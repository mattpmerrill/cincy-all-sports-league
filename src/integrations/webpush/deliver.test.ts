import { describe, expect, it, vi } from "vitest";
import {
  pushMessage,
  testPushAlert,
  type PushAlert,
  type PushStore,
  type PushTarget,
} from "@/domain/push";
import { err, ok } from "@/lib/result";
import type { Logger } from "@/lib/logger";
import { createPushDelivery } from "./deliver";
import type { PushSender, PushSendErrorCode } from "./send";
import { testVapidConfig } from "./test-utils";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/SECRET-DEVICE-TOKEN";
const P256DH = "P".repeat(87);
const AUTH = "A".repeat(22);
const BODY = "the private words of a trade offer";
const config = testVapidConfig();

const device = (n: number, recipientId = "u1"): PushTarget => ({
  subscriptionId: `sub-${n}`,
  recipientId,
  endpoint: `${ENDPOINT}-${n}`,
  keys: { p256dh: P256DH, auth: AUTH },
});

const alert = (recipientId: string, overrides: Partial<PushAlert> = {}): PushAlert => ({
  topic: "trades",
  recipientId,
  dedupeKey: `trade:${recipientId}`,
  message: pushMessage({
    title: "Coop made you an offer",
    body: BODY,
    url: "/trades/abc",
    tag: "trade-abc",
    renotify: true,
  }),
  ttlSeconds: 3600,
  urgency: "high",
  ...overrides,
});

/** Every log call, flattened with the fields a child logger stamps on. */
function recordingLogger() {
  const lines: { level: string; msg: string; fields: Record<string, unknown> }[] = [];
  const make = (base: Record<string, unknown>): Logger => {
    const write = (level: string) => (msg: string, fields?: Record<string, unknown>) => {
      lines.push({ level, msg, fields: { ...base, ...fields } });
    };
    return {
      debug: write("debug"),
      info: write("info"),
      warn: write("warn"),
      error: write("error"),
      child: (fields) => make({ ...base, ...fields }),
    };
  };
  return { logger: make({}), lines };
}

function setup(
  options: {
    targets?: PushTarget[];
    claim?: (recipientId: string, key: string) => boolean;
    send?: (target: PushTarget) => PushSendErrorCode | null;
    budgetMs?: number;
    tailBudgetMs?: number;
    concurrency?: number;
    sendDelayMs?: number;
    configured?: boolean;
    ready?: boolean;
  } = {},
) {
  const { targets = [device(1)], claim = () => true, send = () => null } = options;
  const store = {
    listTargets: vi.fn<PushStore["listTargets"]>(async (ids) =>
      targets.filter((t) => ids.includes(t.recipientId)),
    ),
    claim: vi.fn<PushStore["claim"]>(async (recipientId, key) => claim(recipientId, key)),
    remove: vi.fn<PushStore["remove"]>(async () => {}),
    recordSuccess: vi.fn<PushStore["recordSuccess"]>(async () => {}),
    recordFailure: vi.fn<PushStore["recordFailure"]>(async () => "counted"),
  } satisfies PushStore;
  const sendPush = vi.fn(async (target: PushTarget) => {
    if (options.sendDelayMs) await new Promise((r) => setTimeout(r, options.sendDelayMs));
    const code = send(target);
    return code ? err(code, "failed") : ok(null);
  });
  const sender: PushSender = { ready: () => options.ready ?? true, sendPush };
  const { logger, lines } = recordingLogger();
  const delivery = createPushDelivery({
    store,
    config: options.configured === false ? null : config,
    sender,
    logger,
    newCorrelationId: () => "corr-1",
    budgetMs: options.budgetMs,
    tailBudgetMs: options.tailBudgetMs,
    concurrency: options.concurrency,
    now: () => new Date("2026-09-29T12:00:00Z"),
  });
  return { delivery, store, sendPush, lines };
}

describe("finding devices", () => {
  it("asks once per topic, with each recipient once", async () => {
    const { delivery, store } = setup({ targets: [device(1, "u1"), device(2, "u2")] });
    await delivery.deliver([
      alert("u1"),
      alert("u1", { dedupeKey: "trade:2" }),
      alert("u2", { topic: "feed", dedupeKey: "reply:1" }),
      alert("u2", { topic: "feed", dedupeKey: "reply:2" }),
    ]);
    expect(store.listTargets).toHaveBeenCalledTimes(2);
    expect(store.listTargets).toHaveBeenCalledWith(["u1"], "trades");
    expect(store.listTargets).toHaveBeenCalledWith(["u2"], "feed");
  });

  it("sends nothing and claims nothing for a member with no device", async () => {
    const { delivery, store, sendPush } = setup({ targets: [] });
    await delivery.deliver([alert("u1")]);
    expect(store.claim).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("claims once per alert and sends to every device of that member", async () => {
    const { delivery, store, sendPush } = setup({ targets: [device(1), device(2)] });
    await delivery.deliver([alert("u1")]);
    expect(store.claim).toHaveBeenCalledExactlyOnceWith("u1", "trade:u1");
    expect(sendPush).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty list", async () => {
    const { delivery, store, lines } = setup();
    await delivery.deliver([]);
    expect(store.listTargets).not.toHaveBeenCalled();
    expect(lines).toHaveLength(0);
  });
});

describe("the ledger", () => {
  it("does not send an alert whose key was already claimed", async () => {
    const { delivery, sendPush } = setup({ claim: () => false });
    await delivery.deliver([alert("u1")]);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("claims before it sends", async () => {
    const order: string[] = [];
    const { delivery, store, sendPush } = setup();
    store.claim.mockImplementation(async () => {
      order.push("claim");
      return true;
    });
    sendPush.mockImplementation(async () => {
      order.push("send");
      return ok(null);
    });
    await delivery.deliver([alert("u1")]);
    expect(order).toEqual(["claim", "send"]);
  });

  it("passes each alert's own ttl and urgency to the send", async () => {
    const { delivery, sendPush } = setup();
    await delivery.deliver([alert("u1", { ttlSeconds: 42, urgency: "low" })]);
    expect(sendPush).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
      ttlSeconds: 42,
      urgency: "low",
    });
  });
});

describe("what a send's outcome does to the device", () => {
  it("records a success, in one call for every device that took it", async () => {
    const { delivery, store } = setup({ targets: [device(1), device(2)] });
    await delivery.deliver([alert("u1")]);
    expect(store.recordSuccess).toHaveBeenCalledExactlyOnceWith(
      ["sub-1", "sub-2"],
      new Date("2026-09-29T12:00:00Z"),
    );
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.recordFailure).not.toHaveBeenCalled();
  });

  it.each(["push_gone", "push_invalid_subscription"] as const)("removes on %s", async (code) => {
    const { delivery, store } = setup({ send: () => code });
    await delivery.deliver([alert("u1")]);
    expect(store.remove).toHaveBeenCalledExactlyOnceWith("sub-1");
    expect(store.recordFailure).not.toHaveBeenCalled();
    expect(store.recordSuccess).not.toHaveBeenCalled();
  });

  it("counts a rejection against the device, once", async () => {
    const { delivery, store } = setup({ send: () => "push_rejected" });
    await delivery.deliver([alert("u1")]);
    expect(store.recordFailure).toHaveBeenCalledExactlyOnceWith("sub-1", 5);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it.each(["push_rate_limited", "push_unavailable", "push_timeout", "push_network"] as const)(
    "never counts %s: an outage says nothing about the device",
    async (code) => {
      const { delivery, store } = setup({ send: () => code });
      await delivery.deliver([alert("u1")]);
      expect(store.recordFailure).not.toHaveBeenCalled();
      expect(store.remove).not.toHaveBeenCalled();
      expect(store.recordSuccess).not.toHaveBeenCalled();
    },
  );

  it("counts one failure for a device that rejected two alerts in the same run", async () => {
    const { delivery, store } = setup({ send: () => "push_rejected" });
    await delivery.deliver([alert("u1"), alert("u1", { dedupeKey: "trade:2" })]);
    expect(store.recordFailure).toHaveBeenCalledExactlyOnceWith("sub-1", 5);
  });

  it("never counts a device that took another alert in the same run", async () => {
    let call = 0;
    const { delivery, store } = setup({ send: () => (call++ === 0 ? "push_rejected" : null) });
    await delivery.deliver([alert("u1"), alert("u1", { dedupeKey: "trade:2" })]);
    expect(store.recordFailure).not.toHaveBeenCalled();
    expect(store.recordSuccess).toHaveBeenCalledWith(["sub-1"], expect.any(Date));
  });

  it("logs when a device is pruned for repeated rejections", async () => {
    const { delivery, store, lines } = setup({ send: () => "push_rejected" });
    store.recordFailure.mockResolvedValue("pruned");
    await delivery.deliver([alert("u1")]);
    expect(lines.some((l) => l.msg.includes("pruned"))).toBe(true);
  });

  it("does not blame the device when our own keys are unusable", async () => {
    const { delivery, store, lines } = setup({
      targets: [device(1), device(2)],
      send: () => "push_not_configured",
    });
    await delivery.deliver([alert("u1")]);
    expect(store.recordFailure).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(lines.filter((l) => l.level === "error")).toHaveLength(1);
  });

  it("keeps going when one device fails and another succeeds", async () => {
    const { delivery, store } = setup({
      targets: [device(1), device(2)],
      send: (t) => (t.subscriptionId === "sub-1" ? "push_gone" : null),
    });
    await delivery.deliver([alert("u1")]);
    expect(store.remove).toHaveBeenCalledWith("sub-1");
    expect(store.recordSuccess).toHaveBeenCalledWith(["sub-2"], expect.any(Date));
  });
});

describe("failures never escape", () => {
  it.each(["listTargets", "claim", "remove", "recordFailure", "recordSuccess"] as const)(
    "logs and swallows a store that throws in %s",
    async (method) => {
      const { delivery, store, lines } = setup({
        send: () =>
          method === "remove" ? "push_gone" : method === "recordFailure" ? "push_rejected" : null,
      });
      store[method].mockRejectedValue(new Error(`${method} exploded`));
      await expect(delivery.deliver([alert("u1")])).resolves.toBeUndefined();
      const logged = lines.find((l) => l.msg === "push store call failed");
      expect(logged?.fields.operation).toBe(method);
    },
  );

  it("logs the run summary as a warning when a store call failed, and as info otherwise", async () => {
    const clean = setup();
    await clean.delivery.deliver([alert("u1")]);
    expect(clean.lines.find((l) => l.msg === "push delivery finished")?.level).toBe("info");

    const broken = setup();
    broken.store.recordSuccess.mockRejectedValue(new Error("db down"));
    await broken.delivery.deliver([alert("u1")]);
    const summary = broken.lines.find((l) => l.msg === "push delivery finished");
    expect(summary?.level).toBe("warn");
    expect(summary?.fields.storeErrors).toBe(1);
  });

  it("still delivers the other topics when one topic's lookup fails", async () => {
    const { delivery, store, sendPush } = setup({ targets: [device(1, "u2")] });
    store.listTargets.mockImplementation(async (ids, topic) => {
      if (topic === "trades") throw new Error("boom");
      return ids.includes("u2") ? [device(1, "u2")] : [];
    });
    await delivery.deliver([alert("u1"), alert("u2", { topic: "feed", dedupeKey: "reply:1" })]);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("does not let one alert that cannot be encoded stop the others", async () => {
    const oversized = alert("u1", {
      message: { ...alert("u1").message, title: "x".repeat(5_000) },
    });
    const { delivery, store, sendPush, lines } = setup({
      targets: [device(1, "u1"), device(2, "u2")],
    });
    await delivery.deliver([oversized, alert("u2")]);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(device(2, "u2"), expect.any(String), expect.anything());
    // The broken alert never used up its dedupe key.
    expect(store.claim).toHaveBeenCalledExactlyOnceWith("u2", "trade:u2");
    expect(lines.some((l) => l.msg === "push alert could not be encoded")).toBe(true);
  });

  it("gives up at the time budget, says so, and returns", async () => {
    const { delivery, store, lines } = setup({ budgetMs: 20 });
    store.listTargets.mockImplementation(() => new Promise(() => {}));
    await delivery.deliver([alert("u1")]);
    const line = lines.find((l) => l.msg === "push delivery ran out of time");
    expect(line?.level).toBe("warn");
    expect(line?.fields.budgetMs).toBe(20);
  });
});

describe("not configured", () => {
  it("logs once and touches neither the store nor the network", async () => {
    const { delivery, store, sendPush, lines } = setup({ configured: false });
    await delivery.deliver([alert("u1"), alert("u2")]);
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe("info");
  });
});

describe("logs", () => {
  it("carry the correlation id, topic, subscription, host and code, and nothing secret", async () => {
    const { delivery, store, lines } = setup({
      targets: [device(1), device(2), device(3)],
      send: (t) =>
        t.subscriptionId === "sub-1"
          ? null
          : t.subscriptionId === "sub-2"
            ? "push_gone"
            : "push_rejected",
    });
    // A raw database error object of the kind that carries the failing row, thrown as-is.
    store.recordFailure.mockRejectedValue({
      code: "23514",
      details: `Failing row contains (${ENDPOINT}-3, ${P256DH}, ${AUTH})`,
    });
    await delivery.deliver([alert("u1")]);

    const warned = lines.find((l) => l.msg === "push send rejected");
    expect(warned?.fields).toEqual({
      correlationId: "corr-1",
      topic: "trades",
      subscriptionId: "sub-3",
      host: "fcm.googleapis.com",
      code: "push_rejected",
    });

    const everything = JSON.stringify(lines);
    for (const secret of [
      ENDPOINT,
      "SECRET-DEVICE-TOKEN",
      P256DH,
      AUTH,
      BODY,
      "Coop made you",
      config.privateKey,
    ]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("never include the message even when the alert itself is malformed", async () => {
    const oversized = alert("u1", { message: { ...alert("u1").message, title: BODY.repeat(200) } });
    const { delivery, lines } = setup();
    await delivery.deliver([oversized]);
    expect(JSON.stringify(lines)).not.toContain(BODY);
  });
});

describe("deliver only takes alerts that have a topic", () => {
  it("rejects a test alert at compile time", async () => {
    const { delivery } = setup();
    // @ts-expect-error a PushSend has no topic, so it cannot go through the topic switches
    await delivery.deliver([testPushAlert({ recipientId: "u1", now: new Date() })]);
  });
});

describe("sendNow", () => {
  const testAlert = testPushAlert({ recipientId: "u1", now: new Date("2026-09-29T12:00:00Z") });

  it("sends to the one device without touching the ledger or the switches", async () => {
    const { delivery, store, sendPush } = setup();
    expect(await delivery.sendNow(device(1), testAlert)).toEqual({ ok: true, value: null });
    expect(sendPush).toHaveBeenCalledExactlyOnceWith(device(1), expect.any(String), {
      ttlSeconds: 300,
      urgency: "high",
    });
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.listTargets).not.toHaveBeenCalled();
    expect(store.recordSuccess).toHaveBeenCalledWith(["sub-1"], expect.any(Date));
  });

  it("returns the failure and removes a device that is gone", async () => {
    const { delivery, store } = setup({ send: () => "push_gone" });
    expect(await delivery.sendNow(device(1), testAlert)).toMatchObject({
      ok: false,
      error: { code: "push_gone" },
    });
    expect(store.remove).toHaveBeenCalledWith("sub-1");
  });

  it("reports not configured without a send", async () => {
    const { delivery, sendPush } = setup({ configured: false });
    expect(await delivery.sendNow(device(1), testAlert)).toMatchObject({
      ok: false,
      error: { code: "push_not_configured" },
    });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("answers push_timeout when the send outlasts the budget", async () => {
    const { delivery, sendPush } = setup({ budgetMs: 20 });
    sendPush.mockImplementation(() => new Promise(() => {}));
    expect(await delivery.sendNow(device(1), testAlert)).toMatchObject({
      ok: false,
      error: { code: "push_timeout" },
    });
  });
});

describe("the time budget", () => {
  it("starts nothing new after it is spent and ignores late results", async () => {
    // Ten devices, two at a time, 50 ms each, 120 ms to spend: some sends never get to start.
    const targets = Array.from({ length: 10 }, (_, i) => device(i + 1));
    const { delivery, store, sendPush, lines } = setup({
      targets,
      concurrency: 2,
      sendDelayMs: 50,
      budgetMs: 120,
      send: (t) => (t.subscriptionId === "sub-1" ? null : "push_rejected"),
    });
    await delivery.deliver([alert("u1")]);
    const startedAtReturn = sendPush.mock.calls.length;
    expect(startedAtReturn).toBeLessThan(10);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sendPush).toHaveBeenCalledTimes(startedAtReturn);
    // Rejections that landed after the deadline are not evidence about those devices.
    expect(store.recordFailure).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(lines.some((l) => l.msg === "push delivery ran out of time")).toBe(true);
  });

  it("claims nothing once it is spent", async () => {
    const { delivery, store } = setup({ budgetMs: 20 });
    store.listTargets.mockImplementation(async (ids) => {
      await new Promise((r) => setTimeout(r, 60));
      return [device(1, ids[0] ?? "u1")];
    });
    await delivery.deliver([alert("u1")]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("does not let a hung store call hold delivery open past the tail budget", async () => {
    const { delivery, store, lines } = setup({ tailBudgetMs: 30 });
    store.recordSuccess.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    await delivery.deliver([alert("u1")]);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(lines.some((l) => l.msg === "push outcomes were not recorded in time")).toBe(true);
  });

  it("bounds a hung recordFailure the same way", async () => {
    const { delivery, store, lines } = setup({ tailBudgetMs: 30, send: () => "push_rejected" });
    store.recordFailure.mockImplementation(() => new Promise(() => {}));
    await delivery.deliver([alert("u1")]);
    expect(lines.some((l) => l.msg === "push outcomes were not recorded in time")).toBe(true);
  });
});

describe("the endpoint allow-list", () => {
  const rogue: PushTarget = { ...device(9), endpoint: "https://evil.example/steal/SECRET-PATH" };

  it("removes a device whose host is not a push service and never sends to it", async () => {
    const { delivery, store, sendPush, lines } = setup({ targets: [rogue] });
    await delivery.deliver([alert("u1")]);
    expect(sendPush).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledExactlyOnceWith("sub-9");
    const removed = lines.find((l) => l.msg === "push device removed");
    expect(removed?.fields).toMatchObject({
      subscriptionId: "sub-9",
      host: "evil.example",
      code: "push_endpoint_not_allowed",
    });
    expect(JSON.stringify(lines)).not.toContain("SECRET-PATH");
  });

  it("still sends to the member's other, allowed devices", async () => {
    const { delivery, store, sendPush } = setup({ targets: [rogue, device(1)] });
    await delivery.deliver([alert("u1")]);
    expect(store.remove).toHaveBeenCalledWith("sub-9");
    expect(sendPush).toHaveBeenCalledExactlyOnceWith(
      device(1),
      expect.any(String),
      expect.anything(),
    );
  });

  it("sendNow refuses it with a typed error, removes it and sends nothing", async () => {
    const { delivery, store, sendPush } = setup();
    const testAlert = testPushAlert({ recipientId: "u1", now: new Date() });
    expect(await delivery.sendNow(rogue, testAlert)).toMatchObject({
      ok: false,
      error: { code: "push_endpoint_not_allowed" },
    });
    expect(sendPush).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith("sub-9");
  });
});

describe("unusable VAPID keys", () => {
  it("is caught before anything is claimed, and logged once", async () => {
    const { delivery, store, sendPush, lines } = setup({ ready: false });
    await delivery.deliver([alert("u1"), alert("u2")]);
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
    expect(lines.filter((l) => l.level === "error")).toHaveLength(1);
  });

  it("makes sendNow report not configured without sending", async () => {
    const { delivery, sendPush } = setup({ ready: false });
    const testAlert = testPushAlert({ recipientId: "u1", now: new Date() });
    expect(await delivery.sendNow(device(1), testAlert)).toMatchObject({
      ok: false,
      error: { code: "push_not_configured" },
    });
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe("correlation and budget overrides", () => {
  it("logs under the correlation id it is given", async () => {
    const { delivery, lines } = setup();
    await delivery.deliver([alert("u1")], { correlationId: "from-notifier" });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.fields.correlationId === "from-notifier")).toBe(true);
  });

  it("lets sendNow use a smaller budget than delivery's", async () => {
    const { delivery, sendPush } = setup({ budgetMs: 60_000 });
    sendPush.mockImplementation(() => new Promise(() => {}));
    const testAlert = testPushAlert({ recipientId: "u1", now: new Date() });
    expect(await delivery.sendNow(device(1), testAlert, { budgetMs: 20 })).toMatchObject({
      ok: false,
      error: { code: "push_timeout" },
    });
  });
});
