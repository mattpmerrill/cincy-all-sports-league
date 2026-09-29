import "server-only";
import { createProfilesRepository } from "@/data/profiles.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProfileService } from "./profile.service";

export async function getProfileService() {
  return createProfileService(createProfilesRepository(await createSupabaseServerClient()));
}
