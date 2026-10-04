import { formatGain } from "@/domain/league";
import { toneOfTag, type ScoreTone, type SideTagKind } from "@/ui/matchup-row";
import type { MatchupSideView } from "../matchups.service";

/** How one side's score and tag read. Mapping only: who leads or won is already decided. */
export function sideDisplay(side: MatchupSideView): {
  score: string | null;
  tone: ScoreTone;
  tag: SideTagKind | null;
} {
  const kind = side.result ?? side.lead;
  return {
    score: side.gain === null ? null : formatGain(side.gain),
    tone: toneOfTag(kind),
    tag: kind,
  };
}

/** The small line under a team name: its owner and its matchup record, when it has them. */
export function SideDetail({ side }: { side: Pick<MatchupSideView, "ownerName" | "record"> }) {
  const { ownerName, record } = side;
  if (!ownerName && !record) return null;
  return (
    <>
      {ownerName}
      {ownerName && record ? " · " : null}
      {record ? (
        <>
          <span className="sr-only">Matchup record: </span>
          {record.label}
        </>
      ) : null}
    </>
  );
}
