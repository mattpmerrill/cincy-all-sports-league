import { formatPoints } from "@/domain/league/format";
import { gainTexts } from "./gain-texts";
import type { MatchupLeader } from "./score-matchup";
import type { MatchupSideKey } from "./types";

export type ResultSentenceInput = {
  /** Team names, already resolved: this module words matchups, it never looks teams up. */
  home: string;
  away: string;
  homeGain: number;
  awayGain: number;
  leader: MatchupLeader;
  /** The side the reader owns, for "You beat ..."; omit for the neutral wording. */
  viewer?: MatchupSideKey | null;
};

/**
 * One finished matchup as a sentence. The feed post and the Monday digest both say it, so the
 * wording lives here once. The winner's number always comes first, even in "You lost to ...", so
 * the two numbers read the same in every sentence about the same result.
 */
export function resultSentence(input: ResultSentenceInput): string {
  const { home, away, homeGain, awayGain, leader } = input;
  const viewer = input.viewer ?? null;
  const opponent = viewer === "home" ? away : home;

  if (leader === "tied") {
    const at = formatPoints(homeGain);
    return viewer ? `You tied ${opponent} at ${at}` : `${home} and ${away} tied at ${at}`;
  }
  const homeWon = leader === "home";
  const [winner, loser] = homeWon ? [home, away] : [away, home];
  const [winnerGain, loserGain] = homeWon ? [homeGain, awayGain] : [awayGain, homeGain];
  const [winnerText, loserText] = gainTexts(winnerGain, loserGain);
  const score = `${winnerText} to ${loserText}`;
  if (!viewer) return `${winner} beat ${loser} ${score}`;
  return leader === viewer ? `You beat ${opponent} ${score}` : `You lost to ${opponent} ${score}`;
}

/** One pairing: "Sher Bear vs Papie", or "You play Papie this week" for the owner of a side. */
export function pairingSentence(
  home: string,
  away: string,
  viewer?: MatchupSideKey | null,
): string {
  if (!viewer) return `${home} vs ${away}`;
  return `You play ${viewer === "home" ? away : home} this week`;
}
