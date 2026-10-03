import type { GameLine, GameLineTone } from "@/domain/schedule";
import { cn } from "cn";

// Color never carries the meaning alone: every tone also has words ("W", "L", "Live", "Postponed").
const TONE: Record<GameLineTone, string> = {
  upcoming: "text-text-muted",
  live: "text-brand-bright",
  win: "text-success",
  loss: "text-danger",
  tie: "text-text-muted",
  final: "text-text-muted",
  off: "text-gold",
};

/**
 * A game's start time, live clock, result or "Postponed", in one tone-coded line. `stacked` puts
 * the extra detail ("Q3 4:12", "Final/OT") under the headline, for narrow right-hand columns.
 */
export function GameStatus({
  line,
  stacked = false,
  className,
}: {
  line: GameLine;
  stacked?: boolean;
  className?: string;
}) {
  const detail = line.detail ? (
    <span className="font-medium text-text-muted">{line.detail}</span>
  ) : null;
  return (
    <span
      className={cn(
        "tabular inline-flex text-sm font-semibold whitespace-nowrap",
        stacked ? "flex-col items-end" : "items-center gap-1.5",
        TONE[line.tone],
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {line.tone === "live" ? (
          <span aria-hidden="true" className="size-1.5 animate-live rounded-full bg-brand" />
        ) : null}
        {line.text}
      </span>
      {detail}
    </span>
  );
}
