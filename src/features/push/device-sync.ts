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

/**
 * The browser's view of the session. `loading` is its own state, not "signed out": on a cold start
 * of a Home Screen app the session arrives after the first render, and reading that gap as a
 * sign-out would drop a legitimate subscription.
 */
export type DeviceSession =
  { status: "loading" } | { status: "signed_out" } | { status: "signed_in"; userId: string };

export type DeviceSyncInput = {
  session: DeviceSession;
  marker: DeviceMarker | null;
  /** Undefined where there is no `Notification` at all; only "denied" matters here. */
  permission: NotificationPermission | undefined;
  hasSubscription: boolean;
  /** Whether the subscription was made with the current VAPID public key (`sameKey`). */
  keyMatches: boolean;
  now: number;
};

export type DeviceSyncDecision =
  /** Unsubscribe in the browser and clear the marker: the subscription is not this member's. */
  | "drop_browser_subscription"
  /** Permission was taken away: delete the server row (when a subscription exists), end the browser subscription, clear the marker. */
  | "forget_server"
  /** The VAPID key changed: end the old subscription and, with permission granted, subscribe again silently. */
  | "resubscribe_needed"
  /** Register again to heal an expired or lost server row. */
  | "refresh_server"
  | "none";

/**
 * What this browser should do about its push subscription, checked on every route change. The
 * order is the priority: whether the session is known, then who owns the subscription, then its
 * health.
 *
 * `forget_server` deletes the server row when the browser still holds a subscription to name it
 * by. The marker stores no endpoint, and a browser that took permission away has usually dropped
 * the subscription too, so in that case there is nothing to name: the row is then removed lazily,
 * when the push service answers 404 or 410 on the next send. Signing out deletes the row at once
 * (the sign-out wrapper in `app/`), so this is the backstop for the rest.
 */
export function decideDeviceSync(input: DeviceSyncInput): DeviceSyncDecision {
  const { session, marker } = input;

  // Nothing is known about who is signed in yet, so nothing may be dropped or re-registered.
  if (session.status === "loading") return "none";

  // Signed out, or signed in as someone other than the member who turned alerts on (a shared
  // phone): the alerts on this device belong to the previous member. A subscription with no
  // marker cannot be proven to be this member's either, and dropping it costs one tap on the
  // prompt, while keeping it could deliver one member's trades to another's screen.
  if (session.status === "signed_out" || marker?.userId !== session.userId) {
    return input.hasSubscription ? "drop_browser_subscription" : "none";
  }

  // The member took notifications away in browser settings. The browser has usually dropped the
  // subscription too, so the browser side is cleaned up now.
  if (input.permission === "denied") return "forget_server";

  if (!input.hasSubscription) return "none";
  if (!input.keyMatches) return "resubscribe_needed";
  // The marker is the owner's here (checked above), so its stamp is the last time the server heard.
  return input.now - marker.syncedAt > DEVICE_REFRESH_MS ? "refresh_server" : "none";
}
