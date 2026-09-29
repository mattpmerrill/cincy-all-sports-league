import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { requireUserOrRedirect } from "@/features/auth/guards";
import { claimFormPath, preselectedTeamId } from "@/features/claims/claim-links";
import { ClaimTeamPanel } from "@/features/claims/components/claim-team-panel";
import { getClaimsService } from "@/features/claims/claims.server";
import { DisplayNameForm } from "@/features/profile/components/display-name-form";
import { TradeEmailsForm } from "@/features/profile/components/trade-emails-form";
import { WeeklyEmailForm } from "@/features/profile/components/weekly-email-form";
import { getProfileService } from "@/features/profile/profile.server";
import { isAdminRole } from "@/domain/membership/membership";
import { Badge } from "@/ui/badge";
import { PageHeader, PageMain, PageSection } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { UserAvatar } from "@/ui/user-avatar";
import {
  claimTeamAction,
  setTradeEmailsAction,
  setWeeklyEmailAction,
  updateDisplayNameAction,
} from "./actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const { team } = await searchParams;
  // Keep the picked team through sign-in, so a claim link from the leaderboard still lands on it.
  const user = await requireUserOrRedirect(typeof team === "string" ? claimFormPath(team) : "/me");
  const profileService = await getProfileService();
  const [{ state, claimable }, weeklyEmail, tradeEmails] = await Promise.all([
    getClaimsService().then((service) => service.getMyClaims(user.id)),
    profileService.getWeeklyEmail(user),
    profileService.getTradeEmails(user),
  ]);

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
              <Link
                href="/admin"
                className="text-sm text-brand-bright underline-offset-4 hover:underline"
              >
                Open admin
              </Link>
            </div>
          ) : (
            <Badge variant="secondary">Member</Badge>
          )}
        </div>
      </div>

      <PageSection title="Your team" description="Link your account to your fantasy team.">
        <ClaimTeamPanel
          state={state}
          claimable={claimable}
          defaultTeamId={preselectedTeamId(claimable, team)}
          action={claimTeamAction}
        />
      </PageSection>

      <PageSection title="Profile">
        <DisplayNameForm displayName={user.displayName} action={updateDisplayNameAction} />
      </PageSection>

      <PageSection
        title="Weekly email"
        description="Standings and the biggest movers, every Monday morning."
      >
        <WeeklyEmailForm optedIn={weeklyEmail} action={setWeeklyEmailAction} />
      </PageSection>

      <PageSection
        title="Trade alerts"
        description="An email when someone makes an offer on your players, and when your offers are answered."
      >
        <TradeEmailsForm optedIn={tradeEmails} action={setTradeEmailsAction} />
      </PageSection>
    </PageMain>
  );
}
