import {
  encodePushPayload,
  isAllowedPushEndpoint,
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
import { newCorrelationId as defaultCorrelationId } from "@/lib/logger";
import { mapPool } from "@/lib/map-pool";
import { err, type Result } from "@/lib/result";
import { loggable } from "./log";
import { createPushSender, type PushSender, type PushSendError } from "./send";

export type PushDeliveryDeps = {
  store: PushStore;
  /** Null means "not configured": delivery logs once and touches neither the store nor the network. */
  config: VapidConfig | null;
  sender?: PushSender;
  logger: Logger;
  newCorrelationId?: () => string;
  /** Sends in flight at once. */
  concurrency?: number;
  /** The whole delivery's time limit: `after()` shares the route's 60 s with the response. */
  budgetMs?: number;
  /** The extra limit for the bookkeeping after the sends (recording outcomes), so a hung store cannot hold the task open. */
  tailBudgetMs?: number;
  /** Rejections (not outages) after which a device is dropped. */
  maxFailures?: number;
  now?: () => Date;
};

export type PushDelivery = {
  /**
   * Finds each alert's devices (the member's switch for the topic already applied), claims the
   * dedupe key, sends, and tidies up: dead devices are removed and rejecting ones counted. Never
   * throws: every failure is logged under one correlation id (`options.correlationId` lets the
   * caller share its own).
   */
  deliver: (alerts: readonly PushAlert[], options?: { correlationId?: string }) => Promise<void>;
  /**
   * Sends one alert to one device outside the topic switches (the test alert). The caller claims
   * the key. Returns the outcome, because a person is waiting for it; `budgetMs` shortens the
   * wait for that person.
   */
  sendNow: (
    target: PushTarget,
    alert: PushSend,
    options?: { budgetMs?: number; correlationId?: string },
  ) => Promise<Result<null, PushSendError>>;
};

const DEFAULTS = { concurrency: 6, budgetMs: 20_000, tailBudgetMs: 3_000, maxFailures: 5 };

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
  badEndpoint: number;
  rejected: number;
  transient: number;
  pruned: number;
  storeErrors: number;
};

type Run = {
  log: Logger;
  stats: Stats;
  /** Devices that took a send in this run. */
  succeeded: Set<string>;
  /** Devices that answered with a real rejection in this run. */
  rejected: Set<string>;
  removed: Set<string>;
  /** Set once the time budget is spent: nothing new starts and late results are ignored. */
  expired: boolean;
  warnedUnusableKeys: boolean;
};

const newRun = (log: Logger, alerts: number): Run => ({
  log,
  succeeded: new Set(),
  rejected: new Set(),
  removed: new Set(),
  expired: false,
  warnedUnusableKeys: false,
  stats: {
    alerts,
    noDevice: 0,
    duplicates: 0,
    encodeFailed: 0,
    sent: 0,
    removed: 0,
    badEndpoint: 0,
    rejected: 0,
    transient: 0,
    pruned: 0,
    storeErrors: 0,
  },
});

/**
 * The orchestration, once, for every feature that sends: load targets, claim, send, prune. It
 * logs `{correlationId, topic, subscriptionId, host, code}` and counts, and nothing else about a
 * device or an alert: no endpoint, no keys, no message text.
 *
 * Failure policy: only a real rejection (`push_rejected`) counts against a device, once per run,
 * and never for a device that took a send in the same run. Outages (rate limit, 5xx, timeout,
 * network) say nothing about the device, so they are logged and never counted: a push-service
 * outage must not prune healthy devices.
 */
export function createPushDelivery(deps: PushDeliveryDeps): PushDelivery {
  const sender = deps.sender ?? createPushSender({ config: deps.config });
  const concurrency = deps.concurrency ?? DEFAULTS.concurrency;
  const budgetMs = deps.budgetMs ?? DEFAULTS.budgetMs;
  const tailBudgetMs = deps.tailBudgetMs ?? DEFAULTS.tailBudgetMs;
  const maxFailures = deps.maxFailures ?? DEFAULTS.maxFailures;
  const now = deps.now ?? (() => new Date());
  const newCorrelationId = deps.newCorrelationId ?? defaultCorrelationId;
  const { store } = deps;

  const fieldsOf = (job: Job) => ({
    topic: job.topic,
    subscriptionId: job.target.subscriptionId,
    host: pushServiceHost(job.target.endpoint) ?? "unknown",
  });

  const runFor = (correlationId: string | undefined, alerts: number) =>
    newRun(deps.logger.child({ correlationId: correlationId ?? newCorrelationId() }), alerts);

  function storeFailed(
    run: Run,
    operation: string,
    error: unknown,
    fields: Record<string, unknown> = {},
  ) {
    run.stats.storeErrors++;
    run.log.error("push store call failed", { ...fields, operation, error: loggable(error) });
  }

  /** Deletes a device no later send can reach. Never throws. */
  async function removeDevice(run: Run, target: PushTarget, fields: Record<string, unknown>) {
    if (run.removed.has(target.subscriptionId)) return;
    run.removed.add(target.subscriptionId);
    try {
      await store.remove(target.subscriptionId);
      run.stats.removed++;
      run.log.info("push device removed", fields);
    } catch (error) {
      storeFailed(run, "remove", error, fields);
    }
  }

  /** What a send's outcome means for the device. Never throws. */
  async function settle(job: Job, result: Result<null, PushSendError>, run: Run) {
    // A result that arrives after the budget is spent describes nothing we can act on.
    if (run.expired) return;
    const id = job.target.subscriptionId;
    if (result.ok) {
      run.stats.sent++;
      run.succeeded.add(id);
      return;
    }
    const { code } = result.error;
    const fields = { ...fieldsOf(job), code };

    if (code === "push_gone" || code === "push_invalid_subscription") {
      // The browser dropped it, or the stored keys are junk: no later send can work.
      await removeDevice(run, job.target, fields);
    } else if (code === "push_not_configured") {
      // Our keys, not the device: counting it against the device would prune everyone.
      if (!run.warnedUnusableKeys) {
        run.warnedUnusableKeys = true;
        run.log.error("push keys are not usable; alerts are not being sent", fields);
      }
    } else if (code === "push_rejected") {
      run.stats.rejected++;
      run.rejected.add(id);
      run.log.warn("push send rejected", fields);
    } else {
      run.stats.transient++;
      run.log.warn("push send failed, not counted against the device", fields);
    }
  }

  /** Null when the send never started (budget spent) or the sender threw. */
  async function sendJob(job: Job, run: Run): Promise<Result<null, PushSendError> | null> {
    // Queued sends that had not started when the budget ran out never start.
    if (run.expired) return null;
    let result: Result<null, PushSendError>;
    try {
      result = await sender.sendPush(job.target, job.payload, {
        ttlSeconds: job.ttlSeconds,
        urgency: job.urgency,
      });
    } catch (error) {
      // The sender returns its failures; a throw is a bug, and not this device's fault.
      run.log.error("push sender threw", { ...fieldsOf(job), error: loggable(error) });
      return null;
    }
    await settle(job, result, run);
    return result;
  }

  /** Records the run's outcomes, once per device. Never throws. */
  async function recordOutcomes(run: Run) {
    if (run.succeeded.size > 0) {
      try {
        await store.recordSuccess([...run.succeeded], now());
      } catch (error) {
        storeFailed(run, "recordSuccess", error);
      }
    }
    // A late result is not evidence about the device, and a device that took any send this run is
    // healthy whatever else it answered.
    if (run.expired) return;
    const failing = [...run.rejected].filter(
      (id) => !run.succeeded.has(id) && !run.removed.has(id),
    );
    await mapPool(failing, concurrency, async (id) => {
      try {
        if ((await store.recordFailure(id, maxFailures)) === "pruned") {
          run.stats.pruned++;
          run.log.info("push device pruned after repeated rejections", { subscriptionId: id });
        }
      } catch (error) {
        storeFailed(run, "recordFailure", error, { subscriptionId: id });
      }
    });
  }

  /** The bookkeeping gets its own short limit: a hung store call must not hold `deliver` open. */
  async function finish(run: Run) {
    const done = await withDeadline(recordOutcomes(run), tailBudgetMs);
    if (!done.ok) run.log.warn("push outcomes were not recorded in time", { tailBudgetMs });
  }

  /** Turns alerts into sends: devices found, payload encoded, key claimed, in that order. */
  async function plan(alerts: readonly PushAlert[], run: Run): Promise<Job[]> {
    const byTopic = new Map<PushTopic, PushAlert[]>();
    for (const alert of alerts) {
      byTopic.set(alert.topic, [...(byTopic.get(alert.topic) ?? []), alert]);
    }

    const jobs: Job[] = [];
    for (const [topic, group] of byTopic) {
      if (run.expired) break;
      const devices = new Map<string, PushTarget[]>();
      try {
        const recipients = [...new Set(group.map((alert) => alert.recipientId))];
        for (const target of await store.listTargets(recipients, topic)) {
          if (!isAllowedPushEndpoint(target.endpoint)) {
            // A member supplied this address, so an off-list host is never POSTed to, whatever put
            // the row there. Only the host is logged, so an unknown real push service is noticed.
            run.stats.badEndpoint++;
            await removeDevice(run, target, {
              topic,
              subscriptionId: target.subscriptionId,
              host: pushServiceHost(target.endpoint) ?? "unknown",
              code: "push_endpoint_not_allowed",
            });
            continue;
          }
          devices.set(target.recipientId, [...(devices.get(target.recipientId) ?? []), target]);
        }
      } catch (error) {
        storeFailed(run, "listTargets", error, { topic });
        continue;
      }

      for (const alert of group) {
        // Past the budget nothing may be claimed: a claimed key that is never sent is a lost alert.
        if (run.expired) return jobs;
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
    async deliver(alerts, options) {
      if (alerts.length === 0) return;
      if (!deps.config) {
        deps.logger.info("push alerts skipped: push is not configured", { alerts: alerts.length });
        return;
      }
      const run = runFor(options?.correlationId, alerts.length);
      // Checked before anything is claimed: with unusable keys every claim would burn a dedupe key
      // for an alert that can never go out.
      if (!sender.ready()) {
        run.log.error("push keys are not usable; alerts are not being sent");
        return;
      }
      try {
        const finished = await withDeadline(perform(alerts, run), budgetMs);
        // Sends still in flight cannot be cancelled, but from here on they change nothing.
        if (!finished.ok) run.expired = true;
        await finish(run);
        // A store that failed mid-run is worth noticing in the logs, so it is a warning then.
        if (finished.ok) {
          const level = run.stats.storeErrors > 0 ? "warn" : "info";
          run.log[level]("push delivery finished", run.stats);
        } else run.log.warn("push delivery ran out of time", { budgetMs, ...run.stats });
      } catch (error) {
        run.log.error("push delivery failed", { ...run.stats, error: loggable(error) });
      }
    },

    async sendNow(target, alert, options) {
      if (!deps.config) return err("push_not_configured", "Push alerts are not configured.");
      if (!sender.ready()) return err("push_not_configured", "Push alerts are not usable.");
      const run = runFor(options?.correlationId, 1);
      const limit = options?.budgetMs ?? budgetMs;
      const job: Job = {
        topic: "test",
        target,
        payload: "",
        ttlSeconds: alert.ttlSeconds,
        urgency: alert.urgency,
      };

      if (!isAllowedPushEndpoint(target.endpoint)) {
        run.stats.badEndpoint++;
        await removeDevice(run, target, {
          ...fieldsOf(job),
          code: "push_endpoint_not_allowed",
        });
        return err("push_endpoint_not_allowed", "This device's push address is not allowed.");
      }

      try {
        job.payload = encodePushPayload(alert.message);
      } catch (error) {
        run.log.error("push alert could not be encoded", { topic: "test", error: loggable(error) });
        return err("push_rejected", "The alert could not be prepared.");
      }

      try {
        const finished = await withDeadline(sendJob(job, run), limit);
        if (!finished.ok) run.expired = true;
        await finish(run);
        if (!finished.ok) {
          run.log.warn("push test alert ran out of time", { budgetMs: limit, ...fieldsOf(job) });
          return err("push_timeout", "The push service took too long to answer.");
        }
        return finished.value ?? err("push_network", "The alert could not be sent.");
      } catch (error) {
        run.log.error("push test alert failed", { error: loggable(error) });
        return err("push_network", "The alert could not be sent.");
      }
    },
  };
}
