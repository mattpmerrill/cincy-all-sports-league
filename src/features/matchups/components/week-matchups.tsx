import Link from "next/link";
import { Alert } from "@/ui/alert";
import { EmptyState, PageSection } from "@/ui/page";
import { Skeleton } from "@/ui/skeleton";
import { getSafeMatchupReads } from "../matchups.server";
import type { MatchupView, WeekMatchups as WeekMatchupsData } from "../matchups.service";
import { MatchupCard } from "./matchup-card";
import { MatchupList } from "./matchup-list";

const EMPTY: Record<
  NonNullable<WeekMatchupsData["empty"]>,
  { title: string; description: string }
> = {
  starts_monday: {
    title: "Matchups start Monday",
    description:
      "Every Monday morning each team gets one opponent near it in the standings. The first pairings go up then.",
  },
  none_this_week: {
    title: "No matchups this week",
    description: "Step to another week to see who played.",
  },
};

/** Shown while the section loads, so the games below do not wait on it. */
export function WeekMatchupsFallback() {
  return (
    <div role="status" aria-label="Loading matchups" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-44 w-full rounded-3xl" />
    </div>
  );
}

/**
 * The Matchups section of the Week page: the viewer's own matchup as a scoreboard, then the rest
 * compactly (everyone's at one size when signed out). It follows the page's week and says
 * plainly when it is showing last week's scores because the Monday rollover has not run yet. A
 * failed read leaves the section out: the games below are the page.
 */
export async function WeekMatchups({
  week,
  viewerId,
  gamesHref,
}: {
  /** The page's `?week=`, as the schedule parsed it. */
  week: string | undefined;
  viewerId: string | undefined;
  gamesHref: (matchup: MatchupView) => string;
}) {
  const result = await getSafeMatchupReads().weekMatchups({ weekStart: week, viewerId });
  if (!result.ok || !result.value) return null;
  const data = result.value;

  const [first, ...others] = data.matchups;
  const mine = first?.isMine ? first : null;
  const rest = mine ? others : data.matchups;

  return (
    <PageSection id="week-matchups" title="Matchups" description={data.rangeLabel}>
      {data.awaitingRollover ? (
        <Alert variant="info">
          Showing last week&apos;s matchups. Scores are still counting, and the final results post
          Monday morning.
        </Alert>
      ) : null}

      {data.empty ? (
        <EmptyState title={EMPTY[data.empty].title} description={EMPTY[data.empty].description} />
      ) : (
        <>
          {mine ? <MatchupCard matchup={mine} gamesHref={gamesHref(mine)} /> : null}
          {rest.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {mine ? <h3 className="text-lg font-bold">All matchups</h3> : null}
              <MatchupList
                matchups={rest}
                gamesHref={gamesHref}
                label={mine ? "Other matchups" : "Matchups"}
              />
            </div>
          ) : null}
          {data.byeTeams.length > 0 ? (
            <p className="text-sm text-text-muted">
              On a bye:{" "}
              {data.byeTeams.map((team, i) => (
                <span key={team.teamId}>
                  {i > 0 ? ", " : ""}
                  <Link
                    href={`/teams/${team.slug}`}
                    className="rounded-sm font-medium text-text underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    {team.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
        </>
      )}
    </PageSection>
  );
}
