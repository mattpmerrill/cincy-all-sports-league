import "server-only";
import { createECDH } from "node:crypto";
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

let warnedInvalidReplyTo = false;

/**
 * The Reply-To for app email, or undefined for none. The From address cannot receive mail, so this
 * is where replies go. Read apart from `serverEnv()` on purpose, like push: a malformed value
 * (say the display-name form `Name <a@b.c>`) must drop the header, not make every caller of
 * `serverEnv()` throw. It is reported once, by NAME only, because the value is a personal address.
 */
export function emailReplyTo(): string | undefined {
  // An empty or blank value means "not set", not "invalid".
  const raw = process.env.DIGEST_REPLY_TO?.trim();
  if (!raw) return undefined;
  const parsed = z.email().safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!warnedInvalidReplyTo) {
    warnedInvalidReplyTo = true;
    logger.error("email Reply-To is off: invalid environment variable", {
      names: "DIGEST_REPLY_TO",
    });
  }
  return undefined;
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
let warnedMismatchedVapid = false;

/**
 * Whether the private key is the one the public key belongs to. Both can be well formed and still
 * be from different pairs (one was rotated, the other not); every push service then answers 403,
 * so such a deploy must read as "not configured" for the UI and the sender alike.
 */
function isKeyPair(publicKey: string, privateKey: string): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, "base64url"));
  } catch {
    return false;
  }
}
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
  if (!publicKey || !privateKey) return null;
  if (!isKeyPair(publicKey, privateKey)) {
    if (!warnedMismatchedVapid) {
      warnedMismatchedVapid = true;
      logger.error("push alerts are off: the VAPID keys are not a pair", {
        names: "NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY",
      });
    }
    return null;
  }
  return { publicKey, privateKey, subject };
}
