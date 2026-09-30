import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, pushServiceHost } from "./endpoint";

describe("isAllowedPushEndpoint", () => {
  it("accepts the real endpoints of every push service", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bE",
      "https://fcm.googleapis.com/wp/abc123",
      "https://android.googleapis.com/gcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
      "https://web.push.apple.com/QGvnBvUV7q",
      "https://regional.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
      "https://db5p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("rejects anything that is not https to a push service host", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://127.0.0.1/fcm/send/abc",
      "https://[::1]/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.evil.com/fcm/send/abc",
      "https://evil.com/fcm.googleapis.com",
      "https://evil.com/?u=fcm.googleapis.com",
      "https://evil.com#@fcm.googleapis.com",
      "https://evilfcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com@evil.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://googleapis.com/fcm/send/abc",
      "https://push.apple.com.evil.com/abc",
      "https://evilpush.apple.com/abc",
      "https://apple.com/abc",
      "ftp://fcm.googleapis.com/x",
      "fcm.googleapis.com/fcm/send/abc",
      "",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("is not fooled by letter case", () => {
    expect(isAllowedPushEndpoint("https://FCM.GoogleAPIs.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://FCM.GoogleAPIs.com.Evil.com/x")).toBe(false);
  });
});

describe("pushServiceHost", () => {
  it("returns the host and never the path or query", () => {
    expect(pushServiceHost("https://wns2-par02p.notify.windows.com/w/?token=secret")).toBe(
      "wns2-par02p.notify.windows.com",
    );
    expect(pushServiceHost("not a url")).toBeNull();
  });
});
