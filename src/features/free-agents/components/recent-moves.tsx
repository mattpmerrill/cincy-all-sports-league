import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { FreeAgentMove } from "@/domain/free-agents";
import { SPORTS } from "@/domain/sports/sports";
import { relativeTime } from "@/lib/time";
import { EmptyState } from "@/ui/page";
import { SportIcon } from "@/ui/sport-icon";

/** The newest moves, public like the feed post each one also writes. */
export function RecentMoves({ moves, now }: { moves: FreeAgentMove[]; now: Date }) {
  if (moves.length === 0) {
    return (
      <EmptyState
        title="No moves yet."
        description="When a team drops a pick for a free agent, it shows up here."
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {moves.map((move, index) => (
        <li
          key={move.id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
        >
          <article className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-lift">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/teams/${move.team.slug}`}
                className="inline-flex min-h-11 min-w-0 items-center rounded-sm font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                {move.team.name}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                <SportIcon sport={move.sport} className="size-4" />
                <span className="sr-only">{SPORTS[move.sport].name}, </span>
                {relativeTime(new Date(move.createdAt), now)}
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
              <span className="min-w-0 break-words text-text-muted line-through">
                <span className="sr-only">Dropped </span>
                {move.dropped.name}
              </span>
              <span className="sr-only">, picked up</span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
              <span className="min-w-0 break-words">{move.added.name}</span>
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
