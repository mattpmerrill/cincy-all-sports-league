import { describe, expect, it } from "vitest";
import type { Profile } from "@/data/profiles.repository";
import type { Actor, UserRole } from "@/domain/membership/membership";
import { createAdminUsersService } from "./admin-users.service";

const profile = (id: string, role: UserRole): Profile => ({
  id,
  displayName: id,
  avatarUrl: null,
  role,
  createdAt: "2026-09-28T00:00:00Z",
});

/** An in-memory profiles table: enough to observe what the service writes. */
function setup(initial: Profile[]) {
  const rows = new Map(initial.map((p) => [p.id, p]));
  const writes: [string, UserRole][] = [];
  const service = createAdminUsersService({
    profiles: {
      list: async () => [...rows.values()],
      getById: async (id) => rows.get(id) ?? null,
      countAdmins: async () => [...rows.values()].filter((p) => p.role === "admin").length,
      setRole: async (id, role) => {
        const row = rows.get(id);
        if (!row) return null;
        writes.push([id, role]);
        const next = { ...row, role };
        rows.set(id, next);
        return next;
      },
    },
  });
  return { service, writes };
}

const admin: Actor = { id: "a1", role: "admin" };
const member: Actor = { id: "m1", role: "member" };

describe("setRole", () => {
  it("promotes a member", async () => {
    const { service, writes } = setup([profile("a1", "admin"), profile("m1", "member")]);
    const result = await service.setRole(admin, "m1", "admin");
    expect(result).toMatchObject({ ok: true, value: { role: "admin" } });
    expect(writes).toEqual([["m1", "admin"]]);
  });

  it("refuses to demote the last admin, even themselves", async () => {
    const { service, writes } = setup([profile("a1", "admin"), profile("m1", "member")]);
    const result = await service.setRole(admin, "a1", "member");
    expect(result).toMatchObject({ ok: false, error: { code: "last_admin" } });
    expect(writes).toEqual([]);
  });

  it("lets an admin step down when another admin remains", async () => {
    const { service } = setup([profile("a1", "admin"), profile("a2", "admin")]);
    expect(await service.setRole(admin, "a1", "member")).toMatchObject({
      ok: true,
      value: { role: "member" },
    });
  });

  it("non-admins cannot change roles or list members", async () => {
    const { service, writes } = setup([profile("a1", "admin"), profile("m1", "member")]);
    expect(await service.setRole(member, "m1", "admin")).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await service.listMembers(member)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(writes).toEqual([]);
  });

  it("reports an unknown target and skips a no-op change", async () => {
    const { service, writes } = setup([profile("a1", "admin"), profile("m1", "member")]);
    expect(await service.setRole(admin, "ghost", "admin")).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect((await service.setRole(admin, "m1", "member")).ok).toBe(true);
    expect(writes).toEqual([]);
  });
});
