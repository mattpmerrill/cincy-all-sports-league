import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { requireUserOrRedirect } from "@/features/auth/guards";
import { ClaimTeamPanel } from "@/features/claims/components/claim-team-panel";
import { getClaimsService } from "@/features/claims/claims.server";
import { DisplayNameForm } from "@/features/profile/components/display-name-form";
import { isAdminRole } from "@/domain/membership/membership";
import { Badge } from "@/ui/badge";
import { PageHeader, PageMain, PageSection } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { UserAvatar } from "@/ui/user-avatar";
import { claimTeamAction, updateDisplayNameAction } from "./actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function MePage() {
  const user = await requireUserOrRedirect("/me");
  const { state, claimable } = await (await getClaimsService()).getMyClaims(user.id);

  return (
    <PageMain>
      <PageHeader
        title="You"
        actions={
          <form action={signOutAction}>
            <SubmitButton variant="outline" className="h-9" pendingLabel="Signing out...">
              Sign out
            </SubmitButton>
          </form>
        }
      />

      <div className="flex items-center gap-4">
        <UserAvatar displayName={user.displayName} avatarUrl={user.avatarUrl} size="lg" />
        <div className="flex flex-col items-start gap-1">
          <p className="text-lg font-medium">{user.displayName}</p>
          {isAdminRole(user.role) ? (
            <div className="flex items-center gap-2">
              <Badge>Admin</Badge>
              <Link href="/admin" className="text-sm text-brand underline-offset-4 hover:underline">
                Open admin
              </Link>
            </div>
          ) : (
            <Badge variant="secondary">Member</Badge>
          )}
        </div>
      </div>

      <PageSection title="Your team" description="Link your account to your fantasy team.">
        <ClaimTeamPanel state={state} claimable={claimable} action={claimTeamAction} />
      </PageSection>

      <PageSection title="Profile">
        <DisplayNameForm displayName={user.displayName} action={updateDisplayNameAction} />
      </PageSection>
    </PageMain>
  );
}
