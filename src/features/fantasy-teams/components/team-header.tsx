import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { formatPoints } from "@/domain/league";
import { MovementIndicator } from "@/ui/movement-indicator";
import { RankBadge } from "@/ui/rank-badge";
import { UserAvatar } from "@/ui/user-avatar";
import type { TeamDetail } from "../fantasy-teams.service";

export function TeamHeader({ team, isMine }: { team: TeamDetail; isMine: boolean }) {
  return (
    <header className="hero-backdrop relative overflow-hidden rounded-3xl border border-line bg-surface p-5 md:p-7">
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-text-muted outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Standings
      </Link>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <RankBadge rank={team.rank} label={team.rankLabel} isTied={team.isTied} size="lg" />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-muted">
                {team.isTied ? "Tied for " : ""}place {team.rank} of {team.teamCount}
              </span>
              <MovementIndicator movement={team.movement} className="text-[1rem]" />
            </div>
          </div>
          <h1 className="text-4xl leading-[0.95] font-extrabold break-words md:text-6xl">
            {team.name}
          </h1>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            {team.owner ? (
              <>
                <UserAvatar
                  displayName={team.owner.displayName}
                  avatarUrl={team.owner.avatarUrl}
                  size="sm"
                />
                <span>{team.owner.displayName}</span>
              </>
            ) : (
              <span>Not claimed yet</span>
            )}
            {isMine ? (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand">
                Your team
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end leading-none">
          <span className="tabular font-display text-6xl font-extrabold md:text-8xl">
            {formatPoints(team.total)}
          </span>
          <span className="mt-1 text-xs font-medium text-text-muted">points</span>
        </div>
      </div>
    </header>
  );
}
