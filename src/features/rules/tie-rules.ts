import type { PlayoffScoringMode } from "@/domain/scoring";

/** Plain-language rules that aren't rows in scoring_rules. Kept as data so the page stays dumb. */
export type RuleNote = { title: string; body: string };

export function playoffNote(mode: PlayoffScoringMode): RuleNote {
  return mode === "cumulative"
    ? {
        title: "Playoff points stack",
        body: "Every round a team reaches adds its points. A bye counts as reaching the round it skipped. Champion and runner-up are the two final outcomes, so a team gets one or the other.",
      }
    : {
        title: "Best playoff round only",
        body: "Only the deepest round a team reaches pays, so playoff points do not stack. The champion's 50 is the most a team can earn from the playoffs.",
      };
}

export const GAME_TIE_NOTES: RuleNote[] = [
  { title: "NFL ties", body: "A tie counts as half a win." },
  { title: "MLS draws", body: "A draw is worth 1.2 points, a third of a win." },
];

export const LEADERBOARD_TIE_NOTES: RuleNote[] = [
  {
    title: "Tied on points",
    body: "Teams with equal totals share a rank and show it as T1, T4 and so on. The next rank is skipped, so three teams tied for first are followed by rank 4.",
  },
  {
    title: "Order inside a tie",
    body: "Most championships, then most postseason points, then most sports with points. Only the season-end tiebreak decides a prize.",
  },
];
