import "server-only";
import { createProfilesRepository } from "@/data/profiles.repository";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUnsubscribeService } from "./unsubscribe.service";

/** Null when DIGEST_SIGNING_SECRET is unset: every link is then simply invalid. */
export function getUnsubscribeService() {
  const secret = serverEnv().DIGEST_SIGNING_SECRET;
  if (!secret) return null;
  return createUnsubscribeService({
    profiles: createProfilesRepository(createSupabaseAdminClient()),
    secret,
  });
}
