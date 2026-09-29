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

/**
 * One team on the leaderboard. The whole card opens the team page through a stretched link on the
 * name, which leaves room for a second, separate link (claiming an unowned team) inside the card.
 */
export function LeaderboardRow({
  row,
  maxSportPoints,
  isMine,
  index,
  claimHref,
}: {
  row: Row;
  maxSportPoints: number;
  isMine: boolean;
  /** Position in the list, only used to stagger the entrance. */
  index: number;
  /** Where to claim this team, or null when the viewer can't (it's owned, or they have one). */
  claimHref: string | null;
}) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <div
        className={cn(
          "relative flex items-center gap-3 rounded-2xl border bg-surface px-3 py-3 shadow-lift transition-colors hover:bg-surface-raised has-[[data-row-link]:focus-visible]:ring-3 has-[[data-row-link]:focus-visible]:ring-ring/60 md:gap-4 md:px-4",
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
            <Link
              href={`/teams/${row.slug}`}
              data-row-link
              className="outline-none after:absolute after:inset-0 after:rounded-2xl"
            >
              <span className="line-clamp-3 text-base leading-tight font-semibold break-words">
                {row.name}
              </span>
            </Link>
            {isMine ? (
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
                You
              </span>
            ) : null}
          </div>
          {row.owner ? (
            <span className="truncate text-xs text-text-muted">{row.owner.displayName}</span>
          ) : claimHref ? (
            // Sits above the stretched link so it gets its own tap, 24px tall for WCAG 2.2 AA.
            <Link
              href={claimHref}
              className="relative z-10 inline-flex min-h-6 items-center gap-1 self-start rounded-full border border-brand/50 bg-brand/10 px-2 text-xs font-semibold text-brand-bright outline-none hover:bg-brand/20 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              Unclaimed · Claim it<span className="sr-only">: {row.name}</span>
            </Link>
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
      </div>
    </li>
  );
}
