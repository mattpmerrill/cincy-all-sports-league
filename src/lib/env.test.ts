import { createECDH } from "node:crypto";
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

/** A real P-256 pair made in memory, because `pushConfig` checks that the two belong together. */
function makePair() {
  for (;;) {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const privateKey = ecdh.getPrivateKey().toString("base64url");
    // A scalar with a leading zero byte encodes shorter; draw again rather than pad.
    if (privateKey.length === 43) {
      return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey };
    }
  }
}
const PAIR = makePair();

describe("VAPID public key", () => {
  it("is optional and validated by shape", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBeUndefined();
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID_PUBLIC })
        .NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ).toBe(VAPID_PUBLIC);
  });

  it("reads a malformed value as unset instead of throwing", () => {
    for (const bad of ["short", "B".repeat(88), `${"B".repeat(86)}=`, "not a key!"]) {
      expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_VAPID_PUBLIC_KEY: bad })).toMatchObject({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
      });
    }
    // The rest of the public env is still strictly validated.
    expect(() =>
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "nope",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "x",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
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
    expect((await load({ publicKey: PAIR.publicKey })).pushConfig()).toBeNull();
    expect((await load({ privateKey: PAIR.privateKey })).pushConfig()).toBeNull();
  });

  it("returns both keys and the site address as the default subject", async () => {
    const { pushConfig } = await load({ publicKey: PAIR.publicKey, privateKey: PAIR.privateKey });
    expect(pushConfig()).toEqual({
      publicKey: PAIR.publicKey,
      privateKey: PAIR.privateKey,
      subject: "https://www.cincysports.xyz",
    });
  });

  it("turns push off when both keys are well formed but from different pairs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const other = makePair();
    const { pushConfig } = await load({ publicKey: PAIR.publicKey, privateKey: other.privateKey });
    expect(pushConfig()).toBeNull();
    expect(pushConfig()).toBeNull();
    // Names only, once: the values are the private key.
    const lines = log.mock.calls.map((call) => String(call[0]));
    log.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("VAPID_PRIVATE_KEY");
    expect(lines[0]).not.toContain(other.privateKey);
    expect(lines[0]).not.toContain(PAIR.publicKey);
  });

  it("accepts a mailto subject", async () => {
    const keys = { publicKey: PAIR.publicKey, privateKey: PAIR.privateKey };
    const { pushConfig } = await load({ ...keys, subject: "mailto:league@example.com" });
    expect(pushConfig()?.subject).toBe("mailto:league@example.com");
  });

  it.each([
    ["VAPID_PRIVATE_KEY", { privateKey: "not-a-key-secret" }],
    ["VAPID_SUBJECT", { privateKey: PAIR.privateKey, subject: "http://example.com/secret" }],
  ])("turns push off, and only names %s in the log, when it is malformed", async (name, bad) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pushConfig, serverEnv } = await load({ publicKey: PAIR.publicKey, ...bad });
    expect(pushConfig()).toBeNull();
    // A second call does not repeat the warning, and the rest of the app is unaffected.
    expect(pushConfig()).toBeNull();
    expect(() => serverEnv()).not.toThrow();

    const lines = log.mock.calls.map((call) => String(call[0]));
    log.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(name);
    expect(lines[0]).not.toMatch(/not-a-key-secret|example\.com/);
  });

  it("says which variable is why push is off when the PUBLIC key is malformed, never its value", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pushConfig } = await load({
      publicKey: "malformed-public-secret",
      privateKey: PAIR.privateKey,
    });
    expect(pushConfig()).toBeNull();
    expect(pushConfig()).toBeNull();

    const lines = log.mock.calls.map((call) => String(call[0]));
    log.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(lines[0]).not.toContain("malformed-public-secret");
  });

  it("stays quiet when the public key is simply not set", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pushConfig } = await load({ privateKey: PAIR.privateKey });
    expect(pushConfig()).toBeNull();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("emailReplyTo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(replyTo: string | undefined) {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", valid.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    vi.stubEnv("CRON_SECRET", "c".repeat(16));
    vi.stubEnv("DIGEST_REPLY_TO", replyTo ?? "");
    return import("./env.server");
  }

  it("returns a valid address, trimmed", async () => {
    const { emailReplyTo } = await load("  commissioner@example.com  ");
    expect(emailReplyTo()).toBe("commissioner@example.com");
  });

  it.each([undefined, "", "   "])("reads %j as not set, without a log line", async (value) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { emailReplyTo } = await load(value);
    expect(emailReplyTo()).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(["Matt <matt-secret@example.com>", "not-an-email-secret"])(
    "drops a malformed value (%s), keeps serverEnv() working, and logs the name once, never the value",
    async (bad) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const { emailReplyTo, serverEnv } = await load(bad);
      expect(emailReplyTo()).toBeUndefined();
      expect(emailReplyTo()).toBeUndefined();
      expect(() => serverEnv()).not.toThrow();

      const lines = log.mock.calls.map((call) => String(call[0]));
      log.mockRestore();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("DIGEST_REPLY_TO");
      expect(lines[0]).not.toMatch(/secret|example\.com/);
    },
  );
});
