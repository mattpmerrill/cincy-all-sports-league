import { getCurrentUser } from "@/features/auth/guards";
import { LeaderboardHero } from "@/features/standings/components/leaderboard-hero";
import { LeaderboardRow } from "@/features/standings/components/leaderboard-row";
import { getLeaderboard } from "@/features/standings/standings.server";
import { EmptyState, PageMain } from "@/ui/page";

export default async function LeaderboardPage() {
  const [board, user] = await Promise.all([getLeaderboard(), getCurrentUser()]);

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

  return (
    <PageMain
      width="wide"
      className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-8"
    >
      <LeaderboardHero board={board} now={new Date()} className="lg:sticky lg:top-20" />
      <ol aria-label="Standings" className="flex flex-col gap-2.5">
        {board.rows.map((row, index) => (
          <LeaderboardRow
            key={row.teamId}
            row={row}
            index={index}
            maxSportPoints={board.maxSportPoints}
            isMine={user !== null && row.owner?.id === user.id}
          />
        ))}
      </ol>
    </PageMain>
  );
}
