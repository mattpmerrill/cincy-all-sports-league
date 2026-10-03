import Link from "next/link";
import { weekHref } from "../links";
import type { WeekPage } from "../schedule.service";
import { cn } from "cn";

/**
 * How many games each fantasy team's picks play this week, zeros included, busiest first. Each
 * entry narrows the page to that team. This is the spot weekly head-to-head matchups will grow
 * out of.
 */
export function GamesPerTeam({ page }: { page: WeekPage }) {
  const week = page.isCurrentWeek ? null : page.weekStart;
  return (
    <section aria-labelledby="games-per-team" className="flex flex-col gap-3">
      <h2 id="games-per-team" className="text-xl font-bold">
        Games this week
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {page.teams.map(({ team, games }) => {
          const selected = page.selectedTeam?.slug === team.slug;
          return (
            <li key={team.teamId}>
              <Link
                href={weekHref({ week, team: team.slug })}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  selected
                    ? "border-brand bg-surface-raised"
                    : "border-line bg-surface hover:border-text-muted",
                  games === 0 && "text-text-muted",
                )}
              >
                <span className="min-w-0 truncate font-medium">{team.name}</span>
                <span className="tabular shrink-0 font-display text-xl leading-none font-bold">
                  {games}
                  <span className="sr-only"> {games === 1 ? "game" : "games"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
