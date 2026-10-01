import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type EmailErrorCode =
  | "email_not_configured" // no API key: local dev, or a deploy missing the secret
  | "email_network"
  | "email_timeout"
  | "email_rate_limited" // 429 after every retry
  | "email_unavailable" // 5xx after every retry
  | "email_rejected" // any other 4xx: the request itself is wrong, retrying cannot help
  | "email_shape"; // 2xx whose body no longer has the id we rely on

export type EmailError = AppError<EmailErrorCode>;

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Makes a retry (or a repeated run) deliver at most once; Resend remembers it for 24 hours. */
  idempotencyKey?: string;
};

export type EmailSender = {
  sendEmail: (email: OutgoingEmail) => Promise<Result<{ id: string }, EmailError>>;
};

export type EmailSenderOptions = {
  /** Undefined means "not configured": every send returns `email_not_configured`. */
  apiKey: string | undefined;
  from: string;
  /** Where replies go. Needed when `from` is a send-only address that cannot receive mail. */
  replyTo?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

const ENDPOINT = "https://api.resend.com/emails";
const DEFAULTS = { timeoutMs: 10_000, maxAttempts: 3, baseDelayMs: 500, maxRetryAfterMs: 5_000 };
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const responseSchema = z.object({ id: z.string().min(1) });

const isTransient = (status: number) => status === 429 || status >= 500;

/** Honors Retry-After (seconds) but never waits longer than a serverless function can afford. */
function retryDelay(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get("retry-after"));
  const fallback = DEFAULTS.baseDelayMs * 2 ** (attempt - 1);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, DEFAULTS.maxRetryAfterMs)
    : fallback;
}

/**
 * The only place that knows Resend exists. Callers see `OutgoingEmail` in and a typed `Result`
 * out; nothing about the vendor's payloads leaves this folder. Error messages never include the
 * recipient or the response body.
 */
export function createEmailSender(options: EmailSenderOptions): EmailSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;

  return {
    async sendEmail(email) {
      if (!options.apiKey) {
        return err("email_not_configured", "Email sending is not configured (RESEND_API_KEY).");
      }

      const headers: Record<string, string> = {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      };
      if (email.idempotencyKey) headers["idempotency-key"] = email.idempotencyKey;
      const body = JSON.stringify({
        from: options.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
        // Resend's field is snake_case. JSON.stringify drops it when undefined, so unset stays exactly as before.
        reply_to: options.replyTo,
      });

      let last: EmailError = { code: "email_network", message: "Email request failed" };
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (cause) {
          // Not retried: without a response we can't know whether Resend accepted the message.
          const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
          return timedOut
            ? err("email_timeout", "The email provider timed out")
            : err("email_network", "Could not reach the email provider");
        }

        if (response.ok) {
          const parsed = responseSchema.safeParse(await response.json().catch(() => null));
          return parsed.success
            ? ok({ id: parsed.data.id })
            : err("email_shape", "The email provider's response was not what we expected");
        }

        if (!isTransient(response.status)) {
          return err(
            "email_rejected",
            `The email provider rejected the message (${response.status})`,
          );
        }
        last =
          response.status === 429
            ? { code: "email_rate_limited", message: "The email provider is rate limiting us" }
            : {
                code: "email_unavailable",
                message: `The email provider responded ${response.status}`,
              };
        if (attempt < maxAttempts) await sleep(retryDelay(response, attempt));
      }
      return { ok: false, error: last };
    },
  };
}
