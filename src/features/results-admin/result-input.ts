import type { ScoringRuleKind } from "@/domain/scoring";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type InputRule = {
  kind: ScoringRuleKind;
  rankFrom: number | null;
  rankTo: number | null;
};

export type NormalizedResult = { quantity: number; eventLabel: string };

export type ResultInputError = AppError<"invalid">;

const MAX_COUNT = 999;
const MAX_EVENT_LABEL = 60;

/** Kinds where the admin types a number. Everything else is a fact that is either true or not. */
export const usesQuantity = (kind: ScoringRuleKind) =>
  kind === "per_win" || kind === "per_tie" || kind === "final_rank_band";

export const usesEventLabel = (kind: ScoringRuleKind) => kind === "major_finish";

/**
 * What a result row may hold for a rule, mirroring the database's own checks so the admin gets a
 * sentence instead of a constraint error: wins and ties are whole counts, a milestone or finish is
 * reached once, a finish names its event, and a rank must land inside the band's rank range.
 */
export function normalizeResultInput(
  rule: InputRule,
  input: { quantity: string; eventLabel: string },
): Result<NormalizedResult, ResultInputError> {
  const label = input.eventLabel.trim();

  switch (rule.kind) {
    case "playoff_milestone":
      return ok({ quantity: 1, eventLabel: "" });

    case "major_finish":
      if (label === "") return err("invalid", "Name the event, for example US Open.");
      if (label.length > MAX_EVENT_LABEL) return err("invalid", "That event name is too long.");
      return ok({ quantity: 1, eventLabel: label });

    case "per_win":
    case "per_tie": {
      const count = wholeNumber(input.quantity);
      if (count === null || count < 0 || count > MAX_COUNT) {
        return err("invalid", `Enter a whole number from 0 to ${MAX_COUNT}.`);
      }
      return ok({ quantity: count, eventLabel: "" });
    }

    case "final_rank_band": {
      const rank = wholeNumber(input.quantity);
      if (rank === null || rank < 1) return err("invalid", "Enter the rank as a whole number.");
      if (
        rule.rankFrom !== null &&
        rule.rankTo !== null &&
        (rank < rule.rankFrom || rank > rule.rankTo)
      ) {
        return err("invalid", `That rule covers ranks ${rule.rankFrom} to ${rule.rankTo}.`);
      }
      return ok({ quantity: rank, eventLabel: "" });
    }
  }
}

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
