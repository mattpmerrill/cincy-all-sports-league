import { SPORTS } from "@/domain/sports/sports";
import type { GolfFinish, GolfMajorResult, TennisFinish, TennisMajorResult } from "./facts";
import { getJson, type EspnClientOptions, type EspnError } from "./http";
import { golfScoreboardSchema, tennisScoreboardSchema } from "./schemas";
import { espnUrls } from "./urls";
import { ok, type Result } from "@/lib/result";

type TennisEvent = ReturnType<typeof tennisScoreboardSchema.parse>["events"][number];
type GolfEvent = ReturnType<typeof golfScoreboardSchema.parse>["events"][number];

/**
 * Canonical labels are ours (they become `event_label` in the DB); `espnNames` are what ESPN
 * calls the event. ESPN says "Roland Garros" where the family says "French Open".
 */
const TENNIS_MAJORS = [
  { label: "Australian Open", espnNames: ["Australian Open"], probe: { month: 1, day: 20 } },
  { label: "French Open", espnNames: ["Roland Garros"], probe: { month: 6, day: 1 } },
  { label: "Wimbledon", espnNames: ["Wimbledon"], probe: { month: 7, day: 7 } },
  { label: "US Open", espnNames: ["US Open"], probe: { month: 9, day: 3 } },
] as const;

const GOLF_MAJORS = [
  { label: "Masters Tournament", espnNames: ["Masters Tournament"], month: 4 },
  { label: "PGA Championship", espnNames: ["PGA Championship"], month: 5 },
  { label: "U.S. Open", espnNames: ["U.S. Open"], month: 6 },
  { label: "The Open Championship", espnNames: ["The Open", "The Open Championship"], month: 7 },
] as const;

export const TENNIS_MAJOR_LABELS: readonly string[] = TENNIS_MAJORS.map((m) => m.label);
export const GOLF_MAJOR_LABELS: readonly string[] = GOLF_MAJORS.map((m) => m.label);

const pad = (n: number) => String(n).padStart(2, "0");

// ---- Tennis -----------------------------------------------------------------------------------

// Round 3 is the round of 32 and Round 4 the round of 16 in a 128-player Slam draw.
const TENNIS_ROUND_TIER: Record<string, number> = {
  "round 3": 1,
  "round 4": 2,
  quarterfinal: 3,
  semifinal: 4,
  final: 5,
};
const FINAL_TIER = 5;
const TENNIS_FINISH_BY_TIER: TennisFinish[] = [
  "earlier",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "runner_up",
  "champion",
];

/**
 * A player's finish is the furthest main-draw singles round they appear in, so a scheduled
 * (unplayed) match still counts as reached. Qualifying rounds are excluded. For the final,
 * only a flagged winner is champion; before the result, finalists are guaranteed runner_up.
 */
export function tennisResultsFromEvent(label: string, event: TennisEvent): TennisMajorResult[] {
  const singles = event.groupings?.find((g) => g.grouping.slug === "womens-singles");
  const bestTier = new Map<string, number>();

  for (const match of singles?.competitions ?? []) {
    const round = match.round.displayName.toLowerCase();
    if (round.includes("qualifying")) continue;
    const roundTier = TENNIS_ROUND_TIER[round] ?? 0;
    for (const player of match.competitors) {
      if (!player.id || !/^\d+$/.test(player.id)) continue; // TBD slot
      const tier = roundTier === FINAL_TIER && player.winner ? FINAL_TIER + 1 : roundTier;
      bestTier.set(player.id, Math.max(bestTier.get(player.id) ?? 0, tier));
    }
  }

  return [...bestTier].map(([espnAthleteId, tier]) => ({
    eventName: label,
    espnAthleteId,
    finish: TENNIS_FINISH_BY_TIER[tier] ?? "earlier",
    eventCompleted: event.status.type.completed,
  }));
}

async function fetchTennisMajors(
  espnSeason: number,
  options: EspnClientOptions,
): Promise<Result<TennisMajorResult[], EspnError>> {
  // A day query returns just the tournaments running that day, all with full draws. The probe
  // date sits inside each Slam's window every year, so no calendar lookup is needed.
  const pages = await Promise.all(
    TENNIS_MAJORS.map(async (major) => {
      const dates = `${espnSeason}${pad(major.probe.month)}${pad(major.probe.day)}`;
      return getJson(
        espnUrls.scoreboard(SPORTS.wta, `dates=${dates}`),
        tennisScoreboardSchema,
        options,
      );
    }),
  );

  const results: TennisMajorResult[] = [];
  for (const [index, page] of pages.entries()) {
    if (!page.ok) return page;
    const major = TENNIS_MAJORS[index];
    if (!major) continue;
    // Not on the calendar yet (future season): nothing to report, and that is not an error.
    const event = page.value.events.find((e) =>
      (major.espnNames as readonly string[]).includes(e.name),
    );
    if (event) results.push(...tennisResultsFromEvent(major.label, event));
  }
  return ok(results);
}

// ---- Golf -------------------------------------------------------------------------------------

const toPar = (score: string | undefined): number | null => {
  if (score === "E") return 0;
  return score !== undefined && /^[+-]\d+$/.test(score) ? Number(score) : null;
};

function golfFinishForPosition(position: number): GolfFinish {
  if (position === 1) return "champion";
  if (position === 2) return "runner_up";
  if (position <= 5) return "top_5";
  if (position <= 10) return "top_10";
  if (position <= 20) return "top_20";
  return "made_cut";
}

/**
 * ESPN's scoreboard gives golfers in finishing `order` with a to-par score but no position
 * label, so we derive it: ties share the best position ("T3" is position 3, so top_5).
 * Made the cut = played round 3 (a cut or withdrawal leaves round 3 at 0/"-").
 * If the top score is tied (a playoff), `order` says who won; the rest are position 2.
 */
export function golfResultsFromEvent(label: string, event: GolfEvent): GolfMajorResult[] {
  const competition = event.competitions[0];
  const competitors = [...(competition?.competitors ?? [])].sort((a, b) => a.order - b.order);
  const rows = competitors.map((c) => ({
    espnAthleteId: c.id,
    score: toPar(c.score),
    madeCut: (c.linescores?.filter((l) => (l.value ?? 0) > 0).length ?? 0) >= 3,
  }));

  const ranked = rows.filter((r) => r.madeCut && r.score !== null);
  const position = (score: number) => 1 + ranked.filter((r) => (r.score as number) < score).length;
  const topGroup = ranked.filter((r) => position(r.score as number) === 1);
  const playoffWinner = topGroup.length > 1 ? topGroup[0]?.espnAthleteId : undefined;

  return rows.map((r) => {
    let finish: GolfFinish;
    if (!r.madeCut) finish = "missed_cut";
    else if (r.score === null) finish = "made_cut";
    else if (playoffWinner !== undefined) {
      finish =
        r.espnAthleteId === playoffWinner
          ? "champion"
          : position(r.score) === 1
            ? "runner_up"
            : golfFinishForPosition(position(r.score));
    } else finish = golfFinishForPosition(position(r.score));
    return { eventName: label, espnAthleteId: r.espnAthleteId, finish, eventCompleted: true };
  });
}

async function fetchGolfMajors(
  espnSeason: number,
  options: EspnClientOptions,
): Promise<Result<GolfMajorResult[], EspnError>> {
  // Month queries are the smallest call that finds a major without a calendar lookup
  // (a single date moves every year). They are big (a few MB), hence Promise.all over 4.
  const pages = await Promise.all(
    GOLF_MAJORS.map((major) =>
      getJson(
        espnUrls.scoreboard(SPORTS.pga, `dates=${espnSeason}${pad(major.month)}`),
        golfScoreboardSchema,
        options,
      ),
    ),
  );

  const results: GolfMajorResult[] = [];
  for (const [index, page] of pages.entries()) {
    if (!page.ok) return page;
    const major = GOLF_MAJORS[index];
    if (!major) continue;
    const event = page.value.events.find(
      (e) =>
        (major.espnNames as readonly string[]).includes(e.name) &&
        e.date.startsWith(String(espnSeason)),
    );
    // Positions are only final once the event is over; skip live and future events.
    if (event?.competitions[0]?.status.type.completed) {
      results.push(...golfResultsFromEvent(major.label, event));
    }
  }
  return ok(results);
}

export function fetchMajorResults(
  sport: "wta",
  espnSeason: number,
  options?: EspnClientOptions,
): Promise<Result<TennisMajorResult[], EspnError>>;
export function fetchMajorResults(
  sport: "pga",
  espnSeason: number,
  options?: EspnClientOptions,
): Promise<Result<GolfMajorResult[], EspnError>>;
export function fetchMajorResults(
  sport: "wta" | "pga",
  espnSeason: number,
  options: EspnClientOptions = {},
): Promise<Result<TennisMajorResult[] | GolfMajorResult[], EspnError>> {
  return sport === "wta"
    ? fetchTennisMajors(espnSeason, options)
    : fetchGolfMajors(espnSeason, options);
}
