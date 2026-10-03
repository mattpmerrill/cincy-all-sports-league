import Link from "next/link";
import { formatPoints } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import { SPORTS } from "@/domain/sports/sports";
import { ParticipantImage } from "@/ui/participant-image";
import { RankBadge } from "@/ui/rank-badge";
import { RecordText } from "@/ui/record-line";
import { cn } from "cn";
import type { SportPickView } from "../sports.service";

/** A team's pick in one sport, ranked. The whole row opens that team's page. */
export function SportPickRow({
  pick,
  sport,
  isMine,
  index,
}: {
  pick: SportPickView;
  sport: SportCode;
  isMine: boolean;
  index: number;
}) {
  const detail = pick.lines.map((l) => l.text).join(", ");
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <Link
        href={`/teams/${pick.teamSlug}`}
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-lift transition-colors outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/60",
          isMine && "border-brand/70 bg-linear-to-r from-brand/10 to-surface",
        )}
      >
        <RankBadge rank={pick.rank} label={pick.rankLabel} isTied={pick.isTied} />
        <ParticipantImage
          name={pick.participant.name}
          src={pick.participant.logoUrl}
          kind={SPORTS[sport].participantKind}
          size="sm"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The points belong to the team. After a trade the team leads the row and the current
              player follows, so a number like 30 is never printed beside a player who earned 5. */}
          <span className="truncate text-sm leading-tight font-semibold">
            {pick.traded ? pick.teamName : pick.participant.name}
            {pick.traded && isMine ? " (you)" : ""}
          </span>
          <span className="truncate text-xs text-text-muted">
            {pick.traded ? `Now with ${pick.participant.name}` : pick.teamName}
            {!pick.traded && isMine ? " (you)" : ""}
          </span>
          {pick.record ? (
            <span className="truncate text-xs text-text-muted">
              <RecordText record={pick.record} />
            </span>
          ) : null}
          {detail ? <span className="truncate text-xs text-text-muted">{detail}</span> : null}
        </div>
        <span
          className={cn(
            "tabular font-display text-3xl leading-none font-extrabold",
            pick.points === 0 && "text-text-muted",
          )}
        >
          {formatPoints(pick.points)}
        </span>
      </Link>
    </li>
  );
}
