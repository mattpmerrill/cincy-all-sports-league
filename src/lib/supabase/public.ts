import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Anonymous, cookie-free client for the public league read model. It has no session, so it is
 * safe inside a cached function (cookies() is forbidden there) and RLS sees the `anon` role, which
 * is exactly what the public pages are allowed to read.
 */
export function createSupabasePublicClient() {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
