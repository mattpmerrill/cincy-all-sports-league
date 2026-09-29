import { err, ok, type Result } from "@/lib/result";
import { SPORTS, type SportCode } from "@/domain/sports/sports";
import type { DirectoryEntry } from "./facts";
import { getJson, mapWithConcurrency, type EspnClientOptions, type EspnError } from "./http";
import { fetchPgaSeasonStandings } from "./rankings";
import { isPerTeamRecordsSport } from "./records";
import {
  coreAthleteSchema,
  coreGroupTeamsSchema,
  teamsDirectorySchema,
  wtaRankingsDirectorySchema,
} from "./schemas";
import { espnUrls } from "./urls";

/** A row the directory left out on purpose, so a caller can log it instead of it vanishing. */
export type DirectorySkip = {
  espnId: string;
  name: string;
  reason: "placeholder" | "duplicate_name";
};

export type DirectoryOptions = EspnClientOptions & { onSkip?: (skip: DirectorySkip) => void };

export type AthleteDirectoryOptions = {
  /** Take at most this many of the best-ranked athletes. */
  limit: number;
  /** Ids the caller already stores. Skipped, which also saves their per-athlete detail call. */
  knownIds: ReadonlySet<string>;
};

// ESPN's core groups for college football: 80 is FBS, 81 is FCS. The site teams endpoint ignores
// its `groups` parameter and returns every level down to Division III, so these two lists are the
// only Division I filter there is. Known gap: the intersection with the site teams list also drops
// UT Rio Grande Valley (ESPN id 292), a real FCS team that the site list omits. Nothing reliable
// tells it apart from the 12 all-star and placeholder ids that are missing from the same list, so
// keeping it would mean either admitting those or hardcoding a single id.
const CFB_DIVISION_ONE_GROUPS = [80, 81] as const;
const ATHLETE_FETCH_CONCURRENCY = 6;

/**
 * Every team ESPN lists for a team sport, as directory entries.
 *
 * - College football keeps only Division I (FBS + FCS). A core-group id that the site list does
 *   not carry (all-star and placeholder rows such as "SOUTH All-Stars") simply never matches.
 * - College softball has no usable Division I group, so it keeps ESPN's whole list minus "TBD"
 *   placeholders, and when two rows share a display name it keeps the higher id (ESPN re-created
 *   a few programs; the newer id is the one with a schedule).
 */
export async function fetchTeamDirectory(
  sportCode: SportCode,
  espnSeason: number,
  options: DirectoryOptions = {},
): Promise<Result<DirectoryEntry[], EspnError>> {
  const sport = SPORTS[sportCode];
  if (sport.participantKind !== "team") {
    return err("espn_unsupported", `${sportCode} is not a team sport`);
  }

  const { onSkip, ...client } = options;
  const listed = await getJson(espnUrls.teams(sport), teamsDirectorySchema, client);
  if (!listed.ok) return listed;
  let teams = listed.value.sports.flatMap((s) =>
    s.leagues.flatMap((l) => l.teams.map((t) => t.team)),
  );

  if (sportCode === "ncaaf") {
    const divisionOne = await fetchDivisionOneFootballIds(espnSeason, client);
    if (!divisionOne.ok) return divisionOne;
    teams = teams.filter((t) => divisionOne.value.has(t.id));
  }
  if (sportCode === "ncaasb") teams = withoutSoftballNoise(teams, onSkip);

  // College rosters use the school ("Michigan"); ESPN's displayName adds the mascot.
  const college = isPerTeamRecordsSport(sportCode);
  return ok(
    teams.map((t) => ({
      espnId: t.id,
      name: t.displayName,
      shortName: (college ? t.location : t.shortDisplayName) ?? t.displayName,
      logoUrl: t.logos?.[0]?.href ?? null,
      primaryColor: normalizeColor(t.color),
    })),
  );
}

async function fetchDivisionOneFootballIds(
  espnSeason: number,
  options: EspnClientOptions,
): Promise<Result<Set<string>, EspnError>> {
  const groups = await Promise.all(
    CFB_DIVISION_ONE_GROUPS.map((group) =>
      getJson(
        espnUrls.coreGroupTeams(SPORTS.ncaaf, espnSeason, group),
        coreGroupTeamsSchema,
        options,
      ),
    ),
  );
  const ids = new Set<string>();
  for (const group of groups) {
    if (!group.ok) return group;
    for (const item of group.value.items) {
      const id = /\/teams\/(\d+)/.exec(item.$ref)?.[1];
      if (id) ids.add(id);
    }
  }
  return ok(ids);
}

type ListedTeam = { id: string; displayName: string };

function withoutSoftballNoise<T extends ListedTeam>(
  teams: readonly T[],
  onSkip: DirectoryOptions["onSkip"],
): T[] {
  const real = teams.filter((t) => {
    const placeholder = /^(tbd|tba)$/i.test(t.displayName.trim());
    if (placeholder) onSkip?.({ espnId: t.id, name: t.displayName, reason: "placeholder" });
    return !placeholder;
  });

  const winnerByName = new Map<string, T>();
  for (const t of real) {
    const current = winnerByName.get(t.displayName);
    if (!current || Number(t.id) > Number(current.id)) winnerByName.set(t.displayName, t);
  }
  return real.filter((t) => {
    const keep = winnerByName.get(t.displayName) === t;
    if (!keep) onSkip?.({ espnId: t.id, name: t.displayName, reason: "duplicate_name" });
    return keep;
  });
}

/**
 * The best-ranked athletes for a ranked sport, most relevant first.
 *
 * - WTA: the current ranking table (ESPN publishes the top 150). Everything is in that one call.
 * - PGA: the season's FedExCup order, falling back to the previous season while the new one has
 *   no standings yet. The standings only reference athletes, so names come from one detail call
 *   per athlete, and only for ids the caller does not already have.
 */
export async function fetchAthleteDirectory(
  sportCode: "wta" | "pga",
  espnSeason: number,
  { limit, knownIds }: AthleteDirectoryOptions,
  options: EspnClientOptions = {},
): Promise<Result<DirectoryEntry[], EspnError>> {
  if (sportCode === "wta") return wtaDirectory(limit, knownIds, options);
  return pgaDirectory(espnSeason, limit, knownIds, options);
}

async function wtaDirectory(
  limit: number,
  knownIds: ReadonlySet<string>,
  options: EspnClientOptions,
): Promise<Result<DirectoryEntry[], EspnError>> {
  const response = await getJson(
    espnUrls.wtaRankings(SPORTS.wta),
    wtaRankingsDirectorySchema,
    options,
  );
  if (!response.ok) return response;
  const table = response.value.rankings[0];
  if (!table) return err("espn_shape", "ESPN WTA rankings had no table");

  const top = [...table.ranks].sort((a, b) => a.current - b.current).slice(0, limit);
  return ok(
    top
      .filter((r) => !knownIds.has(r.athlete.id))
      .map(({ athlete }) => ({
        espnId: athlete.id,
        name: athlete.displayName,
        shortName: athlete.lastName ?? lastToken(athlete.displayName),
        logoUrl: athlete.headshot ?? null,
        primaryColor: null,
      })),
  );
}

async function pgaDirectory(
  espnSeason: number,
  limit: number,
  knownIds: ReadonlySet<string>,
  options: EspnClientOptions,
): Promise<Result<DirectoryEntry[], EspnError>> {
  let season = espnSeason;
  let ranked = await fetchPgaSeasonStandings(season, options);
  if (ranked.ok && ranked.value.length === 0) {
    season -= 1;
    ranked = await fetchPgaSeasonStandings(season, options);
  }
  if (!ranked.ok) return ranked;

  const wanted = ranked.value.slice(0, limit).filter((r) => !knownIds.has(r.espnAthleteId));
  const details = await mapWithConcurrency(wanted, ATHLETE_FETCH_CONCURRENCY, (r) =>
    getJson(espnUrls.coreAthlete(SPORTS.pga, season, r.espnAthleteId), coreAthleteSchema, options),
  );

  const entries: DirectoryEntry[] = [];
  for (const detail of details) {
    // A 404 is permanent for that athlete; failing the whole load on it would block the pool
    // forever. Any other failure is transient or a shape change, and fails loudly.
    if (!detail.ok && detail.error.code === "espn_not_found") continue;
    if (!detail.ok) return detail;
    const athlete = detail.value;
    entries.push({
      espnId: athlete.id,
      name: athlete.displayName,
      shortName: athlete.lastName ?? lastToken(athlete.displayName),
      logoUrl: athlete.headshot?.href ?? null,
      primaryColor: null,
    });
  }
  return ok(entries);
}

const lastToken = (name: string) => name.split(" ").at(-1) ?? name;

/** ESPN sends "002d62" (or "F35B0F") with no "#"; the column only accepts lowercase #rrggbb. */
function normalizeColor(raw: string | undefined): string | null {
  const candidate = `#${(raw ?? "").replace(/^#/, "").toLowerCase()}`;
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : null;
}
