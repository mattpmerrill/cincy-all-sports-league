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

export type Sport = {
  code: SportCode;
  name: string;
  shortLabel: string;
  participantKind: ParticipantKind;
  /** Path segments of ESPN's public API: /apis/site/v2/sports/{espnSport}/{espnLeague}. */
  espnSport: string;
  espnLeague: string;
};

export const SPORTS: Readonly<Record<SportCode, Sport>> = {
  mlb: {
    code: "mlb",
    name: "MLB",
    shortLabel: "MLB",
    participantKind: "team",
    espnSport: "baseball",
    espnLeague: "mlb",
  },
  nba: {
    code: "nba",
    name: "NBA",
    shortLabel: "NBA",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "nba",
  },
  nhl: {
    code: "nhl",
    name: "NHL",
    shortLabel: "NHL",
    participantKind: "team",
    espnSport: "hockey",
    espnLeague: "nhl",
  },
  ncaaf: {
    code: "ncaaf",
    name: "NCAA Football",
    shortLabel: "CFB",
    participantKind: "team",
    espnSport: "football",
    espnLeague: "college-football",
  },
  ncaab: {
    code: "ncaab",
    name: "NCAA Basketball",
    shortLabel: "CBB",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "mens-college-basketball",
  },
  ncaasb: {
    code: "ncaasb",
    name: "NCAA Softball",
    shortLabel: "SB",
    participantKind: "team",
    espnSport: "baseball",
    espnLeague: "college-softball",
  },
  wta: {
    code: "wta",
    name: "WTA Tennis",
    shortLabel: "WTA",
    participantKind: "athlete",
    espnSport: "tennis",
    espnLeague: "wta",
  },
  mls: {
    code: "mls",
    name: "MLS",
    shortLabel: "MLS",
    participantKind: "team",
    espnSport: "soccer",
    espnLeague: "usa.1",
  },
  pga: {
    code: "pga",
    name: "PGA Golf",
    shortLabel: "PGA",
    participantKind: "athlete",
    espnSport: "golf",
    espnLeague: "pga",
  },
  wnba: {
    code: "wnba",
    name: "WNBA",
    shortLabel: "WNBA",
    participantKind: "team",
    espnSport: "basketball",
    espnLeague: "wnba",
  },
  nfl: {
    code: "nfl",
    name: "NFL",
    shortLabel: "NFL",
    participantKind: "team",
    espnSport: "football",
    espnLeague: "nfl",
  },
};

export const SPORT_LIST: readonly Sport[] = SPORT_CODES.map((code) => SPORTS[code]);

export function isSportCode(value: string): value is SportCode {
  return (SPORT_CODES as readonly string[]).includes(value);
}
