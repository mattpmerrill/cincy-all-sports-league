import "server-only";
import { createProfilesRepository } from "@/data/profiles.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminUsersService } from "./admin-users.service";

export async function getAdminUsersService() {
  return createAdminUsersService({
    profiles: createProfilesRepository(await createSupabaseServerClient()),
  });
}
