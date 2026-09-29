import "server-only";
import { createAuthRepository } from "@/data/auth.repository";
import { createProfilesRepository } from "@/data/profiles.repository";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAuthService } from "./auth.service";

/** Wires the auth service to the request's Supabase session (cookies). One per request. */
export async function getAuthService() {
  const db = await createSupabaseServerClient();
  return createAuthService({
    auth: createAuthRepository(db),
    profiles: createProfilesRepository(db),
    logger,
  });
}
