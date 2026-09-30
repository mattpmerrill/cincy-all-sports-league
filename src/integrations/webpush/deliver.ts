import {
  encodePushPayload,
  pushServiceHost,
  type PushAlert,
  type PushSend,
  type PushStore,
  type PushTarget,
  type PushTopic,
  type PushUrgency,
} from "@/domain/push";
import { withDeadline } from "@/lib/deadline";
import type { VapidConfig } from "@/lib/env.server";
import type { Logger } from "@/lib/logger";
import { mapPool } from "@/lib/map-pool";
import { err, type Result } from "@/lib/result";
import { loggable } from "./log";
import { createPushSender, type PushSender, type PushSendError } from "./send";

// The port itself is declared in the domain so the data layer can assert it satisfies it.
export type { PushStore } from "@/domain/push";

export type PushDeliveryDeps = {
  store: PushStore;
  /** Null means "not configured": delivery logs once and touches neither the store nor the network. */
  config: VapidConfig | null;
  sender?: PushSender;
  logger: Logger;
  newCorrelationId: () => string;
  /** Sends in flight at once. */
  concurrency?: number;
  /** The whole delivery's time limit: `after()` shares the route's 60 s with the response. */
  budgetMs?: number;
  /** Consecutive failures after which a device is dropped. */
  maxFailures?: number;
  now?: () => Date;
};

export type PushDelivery = {
  /**
   * Finds each alert's devices (the member's switch for the topic already applied), claims the
   * dedupe key, sends, and tidies up: dead devices are removed and flaky ones counted. Never
   * throws: every failure is logged under one correlation id.
   */
  deliver: (alerts: readonly PushAlert[]) => Promise<void>;
  /**
   * Sends one alert to one device outside the topic switches (the test alert). The caller claims
   * the key. Returns the outcome, because a person is waiting for it.
   */
  sendNow: (target: PushTarget, alert: PushSend) => Promise<Result<null, PushSendError>>;
};

const DEFAULTS = { concurrency: 6, budgetMs: 20_000, maxFailures: 5 };

type Job = {
  topic: string;
  target: PushTarget;
  payload: string;
  ttlSeconds: number;
  urgency: PushUrgency;
};

/** Counts only: what a run did, safe to log. */
type Stats = {
  alerts: number;
  noDevice: number;
  duplicates: number;
  encodeFailed: number;
  sent: number;
  removed: number;
  failed: number;
  pruned: number;
  storeErrors: number;
};

type Run = {
  log: Logger;
  stats: Stats;
  /** Devices that took a send, recorded in one call at the end. */
  succeeded: string[];
  warnedUnusableKeys: boolean;
};

const newRun = (log: Logger, alerts: number): Run => ({
  log,
  succeeded: [],
  warnedUnusableKeys: false,
  stats: {
    alerts,
    noDevice: 0,
    duplicates: 0,
    encodeFailed: 0,
    sent: 0,
    removed: 0,
    failed: 0,
    pruned: 0,
    storeErrors: 0,
  },
});

/**
 * The orchestration, once, for every feature that sends: load targets, claim, send, prune. It
 * logs `{correlationId, topic, subscriptionId, host, code}` and counts, and nothing else about a
 * device or an alert: no endpoint, no keys, no message text.
 */
export function createPushDelivery(deps: PushDeliveryDeps): PushDelivery {
  const sender = deps.sender ?? createPushSender({ config: deps.config });
  const concurrency = deps.concurrency ?? DEFAULTS.concurrency;
  const budgetMs = deps.budgetMs ?? DEFAULTS.budgetMs;
  const maxFailures = deps.maxFailures ?? DEFAULTS.maxFailures;
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const fieldsOf = (job: Job) => ({
    topic: job.topic,
    subscriptionId: job.target.subscriptionId,
    host: pushServiceHost(job.target.endpoint) ?? "unknown",
  });

  function storeFailed(run: Run, operation: string, error: unknown, fields: object = {}) {
    run.stats.storeErrors++;
    run.log.error("push store call failed", { ...fields, operation, error: loggable(error) });
  }

  /** What a send's outcome means for the device. Never throws. */
  async function settle(job: Job, result: Result<null, PushSendError>, run: Run) {
    const id = job.target.subscriptionId;
    if (result.ok) {
      run.stats.sent++;
      run.succeeded.push(id);
      return;
    }
    const { code } = result.error;
    const fields = { ...fieldsOf(job), code };

    if (code === "push_gone" || code === "push_invalid_subscription") {
      // The browser dropped it, or the stored keys are junk: no later send can work.
      try {
        await store.remove(id);
        run.stats.removed++;
        run.log.info("push device removed", fields);
      } catch (error) {
        storeFailed(run, "remove", error, fields);
      }
      return;
    }

    run.stats.failed++;
    if (code === "push_not_configured") {
      // Our keys, not the device: counting it against the device would prune everyone.
      if (!run.warnedUnusableKeys) {
        run.warnedUnusableKeys = true;
        run.log.error("push keys are not usable; alerts are not being sent", fields);
      }
      return;
    }
    run.log.warn("push send failed", fields);
    try {
      if ((await store.recordFailure(id, maxFailures)) === "pruned") {
        run.stats.pruned++;
        run.log.info("push device pruned after repeated failures", fields);
      }
    } catch (error) {
      storeFailed(run, "recordFailure", error, fields);
    }
  }

  async function sendJob(job: Job, run: Run): Promise<Result<null, PushSendError>> {
    let result: Result<null, PushSendError>;
    try {
      result = await sender.sendPush(job.target, job.payload, {
        ttlSeconds: job.ttlSeconds,
        urgency: job.urgency,
      });
    } catch (error) {
      // The sender returns its failures; a throw is a bug, and not this device's fault.
      run.stats.failed++;
      run.log.error("push sender threw", { ...fieldsOf(job), error: loggable(error) });
      return err("push_network", "The alert could not be sent");
    }
    await settle(job, result, run);
    return result;
  }

  async function flushSuccesses(run: Run) {
    if (run.succeeded.length === 0) return;
    try {
      await store.recordSuccess(run.succeeded, now());
    } catch (error) {
      storeFailed(run, "recordSuccess", error);
    }
  }

  /** Turns alerts into sends: devices found, payload encoded, key claimed, in that order. */
  async function plan(alerts: readonly PushAlert[], run: Run): Promise<Job[]> {
    const byTopic = new Map<PushTopic, PushAlert[]>();
    for (const alert of alerts) {
      byTopic.set(alert.topic, [...(byTopic.get(alert.topic) ?? []), alert]);
    }

    const jobs: Job[] = [];
    for (const [topic, group] of byTopic) {
      const devices = new Map<string, PushTarget[]>();
      try {
        const recipients = [...new Set(group.map((alert) => alert.recipientId))];
        for (const target of await store.listTargets(recipients, topic)) {
          devices.set(target.recipientId, [...(devices.get(target.recipientId) ?? []), target]);
        }
      } catch (error) {
        storeFailed(run, "listTargets", error, { topic });
        continue;
      }

      for (const alert of group) {
        const targets = devices.get(alert.recipientId) ?? [];
        if (targets.length === 0) {
          run.stats.noDevice++;
          continue;
        }

        // One bad alert must not stop the rest. Encoding comes before the claim so an alert that
        // can never be sent does not use up its dedupe key.
        let payload: string;
        try {
          payload = encodePushPayload(alert.message);
        } catch (error) {
          run.stats.encodeFailed++;
          run.log.error("push alert could not be encoded", { topic, error: loggable(error) });
          continue;
        }

        try {
          if (!(await store.claim(alert.recipientId, alert.dedupeKey))) {
            run.stats.duplicates++;
            continue;
          }
        } catch (error) {
          storeFailed(run, "claim", error, { topic });
          continue;
        }

        for (const target of targets) {
          jobs.push({
            topic,
            target,
            payload,
            ttlSeconds: alert.ttlSeconds,
            urgency: alert.urgency,
          });
        }
      }
    }
    return jobs;
  }

  async function perform(alerts: readonly PushAlert[], run: Run): Promise<void> {
    const jobs = await plan(alerts, run);
    await mapPool(jobs, concurrency, (job) => sendJob(job, run));
  }

  return {
    async deliver(alerts) {
      if (alerts.length === 0) return;
      if (!deps.config) {
        deps.logger.info("push alerts skipped: push is not configured", { alerts: alerts.length });
        return;
      }
      const run = newRun(
        deps.logger.child({ correlationId: deps.newCorrelationId() }),
        alerts.length,
      );
      try {
        const finished = await withDeadline(perform(alerts, run), budgetMs);
        // Sends that were cut off keep going in the background, but their outcomes are no longer
        // recorded: a missed reset of a failure counter is harmless.
        await flushSuccesses(run);
        if (finished.ok) run.log.info("push delivery finished", run.stats);
        else run.log.warn("push delivery ran out of time", { budgetMs, ...run.stats });
      } catch (error) {
        run.log.error("push delivery failed", { ...run.stats, error: loggable(error) });
      }
    },

    async sendNow(target, alert) {
      if (!deps.config) return err("push_not_configured", "Push alerts are not configured.");
      const run = newRun(deps.logger.child({ correlationId: deps.newCorrelationId() }), 1);
      let payload: string;
      try {
        payload = encodePushPayload(alert.message);
      } catch (error) {
        run.log.error("push alert could not be encoded", { topic: "test", error: loggable(error) });
        return err("push_rejected", "The alert could not be prepared.");
      }
      try {
        const job: Job = {
          topic: "test",
          target,
          payload,
          ttlSeconds: alert.ttlSeconds,
          urgency: alert.urgency,
        };
        const outcome = await withDeadline(sendJob(job, run), budgetMs);
        await flushSuccesses(run);
        if (!outcome.ok) {
          run.log.warn("push test alert ran out of time", { budgetMs, ...fieldsOf(job) });
          return err("push_timeout", "The push service took too long to answer.");
        }
        return outcome.value;
      } catch (error) {
        run.log.error("push test alert failed", { error: loggable(error) });
        return err("push_network", "The alert could not be sent.");
      }
    },
  };
}
