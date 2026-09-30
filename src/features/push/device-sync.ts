import { z } from "zod";

/** localStorage key for the marker. This module owns the shape; the device hook only stores it. */
export const DEVICE_MARKER_KEY = "cincy:push-device";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A subscription is re-registered at most this often. It heals a lost row and a rotated endpoint. */
export const DEVICE_REFRESH_MS = DAY_MS;

/**
 * Who turned alerts on in this browser, and when the server last heard about it (epoch ms). The
 * subscription itself lives in the service worker registration and cannot say whose it is, so
 * this marker is the only link between a browser subscription and a member.
 */
export const deviceMarkerSchema = z.object({
  userId: z.string().min(1).max(64),
  syncedAt: z.number().int().min(0),
});
export type DeviceMarker = z.infer<typeof deviceMarkerSchema>;

/** Unreadable means "no marker": the safe reading, see `decideDeviceSync`. */
export function parseDeviceMarker(raw: string | null): DeviceMarker | null {
  if (raw === null) return null;
  try {
    const parsed = deviceMarkerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type DeviceSyncInput = {
  /** The signed-in member, or null when signed out. */
  userId: string | null;
  marker: DeviceMarker | null;
  permission: NotificationPermission;
  hasSubscription: boolean;
  /** Whether the subscription was made with the current VAPID public key (`sameKey`). */
  keyMatches: boolean;
  /** Epoch ms of the last successful register, or null when never. */
  lastSyncedAt: number | null;
  now: number;
};

export type DeviceSyncDecision =
  /** Unsubscribe in the browser and clear the marker: the subscription is not this member's. */
  | "drop_browser_subscription"
  /** Tell the server this device is gone, unsubscribe in the browser and clear the marker. */
  | "forget_server"
  /** The VAPID key changed: unsubscribe so the member is asked again. */
  | "resubscribe_needed"
  /** Register again to heal an expired or lost server row. */
  | "refresh_server"
  | "none";

/**
 * What this browser should do about its push subscription, checked on every route change. The
 * order is the priority: who owns the subscription comes before anything about its health.
 */
export function decideDeviceSync(input: DeviceSyncInput): DeviceSyncDecision {
  const { userId, marker } = input;

  // Signed out, or signed in as someone other than the member who turned alerts on (a shared
  // phone): the alerts on this device belong to the previous member. A subscription with no
  // marker cannot be proven to be this member's either, and dropping it costs one tap on the
  // prompt, while keeping it could deliver one member's trades to another's screen.
  if (userId === null || marker?.userId !== userId) {
    return input.hasSubscription ? "drop_browser_subscription" : "none";
  }

  // The member took notifications away in browser settings. The browser has usually dropped the
  // subscription too, so the server row is removed now instead of waiting for a 410.
  if (input.permission === "denied") return "forget_server";

  if (!input.hasSubscription) return "none";
  if (!input.keyMatches) return "resubscribe_needed";
  if (input.lastSyncedAt === null || input.now - input.lastSyncedAt > DEVICE_REFRESH_MS) {
    return "refresh_server";
  }
  return "none";
}
