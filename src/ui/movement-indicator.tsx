import type { RankMovement } from "@/domain/standings";
import { cn } from "cn";

/** Rank change since the last daily snapshot. Renders nothing when there is no history yet. */
export function MovementIndicator({
  movement,
  className,
}: {
  movement: RankMovement;
  className?: string;
}) {
  if (movement.direction === "new") return null;
  const base =
    "font-display inline-flex items-center gap-0.5 text-sm leading-none font-bold tabular";
  if (movement.direction === "same") {
    return (
      <span className={cn(base, "text-text-muted", className)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">No change</span>
      </span>
    );
  }
  const up = movement.direction === "up";
  return (
    <span className={cn(base, up ? "text-brand" : "text-heat", className)}>
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {movement.places}
      </span>
      <span className="sr-only">
        {up ? "Up" : "Down"} {movement.places} {movement.places === 1 ? "place" : "places"}
      </span>
    </span>
  );
}
