import "server-only";
import { z } from "zod";

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
