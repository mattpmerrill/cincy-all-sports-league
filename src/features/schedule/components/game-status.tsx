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

/** A game's start time, live clock, result or "Postponed", in one tone-coded line. */
export function GameStatus({ line, className }: { line: GameLine; className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap",
        TONE[line.tone],
        className,
      )}
    >
      {line.tone === "live" ? (
        <span aria-hidden="true" className="size-1.5 animate-live rounded-full bg-brand" />
      ) : null}
      {line.text}
      {line.detail ? <span className="font-medium text-text-muted">{line.detail}</span> : null}
    </span>
  );
}
