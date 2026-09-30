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
  userId: "u1",
  marker: { userId: "u1", syncedAt: NOW - HOUR },
  permission: "granted",
  hasSubscription: true,
  keyMatches: true,
  lastSyncedAt: NOW - HOUR,
  now: NOW,
};
const decide = (over: Partial<DeviceSyncInput> = {}) => decideDeviceSync({ ...healthy, ...over });

describe("decideDeviceSync", () => {
  it("leaves a healthy, recently synced device alone", () => {
    expect(decide()).toBe("none");
  });

  describe("whose subscription is it", () => {
    it("drops the browser subscription when signed out", () => {
      expect(decide({ userId: null })).toBe("drop_browser_subscription");
    });

    it("drops it when the marker belongs to another member (a shared phone)", () => {
      expect(decide({ userId: "u2" })).toBe("drop_browser_subscription");
    });

    it("drops one it cannot prove is this member's (no marker)", () => {
      expect(decide({ marker: null, lastSyncedAt: null })).toBe("drop_browser_subscription");
    });

    it("does nothing when there is no subscription to drop", () => {
      expect(decide({ userId: null, hasSubscription: false })).toBe("none");
      expect(decide({ userId: "u2", hasSubscription: false })).toBe("none");
      expect(decide({ marker: null, hasSubscription: false })).toBe("none");
    });

    it("checks ownership before permission, so a signed-out device is dropped, not 'forgotten'", () => {
      expect(decide({ userId: null, permission: "denied" })).toBe("drop_browser_subscription");
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
    expect(decide({ keyMatches: false, lastSyncedAt: null })).toBe("resubscribe_needed");
  });

  describe("refreshing the server", () => {
    it("re-registers once more than 24 hours have passed", () => {
      expect(decide({ lastSyncedAt: NOW - DEVICE_REFRESH_MS })).toBe("none");
      expect(decide({ lastSyncedAt: NOW - DEVICE_REFRESH_MS - 1 })).toBe("refresh_server");
    });

    it("re-registers when it has never synced", () => {
      expect(decide({ lastSyncedAt: null })).toBe("refresh_server");
    });
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
