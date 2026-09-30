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
