import { SPORTS, type SportCode } from "@/domain/sports/sports";
import type { PostseasonAppearance, PostseasonSport, PostseasonStage } from "./stages";
import { isPostseasonSport } from "./stages";
import { getJson, type EspnClientOptions, type EspnError } from "./http";
import { teamScoreboardSchema } from "./schemas";
import { espnUrls } from "./urls";
import { err, ok, type Result } from "@/lib/result";

type ScoreboardEvent = ReturnType<typeof teamScoreboardSchema.parse>["events"][number];

/** A round label, or "final" for the championship game/series (yields champion + runner_up). */
type Round = string;
type Label = { headline: string; slug: string };
type Classifier = (label: Label) => Round | null;

/**
 * Which scoreboard queries hold each sport's postseason. ESPN's scoreboard rejects date ranges,
 * so most sports scan the postseason months (`dates=YYYYMM`) and let the classifiers pick the
 * playoff games out; windows are deliberately a little wide.
 *
 * Two feeds need something else because month queries silently drop games there:
 * - NFL and college football calendars are week-based. NFL postseason is weeks 1-5 of season
 *   type 3; the CFP has its own pseudo-week, 999, which returns exactly the 11 CFP games
 *   (a month query lost a Cotton Bowl quarterfinal).
 */
const monthQueries = (season: number, months: [yearOffset: number, month: number][]) =>
  months.map(([offset, month]) => `dates=${season + offset}${String(month).padStart(2, "0")}`);

const QUERIES: Record<PostseasonSport, (season: number) => string[]> = {
  nfl: (y) => [1, 2, 3, 4, 5].map((week) => `dates=${y}&seasontype=3&week=${week}`),
  ncaaf: (y) => [`dates=${y}&seasontype=3&week=999`],
  nba: (y) =>
    monthQueries(y, [
      [0, 4],
      [0, 5],
      [0, 6],
    ]),
  nhl: (y) =>
    monthQueries(y, [
      [0, 4],
      [0, 5],
      [0, 6],
    ]),
  mlb: (y) =>
    monthQueries(y, [
      [0, 9],
      [0, 10],
      [0, 11],
    ]),
  mls: (y) =>
    monthQueries(y, [
      [0, 10],
      [0, 11],
      [0, 12],
    ]),
  wnba: (y) =>
    monthQueries(y, [
      [0, 9],
      [0, 10],
    ]),
  ncaab: (y) =>
    monthQueries(y, [
      [0, 3],
      [0, 4],
    ]),
  ncaasb: (y) =>
    monthQueries(y, [
      [0, 5],
      [0, 6],
    ]),
};

/**
 * Wins that clinch the championship round. ESPN's own series metadata is unreliable (softball's
 * best-of-3 reports 2 total games), so we count wins ourselves.
 */
const FINAL_WINS_TO_CLINCH: Record<PostseasonSport, number> = {
  nfl: 1,
  mls: 1,
  ncaaf: 1,
  ncaab: 1,
  nba: 4,
  nhl: 4,
  mlb: 4,
  wnba: 3, // best-of-5
  ncaasb: 2, // best-of-3
};

const has = (text: string, ...needles: string[]) => needles.some((n) => text.includes(n));

/**
 * Round detection is by headline (or season slug for MLS), lower-cased. Anything unrecognised
 * returns null and is ignored, which is how the Pro Bowl, NIT, College Basketball Crown, bowl
 * games and NBA play-in stay out. Order matters: "semifinals" contains "finals".
 */
const CLASSIFIERS: Record<PostseasonSport, Classifier> = {
  nfl: ({ headline: h }) =>
    has(h, "super bowl")
      ? "final"
      : has(h, "championship")
        ? "conference_championship"
        : has(h, "divisional")
          ? "divisional"
          : has(h, "wild card")
            ? "wild_card"
            : null,
  nba: ({ headline: h }) =>
    has(h, "nba finals")
      ? "final"
      : has(h, "semifinals")
        ? "conference_semifinals"
        : has(h, "finals")
          ? "conference_finals"
          : has(h, "1st round")
            ? "first_round"
            : null,
  nhl: ({ headline: h }) =>
    has(h, "stanley cup final")
      ? "final"
      : has(h, "east final", "west final")
        ? "conference_final"
        : has(h, "2nd round")
          ? "second_round"
          : has(h, "1st round")
            ? "first_round"
            : null,
  mlb: ({ headline: h }) =>
    has(h, "world series")
      ? "final"
      : /\b(al|nl)cs\b/.test(h)
        ? "lcs"
        : /\b(al|nl)ds\b/.test(h)
          ? "division_series"
          : /\b(al|nl)wc\b/.test(h)
            ? "wild_card"
            : null,
  // ESPN's MLS headlines are just series scores; the round is in the slug. The one-game Wild Card
  // and best-of-3 Round One are both "made the playoffs", so both map to first_round.
  mls: ({ slug }) =>
    slug === "mls-cup"
      ? "final"
      : slug.endsWith("---final")
        ? "conference_final"
        : slug.endsWith("---semifinals")
          ? "conference_semifinal"
          : slug.endsWith("---round-one") || slug.endsWith("---wild-card")
            ? "first_round"
            : null,
  wnba: ({ headline: h }) =>
    has(h, "semifinals")
      ? "semifinal"
      : has(h, "finals")
        ? "final"
        : has(h, "second round")
          ? "second_round"
          : has(h, "first round")
            ? "first_round"
            : null,
  ncaaf: ({ headline: h }) =>
    !has(h, "college football playoff")
      ? null
      : has(h, "national championship")
        ? "final"
        : has(h, "semifinal")
          ? "cfp_semifinal"
          : has(h, "quarterfinal")
            ? "cfp_quarterfinal"
            : has(h, "first round")
              ? "cfp_first_round"
              : null,
  ncaab: ({ headline: h }) =>
    !has(h, "ncaa men's basketball championship") || has(h, "first four")
      ? null
      : has(h, "national championship")
        ? "final"
        : has(h, "final four")
          ? "final_four"
          : has(h, "elite 8")
            ? "elite_eight"
            : has(h, "sweet 16")
              ? "sweet_16"
              : has(h, "2nd round")
                ? "round_of_32"
                : has(h, "1st round")
                  ? "first_round"
                  : null,
  // ESPN never labels a "regional final". The deciding game of each regional is the only one
  // headlined "... advances to Super Regional", and both finalists play in it.
  // WCWS "semifinals" are the two bracket finals, headlined "... advances to Championship Finals".
  ncaasb: ({ headline: h, slug }) =>
    slug === "championship-series" || has(h, "championship finals - game")
      ? "final"
      : has(h, "advances to championship finals")
        ? "wcws_semifinal"
        : slug === "world-series"
          ? "wcws_appearance"
          : has(h, "advances to super regional")
            ? "regional_final"
            : has(h, "super regional")
              ? "super_regional"
              : null,
};

// Placeholder slots ("TBD", "Winner of ...") come through with non-numeric or negative ids.
const isRealTeamId = (teamId: string) => /^\d+$/.test(teamId);

/**
 * Appearances strictly from games played: a team is in a round iff it is in one of that round's
 * games. A bye therefore leaves no row for the skipped round (see withImpliedEarlierStages).
 * champion/runner_up are emitted only once a team has clinched the final round's wins.
 */
export function appearancesFromEvents(
  sport: PostseasonSport,
  events: readonly ScoreboardEvent[],
): PostseasonAppearance[] {
  const classify = CLASSIFIERS[sport];
  const seen = new Set<string>();
  const out: PostseasonAppearance[] = [];
  const add = (espnTeamId: string, stage: string) => {
    const key = `${espnTeamId}:${stage}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ espnTeamId, stage: stage as PostseasonStage });
  };

  const finalWins = new Map<string, number>();
  const finalists = new Set<string>();

  const seenEvents = new Set<string>();
  for (const event of events) {
    // Adjacent month queries can return the same game; a double-counted win would fake a clinch.
    if (seenEvents.has(event.id)) continue;
    seenEvents.add(event.id);
    const competition = event.competitions[0];
    if (!competition) continue;
    const round = classify({
      headline: (competition.notes?.[0]?.headline ?? "").toLowerCase(),
      slug: event.season.slug ?? "",
    });
    if (round === null) continue;

    const teams = competition.competitors.map((c) => c.team.id).filter(isRealTeamId);
    if (round !== "final") {
      teams.forEach((t) => add(t, round));
      continue;
    }
    teams.forEach((t) => finalists.add(t));
    if (competition.status.type.completed) {
      for (const c of competition.competitors) {
        if (c.winner) finalWins.set(c.team.id, (finalWins.get(c.team.id) ?? 0) + 1);
      }
    }
  }

  for (const [champion, wins] of finalWins) {
    if (wins < FINAL_WINS_TO_CLINCH[sport]) continue;
    add(champion, "champion");
    finalists.forEach((t) => t !== champion && add(t, "runner_up"));
  }
  return out;
}

/**
 * Every team that reached a postseason round, from the postseason scoreboards.
 * Fetches are sequential on purpose: a handful of small calls per sport.
 */
export async function fetchPostseasonStages(
  sportCode: SportCode,
  espnSeason: number,
  options: EspnClientOptions = {},
): Promise<Result<PostseasonAppearance[], EspnError>> {
  if (!isPostseasonSport(sportCode)) {
    return err("espn_unsupported", `${sportCode} has no team postseason`);
  }
  const sport = SPORTS[sportCode];

  const events: ScoreboardEvent[] = [];
  for (const query of QUERIES[sportCode](espnSeason)) {
    const page = await getJson(espnUrls.scoreboard(sport, query), teamScoreboardSchema, options);
    if (!page.ok) return page;
    events.push(...page.value.events);
  }
  return ok(appearancesFromEvents(sportCode, events));
}
