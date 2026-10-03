import { Swords } from "lucide-react";
import Link from "next/link";
import { ParticipantImage } from "@/ui/participant-image";
import { cn } from "cn";
import { weekHref } from "../links";
import type { TeamWeek } from "../schedule.service";
import { GameStatus } from "./game-status";

/**
 * A fantasy team's games this week, each read from the team's own side ("W 27–24", "Sun 1:00 PM").
 * Sits on the team page and links on to the full Week page filtered to the team.
 */
export function TeamWeekCard({ week }: { week: TeamWeek }) {
  return (
    <section
      aria-labelledby="team-week"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="team-week" className="text-2xl font-bold">
          This week
        </h2>
        <Link
          href={weekHref({ team: week.slug })}
          className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Full week
          <span className="sr-only"> for {week.teamName}</span>
        </Link>
      </div>
      <p className="-mt-2 text-sm text-text-muted">{week.rangeLabel} · Eastern time</p>

      {week.games.length === 0 ? (
        <p className="text-sm text-text-muted">No games for these picks this week.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/70">
          {week.games.map((game) => (
            <li key={game.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <ParticipantImage
                name={game.opponent.name}
                src={game.opponent.logoUrl}
                kind="team"
                size="sm"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">
                  <span className="font-medium text-text-muted">{game.connector} </span>
                  {game.opponent.name}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  {game.sportLabel}
                  {game.isShowdown ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-brand-bright">
                      <Swords aria-hidden="true" className="size-3" />
                      Showdown
                    </span>
                  ) : null}
                </span>
              </div>
              <GameStatus
                line={game.result}
                className={cn(
                  "shrink-0 text-right",
                  game.result.detail && "flex-col items-end gap-0",
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
