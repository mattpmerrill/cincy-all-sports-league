import type { Metadata } from "next";
import Link from "next/link";
import { requireUserOrRedirect } from "@/features/auth/guards";
import { claimFormPath, preselectedTeamId } from "@/features/claims/claim-links";
import { ClaimTeamPanel } from "@/features/claims/components/claim-team-panel";
import { getClaimsService } from "@/features/claims/claims.server";
import { AlertsSection } from "@/features/push/components/alerts-section";
import { loadPushSettings } from "@/features/push/push.server";
import { AvatarEditor } from "@/features/profile/components/avatar-editor";
import { DisplayNameForm } from "@/features/profile/components/display-name-form";
import { TradeEmailsForm } from "@/features/profile/components/trade-emails-form";
import { WeeklyEmailForm } from "@/features/profile/components/weekly-email-form";
import { getProfileService } from "@/features/profile/profile.server";
import { isAdminRole } from "@/domain/membership/membership";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { PageHeader, PageMain, PageSection } from "@/ui/page";
import { UserAvatar } from "@/ui/user-avatar";
import { ProfileSignOutButton } from "../account-controls";
import { pushActions } from "../push-actions";
import {
  claimTeamAction,
  removeAvatarAction,
  setTradeEmailsAction,
  setWeeklyEmailAction,
  updateAvatarAction,
  updateDisplayNameAction,
} from "./actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const { team } = await searchParams;
  // Keep the picked team through sign-in, so a claim link from the leaderboard still lands on it.
  const user = await requireUserOrRedirect(typeof team === "string" ? claimFormPath(team) : "/me");
  const profileService = await getProfileService();
  const [{ state, claimable }, weeklyEmail, tradeEmails, pushSettings] = await Promise.all([
    getClaimsService().then((service) => service.getMyClaims(user.id)),
    profileService.getWeeklyEmail(user),
    profileService.getTradeEmails(user),
    loadPushSettings(user),
  ]);

  return (
    <PageMain>
      <PageHeader title="You" actions={<ProfileSignOutButton />} />

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

      <PageSection title="Profile" description="Your photo and name show up across the league.">
        <AvatarEditor
          displayName={user.displayName}
          avatarUrl={user.avatarUrl}
          source={profileService.avatarSource(user.avatarUrl)}
          upload={updateAvatarAction}
          remove={removeAvatarAction}
        />
        <DisplayNameForm displayName={user.displayName} action={updateDisplayNameAction} />
      </PageSection>

      <PageSection
        title="Push alerts"
        description="Alerts on your phone or computer, even when the app is closed."
      >
        {pushSettings.ok ? (
          <AlertsSection settings={pushSettings.value} actions={pushActions} />
        ) : (
          // A failed read costs this section only: the rest of the page, Sign out included, stays.
          <Alert variant="error">{pushSettings.error.message}</Alert>
        )}
      </PageSection>

      <PageSection
        title="Weekly email"
        description="Standings and the biggest movers, every Monday morning."
      >
        <WeeklyEmailForm optedIn={weeklyEmail} action={setWeeklyEmailAction} />
      </PageSection>

      <PageSection
        title="Trade emails"
        description="An email when someone makes an offer on your players, and when your offers are answered."
      >
        <TradeEmailsForm optedIn={tradeEmails} action={setTradeEmailsAction} />
      </PageSection>
    </PageMain>
  );
}
