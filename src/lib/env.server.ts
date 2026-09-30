import "server-only";
import { z } from "zod";
import { publicEnv } from "./env";

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
  // Web Push signing key: unpadded base64url of a 32-byte P-256 scalar. Optional so local dev runs
  // without push; alerts are then skipped. Rotating it invalidates every device subscription.
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
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined,
    });
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment variables: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Everything needed to sign a Web Push request. Holds the private key, so never log it. */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/**
 * Push is configured only when BOTH keys are set; a half-configured deploy (say the public key
 * baked into a build but no private key yet) behaves exactly like an unconfigured one, so the UI
 * and the sender agree on whether alerts exist.
 */
export function pushConfig(): VapidConfig | null {
  const publicKey = publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const { VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = serverEnv();
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}
