import { EmptyState } from "@/ui/page";
import type { WeekPage } from "../schedule.service";

const COPY: Record<NonNullable<WeekPage["empty"]>, { title: string; description: string }> = {
  not_loaded: {
    title: "Nothing scheduled yet",
    description: "Schedules load daily; check back soon.",
  },
  no_games: {
    title: "No games for your picks this week",
    description: "Step to another week to see when they play next.",
  },
  team_idle: {
    title: "No games for this team this week",
    description: "Pick another team, or step to another week.",
  },
};

/** What to say when a week has nothing to list, depending on why. */
export function WeekEmpty({ reason }: { reason: NonNullable<WeekPage["empty"]> }) {
  const { title, description } = COPY[reason];
  return <EmptyState title={title} description={description} />;
}
