import { recordLine } from "@/domain/records";
import type { ParticipantRecord, RecordLine } from "@/domain/records";
import type { ParticipantScore } from "@/domain/scoring";
import type { SportCode } from "@/domain/sports/sports";
import type { LeagueData } from "./types";

/**
 * The one place a participant's record or ranking line is decided, for picks and free agents
 * alike (the same reason `createParticipantScorer` exists).
 *
 * A team's line comes from `data.records`. An athlete's rank is not stored twice: it is the
 * quantity of the `final_rank_band` line the scorer already produced (sync stores the actual rank
 * there), so the line can never disagree with the points beside it.
 */
export function createRecordLines(
  data: Pick<LeagueData, "records">,
  scoreOf: (sport: SportCode, participantId: string) => Pick<ParticipantScore, "lines">,
): (sport: SportCode, participantId: string) => RecordLine | null {
  const recordByParticipant = new Map<string, ParticipantRecord>(
    data.records.map(({ participantId, ...record }) => [participantId, record]),
  );
  return (sport, participantId) =>
    recordLine(sport, {
      record: recordByParticipant.get(participantId) ?? null,
      rank:
        scoreOf(sport, participantId).lines.find((line) => line.kind === "final_rank_band")
          ?.quantity ?? null,
    });
}
