import type { PushSubscriptionInput } from "./schemas";
import type { PushSupport } from "./support";

/**
 * What the alerts UI knows about THIS browser, as one state to switch on. `checking` is the state
 * before the browser has been asked (and the only one a server render can produce), so the UI
 * shows a skeleton rather than guessing "off".
 */
export type PushDeviceState =
  | { status: "checking" }
  | { status: "unsupported" }
  | { status: "not_configured" }
  | { status: "ios_install" }
  | { status: "denied" }
  | { status: "off" }
  | { status: "on"; endpoint: string }
  | { status: "working" }
  | { status: "error"; message: string };

/**
 * Maps what the browser can do, plus the endpoint of the subscription it already holds, to a
 * state. A subscription only counts while permission is granted: a browser that took the
 * permission away has usually dropped it too, and one that has not is cleaned up by device sync.
 */
export function resolveDeviceState(support: PushSupport, endpoint: string | null): PushDeviceState {
  switch (support.status) {
    case "unsupported":
      return { status: "unsupported" };
    case "not_configured":
      return { status: "not_configured" };
    case "ios_needs_install":
      return { status: "ios_install" };
    case "denied":
      return { status: "denied" };
    case "ready":
      return support.permission === "granted" && endpoint
        ? { status: "on", endpoint }
        : { status: "off" };
  }
}

/**
 * What the in-app prompt's rules see for a device state, or null while it is unknown. A turn-on
 * that is running or failed still counts as "ready, not on", so the card stays up to show the
 * progress or the error instead of vanishing under the member's finger.
 */
export function promptSupportFor(
  state: PushDeviceState,
): { support: PushSupport; hasSubscription: boolean } | null {
  switch (state.status) {
    case "checking":
      return null;
    case "unsupported":
      return { support: { status: "unsupported" }, hasSubscription: false };
    case "not_configured":
      return { support: { status: "not_configured" }, hasSubscription: false };
    case "ios_install":
      return { support: { status: "ios_needs_install" }, hasSubscription: false };
    case "denied":
      return { support: { status: "denied" }, hasSubscription: false };
    case "off":
    case "working":
    case "error":
      return { support: { status: "ready", permission: "default" }, hasSubscription: false };
    case "on":
      return { support: { status: "ready", permission: "granted" }, hasSubscription: true };
  }
}

/**
 * The "Also on N other devices" number. The server's count includes this browser once it is
 * registered, so it is taken out; a count that lags by one (the daily refresh heals it) never
 * goes below zero.
 */
export function otherDeviceCount(deviceCount: number, thisBrowserOn: boolean): number {
  return Math.max(0, deviceCount - (thisBrowserOn ? 1 : 0));
}

/**
 * `PushSubscription.toJSON()` has every field optional. The server validates again, so this only
 * checks that the fields exist and drops the ones the server ignores.
 */
export function subscriptionToInput(json: {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: Record<string, string>;
}): PushSubscriptionInput | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return {
    endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

/** Every sentence the device code can show, so the words live in one place and one test. */
export const DEVICE_COPY = {
  brave:
    'Your browser blocked its push service. If you use Brave, turn on "Use Google services for push messaging" in its privacy settings, then try again.',
  notAllowed:
    "Your browser didn't allow alerts. Check this site's notification setting, then try again.",
  closedPrompt:
    "You closed the permission prompt, so alerts are still off. Try again when you're ready.",
  noPermissionApi: "This browser can't show push alerts.",
  signedOut: "Sign in again, then turn alerts on.",
  network: "We couldn't reach the server. Check your connection and try again.",
  generic: "We couldn't turn alerts on. Try again in a moment.",
} as const;

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}

/**
 * A plain sentence for a browser error while subscribing. Brave with push messaging switched off
 * fails `subscribe` with an AbortError, which says nothing to a member, so it gets the hint that
 * fixes it. The browser's own message is never shown.
 */
export function describeSubscribeFailure(error: unknown): string {
  switch (errorName(error)) {
    case "AbortError":
      return DEVICE_COPY.brave;
    case "NotAllowedError":
      return DEVICE_COPY.notAllowed;
    default:
      return DEVICE_COPY.generic;
  }
}
