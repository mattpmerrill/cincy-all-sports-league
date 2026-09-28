/**
 * One-off enrichment: resolves every participant in data/league-2026-27.json to its ESPN id,
 * canonical name, logo/headshot and primary color, then writes the JSON back. The output is
 * committed so seeding is deterministic and needs no network. Re-run only when the roster changes.
 *
 *   pnpm data:resolve
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { SPORTS, type SportCode } from "../src/domain/sports/sports";
import { leagueSchema, type League } from "./league-schema";

const DATA_PATH = new URL("../data/league-2026-27.json", import.meta.url);

async function getJson(url: string, attempts = 3): Promise<unknown> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

/** Case, accent, punctuation-insensitive key: "Montréal Canadiens" == "Montreal Canadiens". */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const teamsResponse = z.object({
  sports: z
    .array(
      z.object({
        leagues: z.array(
          z.object({
            teams: z.array(
              z.object({
                team: z.object({
                  id: z.string(),
                  location: z.string().optional(),
                  displayName: z.string(),
                  shortDisplayName: z.string().optional(),
                  color: z.string().optional(),
                  logos: z.array(z.object({ href: z.string() })).optional(),
                }),
              }),
            ),
          }),
        ),
      }),
    )
    .min(1),
});

const rankingsResponse = z.object({
  rankings: z
    .array(
      z.object({
        ranks: z.array(
          z.object({
            athlete: z.object({
              id: z.string(),
              displayName: z.string(),
              lastName: z.string().optional(),
              headshot: z.string().optional(),
            }),
          }),
        ),
      }),
    )
    .min(1),
});

const searchResponse = z.object({
  items: z
    .array(z.object({ id: z.string(), displayName: z.string(), type: z.string().optional() }))
    .default([]),
});

type Resolved = {
  espn_id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string | null;
};

/**
 * Official club names that ESPN spells differently. The roster keeps the official name; only the
 * lookup uses ESPN's spelling.
 */
const ESPN_ALIASES: Readonly<Record<string, string>> = {
  "New York Red Bulls": "Red Bull New York",
  "Los Angeles FC": "LAFC",
  "Vancouver Whitecaps FC": "Vancouver Whitecaps",
};

const isCollege = (code: SportCode) => code === "ncaaf" || code === "ncaab" || code === "ncaasb";

async function resolveTeams(code: SportCode, names: string[]) {
  const { espnSport, espnLeague } = SPORTS[code];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${espnLeague}/teams?limit=1000`;
  const teams = teamsResponse
    .parse(await getJson(url))
    .sports[0].leagues[0].teams.map((t) => t.team);
  const out = new Map<string, Resolved | null>();
  for (const name of names) {
    // College names in the roster are the school ("Michigan"); ESPN's displayName adds the mascot.
    const alias = ESPN_ALIASES[name];
    const lookup = alias ?? name;
    // Also accept the full displayName so re-running on an already-resolved file is a no-op.
    const matches = teams.filter(
      (t) =>
        norm(t.displayName) === norm(lookup) ||
        (isCollege(code) && norm(t.location ?? "") === norm(lookup)),
    );
    if (matches.length !== 1) {
      out.set(name, null);
      continue;
    }
    const t = matches[0];
    out.set(name, {
      espn_id: t.id,
      name: alias ? name : t.displayName,
      short_name: (isCollege(code) ? t.location : t.shortDisplayName) ?? t.displayName,
      logo_url: t.logos?.[0]?.href ?? null,
      primary_color: t.color ? `#${t.color.toLowerCase()}` : null,
    });
  }
  return out;
}

async function headshotIfExists(sport: "tennis" | "golf", id: string) {
  const url = `https://a.espncdn.com/i/headshots/${sport}/players/full/${id}.png`;
  const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
  return res.ok ? url : null;
}

const lastToken = (name: string) => name.split(" ").at(-1) ?? name;

async function resolveAthletes(code: "wta" | "pga", names: string[]) {
  const out = new Map<string, Resolved | null>();
  const sport = code === "wta" ? "tennis" : "golf";
  const ranked =
    code === "wta"
      ? rankingsResponse
          .parse(await getJson("https://site.api.espn.com/apis/site/v2/sports/tennis/wta/rankings"))
          .rankings[0].ranks.map((r) => r.athlete)
      : [];
  for (const name of names) {
    let hit:
      { id: string; displayName: string; lastName?: string; headshot?: string | null } | undefined;
    const fromRanking = ranked.find((a) => norm(a.displayName) === norm(name));
    if (fromRanking) {
      hit = { ...fromRanking, headshot: fromRanking.headshot };
    } else {
      const search = searchResponse.parse(
        await getJson(
          `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&type=player&sport=${sport}`,
        ),
      );
      hit = search.items.find((i) => i.type === "player" && norm(i.displayName) === norm(name));
    }
    if (!hit) {
      out.set(name, null);
      continue;
    }
    out.set(name, {
      espn_id: hit.id,
      name: hit.displayName,
      short_name: hit.lastName ?? lastToken(hit.displayName),
      logo_url: hit.headshot ?? (await headshotIfExists(sport, hit.id)),
      primary_color: null,
    });
  }
  return out;
}

async function main() {
  const league: League = leagueSchema.parse(JSON.parse(readFileSync(DATA_PATH, "utf8")));
  const unresolved: string[] = [];

  for (const sport of league.sports) {
    const code = sport.code;
    const names = sport.participants.map((p) => p.name);
    const resolved =
      code === "wta" || code === "pga"
        ? await resolveAthletes(code, names)
        : await resolveTeams(code, names);

    for (const p of sport.participants) {
      const r = resolved.get(p.name);
      if (!r) {
        unresolved.push(`${code}: ${p.name}`);
        continue;
      }
      // Rewrite picks that used the roster spelling so they follow the canonical name.
      for (const team of league.teams) if (team.picks[code] === p.name) team.picks[code] = r.name;
      Object.assign(p, r);
    }
  }

  writeFileSync(DATA_PATH, `${JSON.stringify(league, null, 2)}\n`);
  console.log(unresolved.length ? `UNRESOLVED:\n${unresolved.join("\n")}` : "all resolved");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
