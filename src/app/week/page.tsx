import type { Metadata } from "next";
import { getCurrentUser } from "@/features/auth/guards";
import { DaySection } from "@/features/schedule/components/day-section";
import { GamesPerTeam } from "@/features/schedule/components/games-per-team";
import { TeamFilter } from "@/features/schedule/components/team-filter";
import { WeekEmpty } from "@/features/schedule/components/week-empty";
import { WeekHeader } from "@/features/schedule/components/week-header";
import { getScheduleService } from "@/features/schedule/schedule.server";
import { weekSearchSchema } from "@/features/schedule/schemas";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";

export const metadata: Metadata = {
  title: "Week",
  description:
    "The games every fantasy team's picks play this week, Monday to Sunday, Eastern time.",
};

/**
 * Public, like standings: anyone can see the week. A bad `?week=` or `?team=` is ignored rather
 * than answered with a 404 (it is a harmless filter, and a stale bookmark should still land on a
 * useful page); the header always says which week is showing.
 */
export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const { week, team } = weekSearchSchema.parse(await searchParams);
  const user = await getCurrentUser();
  const page = await getScheduleService().getWeek({
    weekStart: week,
    teamSlug: team,
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
          page.selectedTeam
            ? `Games for ${page.selectedTeam.name}'s picks.`
            : "The games every team's picks play, Monday to Sunday."
        }
      />
      <WeekHeader page={page} />
      <TeamFilter page={page} />

      {page.empty ? (
        <WeekEmpty reason={page.empty} />
      ) : (
        <div className="flex flex-col gap-6">
          {page.days.map((day) => (
            <DaySection key={day.date} day={day} />
          ))}
        </div>
      )}

      {page.empty === "not_loaded" ? null : <GamesPerTeam page={page} />}

      <p className="text-sm text-text-muted">
        Scores refresh every 30 minutes. Each game is on the Eastern day it starts.
      </p>
    </PageMain>
  );
}
