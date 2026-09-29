import type { LeagueModelSource } from "@/data/league-model";
import type { LeagueData, RuleGroup, SeasonStatus } from "@/domain/league";
import { groupRules } from "@/domain/league";
import { SPORTS, SPORT_CODES } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import { formatPoints } from "@/domain/league";
import { GAME_TIE_NOTES, LEADERBOARD_TIE_NOTES, playoffNote } from "./tie-rules";
import type { RuleNote } from "./tie-rules";

export type SportRules = {
  code: SportCode;
  name: string;
  status: SeasonStatus;
  groups: RuleGroup[];
  /** Set for tennis and golf: the most the majors can add together. */
  majorCapNote: string | null;
};

export type RulesView = {
  seasonName: string;
  sports: SportRules[];
  notes: { playoffs: RuleNote; gameTies: RuleNote[]; leaderboardTies: RuleNote[] };
};

export function createRulesService({
  model,
  loadData,
}: {
  model: LeagueModelSource;
  loadData: () => Promise<LeagueData | null>;
}) {
  return {
    /** Renders scoring_rules as the league's rubric, grouped by sport. Null before a season exists. */
    async getRules(): Promise<RulesView | null> {
      const [league, data] = await Promise.all([model(), loadData()]);
      if (!league || !data) return null;
      return {
        seasonName: data.season.name,
        sports: SPORT_CODES.map((code) => {
          const cap = league.sports[code].majorPointsCap;
          return {
            code,
            name: SPORTS[code].name,
            status: league.sports[code].status,
            groups: groupRules(data.rules.filter((r) => r.sport === code)),
            majorCapNote:
              cap === null ? null : `Major points are capped at ${formatPoints(cap)} per season.`,
          };
        }),
        notes: {
          playoffs: playoffNote(data.season.playoffScoringMode),
          gameTies: GAME_TIE_NOTES,
          leaderboardTies: LEADERBOARD_TIE_NOTES,
        },
      };
    },
  };
}
