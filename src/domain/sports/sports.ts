/**
 * The single owner of the "sport" concept: the code union and the catalog. Everything else
 * (scoring rules, ESPN adapters, UI, DB seed) imports from here instead of re-declaring sports.
 */

export const SPORT_CODES = [
  "mlb",
  "nba",
  "nhl",
  "ncaaf",
  "ncaab",
  "ncaasb",
  "wta",
  "mls",
  "pga",
  "wnba",
  "nfl",
] as const;

export type SportCode = (typeof SPORT_CODES)[number];

/** Teams win games; athletes (tennis, golf) are scored on rankings and event finishes. */
export type ParticipantKind = "team" | "athlete";

/**
 * How a participant's standing reads in this sport: the shape of a team's regular-season record,
 * or "ranking" for athletes, who have a rank rather than a record.
 *
 * - `W-L`: wins and losses (most sports).
 * - `W-L-T`: NFL; the tie count is shown only when it is above zero, because ties are rare.
 * - `W-L-OTL`: NHL; overtime and shootout losses are a third column that is always shown.
 * - `W-L-D`: MLS; draws are common, so the column is always shown.
 */
export const RECORD_STYLES = ["W-L", "W-L-T", "W-L-OTL", "W-L-D", "ranking"] as const;
export type RecordStyle = (typeof RECORD_STYLES)[number];

export type Sport = {
  code: SportCode;
  name: string;
  shortLabel: string;
  participantKind: ParticipantKind;
  /** Path segments of ESPN's public API: /apis/site/v2/sports/{espnSport}/{espnLeague}. */
  espnSport: string;
  espnLeague: string;
  recordStyle: RecordStyle;
  /** What an athlete's rank is a rank in ("WTA", "FedExCup"); set exactly for `ranking` sports. */
  rankingLabel: string | null;
};

export const SPORTS: Readonly<Record<SportCode, Sport>> = {
  mlb: {
    code: "mlb",
    name: "MLB",
    shortLabel: "MLB",
    participantKind: "team",
    espnSport: "baseball",
    espnLeague: "mlb",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  nba: {
    code: "nba",
    name: "NBA",
    shortLabel: "NBA",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "nba",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  nhl: {
    code: "nhl",
    name: "NHL",
    shortLabel: "NHL",
    participantKind: "team",
    espnSport: "hockey",
    espnLeague: "nhl",
    recordStyle: "W-L-OTL",
    rankingLabel: null,
  },
  ncaaf: {
    code: "ncaaf",
    name: "NCAA Football",
    shortLabel: "CFB",
    participantKind: "team",
    espnSport: "football",
    espnLeague: "college-football",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  ncaab: {
    code: "ncaab",
    name: "NCAA Basketball",
    shortLabel: "CBB",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "mens-college-basketball",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  ncaasb: {
    code: "ncaasb",
    name: "NCAA Softball",
    shortLabel: "SB",
    participantKind: "team",
    espnSport: "baseball",
    espnLeague: "college-softball",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  wta: {
    code: "wta",
    name: "WTA Tennis",
    shortLabel: "WTA",
    participantKind: "athlete",
    espnSport: "tennis",
    espnLeague: "wta",
    recordStyle: "ranking",
    rankingLabel: "WTA",
  },
  mls: {
    code: "mls",
    name: "MLS",
    shortLabel: "MLS",
    participantKind: "team",
    espnSport: "soccer",
    espnLeague: "usa.1",
    recordStyle: "W-L-D",
    rankingLabel: null,
  },
  pga: {
    code: "pga",
    name: "PGA Golf",
    shortLabel: "PGA",
    participantKind: "athlete",
    espnSport: "golf",
    espnLeague: "pga",
    recordStyle: "ranking",
    rankingLabel: "FedExCup",
  },
  wnba: {
    code: "wnba",
    name: "WNBA",
    shortLabel: "WNBA",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "wnba",
    recordStyle: "W-L",
    rankingLabel: null,
  },
  nfl: {
    code: "nfl",
    name: "NFL",
    shortLabel: "NFL",
    participantKind: "team",
    espnSport: "football",
    espnLeague: "nfl",
    recordStyle: "W-L-T",
    rankingLabel: null,
  },
};

export const SPORT_LIST: readonly Sport[] = SPORT_CODES.map((code) => SPORTS[code]);

export function isSportCode(value: string): value is SportCode {
  return (SPORT_CODES as readonly string[]).includes(value);
}
