import { describe, expect, it } from "vitest";
import {
  DEVICE_COPY,
  describeSubscribeFailure,
  otherDeviceCount,
  promptSupportFor,
  resolveDeviceState,
  subscriptionToInput,
  type PushDeviceState,
} from "./device-state";
import { shouldShowPrompt } from "./prompt-rules";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

describe("resolveDeviceState", () => {
  it("passes every non-ready support state through", () => {
    expect(resolveDeviceState({ status: "unsupported" }, null)).toEqual({ status: "unsupported" });
    expect(resolveDeviceState({ status: "not_configured" }, null)).toEqual({
      status: "not_configured",
    });
    expect(resolveDeviceState({ status: "ios_needs_install" }, null)).toEqual({
      status: "ios_install",
    });
    expect(resolveDeviceState({ status: "denied" }, ENDPOINT)).toEqual({ status: "denied" });
  });

  it("is on only with granted permission and a subscription", () => {
    expect(resolveDeviceState({ status: "ready", permission: "granted" }, ENDPOINT)).toEqual({
      status: "on",
      endpoint: ENDPOINT,
    });
    expect(resolveDeviceState({ status: "ready", permission: "granted" }, null)).toEqual({
      status: "off",
    });
    // A leftover subscription without permission is not "on": sync removes it.
    expect(resolveDeviceState({ status: "ready", permission: "default" }, ENDPOINT)).toEqual({
      status: "off",
    });
  });
});

describe("promptSupportFor", () => {
  const cases: [PushDeviceState, boolean][] = [
    [{ status: "checking" }, false],
    [{ status: "unsupported" }, false],
    [{ status: "not_configured" }, false],
    [{ status: "denied" }, false],
    [{ status: "on", endpoint: ENDPOINT }, false],
    [{ status: "off" }, true],
    // The card stays up while turning on and after a failure, so it can show the progress or error.
    [{ status: "working" }, true],
    [{ status: "error", message: "x" }, true],
    [{ status: "ios_install" }, true],
  ];

  it.each(cases)("feeds the prompt rules for %j", (state, shown) => {
    const facts = promptSupportFor(state);
    const show =
      facts !== null &&
      shouldShowPrompt({
        ...facts,
        signedIn: true,
        ownsTeam: true,
        pathname: "/",
        dismissal: null,
        now: 0,
      });
    expect(show).toBe(shown);
  });

  it("is unknown (null) only while checking", () => {
    expect(promptSupportFor({ status: "checking" })).toBeNull();
    expect(promptSupportFor({ status: "off" })).not.toBeNull();
  });
});

describe("otherDeviceCount", () => {
  it("takes this browser out of the server's count", () => {
    expect(otherDeviceCount(3, true)).toBe(2);
    expect(otherDeviceCount(3, false)).toBe(3);
  });

  it("never goes below zero when the count lags", () => {
    expect(otherDeviceCount(0, true)).toBe(0);
  });
});

describe("subscriptionToInput", () => {
  it("keeps the fields the server reads", () => {
    expect(
      subscriptionToInput({
        endpoint: ENDPOINT,
        expirationTime: null,
        keys: { p256dh: "p", auth: "a", extra: "ignored" },
      }),
    ).toEqual({ endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "p", auth: "a" } });
  });

  it.each([
    ["no endpoint", { keys: { p256dh: "p", auth: "a" } }],
    ["no keys", { endpoint: ENDPOINT }],
    ["no auth key", { endpoint: ENDPOINT, keys: { p256dh: "p" } }],
  ])("refuses %s", (_name, json) => {
    expect(subscriptionToInput(json)).toBeNull();
  });
});

describe("describeSubscribeFailure", () => {
  const named = (name: string) => Object.assign(new Error("browser words"), { name });

  it("explains Brave's AbortError with the setting that fixes it", () => {
    expect(describeSubscribeFailure(named("AbortError"))).toContain(
      "Use Google services for push messaging",
    );
  });

  it("never passes the browser's own message on", () => {
    expect(describeSubscribeFailure(named("NotAllowedError"))).toBe(DEVICE_COPY.notAllowed);
    expect(describeSubscribeFailure(named("InvalidStateError"))).toBe(DEVICE_COPY.generic);
    expect(describeSubscribeFailure("boom")).toBe(DEVICE_COPY.generic);
    expect(describeSubscribeFailure(null)).toBe(DEVICE_COPY.generic);
  });

  it("uses plain copy with no em-dashes", () => {
    for (const text of Object.values(DEVICE_COPY)) expect(text).not.toMatch(/[–—]/);
  });
});
