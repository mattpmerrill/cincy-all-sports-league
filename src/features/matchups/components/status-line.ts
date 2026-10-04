import type { MatchupOutcome } from "../matchups.service";

const LIVE_LINE = {
  ahead: { text: "Winning", className: "text-success" },
  behind: { text: "Trailing", className: "text-danger" },
  tied: { text: "Tied", className: "text-text-muted" },
} as const;

const FINAL_LINE = {
  win: { text: "Final: won", className: "text-success" },
  loss: { text: "Final: lost", className: "text-danger" },
  tie: { text: "Final: tied", className: "text-text-muted" },
} as const;

/** The viewer's status line. A live matchup whose totals are unknown stays neutral. */
export function statusLine(outcome: MatchupOutcome | null): { text: string; className: string } {
  if (!outcome) return { text: "Matchup", className: "text-text-muted" };
  if (outcome.state === "final") return FINAL_LINE[outcome.result];
  return outcome.lead
    ? LIVE_LINE[outcome.lead]
    : { text: "Waiting for scores", className: "text-text-muted" };
}
