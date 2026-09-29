import Link from "next/link";
import { formatPoints } from "@/domain/league";
import { SportIcon } from "@/ui/sport-icon";
import { StatusPill } from "@/ui/status-pill";
import type { SportSummary } from "../sports.service";

/** A sport on the index: icon, name, season state and who is ahead. */
export function SportTile({ sport, index }: { sport: SportSummary; index: number }) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${index * 35}ms` }}>
      <Link
        href={`/sports/${sport.code}`}
        className="group flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-lift transition-colors outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-raised text-brand-bright ring-1 ring-line transition-colors group-hover:bg-brand group-hover:text-on-brand">
          <SportIcon sport={sport.code} className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-2xl leading-none font-bold uppercase">
            {sport.name}
          </span>
          <StatusPill status={sport.status} />
          <span className="truncate text-xs text-text-muted">
            {sport.leader
              ? `Ahead: ${sport.leader.participantName}, ${formatPoints(sport.leader.points)} pts`
              : "No points yet"}
          </span>
        </span>
      </Link>
    </li>
  );
}
