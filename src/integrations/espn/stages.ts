import type { SportCode } from "@/domain/sports/sports";

/**
 * Ordered postseason ladders, lowest round first. The two final outcomes always come last and are
 * mutually exclusive. Names deliberately equal the `scoring_rules.code` values in the league seed
 * so the sync layer maps stage -> rule with no translation table to drift.
 */
export const POSTSEASON_STAGES = {
  nfl: ["wild_card", "divisional", "conference_championship", "runner_up", "champion"],
  nba: ["first_round", "conference_semifinals", "conference_finals", "runner_up", "champion"],
  nhl: ["first_round", "second_round", "conference_final", "runner_up", "champion"],
  mlb: ["wild_card", "division_series", "lcs", "runner_up", "champion"],
  mls: ["first_round", "conference_semifinal", "conference_final", "runner_up", "champion"],
  wnba: ["first_round", "second_round", "semifinal", "runner_up", "champion"],
  ncaaf: ["cfp_first_round", "cfp_quarterfinal", "cfp_semifinal", "runner_up", "champion"],
  ncaab: [
    "first_round",
    "round_of_32",
    "sweet_16",
    "elite_eight",
    "final_four",
    "runner_up",
    "champion",
  ],
  ncaasb: [
    "regional_final",
    "super_regional",
    "wcws_appearance",
    "wcws_semifinal",
    "runner_up",
    "champion",
  ],
} as const satisfies Partial<Record<SportCode, readonly string[]>>;

export type PostseasonSport = keyof typeof POSTSEASON_STAGES;
export type PostseasonStageOf<S extends PostseasonSport> = (typeof POSTSEASON_STAGES)[S][number];
export type PostseasonStage = PostseasonStageOf<PostseasonSport>;

export function isPostseasonSport(sport: SportCode): sport is PostseasonSport {
  return sport in POSTSEASON_STAGES;
}

export type PostseasonAppearance = {
  espnTeamId: string;
  stage: PostseasonStage;
};

/**
 * Byes: the fetcher reports appearances strictly from games played, so an NFL #1 seed that skipped
 * Wild Card has no "wild_card" row. Whether a bye counts as an earlier appearance is a league
 * scoring decision, not a vendor fact, so this helper is opt-in for the sync layer.
 *
 * It adds every round below the team's highest stage. Champion and runner-up stay mutually
 * exclusive: reaching either implies all real rounds, never the other final outcome.
 */
export function withImpliedEarlierStages(
  sport: PostseasonSport,
  appearances: readonly PostseasonAppearance[],
): PostseasonAppearance[] {
  const ladder: readonly string[] = POSTSEASON_STAGES[sport];
  const roundCount = ladder.length - 2;
  const highest = new Map<string, number>();
  for (const { espnTeamId, stage } of appearances) {
    highest.set(espnTeamId, Math.max(highest.get(espnTeamId) ?? -1, ladder.indexOf(stage)));
  }

  const out: PostseasonAppearance[] = [];
  for (const [espnTeamId, top] of highest) {
    for (let i = 0; i <= Math.min(top, roundCount - 1); i++) {
      out.push({ espnTeamId, stage: ladder[i] as PostseasonStage });
    }
    if (top >= roundCount) out.push({ espnTeamId, stage: ladder[top] as PostseasonStage });
  }
  return out;
}
