import type { BreakdownLine, ParticipantScore } from "@/domain/scoring";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const linesOf = (lines: readonly BreakdownLine[], kind: BreakdownLine["kind"]) =>
  lines.filter((l) => l.kind === kind);

const total = (lines: readonly BreakdownLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

/**
 * A short line of what a free agent has done so far, to help a person choose: "12 wins",
 * "12 wins, 3 ties" or "Rank 14". Built from the scoring lines, so it can only say what the
 * rules counted. A rank outside every scoring band has no line and reads as nothing, and so does
 * a participant with no results yet.
 */
export function freeAgentStatLine(score: Pick<ParticipantScore, "lines">): string | null {
  const wins = linesOf(score.lines, "per_win");
  const ties = linesOf(score.lines, "per_tie");
  const rank = linesOf(score.lines, "final_rank_band")[0];
  const parts = [
    wins.length > 0 ? count(total(wins), "win", "wins") : null,
    ties.length > 0 ? count(total(ties), "tie", "ties") : null,
    rank ? `Rank ${rank.quantity}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}
