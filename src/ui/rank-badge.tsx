import { cn } from "cn";

const METAL: Record<number, string> = {
  1: "bg-linear-to-b from-gold/30 to-gold/10 text-gold shadow-glow-gold",
  2: "bg-linear-to-b from-silver/25 to-silver/5 text-silver shadow-glow-silver",
  3: "bg-linear-to-b from-bronze/30 to-bronze/10 text-bronze shadow-glow-bronze",
};

/** Rank as a badge: top three get a metal glow, everyone else a quiet chip. `label` carries the "T". */
export function RankBadge({
  rank,
  label,
  isTied = false,
  size = "md",
  className,
}: {
  rank: number;
  label: string;
  isTied?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={isTied ? `Tied for rank ${rank}` : `Rank ${rank}`}
      className={cn(
        "tabular inline-flex shrink-0 items-center justify-center rounded-xl font-display leading-none font-extrabold",
        size === "md" ? "size-11 text-2xl" : "size-16 text-4xl",
        METAL[rank] ?? "bg-surface-raised text-text-muted ring-1 ring-line",
        className,
      )}
    >
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
