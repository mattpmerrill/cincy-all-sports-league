import type { LeagueModelSource } from "@/data/league-model";
import { describeBreakdownLine } from "@/domain/league";
import type { BreakdownView, OwnerData, SeasonStatus } from "@/domain/league";
import type { RankMovement } from "@/domain/standings";
import { SPORTS, SPORT_CODES } from "@/domain/sports/sports";
import type { ParticipantKind, SportCode } from "@/domain/sports/sports";

export type PickView = {
  sport: SportCode;
  sportName: string;
  sportShortLabel: string;
  participantKind: ParticipantKind;
  participantName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  status: SeasonStatus;
  points: number;
  lines: BreakdownView[];
};

export type TeamDetail = {
  id: string;
  slug: string;
  name: string;
  owner: OwnerData | null;
  rank: number;
  rankLabel: string;
  isTied: boolean;
  total: number;
  movement: RankMovement;
  teamCount: number;
  picks: PickView[];
};

export function createFantasyTeamsService({ model }: { model: LeagueModelSource }) {
  return {
    /** Null when the slug matches no team (the page turns that into a 404). */
    async getTeamDetail(slug: string): Promise<TeamDetail | null> {
      const league = await model();
      const team = league?.standings.find((t) => t.slug === slug);
      if (!league || !team) return null;

      const catalogOrder = (sport: SportCode) => SPORT_CODES.indexOf(sport);
      const picks = team.picks
        .map((pick): PickView => {
          const sport = SPORTS[pick.sport];
          return {
            sport: pick.sport,
            sportName: sport.name,
            sportShortLabel: sport.shortLabel,
            participantKind: sport.participantKind,
            participantName: pick.participant.name,
            logoUrl: pick.participant.logoUrl,
            primaryColor: pick.participant.primaryColor,
            status: league.sports[pick.sport].status,
            points: pick.score.total,
            lines: pick.score.lines.map(describeBreakdownLine),
          };
        })
        // Earning picks first so the page opens on what is moving the total.
        .sort((a, b) => b.points - a.points || catalogOrder(a.sport) - catalogOrder(b.sport));

      return {
        id: team.teamId,
        slug: team.slug,
        name: team.teamName,
        owner: team.owner,
        rank: team.rank,
        rankLabel: team.rankLabel,
        isTied: team.isTied,
        total: team.total,
        movement: team.movement,
        teamCount: league.standings.length,
        picks,
      };
    },
  };
}
