import type { Metadata } from "next";
import { getAdminUsersService } from "@/features/admin-users/admin-users.server";
import { MembersList } from "@/features/admin-users/components/members-list";
import { requireAdminOrNotFound } from "@/features/auth/guards";
import { PageSection } from "@/ui/page";
import { changeRoleAction } from "../actions";

export const metadata: Metadata = { title: "Admin: members" };

export default async function AdminMembersPage() {
  const admin = await requireAdminOrNotFound("/admin/members");
  const result = await (await getAdminUsersService()).listMembers(admin);
  if (!result.ok) throw new Error(`Unexpected ${result.error.code} listing members`);

  return (
    <PageSection title="Members and roles" description="Admins can review claims and edit results.">
      <MembersList members={result.value} currentUserId={admin.id} action={changeRoleAction} />
    </PageSection>
  );
}
