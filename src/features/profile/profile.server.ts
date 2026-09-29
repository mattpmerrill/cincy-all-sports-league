import "server-only";
import { createAuthRepository } from "@/data/auth.repository";
import { createAvatarsRepository } from "@/data/avatars.repository";
import { createProfilesRepository } from "@/data/profiles.repository";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProfileService } from "./profile.service";

/** Everything runs as the signed-in member, so RLS (tables and storage) is the final authority. */
export async function getProfileService() {
  const db = await createSupabaseServerClient();
  return createProfileService({
    profiles: createProfilesRepository(db),
    avatars: createAvatarsRepository(db),
    auth: createAuthRepository(db),
    logger: logger.child({ scope: "profile" }),
  });
}
