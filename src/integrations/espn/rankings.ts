import { SPORTS } from "@/domain/sports/sports";
import type { RankedAthlete } from "./facts";
import { getJson, type EspnClientOptions, type EspnError } from "./http";
import { fedexStandingsSchema, wtaRankingsSchema } from "./schemas";
import { espnUrls } from "./urls";
import { err, ok, type Result } from "@/lib/result";

/**
 * Current WTA singles ranking. ESPN only publishes the top 150 and only the latest week, so a
 * pick outside the top 150 (or a historical year-end rank) has to be entered by an admin.
 */
export async function fetchWtaRankings(
  options: EspnClientOptions = {},
): Promise<Result<RankedAthlete[], EspnError>> {
  const response = await getJson(espnUrls.wtaRankings(SPORTS.wta), wtaRankingsSchema, options);
  if (!response.ok) return response;
  const table = response.value.rankings[0];
  if (!table) return err("espn_shape", "ESPN WTA rankings had no table");
  return ok(table.ranks.map((r) => ({ espnAthleteId: r.athlete.id, rank: r.current })));
}

/**
 * FedExCup rank for a season. ESPN's core standings expose season points per athlete but no
 * rank field, so we rank by points (ties share a rank, like "T2"). Athletes with no points are
 * unranked. Caveat: the official final FedExCup rank is settled by the TOUR Championship's
 * starting-strokes format, which can differ from raw points order; the admin editor covers that.
 */
export async function fetchPgaSeasonStandings(
  espnSeason: number,
  options: EspnClientOptions = {},
): Promise<Result<RankedAthlete[], EspnError>> {
  const response = await getJson(
    espnUrls.fedexCupStandings(SPORTS.pga, espnSeason),
    fedexStandingsSchema,
    options,
  );
  if (!response.ok) return response;

  const scored: { espnAthleteId: string; points: number }[] = [];
  for (const row of response.value.standings) {
    const espnAthleteId = /athletes\/(\d+)/.exec(row.athlete.$ref)?.[1];
    const points = row.records[0]?.stats.find((s) => s.name === "cupPoints")?.value;
    if (espnAthleteId && points !== undefined && points > 0) scored.push({ espnAthleteId, points });
  }
  return ok(rankByPoints(scored));
}

export function rankByPoints(
  scored: readonly { espnAthleteId: string; points: number }[],
): RankedAthlete[] {
  const sorted = [...scored].sort((a, b) => b.points - a.points);
  return sorted.map((athlete) => {
    const firstWithSamePoints = sorted.findIndex((s) => s.points === athlete.points);
    return { espnAthleteId: athlete.espnAthleteId, rank: firstWithSamePoints + 1 };
  });
}
