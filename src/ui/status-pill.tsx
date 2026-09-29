import type { SeasonStatus } from "@/domain/league";
import { cn } from "cn";

const TONE: Record<SeasonStatus["phase"], { text: string; dot: string }> = {
  in_season: { text: "text-brand-bright", dot: "bg-brand" },
  upcoming: { text: "text-text-muted", dot: "bg-text-muted" },
  complete: { text: "text-gold", dot: "bg-gold" },
};

/** A sport's season state: "In season", "Starts Oct 20" or "Final". */
export function StatusPill({ status, className }: { status: SeasonStatus; className?: string }) {
  const tone = TONE[status.phase];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone.text, className)}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone.dot)} />
      {status.label}
    </span>
  );
}
