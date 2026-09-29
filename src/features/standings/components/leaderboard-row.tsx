import Link from "next/link";
import { formatPoints } from "@/domain/league";
import { MovementIndicator } from "@/ui/movement-indicator";
import { RankBadge } from "@/ui/rank-badge";
import { UserAvatar } from "@/ui/user-avatar";
import { cn } from "cn";
import type { LeaderboardRow as Row } from "../standings.service";
import { SportContributionBars } from "./sport-contribution-bars";

const TOP_BORDER: Record<number, string> = {
  1: "border-gold/45",
  2: "border-silver/35",
  3: "border-bronze/40",
};

/** One team on the leaderboard: a single tap target that opens the team page. */
export function LeaderboardRow({
  row,
  maxSportPoints,
  isMine,
  index,
}: {
  row: Row;
  maxSportPoints: number;
  isMine: boolean;
  /** Position in the list, only used to stagger the entrance. */
  index: number;
}) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <Link
        href={`/teams/${row.slug}`}
        className={cn(
          "group flex items-center gap-3 rounded-2xl border bg-surface px-3 py-3 shadow-lift transition-colors outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/60 md:gap-4 md:px-4",
          TOP_BORDER[row.rank] ?? "border-line",
          isMine && "border-brand/70 bg-linear-to-r from-brand/10 to-surface shadow-glow-brand",
        )}
      >
        <div className="flex w-11 shrink-0 flex-col items-center gap-1.5">
          <RankBadge rank={row.rank} label={row.rankLabel} isTied={row.isTied} />
          <MovementIndicator movement={row.movement} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="line-clamp-3 text-base leading-tight font-semibold break-words">
              {row.name}
            </span>
            {isMine ? (
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
                You
              </span>
            ) : null}
          </div>
          {row.owner ? (
            <span className="truncate text-xs text-text-muted">{row.owner.displayName}</span>
          ) : null}
          <SportContributionBars sportPoints={row.sportPoints} max={maxSportPoints} />
        </div>

        {/* Fixed width even when unclaimed, so scores line up down the list. The name sits in the
            text beside it, so the photo is decorative and announces nothing. */}
        <div className="flex size-10 shrink-0 items-center justify-center md:size-12">
          {row.owner ? (
            <UserAvatar
              displayName={row.owner.displayName}
              avatarUrl={row.owner.avatarUrl}
              className={cn(
                "size-10 ring-2 ring-line md:size-12",
                "*:data-[slot=avatar-fallback]:text-sm *:data-[slot=avatar-fallback]:font-semibold md:*:data-[slot=avatar-fallback]:text-base",
                isMine && "ring-brand",
              )}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end leading-none">
          <span className="tabular font-display text-3xl font-extrabold min-[380px]:text-4xl md:text-5xl">
            {formatPoints(row.total)}
          </span>
          <span className="mt-1 text-[0.7rem] font-medium text-text-muted">pts</span>
        </div>
      </Link>
    </li>
  );
}
