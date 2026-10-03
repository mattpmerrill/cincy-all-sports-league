/**
 * Manual live check against ESPN (not part of the test suite, never imported by the app):
 *   pnpm tsx src/integrations/espn/dev/smoke.ts records|postseason|rankings|majors|games|all
 * Prints compact summaries only, never raw payloads.
 */
import { addDays, easternDateOf, easternWeekStart, stepWeek } from "@/domain/calendar";
import { SPORTS } from "@/domain/sports/sports";
import {
  fetchMajorResults,
  fetchPgaSeasonStandings,
  fetchPostseasonStages,
  fetchScheduledGames,
  fetchTeamRecords,
  fetchWtaRankings,
  type PostseasonSport,
} from "..";
import { gamesFromEvents } from "../games";
import { getJson } from "../http";
import { gamesScoreboardSchema } from "../schemas";
import { espnUrls } from "../urls";

const show = (label: string, result: { ok: boolean; value?: unknown; error?: unknown }) => {
  if (!result.ok) console.log(label, "ERROR", JSON.stringify(result.error));
  return result.ok;
};

async function records() {
  const nfl = await fetchTeamRecords("nfl", 2026);
  if (show("nfl records", nfl) && nfl.ok) {
    const byId = new Map(nfl.value.map((r) => [r.espnTeamId, r]));
    const names: Record<string, string> = {
      "12": "Chiefs",
      "2": "Bills",
      "16": "Vikings",
      "25": "49ers",
      "4": "Bengals",
      "24": "Chargers",
      "34": "Texans",
    };
    for (const [id, name] of Object.entries(names)) {
      const r = byId.get(id);
      console.log(`  ${name.padEnd(9)} ${r?.wins}-${r?.losses}-${r?.ties}`);
    }
  }
  const mls = await fetchTeamRecords("mls", 2026, { espnTeamIds: ["182"] });
  if (show("mls records", mls) && mls.ok) console.log("  mls 182", JSON.stringify(mls.value));
  const cbb = await fetchTeamRecords("ncaab", 2026, { espnTeamIds: ["12", "2132", "150"] });
  if (show("ncaab records (Arizona, Cincinnati, Duke)", cbb) && cbb.ok) {
    console.log("  ", JSON.stringify(cbb.value));
  }
}

async function postseason() {
  const cases: [PostseasonSport, number][] = [
    ["nfl", 2025],
    ["nhl", 2026],
    ["nba", 2026],
    ["mlb", 2025],
    ["mls", 2025],
    ["wnba", 2025],
    ["ncaaf", 2025],
    ["ncaab", 2026],
    ["ncaasb", 2026],
  ];
  for (const [sport, season] of cases) {
    const r = await fetchPostseasonStages(sport, season);
    if (!show(`${sport} ${season}`, r) || !r.ok) continue;
    const counts: Record<string, number> = {};
    for (const a of r.value) counts[a.stage] = (counts[a.stage] ?? 0) + 1;
    const champ = r.value.find((a) => a.stage === "champion")?.espnTeamId;
    console.log(`${sport} ${season}: champion=${champ}`, JSON.stringify(counts));
  }
}

async function rankings() {
  const wta = await fetchWtaRankings();
  if (show("wta", wta) && wta.ok)
    console.log("wta top3", JSON.stringify(wta.value.slice(0, 3)), wta.value.length);
  const pga = await fetchPgaSeasonStandings(2026);
  if (show("pga", pga) && pga.ok)
    console.log("fedex top3", JSON.stringify(pga.value.slice(0, 3)), pga.value.length);
}

async function majors() {
  const tennis = await fetchMajorResults("wta", 2026);
  if (show("tennis majors", tennis) && tennis.ok) {
    for (const r of tennis.value.filter((x) => ["champion", "runner_up"].includes(x.finish))) {
      console.log(" ", r.eventName, r.finish, r.espnAthleteId, r.eventCompleted);
    }
  }
  const golf = await fetchMajorResults("pga", 2026);
  if (show("golf majors", golf) && golf.ok) {
    for (const r of golf.value.filter((x) => ["champion", "runner_up"].includes(x.finish))) {
      console.log(" ", r.eventName, r.finish, r.espnAthleteId);
    }
  }
}

/**
 * The games feeds are unverified against live ESPN (they were written while ESPN was blocked, from
 * its known response shape). This checks, for this Eastern week, that every pro scoreboard parses
 * and maps, that college team schedules do too, and answers the one open question: whether ESPN
 * files a late-night game under the scoreboard day we ask for or under another one.
 */
async function games() {
  const weekStart = easternWeekStart(new Date());
  const span = { from: weekStart, to: addDays(stepWeek(weekStart, 1), 6) }; // this week and next
  console.log(`window ${span.from} .. ${span.to} (Eastern)`);

  for (const sport of ["nfl", "nba", "nhl", "mlb", "mls", "wnba"] as const) {
    const r = await fetchScheduledGames(sport, { window: span, espnSeason: 2026 });
    if (!show(`${sport} games`, r) || !r.ok) continue;
    const status: Record<string, number> = {};
    for (const g of r.value.games) status[g.status] = (status[g.status] ?? 0) + 1;
    const tbd = r.value.games.filter((g) => g.timeTbd).length;
    const withoutScore = r.value.games.filter(
      (g) => g.status === "final" && (g.home.score === null || g.away.score === null),
    ).length;
    console.log(
      `${sport}: ${r.value.games.length} games`,
      JSON.stringify(status),
      `tbd=${tbd} finalWithoutScore=${withoutScore} skipped=${r.value.skipped}`,
      `calls=${r.value.requests} failed=${r.value.failedRequests}`,
    );
    const sample = r.value.games[0];
    if (sample) {
      console.log(
        `  e.g. ${sample.away.shortName} @ ${sample.home.shortName}`,
        sample.startsAt.toISOString(),
        sample.status,
        sample.statusDetail ?? "",
        sample.note ?? "",
      );
    }
  }

  // Where does ESPN put a game that starts after Eastern midnight? Print every game whose
  // Eastern start day differs from the scoreboard day it came back under.
  for (const sport of ["nba", "nhl", "mlb"] as const) {
    let mismatches = 0;
    for (let day = addDays(span.from, -1); day <= addDays(span.from, 6); day = addDays(day, 1)) {
      const page = await getJson(espnUrls.scoreboardDay(SPORTS[sport], day), gamesScoreboardSchema);
      if (!show(`${sport} ${day}`, page) || !page.ok) continue;
      const all = gamesFromEvents(page.value.events, { from: "0000-01-01", to: "9999-12-31" });
      for (const g of all.games) {
        const eastern = easternDateOf(g.startsAt);
        if (eastern !== day) {
          mismatches += 1;
          console.log(`  ${sport} scoreboard ${day} lists a game that starts ${eastern} Eastern`);
        }
      }
    }
    console.log(`${sport}: ${mismatches} games filed under a different day than their Eastern day`);
  }

  // College: a held team or two per sport. Cincinnati (2132) and Arizona (12) are real ids.
  for (const [sport, ids] of [
    ["ncaaf", ["2132", "2116"]],
    ["ncaab", ["2132", "12"]],
    ["ncaasb", ["12"]],
  ] as const) {
    const r = await fetchScheduledGames(sport, {
      window: span,
      espnSeason: 2026,
      espnTeamIds: ids,
    });
    if (!show(`${sport} games`, r) || !r.ok) continue;
    console.log(
      `${sport}: ${r.value.games.length} games in window for teams ${ids.join(",")}`,
      `calls=${r.value.requests} failed=${r.value.failedRequests} skipped=${r.value.skipped}`,
    );
    for (const g of r.value.games.slice(0, 3)) {
      console.log(
        `  ${g.away.shortName} @ ${g.home.shortName}`,
        g.startsAt.toISOString(),
        g.status,
        g.timeTbd ? "(time TBD)" : "",
      );
    }
  }
}

const steps = { records, postseason, rankings, majors, games };
const arg = process.argv[2] ?? "records";
const run = arg === "all" ? Object.values(steps) : [steps[arg as keyof typeof steps] ?? records];

async function main() {
  for (const step of run) await step();
}
void main();
