import { afterEach, describe, expect, it, vi } from "vitest";
import { generateVAPIDKeys } from "web-push";

// Throwaway pairs made in memory for each run: real, so the sender's own key check is exercised.
const pair = generateVAPIDKeys();
const other = generateVAPIDKeys();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// env caches its parse and the server modules are guarded by `server-only`, so each case loads a
// fresh copy with the database clients stubbed out: `isPushAvailable` must not need them.
async function load(vapid: { publicKey?: string; privateKey?: string }) {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: () => {
      throw new Error("isPushAvailable must not touch the session client (cookies)");
    },
  }));
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => {
      throw new Error("isPushAvailable must not touch the database");
    },
  }));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
  vi.stubEnv("CRON_SECRET", "c".repeat(16));
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey ?? "");
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey ?? "");
  vi.stubEnv("VAPID_SUBJECT", "");
  return import("./push.server");
}

describe("isPushAvailable", () => {
  it("is false with no keys, or only one of them", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await load({})).isPushAvailable()).toBe(false);
    expect((await load({ publicKey: pair.publicKey })).isPushAvailable()).toBe(false);
    expect((await load({ privateKey: pair.privateKey })).isPushAvailable()).toBe(false);
  });

  it("is false for a malformed pair, without throwing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const bad = await load({ publicKey: "not-a-key", privateKey: "also-not-a-key" });
    expect(bad.isPushAvailable()).toBe(false);
  });

  it("is true for a matching pair", async () => {
    const { isPushAvailable } = await load({
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    });
    expect(isPushAvailable()).toBe(true);
  });

  it("is false for well-formed keys that do not belong together", async () => {
    // Every push service would answer 403, so the UI must not offer alerts.
    const { isPushAvailable } = await load({
      publicKey: pair.publicKey,
      privateKey: other.privateKey,
    });
    expect(isPushAvailable()).toBe(false);
  });
});

describe("loadPushSettings", () => {
  const actor = { id: "u1", displayName: "Ann", role: "member" } as const;

  async function loadWith(failure: unknown) {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => {
        throw failure;
      },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    vi.stubEnv("CRON_SECRET", "c".repeat(16));
    return import("./push.server");
  }

  it("turns a throw into an error value and logs the error's name and code, never its text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const failure = Object.assign(
      new Error("Failing row contains (https://fcm.googleapis.com/fcm/send/SECRET-ENDPOINT)"),
      { code: "23514", details: "Failing row contains (SECRET-KEY-MATERIAL)" },
    );
    const { loadPushSettings } = await loadWith(failure);

    const result = await loadPushSettings(actor);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unexpected",
        message: "We couldn't load your alert settings. Refresh the page to try again.",
      },
    });
    const lines = log.mock.calls.map((call) => String(call[0]));
    log.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("23514");
    expect(lines[0]).toContain("correlationId");
    expect(lines[0]).not.toMatch(/SECRET|fcm\.googleapis/);
  });
});
