import type { BreakdownLine, ParticipantScore } from "@/domain/scoring";
import type { PickAdjustment } from "./credit-pick";
import { formatPoints } from "./format";

export type BreakdownView = {
  /** Human sentence for the line, e.g. "4 wins × 4.1" or "Divisional Round appearance". */
  text: string;
  points: number;
  /** True for the negative cap adjustment, so the UI can style it as a deduction. */
  isAdjustment: boolean;
};

const plural = (n: number, one: string, many: string) =>
  `${formatPoints(n)} ${n === 1 ? one : many}`;

/** Turns a scoring line into what a person reads. Lines always sum to the participant's total. */
export function describeBreakdownLine(line: BreakdownLine): BreakdownView {
  const view = (text: string): BreakdownView => ({
    text,
    points: line.points,
    isAdjustment: line.kind === "major_cap",
  });
  switch (line.kind) {
    case "per_win":
      return view(`${plural(line.quantity, "win", "wins")} × ${formatPoints(line.rate ?? 0)}`);
    case "per_tie":
      return view(`${plural(line.quantity, "tie", "ties")} × ${formatPoints(line.rate ?? 0)}`);
    case "major_finish":
      return view(line.eventLabel ? `${line.eventLabel}: ${line.label}` : line.label);
    case "playoff_milestone":
    case "final_rank_band":
    case "major_cap":
      return view(line.label);
  }
}

/**
 * The lines a person reads for one pick, summing to what the team is credited: the participant's
 * scoring lines, less what it earned before joining this team, plus what this team earned from
 * players it traded away in the sport. With no trade this is exactly the scoring lines.
 */
export function describePickBreakdown(pick: {
  score: Pick<ParticipantScore, "lines">;
  adjustment: PickAdjustment;
}): BreakdownView[] {
  const views = pick.score.lines.map(describeBreakdownLine);
  const before = pick.adjustment.baseline.total;
  if (before !== 0) {
    views.push({
      text: `Earned ${plural(before, "pt", "pts")} before joining this team (not counted)`,
      points: -before,
      isAdjustment: true,
    });
  }
  for (const banked of pick.adjustment.banked) {
    if (banked.total === 0) continue;
    const amount = plural(Math.abs(banked.total), "pt", "pts");
    views.push({
      text:
        banked.total > 0
          ? `Includes ${amount} from ${banked.participant.name} before the trade`
          : `Less ${amount} from ${banked.participant.name} before the trade`,
      points: banked.total,
      isAdjustment: true,
    });
  }
  return views;
}
