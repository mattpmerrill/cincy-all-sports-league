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
 * The Matchups side of the Standings switch. The service decides which of three states applies
 * (see `MatchupStandings`) from one read; this only maps each to markup. A failed read says so in
 * place of the table: the Season tab beside it still works.
 */
export async function MatchupStandingsView({ viewerId }: { viewerId: string | undefined }) {
  const standings = await getSafeMatchupReads().standings({ viewerId });

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

  switch (table.state) {
    case "not_started":
      return (
        <EmptyState
          title="Matchups start Monday"
          description="Every Monday morning each team gets one opponent near it in the standings. The first pairings go up then."
        />
      );
    case "first_week_live":
      return (
        <div className="flex flex-col gap-4">
          <EmptyState
            title="No finished weeks yet"
            description="Records start counting when the first week ends, Monday morning. Here is who plays this week."
          />
          <MatchupList
            matchups={table.mine ? [table.mine, ...table.others] : table.others}
            label="This week's matchups"
          />
        </div>
      );
    case "table":
      return (
        <ol aria-label="Matchup standings" className="flex flex-col gap-2.5">
          {table.rows.map((row, index) => (
            <MatchupStandingsRow key={row.teamId} row={row} index={index} />
          ))}
        </ol>
      );
  }
}
