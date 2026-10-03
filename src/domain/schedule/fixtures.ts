import type { SlateTeam } from "./build-week-slate";
import type { Game, GameSide } from "./types";

/**
 * Hand-built games and teams for tests. Test-only; nothing in the app imports it.
 * `side("pit")` is a mapped participant "pit" with an ESPN id of the same name.
 */
export const side = (id: string, overrides: Partial<GameSide> = {}): GameSide => ({
  externalId: id,
  participantId: id,
  name: `Team ${id}`,
  shortName: id.toUpperCase(),
  logoUrl: null,
  score: null,
  winner: null,
  ...overrides,
});

let nextId = 1;

export function game(overrides: Partial<Game> & Pick<Game, "home" | "away">): Game {
  const id = String(nextId++);
  return {
    id: `g${id}`,
    sport: "nfl",
    externalId: `e${id}`,
    // Sun Oct 4 2026, 1:00 pm EDT.
    startsAt: "2026-10-04T17:00:00Z",
    timeTbd: false,
    status: "scheduled",
    statusDetail: null,
    note: null,
    neutralSite: false,
    ...overrides,
  };
}

export const team = (
  id: string,
  picks: SlateTeam["picks"],
  owner: SlateTeam["owner"] = null,
): SlateTeam => ({ id, slug: id, name: `Team ${id.toUpperCase()}`, owner, picks });
