import { PUSH_TOPIC_COLUMN, type ProfilesRepository } from "@/data/profiles.repository";
import type { PushRepository } from "@/data/push.repository";
import type { Actor } from "@/domain/membership/membership";
import { deviceLabel, testPushAlert, type PushTopic, type PushTopicSettings } from "@/domain/push";
import type { PushDelivery } from "@/integrations/webpush";
import { newCorrelationId as defaultCorrelationId, type Logger } from "@/lib/logger";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { ParsedPushSubscription } from "./schemas";

export type PushError = AppError<
  "not_configured" | "not_found" | "rate_limited" | "send_failed" | "invalid_subscription"
>;

export type PushSettings = {
  /** Whether the SERVER can send alerts. The client only knows the public key, which is not enough. */
  configured: boolean;
  topics: PushTopicSettings;
  /** Devices this member has alerts on for, across browsers and phones. */
  deviceCount: number;
};

export type PushServiceDeps = {
  /** Admin-client repository: the tables have no policy, so the caller must have re-checked the session. */
  subscriptions: Pick<
    PushRepository,
    "register" | "removeOwned" | "countOwned" | "getOwned" | "claim"
  >;
  /** Session-client repository, so RLS applies to the switches. */
  profiles: Pick<ProfilesRepository, "getPushTopics" | "setOptIn">;
  delivery: Pick<PushDelivery, "sendNow">;
  configured: () => boolean;
  now: () => Date;
  logger: Pick<Logger, "warn">;
  newCorrelationId?: () => string;
};

/**
 * A person is waiting on the test alert, so it gets a short leash: the sender's own timeouts and
 * retry could otherwise keep the button spinning for the full 20 s delivery budget.
 */
export const TEST_ALERT_BUDGET_MS = 8_000;

/** A missing profile reads as the defaults (every switch on), like the email preferences. */
const DEFAULT_TOPICS: PushTopicSettings = { trades: true, feed: true, scores: true };

const notConfigured = () => err("not_configured", "Push alerts aren't available yet.");

export function createPushService({
  subscriptions,
  profiles,
  delivery,
  configured,
  now,
  logger,
  newCorrelationId = defaultCorrelationId,
}: PushServiceDeps) {
  return {
    async getSettings(actor: Actor): Promise<PushSettings> {
      const [topics, deviceCount] = await Promise.all([
        profiles.getPushTopics(actor.id),
        subscriptions.countOwned(actor.id),
      ]);
      return { configured: configured(), topics: topics ?? DEFAULT_TOPICS, deviceCount };
    },

    /**
     * Registers this device for the member. The member is the actor, never a parameter, and an
     * endpoint another member had is moved to them (a shared device): the browser is signed in as
     * this member now. Only a short device name is stored, never the user agent.
     */
    async subscribe(
      actor: Actor,
      subscription: ParsedPushSubscription,
      userAgent: string | null,
    ): Promise<Result<{ deviceCount: number }, PushError>> {
      if (!configured()) return notConfigured();
      const registered = await subscriptions.register({
        actorId: actor.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        deviceLabel: deviceLabel(userAgent),
      });
      if (!registered.ok) return registered;
      return ok({ deviceCount: await subscriptions.countOwned(actor.id) });
    },

    /**
     * Idempotent: a device that is already gone is a success, so a retry, a second tab or the
     * sign-out cleanup racing the button never shows an error. Scoped by owner in the repository.
     */
    async unsubscribe(
      actor: Actor,
      endpoint: string,
    ): Promise<Result<{ deviceCount: number }, never>> {
      await subscriptions.removeOwned(actor.id, endpoint);
      return ok({ deviceCount: await subscriptions.countOwned(actor.id) });
    },

    /** Preferences apply to every device of the member, so this is a profile write, not a device one. */
    async setTopic(
      actor: Actor,
      topic: PushTopic,
      on: boolean,
    ): Promise<Result<{ on: boolean }, PushError>> {
      const updated = await profiles.setOptIn(actor.id, PUSH_TOPIC_COLUMN[topic], on);
      return updated ? ok({ on }) : err("not_found", "We couldn't find your profile.");
    },

    /**
     * Sends a test alert to one of the member's own devices and reports the outcome, because it is
     * the only way a member can tell alerts work. The key claim is the throttle (one per minute),
     * and a failed send still uses that minute: the claim comes first so two quick taps cannot
     * both send.
     */
    async sendTest(actor: Actor, endpoint: string): Promise<Result<null, PushError>> {
      if (!configured()) return notConfigured();
      const target = await subscriptions.getOwned(actor.id, endpoint);
      if (!target) {
        return err("not_found", "This device isn't set up for alerts. Turn alerts on again.");
      }

      const alert = testPushAlert({ recipientId: actor.id, now: now() });
      if (!(await subscriptions.claim(alert.recipientId, alert.dedupeKey))) {
        return err("rate_limited", "A test alert was just sent. Give it a minute and try again.");
      }

      const correlationId = newCorrelationId();
      const sent = await delivery.sendNow(target, alert, {
        budgetMs: TEST_ALERT_BUDGET_MS,
        correlationId,
      });
      if (sent.ok) return ok(null);

      // `sendNow` already logged the device-level detail under this id; this ties the person's
      // failure to it. The code is ours, never the push service's words.
      logger.warn("push test alert failed", { correlationId, code: sent.error.code });
      switch (sent.error.code) {
        case "push_not_configured":
          return notConfigured();
        case "push_gone":
        case "push_invalid_subscription":
        case "push_endpoint_not_allowed":
          // Delivery has removed this device; turning alerts on again registers a fresh one.
          return err(
            "invalid_subscription",
            "This device can't receive alerts any more. Turn alerts off and on again.",
          );
        default:
          return err(
            "send_failed",
            "We couldn't reach your device's push service. Try again in a minute.",
          );
      }
    },
  };
}

export type PushService = ReturnType<typeof createPushService>;
