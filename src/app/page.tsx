import { Suspense } from "react";
import { getCurrentUser } from "@/features/auth/guards";
import { claimTeamHref, viewerCanClaim } from "@/features/claims/claim-links";
import { ClaimInvite } from "@/features/claims/components/claim-invite";
import { LatestTrashTalk } from "@/features/feed/components/latest-trash-talk";
import {
  MatchupStandingsFallback,
  MatchupStandingsView,
} from "@/features/matchups/components/matchup-standings-view";
import { getSafeMatchupReads } from "@/features/matchups/matchups.server";
import { LeaderboardHero } from "@/features/standings/components/leaderboard-hero";
import { LeaderboardRow } from "@/features/standings/components/leaderboard-row";
import { StandingsViewSwitch } from "@/features/standings/components/standings-view-switch";
import { standingsSearchSchema } from "@/features/standings/schemas";
import { getLeaderboard } from "@/features/standings/standings.server";
import { EmptyState, PageMain } from "@/ui/page";

export default async function LeaderboardPage({ searchParams }: PageProps<"/">) {
  const { view } = standingsSearchSchema.parse(await searchParams);
  const [board, user, records] = await Promise.all([
    getLeaderboard(),
    getCurrentUser(),
    // The small matchup record on each season row is a garnish: without it the rows still render.
    view === "season" ? getSafeMatchupReads().records() : null,
  ]);

  if (!board) {
    return (
      <PageMain>
        <EmptyState
          title="No season is set up yet"
          description="Standings appear here once an admin activates a season."
        />
      </PageMain>
    );
  }

  const canClaim = viewerCanClaim(board.rows, user?.id ?? null);
  const hasOpenTeams = board.claimedTeams < board.rows.length;

  return (
    <PageMain
      width="wide"
      className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-8"
    >
      <LeaderboardHero board={board} now={new Date()} className="lg:sticky lg:top-20" />
      <div className="flex flex-col gap-4">
        {!user && hasOpenTeams ? (
          <ClaimInvite claimed={board.claimedTeams} total={board.rows.length} />
        ) : null}
        <LatestTrashTalk />
        <StandingsViewSwitch current={view} />
        {view === "matchups" ? (
          <Suspense fallback={<MatchupStandingsFallback />}>
            <MatchupStandingsView viewerId={user?.id} />
          </Suspense>
        ) : (
          <ol aria-label="Standings" className="flex flex-col gap-2.5">
            {board.rows.map((row, index) => (
              <LeaderboardRow
                key={row.teamId}
                row={row}
                index={index}
                maxSportPoints={board.maxSportPoints}
                isMine={user !== null && row.owner?.id === user.id}
                claimHref={canClaim && !row.owner ? claimTeamHref(row.slug, user !== null) : null}
                matchupRecord={
                  records?.ok ? (records.value.recordFor(row.teamId)?.label ?? null) : null
                }
              />
            ))}
          </ol>
        )}
      </div>
    </PageMain>
  );
}
