import { createECDH } from "node:crypto";
import * as webpush from "web-push";
import type { PushTarget, PushUrgency } from "@/domain/push";
import type { VapidConfig } from "@/lib/env.server";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type PushSendErrorCode =
  | "push_not_configured" // no (or unusable) VAPID keys: local dev, or a deploy missing them
  | "push_endpoint_not_allowed" // never returned here: delivery refuses off-list hosts before sending
  | "push_gone" // 404/410: the browser dropped the subscription, so the row should go too
  | "push_invalid_subscription" // the stored keys cannot be used to encrypt
  | "push_rejected" // any other 4xx (403 after a key mismatch, 413): retrying cannot help
  | "push_rate_limited" // 429 after every retry
  | "push_unavailable" // 5xx after every retry
  | "push_timeout"
  | "push_network";

export type PushSendError = AppError<PushSendErrorCode>;

export type PushSendOptions = { ttlSeconds: number; urgency: PushUrgency };

export type PushSender = {
  /**
   * Whether the keys can sign and belong together. Delivery asks before it claims anything, so a
   * broken pair cannot use up dedupe keys for alerts that were never sent.
   */
  ready: () => boolean;
  /**
   * Encrypts `payload` for the device and POSTs it to the device's push service. `payload` is the
   * JSON from `encodePushPayload`. Never throws for an expected failure.
   */
  sendPush: (
    target: PushTarget,
    payload: string,
    options: PushSendOptions,
  ) => Promise<Result<null, PushSendError>>;
};

export type PushSenderOptions = {
  /** Null means "not configured": every send returns `push_not_configured`. */
  config: VapidConfig | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

const DEFAULTS = { timeoutMs: 5_000, maxAttempts: 2, fallbackDelayMs: 500, maxRetryAfterMs: 3_000 };
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTransient = (status: number) => status === 429 || status >= 500;

/** Honors Retry-After (seconds) but never waits longer than the delivery budget can afford. */
function retryDelay(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, DEFAULTS.maxRetryAfterMs)
    : DEFAULTS.fallbackDelayMs;
}

/** An unread body keeps its socket busy; the answer is not needed, so let it go. */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The connection is being dropped anyway.
  }
}

/**
 * Whether the pair can sign and belongs together. A key that merely parses passes web-push's own
 * checks, and a public key that does not match the private one is refused by every push service
 * with a 403. Left unchecked that would count a failure against EVERY device and prune them all
 * after five sends, so a half-rotated pair is caught here and reported as our misconfiguration.
 */
function vapidUsable(config: VapidConfig): boolean {
  try {
    webpush.getVapidHeaders(
      "https://push.invalid",
      config.subject,
      config.publicKey,
      config.privateKey,
      "aes128gcm",
    );
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(config.privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(config.publicKey, "base64url"));
  } catch {
    return false;
  }
}

/**
 * The only place that knows `web-push` exists. The library does the two hard parts (RFC 8291
 * payload encryption and the RFC 8292 VAPID JWT); the request itself goes through our own `fetch`
 * so it gets the same timeout and bounded retry as every other outbound call.
 *
 * It does not check the endpoint against the push-service allow-list: that is a rule about what a
 * member may register (`isAllowedPushEndpoint`, applied where subscriptions come in), and the
 * integration test points this at a local server. Error messages never contain the endpoint, the
 * keys or the response body.
 */
export function createPushSender(options: PushSenderOptions): PushSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const { config } = options;
  let usable: boolean | undefined;

  const ready = (): boolean => {
    if (!config) return false;
    usable ??= vapidUsable(config);
    return usable;
  };

  return {
    ready,
    async sendPush(target, payload, sendOptions) {
      if (!config) {
        return err("push_not_configured", "Push alerts are not configured (VAPID keys).");
      }
      if (!ready()) return err("push_not_configured", "The VAPID keys are not usable.");

      let request: { url: string; headers: Record<string, string>; body: Uint8Array<ArrayBuffer> };
      try {
        const details = webpush.generateRequestDetails(
          { endpoint: target.endpoint, keys: target.keys },
          payload,
          {
            TTL: sendOptions.ttlSeconds,
            urgency: sendOptions.urgency,
            contentEncoding: "aes128gcm",
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
          },
        );
        // fetch computes Content-Length itself and refuses a header that disagrees with the body.
        const headers = Object.fromEntries(
          Object.entries(details.headers)
            .filter(([name]) => name.toLowerCase() !== "content-length")
            .map(([name, value]) => [name, String(value)]),
        );
        request = { url: details.endpoint, headers, body: new Uint8Array(details.body) };
      } catch {
        // The keys were checked above, so what is left is this device's subscription. web-push's
        // messages can quote it, so none of that text is passed on.
        return err("push_invalid_subscription", "The device's subscription could not be used.");
      }

      let last: PushSendError = { code: "push_network", message: "Push request failed" };
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(request.url, {
            method: "POST",
            headers: request.headers,
            body: request.body,
            // A push service answering with a redirect must not bounce our POST to another host.
            redirect: "error",
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (cause) {
          // Not retried: without a response we cannot know whether the push service took it, and a
          // second copy of an alert is worse than a missed one.
          const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
          return timedOut
            ? err("push_timeout", "The push service timed out")
            : err("push_network", "Could not reach the push service");
        }

        await discard(response);
        if (response.ok) return ok(null);
        if (response.status === 404 || response.status === 410) {
          return err("push_gone", "The device is no longer subscribed");
        }
        if (!isTransient(response.status)) {
          return err("push_rejected", `The push service rejected the alert (${response.status})`);
        }
        last =
          response.status === 429
            ? { code: "push_rate_limited", message: "The push service is rate limiting us" }
            : {
                code: "push_unavailable",
                message: `The push service responded ${response.status}`,
              };
        if (attempt < maxAttempts) await sleep(retryDelay(response));
      }
      return { ok: false, error: last };
    },
  };
}
