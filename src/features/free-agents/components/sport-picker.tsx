import { Lock } from "lucide-react";
import Link from "next/link";
import { formatPoints } from "@/domain/league";
import { SportIcon } from "@/ui/sport-icon";
import { StatusPill } from "@/ui/status-pill";
import type { HubSport } from "../free-agents.service";

/** One sport per tile: where its season stands and, for a team owner, the current pick. */
function SportPickerTile({ sport, index }: { sport: HubSport; index: number }) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${index * 35}ms` }}>
      <Link
        href={`/free-agents/${sport.sport}`}
        className="group flex h-full min-h-11 items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-lift transition-colors outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-raised text-brand-bright ring-1 ring-line transition-colors group-hover:bg-brand group-hover:text-on-brand">
          <SportIcon sport={sport.sport} className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-2xl leading-none font-bold uppercase">
            {sport.name}
          </span>
          {sport.locked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gold">
              <Lock aria-hidden="true" className="size-3.5" />
              Season over
              <span className="sr-only">, moves are closed</span>
            </span>
          ) : (
            <StatusPill status={sport.status} />
          )}
          {sport.myPick ? (
            <span className="truncate text-xs text-text-muted">
              Your pick: {sport.myPick.participant.name}, {formatPoints(sport.myPick.points)} pts
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/** The 11 sports as a grid of links to each sport's free agents. */
export function SportPicker({ sports }: { sports: HubSport[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sports.map((sport, index) => (
        <SportPickerTile key={sport.sport} sport={sport} index={index} />
      ))}
    </ul>
  );
}
