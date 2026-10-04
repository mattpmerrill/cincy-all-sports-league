import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/auth/guards";
import { WeekMatchups, WeekMatchupsFallback } from "@/features/matchups/components/week-matchups";
import { DaySection } from "@/features/schedule/components/day-section";
import { GamesPerTeam } from "@/features/schedule/components/games-per-team";
import { TeamFilter } from "@/features/schedule/components/team-filter";
import { WeekEmpty } from "@/features/schedule/components/week-empty";
import { WeekHeader } from "@/features/schedule/components/week-header";
import { pairGamesHref } from "@/features/schedule/links";
import { getScheduleService } from "@/features/schedule/schedule.server";
import { weekSearchSchema } from "@/features/schedule/schemas";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";

export const metadata: Metadata = {
  title: "Week",
  description:
    "The games every fantasy team's picks play this week, Monday to Sunday, Eastern time.",
};

/**
 * Public, like standings: anyone can see the week. A bad `?week=`, `?team=` or `?vs=` is ignored rather
 * than answered with a 404 (it is a harmless filter, and a stale bookmark should still land on a
 * useful page); the header always says which week is showing.
 */
export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const { week, team, vs } = weekSearchSchema.parse(await searchParams);
  const user = await getCurrentUser();
  const page = await getScheduleService().getWeek({
    weekStart: week,
    teamSlug: team,
    vsSlug: vs,
    viewerId: user?.id,
  });

  if (!page) {
    return (
      <PageMain width="wide">
        <PageHeader title="Week" description="The games your picks play, Monday to Sunday." />
        <EmptyState
          title="No season yet"
          description="The weekly schedule appears once the league's season is set up."
        />
      </PageMain>
    );
  }

  return (
    <PageMain width="wide">
      <PageHeader
        title="Week"
        description={
          page.selectedTeam && page.selectedOpponent
            ? `Games for ${page.selectedTeam.name} and ${page.selectedOpponent.name}.`
            : page.selectedTeam
              ? `Games for ${page.selectedTeam.name}'s picks.`
              : "The games every team's picks play, Monday to Sunday."
        }
      />
      <WeekHeader page={page} />

      {/* Streams in on its own: the games below never wait on the matchups, and a matchups failure
          leaves this out instead of failing the page. */}
      <Suspense fallback={<WeekMatchupsFallback />}>
        <WeekMatchups
          week={week}
          viewerId={user?.id}
          gamesHref={(matchup) =>
            pairGamesHref({
              weekStart: matchup.weekStart,
              currentWeek: page.currentWeek,
              teams: [matchup.home.slug, matchup.away.slug],
            })
          }
        />
      </Suspense>

      <section id="games" aria-label="Games" className="flex scroll-mt-20 flex-col gap-6">
        <TeamFilter page={page} />

        {page.empty ? (
          <WeekEmpty reason={page.empty} pair={page.selectedOpponent !== null} />
        ) : (
          <div className="flex flex-col gap-6">
            {page.days.map((day) => (
              <DaySection key={day.date} day={day} />
            ))}
          </div>
        )}
      </section>

      {page.empty === "not_loaded" ? null : <GamesPerTeam page={page} />}

      <p className="text-sm text-text-muted">
        Scores refresh every 30 minutes. Each game is on the Eastern day it starts.
      </p>
    </PageMain>
  );
}
