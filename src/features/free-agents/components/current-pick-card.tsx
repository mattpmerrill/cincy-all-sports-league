import { formatPoints } from "@/domain/league";
import type { SeasonStatus } from "@/domain/league";
import type { ParticipantKind } from "@/domain/sports/sports";
import { ParticipantImage } from "@/ui/participant-image";
import { StatusPill } from "@/ui/status-pill";
import type { MyPickView } from "../free-agents.service";

/** The viewer's pick in this sport: who it is and what it has earned for their team. */
export function CurrentPickCard({
  pick,
  sportName,
  kind,
  status,
}: {
  pick: MyPickView;
  sportName: string;
  kind: ParticipantKind;
  status: SeasonStatus;
}) {
  return (
    <section
      aria-label={`Your ${sportName} pick`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift"
    >
      <ParticipantImage
        name={pick.participant.name}
        src={pick.participant.logoUrl}
        kind={kind}
        size="md"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-medium text-text-muted">Your {sportName} pick</p>
        <p className="min-w-0 text-base leading-tight font-semibold break-words">
          {pick.participant.name}
        </p>
        <StatusPill status={status} />
      </div>
      <p className="flex shrink-0 flex-col items-end">
        <span className="tabular font-display text-4xl leading-none font-extrabold">
          {formatPoints(pick.points)}
        </span>
        <span className="text-xs text-text-muted">pts for your team</span>
      </p>
    </section>
  );
}
