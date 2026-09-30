import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  subscribe: vi.fn(),
  sendTest: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "test-ua" }) }));
vi.mock("@/features/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/features/push/push.server", () => ({
  getPushService: async () => ({ subscribe: mocks.subscribe, sendTest: mocks.sendTest }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: mocks.logError, warn: mocks.logWarn }) },
  newCorrelationId: () => "corr-1",
}));

import { sendTestPushAction, subscribePushAction } from "./alerts-actions";

const SECRET_PATH = "/fcm/send/very-secret-device-token";
const GOOD = {
  endpoint: `https://fcm.googleapis.com${SECRET_PATH}`,
  keys: { p256dh: "B".repeat(87), auth: "k".repeat(22) },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(ok({ id: "u1", role: "member" }));
});

describe("subscribePushAction", () => {
  it("re-checks the session first and does nothing when signed out", async () => {
    mocks.requireUser.mockResolvedValue(err("unauthenticated", "Sign in first."));
    expect(await subscribePushAction(GOOD)).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("hands the service the parsed subscription and the user agent", async () => {
    mocks.subscribe.mockResolvedValue(ok({ deviceCount: 1 }));
    expect(await subscribePushAction(GOOD)).toEqual(ok({ deviceCount: 1 }));
    expect(mocks.subscribe).toHaveBeenCalledWith(
      { id: "u1", role: "member" },
      expect.objectContaining({ endpoint: GOOD.endpoint }),
      "test-ua",
    );
  });

  it("answers an off-list push service with a typed error that says nothing about the address", async () => {
    const result = await subscribePushAction({
      ...GOOD,
      endpoint: `https://push.example.com${SECRET_PATH}?token=abc`,
    });
    expect(result).toEqual(
      err("unsupported_push_service", "This browser's push service isn't supported yet."),
    );
    expect(mocks.subscribe).not.toHaveBeenCalled();
    // The host is logged so a real service we do not know yet gets noticed; the path is not.
    expect(mocks.logWarn).toHaveBeenCalledWith(expect.any(String), { host: "push.example.com" });
    expect(JSON.stringify([mocks.logWarn.mock.calls, result])).not.toContain("very-secret");
  });

  it("answers any other malformed input with the fixed message", async () => {
    const badKey = { ...GOOD, keys: { ...GOOD.keys, auth: "short" } };
    for (const input of [badKey, null, "x", {}]) {
      expect(await subscribePushAction(input)).toMatchObject({
        ok: false,
        error: { code: "invalid" },
      });
    }
    expect(mocks.logWarn).not.toHaveBeenCalled();
  });

  it("logs an unexpected failure by name and code only, and returns a reference", async () => {
    // What supabase-js throws for a constraint violation: the failing row is in `details`.
    mocks.subscribe.mockRejectedValue({
      message: "new row violates check constraint",
      details: `Failing row contains (${GOOD.endpoint}, ${GOOD.keys.p256dh})`,
      code: "23514",
    });
    const result = await subscribePushAction(GOOD);
    expect(result).toEqual(err("unexpected", "Something went wrong. Reference corr-1."));

    expect(mocks.logError).toHaveBeenCalledWith("push action failed", {
      operation: "subscribe",
      correlationId: "corr-1",
      errorName: "NonError",
      errorCode: "23514",
    });
    const logged = JSON.stringify(mocks.logError.mock.calls);
    expect(logged).not.toContain("very-secret");
    expect(logged).not.toContain(GOOD.keys.p256dh);
  });

  it("does not log an Error's message either, since it can quote the input", async () => {
    mocks.sendTest.mockRejectedValue(new Error(`bad subscription ${GOOD.endpoint}`));
    await sendTestPushAction({ endpoint: GOOD.endpoint });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("very-secret");
  });
});
