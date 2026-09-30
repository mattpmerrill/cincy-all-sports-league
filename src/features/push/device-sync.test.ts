import { describe, expect, it } from "vitest";
import {
  DEVICE_REFRESH_MS,
  decideDeviceSync,
  parseDeviceMarker,
  type DeviceSyncInput,
} from "./device-sync";

const NOW = Date.UTC(2026, 8, 29, 12);
const HOUR = 60 * 60 * 1000;

// A healthy device: alerts on for u1, synced an hour ago.
const healthy: DeviceSyncInput = {
  session: { status: "signed_in", userId: "u1" },
  marker: { userId: "u1", syncedAt: NOW - HOUR },
  permission: "granted",
  hasSubscription: true,
  keyMatches: true,
  now: NOW,
};
const signedOut = { status: "signed_out" } as const;
const signedInAs = (userId: string) => ({ status: "signed_in", userId }) as const;
const decide = (over: Partial<DeviceSyncInput> = {}) => decideDeviceSync({ ...healthy, ...over });

describe("decideDeviceSync", () => {
  it("leaves a healthy, recently synced device alone", () => {
    expect(decide()).toBe("none");
  });

  describe("whose subscription is it", () => {
    it("drops the browser subscription when signed out", () => {
      expect(decide({ session: signedOut })).toBe("drop_browser_subscription");
    });

    it("drops it when the marker belongs to another member (a shared phone)", () => {
      expect(decide({ session: signedInAs("u2") })).toBe("drop_browser_subscription");
    });

    it("drops one it cannot prove is this member's (no marker)", () => {
      expect(decide({ marker: null })).toBe("drop_browser_subscription");
    });

    it("does nothing when there is no subscription to drop", () => {
      expect(decide({ session: signedOut, hasSubscription: false })).toBe("none");
      expect(decide({ session: signedInAs("u2"), hasSubscription: false })).toBe("none");
      expect(decide({ marker: null, hasSubscription: false })).toBe("none");
    });

    it("checks ownership before permission, so a signed-out device is dropped, not 'forgotten'", () => {
      expect(decide({ session: signedOut, permission: "denied" })).toBe(
        "drop_browser_subscription",
      );
    });
  });

  describe("while the session is still loading", () => {
    const loading = { status: "loading" } as const;

    it("never touches a subscription, with or without one (a Home Screen cold start)", () => {
      expect(decide({ session: loading })).toBe("none");
      expect(decide({ session: loading, hasSubscription: false })).toBe("none");
    });

    it("does nothing whoever the marker names, and whatever else looks wrong", () => {
      const other = { userId: "u2", syncedAt: NOW - HOUR };
      expect(decide({ session: loading, marker: other })).toBe("none");
      expect(decide({ session: loading, marker: null })).toBe("none");
      expect(decide({ session: loading, permission: "denied" })).toBe("none");
      expect(decide({ session: loading, keyMatches: false })).toBe("none");
      expect(decide({ session: loading, marker: { userId: "u1", syncedAt: 0 } })).toBe("none");
    });
  });

  it("forgets the server row when the owner took permission away", () => {
    expect(decide({ permission: "denied" })).toBe("forget_server");
    // The browser usually drops the subscription too; the server row still has to go.
    expect(decide({ permission: "denied", hasSubscription: false })).toBe("forget_server");
  });

  it("does nothing for the owner when the browser has no subscription (the prompt takes over)", () => {
    expect(decide({ hasSubscription: false })).toBe("none");
  });

  it("asks to resubscribe when the VAPID key changed, ahead of a refresh", () => {
    expect(decide({ keyMatches: false })).toBe("resubscribe_needed");
    expect(decide({ keyMatches: false, marker: { userId: "u1", syncedAt: 0 } })).toBe(
      "resubscribe_needed",
    );
  });

  describe("refreshing the server", () => {
    const syncedAgo = (ms: number) => ({ userId: "u1", syncedAt: NOW - ms });

    it("re-registers once more than 24 hours have passed since the marker's stamp", () => {
      expect(decide({ marker: syncedAgo(DEVICE_REFRESH_MS) })).toBe("none");
      expect(decide({ marker: syncedAgo(DEVICE_REFRESH_MS + 1) })).toBe("refresh_server");
    });
  });

  it("treats an unreadable permission (no Notification API) as not denied", () => {
    expect(decide({ permission: undefined })).toBe("none");
  });
});

describe("parseDeviceMarker", () => {
  it("round-trips a marker", () => {
    const marker = { userId: "u1", syncedAt: NOW };
    expect(parseDeviceMarker(JSON.stringify(marker))).toEqual(marker);
  });

  it.each([
    ["nothing stored", null],
    ["not JSON", "{oops"],
    ["no user", '{"syncedAt":5}'],
    ["an empty user", '{"userId":"","syncedAt":5}'],
    ["a text time", '{"userId":"u1","syncedAt":"now"}'],
    ["a negative time", '{"userId":"u1","syncedAt":-1}'],
  ])("reads %s as no marker", (_name, raw) => {
    expect(parseDeviceMarker(raw)).toBeNull();
  });
});
