/**
 * Manual live check against ESPN (not part of the test suite, never imported by the app):
 *   pnpm tsx src/integrations/espn/dev/smoke.ts records|postseason|rankings|majors|all
 * Prints compact summaries only, never raw payloads.
 */
import {
  fetchMajorResults,
  fetchPgaSeasonStandings,
  fetchPostseasonStages,
  fetchTeamRecords,
  fetchWtaRankings,
  type PostseasonSport,
} from "..";

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

const steps = { records, postseason, rankings, majors };
const arg = process.argv[2] ?? "records";
const run = arg === "all" ? Object.values(steps) : [steps[arg as keyof typeof steps] ?? records];

async function main() {
  for (const step of run) await step();
}
void main();
