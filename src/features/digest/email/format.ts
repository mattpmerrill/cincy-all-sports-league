import { formatPoints } from "@/domain/league";
import type { RankMovement } from "@/domain/standings";

const places = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;

/** "Up 2 places", "Down 1 place", "No change", "New". */
export function movementText(m: RankMovement): string {
  switch (m.direction) {
    case "up":
      return `Up ${places(m.places)}`;
    case "down":
      return `Down ${places(m.places)}`;
    case "same":
      return "No change";
    case "new":
      return "New";
  }
}

/** Compact form for table cells: "▲2", "▼1", "-", "New". */
export function movementShort(m: RankMovement): string {
  switch (m.direction) {
    case "up":
      return `▲${m.places}`;
    case "down":
      return `▼${m.places}`;
    case "same":
      return "-";
    case "new":
      return "";
  }
}

/** "+4.1", "+0", "-2". Gains are never negative in practice, but the sign should be honest. */
export function signedPoints(points: number): string {
  return `${points > 0 ? "+" : ""}${formatPoints(points)}`;
}

export { formatPoints };
