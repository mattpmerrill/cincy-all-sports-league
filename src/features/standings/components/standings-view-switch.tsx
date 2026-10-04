import { SegmentedLinks } from "@/ui/segmented-links";
import type { StandingsView } from "../schemas";

const VIEWS = [
  { key: "season", label: "Season", href: "/" },
  { key: "matchups", label: "Matchups", href: "/?view=matchups" },
] as const satisfies readonly { key: StandingsView; label: string; href: string }[];

/** Season points or the weekly matchup table. Plain links, so it works without JavaScript. */
export function StandingsViewSwitch({ current }: { current: StandingsView }) {
  return <SegmentedLinks label="Standings view" items={VIEWS} current={current} />;
}
