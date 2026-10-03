import type { LeagueModelSource } from "@/data/league-model";
import type { OwnerData, ParticipantData, SeasonStatus } from "@/domain/league";
import { describePickBreakdown } from "@/domain/league";
import type { BreakdownView, SportPickRow } from "@/domain/league";
import type { RecordLine } from "@/domain/records";
import { SPORTS, SPORT_CODES } from "@/domain/sports/sports";
import type { ParticipantKind, SportCode } from "@/domain/sports/sports";

export type SportSummary = {
  code: SportCode;
  name: string;
  shortLabel: string;
  participantKind: ParticipantKind;
  status: SeasonStatus;
  /**
   * The best pick so far, or null while nobody has scored. The points belong to the team: when
   * `traded`, they include what the team earned from players it traded away (or exclude what its
   * current player earned elsewhere), so they are not the participant's own score.
   */
  leader: { teamName: string; participantName: string; points: number; traded: boolean } | null;
};

export type SportPickView = {
  rank: number;
  rankLabel: string;
  isTied: boolean;
  teamName: string;
  teamSlug: string;
  owner: OwnerData | null;
  participant: Pick<ParticipantData, "name" | "logoUrl" | "primaryColor">;
  /** True when `points` differ from the participant's own score because of a trade. */
  traded: boolean;
  points: number;
  lines: BreakdownView[];
  /** The current participant's record or ranking; null while there is nothing to show. */
  record: RecordLine | null;
};

export type SportView = SportSummary & { picks: SportPickView[] };

export function createSportsService({ model }: { model: LeagueModelSource }) {
  const summary = (
    code: SportCode,
    status: SeasonStatus,
    top: { teamName: string; participantName: string; points: number; traded: boolean } | undefined,
  ): SportSummary => ({
    code,
    name: SPORTS[code].name,
    shortLabel: SPORTS[code].shortLabel,
    participantKind: SPORTS[code].participantKind,
    status,
    leader: top && top.points > 0 ? top : null,
  });

  /** The credited number's owner is the team; the breakdown lines say when a trade moved it. */
  const isTraded = (row: Parameters<typeof describePickBreakdown>[0]) =>
    describePickBreakdown(row).some((line) => line.isAdjustment);
  const leaderOf = (row: SportPickRow | undefined) =>
    row && {
      teamName: row.teamName,
      participantName: row.participant.name,
      points: row.credited.total,
      traded: isTraded(row),
    };

  return {
    async listSports(): Promise<SportSummary[]> {
      const league = await model();
      if (!league) return [];
      return SPORT_CODES.map((code) => {
        // Picks arrive ranked, so the first row holds the sport's best score.
        const first = league.sportPicks[code][0];
        return summary(code, league.sports[code].status, leaderOf(first));
      });
    },

    /** All 20 picks (one row per team, so a shared WNBA pick appears once per team), ranked. */
    async getSportView(code: SportCode): Promise<SportView | null> {
      const league = await model();
      if (!league) return null;
      const rows = league.sportPicks[code];
      const first = rows[0];
      return {
        ...summary(code, league.sports[code].status, leaderOf(first)),
        picks: rows.map((row) => ({
          rank: row.rank,
          rankLabel: row.rankLabel,
          isTied: row.isTied,
          teamName: row.teamName,
          teamSlug: row.teamSlug,
          owner: row.owner,
          participant: {
            name: row.participant.name,
            logoUrl: row.participant.logoUrl,
            primaryColor: row.participant.primaryColor,
          },
          traded: isTraded(row),
          points: row.credited.total,
          lines: describePickBreakdown(row),
          record: row.record,
        })),
      };
    },
  };
}
