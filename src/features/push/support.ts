/**
 * What this browser can do about push alerts, as one state the UI switches on. Pure: the caller
 * reads `navigator`, `Notification` and `matchMedia` and passes the facts in, so every platform
 * quirk is testable without a browser.
 */
export type PushSupportEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.standalone`: iOS's own flag for a Home Screen app. Undefined elsewhere. */
  navigatorStandalone: boolean | undefined;
  /** `matchMedia("(display-mode: standalone)").matches`. */
  displayModeStandalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Undefined where there is no `Notification` at all (an iOS Safari tab). */
  permission: NotificationPermission | undefined;
  /** The public VAPID key the build was given, if any. */
  vapidKey: string | null | undefined;
  /**
   * Whether the SERVER can send (`getSettings().configured`). The public key alone says nothing
   * about the private one, and a prompt that leads to a device nobody can alert is worse than none.
   */
  configured: boolean;
};

export type PushSupport =
  | { status: "unsupported" }
  | { status: "not_configured" }
  | { status: "ios_needs_install" }
  | { status: "denied" }
  | { status: "ready"; permission: "default" | "granted" };

/**
 * iPadOS 13+ sends a desktop Safari user agent ("Macintosh"), and a real Mac has no touch screen,
 * so a Mac user agent with more than one touch point is an iPad.
 */
function isIos(env: Pick<PushSupportEnv, "userAgent" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function detectPushSupport(env: PushSupportEnv): PushSupport {
  // Before anything else: with nothing to send, asking a member to install or allow anything
  // would only lead them to a dead end.
  if (!env.configured || !env.vapidKey) return { status: "not_configured" };

  // iOS delivers push only to a Home Screen app, and in a Safari tab `PushManager` does not exist,
  // so this must come before the feature check or the member would be told "unsupported" when
  // the answer is "install it".
  if (isIos(env) && env.navigatorStandalone !== true && !env.displayModeStandalone) {
    return { status: "ios_needs_install" };
  }

  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return { status: "unsupported" };
  }
  if (env.permission === "denied") return { status: "denied" };
  // Undefined only if the caller has `Notification` but could not read it; nothing was decided.
  return { status: "ready", permission: env.permission ?? "default" };
}

/**
 * Decodes an unpadded or padded base64url string, which is how a VAPID public key is written and
 * what `pushManager.subscribe` wants as bytes.
 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function asBytes(source: BufferSource): Uint8Array {
  return source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

/**
 * Whether a subscription was made with this VAPID key. After a key rotation the old subscription
 * still exists in the browser but every push service refuses it, so a mismatch means "subscribe
 * again". A subscription with no recorded key never matches.
 */
export function sameKey(
  a: BufferSource | null | undefined,
  b: BufferSource | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = asBytes(a);
  const right = asBytes(b);
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}
