import type { BreakdownLine } from "@/domain/scoring";
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
