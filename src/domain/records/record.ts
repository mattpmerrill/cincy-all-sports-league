import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";

/**
 * A team's regular-season record, as the vendor reports it. A display fact: nothing in scoring
 * reads it (wins score through `participant_results`, ADR-001).
 */
export type ParticipantRecord = {
  wins: number;
  losses: number;
  /** NFL ties and MLS draws; 0 in every other sport. */
  ties: number;
  /** NHL overtime and shootout losses; 0 in every other sport. */
  otLosses: number;
};

/**
 * What a person reads under a participant's name: "10-4", "10-4-1", "30-20-5" or "No. 4 WTA".
 * `label` is the words for assistive technology ("Regular-season record"), so a bare "10-4" is
 * never ambiguous to a screen reader.
 */
export type RecordLine = {
  kind: "record" | "ranking";
  text: string;
  label: string;
};

export const RECORD_LABEL = "Regular-season record";
export const RANKING_LABEL = "Ranking";

/**
 * Formats a record in the sport's own style (`recordStyle` in the sport catalog). Null for a
 * sport whose participants are ranked rather than recorded (tennis, golf).
 */
export function formatRecord(sport: SportCode, record: ParticipantRecord): string | null {
  const { wins, losses, ties, otLosses } = record;
  switch (SPORTS[sport].recordStyle) {
    case "W-L":
      return `${wins}-${losses}`;
    case "W-L-T":
      return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    case "W-L-OTL":
      return `${wins}-${losses}-${otLosses}`;
    case "W-L-D":
      return `${wins}-${losses}-${ties}`;
    case "ranking":
      return null;
  }
}

/** "No. 4 WTA", "No. 12 FedExCup". Null for a sport that keeps records instead. */
export function formatRanking(sport: SportCode, rank: number): string | null {
  const { recordStyle, rankingLabel } = SPORTS[sport];
  return recordStyle === "ranking" && rankingLabel !== null ? `No. ${rank} ${rankingLabel}` : null;
}

const hasPlayed = ({ wins, losses, ties, otLosses }: ParticipantRecord) =>
  wins + losses + ties + otLosses > 0;

/**
 * The one line to show for a participant, or null when there is nothing honest to say.
 *
 * - Teams show their record. An all-zero record means the season has not started (the vendor
 *   publishes the standings table before the first game), and "0-0" under every team is noise.
 * - Athletes show their ranking, which the caller reads from the `final_rank_band` result sync
 *   already stores. A rank outside every scoring band has no result, so no rank, so no line.
 */
export function recordLine(
  sport: SportCode,
  facts: { record: ParticipantRecord | null; rank: number | null },
): RecordLine | null {
  if (SPORTS[sport].recordStyle === "ranking") {
    const text = facts.rank === null ? null : formatRanking(sport, facts.rank);
    return text === null ? null : { kind: "ranking", text, label: RANKING_LABEL };
  }
  if (!facts.record || !hasPlayed(facts.record)) return null;
  const text = formatRecord(sport, facts.record);
  return text === null ? null : { kind: "record", text, label: RECORD_LABEL };
}
