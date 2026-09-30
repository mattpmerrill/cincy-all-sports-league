import { describe, expect, it, vi } from "vitest";
import { pushMessage, type PushAlert } from "@/domain/push";
import type { Logger } from "@/lib/logger";
import type { PushDelivery } from "./deliver";
import { createPushNotifier } from "./notifier";

const alert: PushAlert = {
  topic: "feed",
  recipientId: "u1",
  dedupeKey: "reply:1",
  message: pushMessage({ title: "Hi", body: "", url: "/feed", tag: "t", renotify: true }),
  ttlSeconds: 60,
  urgency: "normal",
};

function setup(options: { schedule?: (task: () => Promise<void>) => void } = {}) {
  const errors: { msg: string; fields?: Record<string, unknown> }[] = [];
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (msg, fields) => errors.push({ msg, fields }),
    child: () => logger,
  };
  const pending: (() => Promise<void>)[] = [];
  const deliver = vi.fn<PushDelivery["deliver"]>(async () => {});
  const delivery = vi.fn((): PushDelivery => ({ deliver, sendNow: vi.fn() }));
  const notifier = createPushNotifier({
    schedule: options.schedule ?? ((task) => void pending.push(task)),
    delivery,
    logger,
    newCorrelationId: () => "corr-1",
  });
  /** What `after()` does once the response has gone: runs the queued work. */
  const flush = async () => {
    for (const task of pending.splice(0)) await task();
  };
  return { notifier, delivery, deliver, errors, flush, pending };
}

describe("createPushNotifier", () => {
  it("returns at once and does the work only when the scheduled task runs", async () => {
    const { notifier, delivery, deliver, flush } = setup();
    const build = vi.fn(() => [alert]);
    notifier.notify(build);
    expect(build).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();

    await flush();
    expect(deliver).toHaveBeenCalledExactlyOnceWith([alert]);
  });

  it("awaits an async build", async () => {
    const { notifier, deliver, flush } = setup();
    notifier.notify(async () => [alert]);
    await flush();
    expect(deliver).toHaveBeenCalledWith([alert]);
  });

  it("never builds a delivery for an empty list", async () => {
    const { notifier, delivery, flush } = setup();
    notifier.notify(() => []);
    await flush();
    expect(delivery).not.toHaveBeenCalled();
  });

  it("catches a schedule that throws, so the action is unaffected", () => {
    const { notifier, errors } = setup({
      schedule: () => {
        throw new Error("after() outside a request");
      },
    });
    expect(() => notifier.notify(() => [alert])).not.toThrow();
    expect(errors.map((e) => e.msg)).toEqual(["push alerts could not be scheduled"]);
  });

  it("logs a build that rejects, with a correlation id, and delivers nothing", async () => {
    const { notifier, delivery, errors, flush } = setup();
    notifier.notify(async () => {
      throw new Error("the feed read failed");
    });
    await expect(flush()).resolves.toBeUndefined();
    expect(delivery).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toBe("push alerts failed");
  });

  it("logs a delivery factory that throws instead of failing the task", async () => {
    const { notifier, delivery, errors, flush } = setup();
    delivery.mockImplementation(() => {
      throw new Error("Invalid server environment variables: VAPID_PRIVATE_KEY");
    });
    notifier.notify(() => [alert]);
    await expect(flush()).resolves.toBeUndefined();
    expect(errors.map((e) => e.msg)).toEqual(["push alerts failed"]);
  });

  it("replaces a thrown non-Error value with a fixed string in the log", async () => {
    const { notifier, errors, flush } = setup();
    notifier.notify(async () => {
      throw { details: "Failing row contains (https://fcm.googleapis.com/fcm/send/SECRET)" };
    });
    await flush();
    expect(JSON.stringify(errors)).not.toContain("SECRET");
  });
});
