import { z } from "zod";

/**
 * Public env: safe to ship to the browser. Next inlines NEXT_PUBLIC_* at build time, but only for
 * literal `process.env.NAME` reads, so each is listed explicitly instead of passing process.env.
 * Server-only secrets live in `env.server.ts`.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // Canonical origin for absolute URLs (metadataBase). Set it in production; local dev falls back.
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // Google Search Console HTML-tag token. Optional; empty means no verification tag is rendered.
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().trim().min(1).optional(),
  // Web Push (VAPID) public key: unpadded base64url of a 65-byte P-256 point. Public by design (the
  // browser needs it to subscribe). Optional: without it push alerts are simply "not available".
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{87}$/)
    .optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const parsed = publicSchema.safeParse(source);
  if (!parsed.success) {
    // Names only: never echo values, they may be secrets in a misconfigured deploy.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid public environment variables: ${names}`);
  }
  return parsed.data;
}

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  });
  return cached;
}
