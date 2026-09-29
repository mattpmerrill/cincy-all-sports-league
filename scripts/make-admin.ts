/**
 * One-off: grant the admin role to an existing user, looked up by email. This is how the first
 * admin is bootstrapped, since the app only lets admins promote others.
 *
 *   pnpm make-admin you@example.com
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from the environment (pnpm loads
 * .env.local via --env-file). The secret key bypasses RLS, so the target project is printed before
 * anything is written. The person must have signed in at least once so their profile exists.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
  })
  .parse(process.env);

const email = z.email().parse(process.argv[2]?.trim().toLowerCase());

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The admin API has no lookup by email, so page through users until it turns up. */
async function findUserId(target: string): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  console.log(`Project: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}`);

  const userId = await findUserId(email);
  if (!userId) {
    throw new Error(`No auth user with email ${email}. Sign in to the app once, then re-run.`);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId)
    .select("display_name, role")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`User ${userId} has no profile row.`);

  console.log(`${data.display_name} (${email}) is now ${data.role}.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
