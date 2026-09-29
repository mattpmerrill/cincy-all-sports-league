import type { Profile, ProfilesRepository } from "@/data/profiles.repository";
import { isAdminRole, type Actor, type UserRole } from "@/domain/membership/membership";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type AdminUsersDeps = {
  profiles: Pick<ProfilesRepository, "list" | "getById" | "countAdmins" | "setRole">;
};

export type ListMembersError = AppError<"forbidden">;
export type ChangeRoleError = AppError<"forbidden" | "not_found" | "last_admin">;

export type AdminUsersService = ReturnType<typeof createAdminUsersService>;

export function createAdminUsersService({ profiles }: AdminUsersDeps) {
  return {
    async listMembers(actor: Actor): Promise<Result<Profile[], ListMembersError>> {
      if (!isAdminRole(actor.role)) return err("forbidden", "Only admins can see members.");
      return ok(await profiles.list());
    },

    /**
     * Promote or demote. The league must always keep an admin, so demoting the only remaining one
     * (which, since the caller is an admin, can only be themselves) is refused. The check and the
     * write are separate statements: two admins demoting each other in the same instant could slip
     * past it, which is acceptable for a league this size.
     */
    async setRole(
      actor: Actor,
      targetId: string,
      role: UserRole,
    ): Promise<Result<Profile, ChangeRoleError>> {
      if (!isAdminRole(actor.role)) return err("forbidden", "Only admins can change roles.");

      const target = await profiles.getById(targetId);
      if (!target) return err("not_found", "That member doesn't exist.");
      if (target.role === role) return ok(target);

      if (isAdminRole(target.role) && !isAdminRole(role) && (await profiles.countAdmins()) <= 1) {
        return err(
          "last_admin",
          "The league needs at least one admin, so you can't demote the last one.",
        );
      }

      const updated = await profiles.setRole(targetId, role);
      return updated ? ok(updated) : err("not_found", "That member doesn't exist.");
    },
  };
}
