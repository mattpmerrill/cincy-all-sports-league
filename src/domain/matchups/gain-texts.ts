import { formatPoints } from "@/domain/league/format";

/**
 * Gains to show for a decided matchup. Two decimals read best, but a close finish can round to the
 * same text ("1.23 to 1.23") for a matchup somebody won; then it shows up to four decimals, the
 * precision points are stored at, until the two differ. The feed post and the digest both word a
 * result, so the rule lives here once.
 */
export function gainTexts(winnerGain: number, loserGain: number): [string, string] {
  for (const decimals of [2, 3, 4]) {
    const scale = 10 ** decimals;
    const [w, l] = [winnerGain, loserGain].map((g) => String(Math.round(g * scale) / scale));
    if (w !== l || winnerGain === loserGain) return [w as string, l as string];
  }
  return [formatPoints(winnerGain), formatPoints(loserGain)];
}
