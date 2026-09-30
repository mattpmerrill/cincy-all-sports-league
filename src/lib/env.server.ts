import "server-only";
import { z } from "zod";
import { publicEnv } from "./env";
import { logger } from "./logger";

/** Server-only secrets. The `server-only` import makes a client-side import a build error. */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  // Optional so local dev runs without email: sending then fails with `email_not_configured`.
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  // Signs unsubscribe links. Rotating it invalidates every link already sent.
  DIGEST_SIGNING_SECRET: z.string().min(32).optional(),
  DIGEST_FROM: z
    .string()
    .trim()
    .min(3)
    .default("Cincy's All-Sports League <league@cincysports.xyz>"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      // `|| undefined`: an empty line in .env.local means "not set", not "invalid".
      RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
      DIGEST_SIGNING_SECRET: process.env.DIGEST_SIGNING_SECRET || undefined,
      DIGEST_FROM: process.env.DIGEST_FROM || undefined,
    });
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment variables: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/**
 * Parsed apart from `serverEnv()` on purpose: push is optional, so a malformed VAPID variable must
 * switch push off, not make every caller of `serverEnv()` (sync, trades, digest) throw.
 */
const vapidSchema = z.object({
  // Signing key: unpadded base64url of a 32-byte P-256 scalar. Rotating it invalidates every
  // device subscription.
  VAPID_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  // The contact push services see (RFC 8292 `sub`). A site address, so no personal email leaves us.
  VAPID_SUBJECT: z
    .string()
    .trim()
    .regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/)
    .default("https://www.cincysports.xyz"),
});

/** Everything needed to sign a Web Push request. Holds the private key, so never log it. */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

let warnedInvalidVapid = false;
let warnedInvalidPublicKey = false;

/**
 * Push is configured only when BOTH keys are set and well formed; anything else (a half-configured
 * deploy, a mistyped variable) behaves exactly like an unconfigured one, so the UI and the sender
 * agree on whether alerts exist. A malformed variable is reported once, by NAME only: values may
 * be the private key.
 */
export function pushConfig(): VapidConfig | null {
  const publicKey = publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  // `publicEnv()` reads a malformed public key as unset so the whole app keeps rendering, which
  // would otherwise leave an operator wondering why push is off. Name only, never the value.
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !publicKey && !warnedInvalidPublicKey) {
    warnedInvalidPublicKey = true;
    logger.error("push alerts are off: invalid VAPID environment variables", {
      names: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    });
  }
  const parsed = vapidSchema.safeParse({
    // `|| undefined`: an empty line in .env.local means "not set", not "invalid".
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined,
  });
  if (!parsed.success) {
    if (!warnedInvalidVapid) {
      warnedInvalidVapid = true;
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      logger.error("push alerts are off: invalid VAPID environment variables", { names });
    }
    return null;
  }
  const { VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = parsed.data;
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}
