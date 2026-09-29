import { formatPoints } from "@/domain/league";
import type { MoveSideEffects } from "@/domain/free-agents";
import type { ParticipantKind, SportCode } from "@/domain/sports/sports";
import { ParticipantImage } from "@/ui/participant-image";
import type { FreeAgentRow, MyPickView } from "../free-agents.service";
import { MoveDialog, type MoveAction } from "./move-dialog";

/** What a row needs to offer the Add button; absent for anyone who cannot make a move. */
export type MoveContext = {
  sport: SportCode;
  dropped: MyPickView;
  sideEffects: MoveSideEffects;
  action: MoveAction;
  onMoved?: () => void;
};

/** One free agent: who, what they have done so far, and (for a team owner) a way to add them. */
export function FreeAgentListItem({
  row,
  kind,
  move,
}: {
  row: FreeAgentRow;
  kind: ParticipantKind;
  move: MoveContext | null;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <ParticipantImage name={row.name} src={row.logoUrl} kind={kind} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 text-sm leading-tight font-semibold break-words">{row.name}</span>
        <span className="text-xs text-text-muted">{row.statLine ?? "No results yet"}</span>
      </div>
      <span className="tabular shrink-0 text-right">
        <span className="font-display text-xl leading-none font-bold">
          {formatPoints(row.points)}
        </span>
        <span className="block text-xs text-text-muted">pts</span>
      </span>
      {move ? (
        <MoveDialog
          sport={move.sport}
          dropped={move.dropped}
          added={row}
          sideEffects={move.sideEffects}
          action={move.action}
          onMoved={move.onMoved}
        />
      ) : null}
    </li>
  );
}
