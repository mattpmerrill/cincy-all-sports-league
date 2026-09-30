import { describe, expect, it } from "vitest";
import { base64UrlToBytes, detectPushSupport, sameKey, type PushSupportEnv } from "./support";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
// iPadOS 13+ sends this desktop Safari string.
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const desktop: PushSupportEnv = {
  userAgent: CHROME_MAC,
  maxTouchPoints: 0,
  navigatorStandalone: undefined,
  displayModeStandalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  vapidKey: "K".repeat(87),
  configured: true,
};
const env = (over: Partial<PushSupportEnv> = {}): PushSupportEnv => ({ ...desktop, ...over });

describe("detectPushSupport", () => {
  it("is ready on a capable browser, carrying the permission", () => {
    expect(detectPushSupport(env())).toEqual({ status: "ready", permission: "default" });
    expect(detectPushSupport(env({ permission: "granted" }))).toEqual({
      status: "ready",
      permission: "granted",
    });
  });

  it("is denied once notifications are blocked", () => {
    expect(detectPushSupport(env({ permission: "denied" }))).toEqual({ status: "denied" });
  });

  it.each([
    ["no service worker (an insecure page)", { hasServiceWorker: false }],
    ["no PushManager", { hasPushManager: false }],
    ["no Notification API", { hasNotification: false }],
  ])("is unsupported with %s", (_name, over) => {
    expect(detectPushSupport(env(over))).toEqual({ status: "unsupported" });
  });

  it("is not_configured without the public key, or when the SERVER says it cannot send", () => {
    expect(detectPushSupport(env({ vapidKey: undefined }))).toEqual({ status: "not_configured" });
    expect(detectPushSupport(env({ vapidKey: null }))).toEqual({ status: "not_configured" });
    // The key is baked into the build, but the private key may be missing or mismatched.
    expect(detectPushSupport(env({ configured: false }))).toEqual({ status: "not_configured" });
  });

  it("puts not_configured ahead of everything, so nobody is told to install for nothing", () => {
    expect(
      detectPushSupport(
        env({
          userAgent: IPHONE,
          hasPushManager: false,
          hasNotification: false,
          configured: false,
        }),
      ),
    ).toEqual({ status: "not_configured" });
  });

  describe("iOS", () => {
    const safariTab = {
      userAgent: IPHONE,
      maxTouchPoints: 5,
      // PushManager does not exist in a Safari tab, and that must read as "install", not "unsupported".
      hasPushManager: false,
    };

    it("needs the app on the Home Screen, whichever way the browser says so", () => {
      expect(detectPushSupport(env(safariTab))).toEqual({ status: "ios_needs_install" });
    });

    it("is ready once installed, by either standalone signal", () => {
      expect(
        detectPushSupport(env({ ...safariTab, hasPushManager: true, navigatorStandalone: true })),
      ).toEqual({ status: "ready", permission: "default" });
      expect(
        detectPushSupport(env({ ...safariTab, hasPushManager: true, displayModeStandalone: true })),
      ).toEqual({ status: "ready", permission: "default" });
    });

    it("treats iPadOS's desktop user agent plus touch points as iOS", () => {
      const ipad = env({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5, hasPushManager: false });
      expect(detectPushSupport(ipad)).toEqual({ status: "ios_needs_install" });
    });

    it("does not mistake a real Mac (no touch) for an iPad", () => {
      expect(detectPushSupport(env({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 }))).toEqual({
        status: "ready",
        permission: "default",
      });
    });

    it("needs no Notification API to say install: an iOS Safari tab has none", () => {
      const tab = env({ ...safariTab, hasNotification: false, permission: undefined });
      expect(detectPushSupport(tab)).toEqual({ status: "ios_needs_install" });
    });

    it("reports unsupported for an installed app whose iOS has no push", () => {
      const old = env({ ...safariTab, navigatorStandalone: true, hasNotification: false });
      expect(detectPushSupport(old)).toEqual({ status: "unsupported" });
    });
  });
});

describe("base64UrlToBytes", () => {
  it("decodes unpadded base64url, including the - and _ characters", () => {
    // 0xfb 0xff 0xfe is "+//+" in base64 and "-__-" in base64url.
    expect([...base64UrlToBytes("-__-")]).toEqual([0xfb, 0xff, 0xfe]);
    // Lengths that need one or two padding characters.
    expect([...base64UrlToBytes("AQI")]).toEqual([1, 2]);
    expect([...base64UrlToBytes("AQ")]).toEqual([1]);
  });

  it("decodes a padded string the same way", () => {
    expect([...base64UrlToBytes("AQI=")]).toEqual([1, 2]);
  });

  it("gives 65 bytes for a VAPID public key", () => {
    expect(base64UrlToBytes("B".repeat(86) + "A")).toHaveLength(65);
  });
});

describe("sameKey", () => {
  const key = base64UrlToBytes("BAECAwQ");

  it("compares bytes, whether given an ArrayBuffer or a view", () => {
    expect(sameKey(key.buffer, key)).toBe(true);
    expect(sameKey(new Uint8Array([4, 1, 2, 3, 4]), key)).toBe(true);
    expect(sameKey(new Uint8Array([4, 1, 2, 3, 5]), key)).toBe(false);
    expect(sameKey(new Uint8Array([4, 1, 2, 3]), key)).toBe(false);
  });

  it("reads a view into a larger buffer by its own window", () => {
    const backing = new Uint8Array([9, 9, 4, 1, 2, 3, 4, 9]);
    expect(sameKey(new Uint8Array(backing.buffer, 2, 5), key)).toBe(true);
  });

  it("never matches a subscription that recorded no key", () => {
    expect(sameKey(null, key)).toBe(false);
    expect(sameKey(undefined, key)).toBe(false);
    expect(sameKey(null, null)).toBe(false);
  });
});
