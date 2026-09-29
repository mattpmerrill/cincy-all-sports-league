import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { formatPoints } from "@/domain/league";

/**
 * Eleven slim columns, one per sport in catalog order, scaled against the biggest single-sport
 * score on the board. Shows at a glance where a team's points come from without labels.
 */
export function SportContributionBars({
  sportPoints,
  max,
}: {
  sportPoints: { sport: SportCode; points: number }[];
  max: number;
}) {
  const summary = sportPoints
    .filter((s) => s.points > 0)
    .map((s) => `${SPORTS[s.sport].shortLabel} ${formatPoints(s.points)}`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={summary ? `Points by sport: ${summary}` : "No points yet"}
      className="flex h-4 items-end gap-[3px]"
    >
      {sportPoints.map(({ sport, points }) => (
        <span
          key={sport}
          className={points > 0 ? "w-1.5 rounded-xs bg-brand" : "h-0.5 w-1.5 rounded-full bg-line"}
          style={
            points > 0 && max > 0 ? { height: `${Math.max(18, (points / max) * 100)}%` } : undefined
          }
        />
      ))}
    </div>
  );
}
