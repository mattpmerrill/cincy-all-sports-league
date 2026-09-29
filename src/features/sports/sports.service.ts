import type { LeagueModelSource } from "@/data/league-model";
import type { OwnerData, ParticipantData, SeasonStatus } from "@/domain/league";
import { describePickBreakdown } from "@/domain/league";
import type { BreakdownView } from "@/domain/league";
import { SPORTS, SPORT_CODES } from "@/domain/sports/sports";
import type { ParticipantKind, SportCode } from "@/domain/sports/sports";

export type SportSummary = {
  code: SportCode;
  name: string;
  shortLabel: string;
  participantKind: ParticipantKind;
  status: SeasonStatus;
  /** The best pick so far, or null while nobody has scored. */
  leader: { participantName: string; points: number } | null;
};

export type SportPickView = {
  rank: number;
  rankLabel: string;
  isTied: boolean;
  teamName: string;
  teamSlug: string;
  owner: OwnerData | null;
  participant: Pick<ParticipantData, "name" | "logoUrl" | "primaryColor">;
  points: number;
  lines: BreakdownView[];
};

export type SportView = SportSummary & { picks: SportPickView[] };

export function createSportsService({ model }: { model: LeagueModelSource }) {
  const summary = (
    code: SportCode,
    status: SeasonStatus,
    top: { name: string; points: number } | undefined,
  ): SportSummary => ({
    code,
    name: SPORTS[code].name,
    shortLabel: SPORTS[code].shortLabel,
    participantKind: SPORTS[code].participantKind,
    status,
    leader: top && top.points > 0 ? { participantName: top.name, points: top.points } : null,
  });

  return {
    async listSports(): Promise<SportSummary[]> {
      const league = await model();
      if (!league) return [];
      return SPORT_CODES.map((code) => {
        // Picks arrive ranked, so the first row holds the sport's best score.
        const first = league.sportPicks[code][0];
        return summary(
          code,
          league.sports[code].status,
          first && { name: first.participant.name, points: first.credited.total },
        );
      });
    },

    /** All 20 picks (one row per team, so a shared WNBA pick appears once per team), ranked. */
    async getSportView(code: SportCode): Promise<SportView | null> {
      const league = await model();
      if (!league) return null;
      const rows = league.sportPicks[code];
      const first = rows[0];
      return {
        ...summary(
          code,
          league.sports[code].status,
          first && { name: first.participant.name, points: first.credited.total },
        ),
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
          points: row.credited.total,
          lines: describePickBreakdown(row),
        })),
      };
    },
  };
}
