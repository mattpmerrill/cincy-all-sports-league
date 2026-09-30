import { describe, expect, it, vi } from "vitest";
import type { PushRegisterError } from "@/data/push.repository";
import type { Actor } from "@/domain/membership/membership";
import type { PushTarget } from "@/domain/push";
import type { PushDelivery, PushSendErrorCode } from "@/integrations/webpush";
import { err, ok, type Result } from "@/lib/result";
import { createPushService, TEST_ALERT_BUDGET_MS, type PushServiceDeps } from "./push.service";
import type { ParsedPushSubscription } from "./schemas";

const actor: Actor = { id: "u-member", role: "member" };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const NOW = new Date("2026-09-29T12:34:56Z");

const subscription: ParsedPushSubscription = {
  endpoint: ENDPOINT,
  keys: { p256dh: "P".repeat(87), auth: "A".repeat(22) },
};
const target: PushTarget = {
  subscriptionId: "s1",
  recipientId: actor.id,
  endpoint: ENDPOINT,
  keys: subscription.keys,
};

type Setup = {
  configured?: boolean;
  register?: Result<{ id: string }, PushRegisterError>;
  owned?: PushTarget | null;
  claimed?: boolean;
  send?: Result<null, { code: PushSendErrorCode; message: string }>;
  topics?: { trades: boolean; feed: boolean; scores: boolean } | null;
  profileUpdated?: boolean;
  count?: number;
};

function setup(opts: Setup = {}) {
  const register = vi.fn<PushServiceDeps["subscriptions"]["register"]>(
    async () => opts.register ?? ok({ id: "s1" }),
  );
  const removeOwned = vi.fn<PushServiceDeps["subscriptions"]["removeOwned"]>(async () => true);
  const claim = vi.fn<PushServiceDeps["subscriptions"]["claim"]>(async () => opts.claimed ?? true);
  const getOwned = vi.fn<PushServiceDeps["subscriptions"]["getOwned"]>(async () =>
    opts.owned === undefined ? target : opts.owned,
  );
  const setOptIn = vi.fn<PushServiceDeps["profiles"]["setOptIn"]>(
    async () => opts.profileUpdated ?? true,
  );
  const sendNow = vi.fn<PushDelivery["sendNow"]>(async () => opts.send ?? ok(null));
  const warn = vi.fn();
  const service = createPushService({
    subscriptions: {
      register,
      removeOwned,
      claim,
      getOwned,
      countOwned: async () => opts.count ?? 2,
    },
    profiles: {
      getPushTopics: async () =>
        opts.topics === undefined ? { trades: true, feed: false, scores: true } : opts.topics,
      setOptIn,
    },
    delivery: { sendNow },
    configured: () => opts.configured ?? true,
    now: () => NOW,
    logger: { warn },
    newCorrelationId: () => "corr-1",
  });
  return { service, register, removeOwned, claim, getOwned, setOptIn, sendNow, warn };
}

describe("getSettings", () => {
  it("reports the server's configured flag, the member's switches and their device count", async () => {
    const { service } = setup({ count: 3 });
    expect(await service.getSettings(actor)).toEqual({
      configured: true,
      topics: { trades: true, feed: false, scores: true },
      deviceCount: 3,
    });
    expect((await setup({ configured: false }).service.getSettings(actor)).configured).toBe(false);
  });

  it("reads a missing profile as every switch on", async () => {
    const { service } = setup({ topics: null });
    expect((await service.getSettings(actor)).topics).toEqual({
      trades: true,
      feed: true,
      scores: true,
    });
  });
});

describe("subscribe", () => {
  it("registers the device for the actor with a short label and never the user agent", async () => {
    const { service, register } = setup({ count: 2 });
    const result = await service.subscribe(
      actor,
      subscription,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari",
    );
    expect(result).toEqual(ok({ deviceCount: 2 }));
    expect(register).toHaveBeenCalledWith({
      actorId: actor.id,
      endpoint: ENDPOINT,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      deviceLabel: "iPhone",
    });
  });

  it("labels an unknown or missing user agent 'Device'", async () => {
    const { service, register } = setup();
    await service.subscribe(actor, subscription, null);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ deviceLabel: "Device" }));
  });

  it("refuses without touching storage when the server is not configured", async () => {
    const { service, register } = setup({ configured: false });
    const result = await service.subscribe(actor, subscription, null);
    expect(result).toMatchObject({ ok: false, error: { code: "not_configured" } });
    expect(register).not.toHaveBeenCalled();
  });

  it.each(["invalid_subscription", "not_found"] as const)(
    "passes the repository's %s through as a typed error",
    async (code) => {
      const { service } = setup({ register: err(code, "Friendly words.") });
      expect(await service.subscribe(actor, subscription, null)).toEqual(
        err(code, "Friendly words."),
      );
    },
  );
});

describe("unsubscribe", () => {
  it("removes the actor's own device and reports what is left", async () => {
    const { service, removeOwned } = setup({ count: 1 });
    expect(await service.unsubscribe(actor, ENDPOINT)).toEqual(ok({ deviceCount: 1 }));
    expect(removeOwned).toHaveBeenCalledWith(actor.id, ENDPOINT);
  });

  it("is a success when the device is already gone", async () => {
    const { service, removeOwned } = setup();
    removeOwned.mockResolvedValueOnce(false);
    expect((await service.unsubscribe(actor, ENDPOINT)).ok).toBe(true);
  });
});

describe("setTopic", () => {
  it("writes the topic's own column for the actor", async () => {
    const { service, setOptIn } = setup();
    expect(await service.setTopic(actor, "feed", false)).toEqual(ok({ on: false }));
    expect(setOptIn).toHaveBeenCalledWith(actor.id, "push_feed", false);
  });

  it("is not_found when no profile row changed (missing, or RLS refused)", async () => {
    const { service } = setup({ profileUpdated: false });
    expect(await service.setTopic(actor, "scores", true)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("sendTest", () => {
  it("claims the minute's key, then sends to the member's own device with a short budget", async () => {
    const { service, claim, getOwned, sendNow } = setup();
    expect(await service.sendTest(actor, ENDPOINT)).toEqual(ok(null));

    expect(getOwned).toHaveBeenCalledWith(actor.id, ENDPOINT);
    expect(claim).toHaveBeenCalledWith(actor.id, "test:2026-09-29T12:34");
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(sendNow.mock.invocationCallOrder[0]!);
    const [sentTo, alert, options] = sendNow.mock.calls[0]!;
    expect(sentTo).toBe(target);
    expect(alert.recipientId).toBe(actor.id);
    expect(options).toEqual({ budgetMs: TEST_ALERT_BUDGET_MS, correlationId: "corr-1" });
    expect(TEST_ALERT_BUDGET_MS).toBeLessThanOrEqual(10_000);
  });

  it("is not_found for a device that is not the member's, and sends and claims nothing", async () => {
    const { service, claim, sendNow } = setup({ owned: null });
    expect(await service.sendTest(actor, ENDPOINT)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(claim).not.toHaveBeenCalled();
    expect(sendNow).not.toHaveBeenCalled();
  });

  it("is rate_limited when this minute's test was already claimed", async () => {
    const { service, sendNow } = setup({ claimed: false });
    expect(await service.sendTest(actor, ENDPOINT)).toMatchObject({
      ok: false,
      error: { code: "rate_limited" },
    });
    expect(sendNow).not.toHaveBeenCalled();
  });

  it("is not_configured without keys, before any storage read", async () => {
    const { service, getOwned } = setup({ configured: false });
    expect(await service.sendTest(actor, ENDPOINT)).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    expect(getOwned).not.toHaveBeenCalled();
  });

  it.each([
    ["push_not_configured", "not_configured"],
    ["push_gone", "invalid_subscription"],
    ["push_invalid_subscription", "invalid_subscription"],
    ["push_endpoint_not_allowed", "invalid_subscription"],
    ["push_rejected", "send_failed"],
    ["push_rate_limited", "send_failed"],
    ["push_unavailable", "send_failed"],
    ["push_timeout", "send_failed"],
    ["push_network", "send_failed"],
  ] as const)("maps a %s send failure to %s", async (sendCode, expected) => {
    const { service, warn } = setup({ send: err(sendCode, "Push service said something.") });
    const result = await service.sendTest(actor, ENDPOINT);
    expect(result).toMatchObject({ ok: false, error: { code: expected } });
    // The push service's own words never reach the member.
    expect(JSON.stringify(result)).not.toContain("Push service said something");
    // The log carries the code and the correlation id, and no address or key.
    expect(warn).toHaveBeenCalledWith("push test alert failed", {
      correlationId: "corr-1",
      code: sendCode,
    });
  });
});
