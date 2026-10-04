import { Alert } from "@/ui/alert";
import { EmptyState } from "@/ui/page";
import { Skeleton } from "@/ui/skeleton";
import { getSafeMatchupReads } from "../matchups.server";
import { MatchupList } from "./matchup-list";
import { MatchupStandingsRow } from "./matchup-standings-row";

export function MatchupStandingsFallback() {
  return (
    <div role="status" aria-label="Loading matchups" className="flex flex-col gap-2.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * The Matchups side of the Standings switch: the ranked table of all 20 teams, or, until a first
 * week has finished, an empty state that still shows this week's pairings when a week is live.
 * A failed read says so in place of the table: the Season tab beside it still works.
 */
export async function MatchupStandingsView({ viewerId }: { viewerId: string | undefined }) {
  const reads = getSafeMatchupReads();
  const [standings, week] = await Promise.all([
    reads.standings({ viewerId }),
    reads.weekMatchups({ viewerId }),
  ]);

  if (!standings.ok) {
    return (
      <Alert variant="error">
        Matchups did not load. Try again in a moment, or look at the Season tab.
      </Alert>
    );
  }
  const table = standings.value;
  if (!table) {
    return (
      <EmptyState
        title="No season is set up yet"
        description="Matchups appear here once the season starts."
      />
    );
  }

  if (!table.hasFinishedWeek) {
    // Pairings come from the week read, which the table has no use for once there are results.
    const live = week.ok && week.value && table.liveWeekStart ? week.value : null;
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title={live ? "No finished weeks yet" : "Matchups start Monday"}
          description={
            live
              ? "Records start counting when the first week ends, Monday morning. Here is who plays this week."
              : "Every Monday morning each team gets one opponent near it in the standings. The first pairings go up then."
          }
        />
        {live && live.matchups.length > 0 ? (
          <MatchupList matchups={live.matchups} label="This week's matchups" />
        ) : null}
      </div>
    );
  }

  return (
    <ol aria-label="Matchup standings" className="flex flex-col gap-2.5">
      {table.rows.map((row, index) => (
        <MatchupStandingsRow key={row.teamId} row={row} index={index} />
      ))}
    </ol>
  );
}
