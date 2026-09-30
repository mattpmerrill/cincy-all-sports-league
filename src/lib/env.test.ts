import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePublicEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

describe("parsePublicEnv", () => {
  it("accepts a complete environment", () => {
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "https://example.com" })).toEqual({
      ...valid,
      NEXT_PUBLIC_SITE_URL: "https://example.com",
    });
  });

  it("falls back to localhost when the site URL is unset", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("omits the Google verification token when unset and keeps it when present", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION).toBeUndefined();
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "test123" })
        .NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    ).toBe("test123");
  });

  it("names the bad variables without echoing their values", () => {
    const attempt = () =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url-secret" });
    expect(attempt).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(attempt).not.toThrow(/not-a-url-secret/);
  });

  it("rejects a missing key", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(/PUBLISHABLE_KEY/);
  });
});

// Real-shaped throwaway values: 87 and 43 base64url characters, never a working key pair.
const VAPID_PUBLIC = "B".repeat(87);
const VAPID_PRIVATE = "k".repeat(43);

describe("VAPID public key", () => {
  it("is optional and validated by shape", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBeUndefined();
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID_PUBLIC })
        .NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ).toBe(VAPID_PUBLIC);
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "short" })).toThrow(
      /NEXT_PUBLIC_VAPID_PUBLIC_KEY/,
    );
  });
});

describe("pushConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // env.server caches its parse and is guarded by `server-only`, so each case loads a fresh copy.
  async function load(vapid: { publicKey?: string; privateKey?: string; subject?: string }) {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", valid.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    vi.stubEnv("CRON_SECRET", "c".repeat(16));
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey ?? "");
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey ?? "");
    vi.stubEnv("VAPID_SUBJECT", vapid.subject ?? "");
    return import("./env.server");
  }

  it("is null unless both keys are set", async () => {
    expect((await load({})).pushConfig()).toBeNull();
    expect((await load({ publicKey: VAPID_PUBLIC })).pushConfig()).toBeNull();
    expect((await load({ privateKey: VAPID_PRIVATE })).pushConfig()).toBeNull();
  });

  it("returns both keys and the site address as the default subject", async () => {
    const { pushConfig } = await load({ publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE });
    expect(pushConfig()).toEqual({
      publicKey: VAPID_PUBLIC,
      privateKey: VAPID_PRIVATE,
      subject: "https://www.cincysports.xyz",
    });
  });

  it("accepts a mailto or https subject and refuses anything else", async () => {
    const keys = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE };
    expect(
      (await load({ ...keys, subject: "mailto:league@example.com" })).pushConfig()?.subject,
    ).toBe("mailto:league@example.com");
    await expect(async () =>
      (await load({ ...keys, subject: "http://example.com" })).pushConfig(),
    ).rejects.toThrow(/VAPID_SUBJECT/);
  });

  it("names a malformed private key without echoing it", async () => {
    const { pushConfig } = await load({ publicKey: VAPID_PUBLIC, privateKey: "not-a-key" });
    expect(pushConfig).toThrow(/VAPID_PRIVATE_KEY/);
    expect(pushConfig).not.toThrow(/not-a-key/);
  });
});
