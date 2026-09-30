import { logger } from "@/lib/logger";
import { publicEnv } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createDeviceController,
  type DeviceController,
  type DevicePort,
  type DeviceSubscription,
} from "./device-controller";
import { DEVICE_MARKER_KEY, parseDeviceMarker } from "./device-sync";
import type { PushActions } from "./push-actions";
import { parseDismissal, promptDismissalKey, type PromptDismissal } from "./prompt-rules";
import { createSerialQueue } from "./serial-queue";
import { base64UrlToBytes, detectPushSupport, sameKey } from "./support";

/**
 * The browser side of the device controller: the real `navigator`, `Notification`, localStorage
 * and auth client behind the `DevicePort`. Kept thin on purpose, because none of it can run
 * outside a browser; the order of operations is in `device-controller.ts`, and every decision is
 * in the pure modules.
 */

/** Fired on `window` whenever this browser's subscription changes, so every mounted alerts component re-reads it. */
export const PUSH_DEVICE_CHANGED_EVENT = "cincy:push-device-changed";

const WORKER_URL = "/sw.js";
/** `ready` waits for an active worker; a broken registration would otherwise leave "Turning on..." forever. */
const WORKER_READY_TIMEOUT_MS = 15_000;

/** One queue for the whole page: the prompt, the profile section and sign-out all share it. */
const run = createSerialQueue();

function toDeviceSubscription(
  subscription: PushSubscription,
  vapidKey: string,
): DeviceSubscription {
  return {
    endpoint: subscription.endpoint,
    usesCurrentKey: sameKey(subscription.options.applicationServerKey, base64UrlToBytes(vapidKey)),
    toJSON: () => subscription.toJSON(),
    unsubscribe: () => subscription.unsubscribe(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function currentPermission(): NotificationPermission | undefined {
  return typeof Notification === "undefined" ? undefined : Notification.permission;
}

/** localStorage can throw (private windows, blocked storage); the marker then reads as absent. */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createBrowserPort(configured: boolean): DevicePort {
  const vapidKey = publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return {
    support: () =>
      detectPushSupport({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        navigatorStandalone:
          "standalone" in navigator && typeof navigator.standalone === "boolean"
            ? navigator.standalone
            : undefined,
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: "Notification" in window,
        permission: currentPermission(),
        vapidKey,
        configured,
      }),

    permission: currentPermission,

    requestPermission() {
      if (typeof Notification === "undefined") return Promise.resolve(undefined);
      // Some browsers throw instead of rejecting; either way the caller gets a promise.
      try {
        return Notification.requestPermission();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    async getSubscription() {
      if (!vapidKey || !("serviceWorker" in navigator)) return null;
      // getRegistration never creates one: a visitor who never turns alerts on never gets a worker.
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      return subscription ? toDeviceSubscription(subscription, vapidKey) : null;
    },

    async subscribe() {
      if (!vapidKey) throw new Error("no public key");
      // The only registration in the app. `updateViaCache: "none"` makes the browser fetch a
      // changed worker on every check instead of trusting the HTTP cache.
      await navigator.serviceWorker.register(WORKER_URL, { scope: "/", updateViaCache: "none" });
      const registration = await withTimeout(
        navigator.serviceWorker.ready,
        WORKER_READY_TIMEOUT_MS,
      );
      const subscription = await registration.pushManager.subscribe({
        // Chrome and Safari refuse a push subscription that promises to be silent.
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidKey),
      });
      return toDeviceSubscription(subscription, vapidKey);
    },

    async signedInUserId() {
      const { data } = await createSupabaseBrowserClient().auth.getSession();
      return data.session?.user.id ?? null;
    },

    marker: {
      read: () => {
        try {
          return parseDeviceMarker(storage()?.getItem(DEVICE_MARKER_KEY) ?? null);
        } catch {
          return null;
        }
      },
      write: (marker) => {
        try {
          storage()?.setItem(DEVICE_MARKER_KEY, JSON.stringify(marker));
        } catch {
          // Without a marker the next check drops the subscription: alerts turn off, safely.
        }
      },
      clear: () => {
        try {
          storage()?.removeItem(DEVICE_MARKER_KEY);
        } catch {
          // Nothing to clear if storage is unavailable.
        }
      },
    },

    now: () => Date.now(),
    announce: () => window.dispatchEvent(new Event(PUSH_DEVICE_CHANGED_EVENT)),
    warn: (message, fields) => logger.warn(message, fields),
  };
}

/** A controller wired to this browser. `configured` is the server's flag, never inferred from the public key. */
export function createBrowserDeviceController(
  actions: Pick<PushActions, "subscribe" | "unsubscribe">,
  configured: boolean,
): DeviceController {
  return createDeviceController({ port: createBrowserPort(configured), actions, run });
}

/** How long sign-out waits for the device cleanup before it goes ahead without it. */
export const SIGN_OUT_CLEANUP_TIMEOUT_MS = 4_000;

/**
 * Called by the sign-out button while the session is still valid: deletes this device's server
 * row and ends its browser subscription, so alerts stop at once on a shared phone. Never throws
 * and never waits long, so it cannot keep a member from signing out.
 */
export async function releaseDeviceBeforeSignOut(
  actions: Pick<PushActions, "subscribe" | "unsubscribe">,
): Promise<void> {
  try {
    // `configured` only gates the checks that read support; release just needs the subscription.
    await createBrowserDeviceController(actions, true).release(SIGN_OUT_CLEANUP_TIMEOUT_MS);
  } catch {
    // Sign-out goes ahead regardless.
  }
}

/** The member's "Not now" record on this browser; unreadable storage reads as "never dismissed". */
export function readPromptDismissal(userId: string): PromptDismissal | null {
  try {
    return parseDismissal(storage()?.getItem(promptDismissalKey(userId)) ?? null, userId);
  } catch {
    return null;
  }
}

export function writePromptDismissal(dismissal: PromptDismissal): void {
  try {
    storage()?.setItem(promptDismissalKey(dismissal.userId), JSON.stringify(dismissal));
  } catch {
    // Unwritable storage: the card returns on the next visit, which is the safe failure.
  }
}
