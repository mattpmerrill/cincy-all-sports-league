import Link from "next/link";
import { formatGain } from "@/domain/league";
import { RankBadge } from "@/ui/rank-badge";
import { cn } from "cn";
import type { MatchupStandingsRowView } from "../matchups.service";

const TOP_BORDER: Record<number, string> = {
  1: "border-gold/45",
  2: "border-silver/35",
  3: "border-bronze/40",
};

const STREAK_TONE = { win: "text-success", loss: "text-danger", tie: "text-text-muted" } as const;

/**
 * One team in the matchup table. Same card as a season row: the whole card opens the team page
 * through a stretched link on the name, with the opponent's link lifted above it.
 */
export function MatchupStandingsRow({
  row,
  index,
}: {
  row: MatchupStandingsRowView;
  /** Position in the list, only used to stagger the entrance. */
  index: number;
}) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <div
        className={cn(
          "relative flex items-start gap-3 rounded-2xl border bg-surface px-3 py-3 shadow-lift transition-colors hover:bg-surface-raised has-[[data-row-link]:focus-visible]:ring-3 has-[[data-row-link]:focus-visible]:ring-ring/60 md:gap-4 md:px-4",
          TOP_BORDER[row.rank] ?? "border-line",
          row.isMine && "border-brand/70 bg-linear-to-r from-brand/10 to-surface shadow-glow-brand",
        )}
      >
        <RankBadge rank={row.rank} label={row.rankLabel} isTied={row.isTied} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
            {row.isMine ? (
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
                You
              </span>
            ) : null}
          </div>
          {row.ownerName ? (
            <span className="truncate text-xs text-text-muted">{row.ownerName}</span>
          ) : null}
          <p className="tabular text-xs text-text-muted">
            <span className="font-semibold text-text">{formatGain(row.pointsGained)}</span> pts
            gained
          </p>
          {row.opponent ? (
            <p className="text-xs text-text-muted">
              This week vs{" "}
              <Link
                href={`/teams/${row.opponent.slug}`}
                className="relative z-10 inline-flex min-h-6 items-center rounded-sm font-semibold text-text underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                {row.opponent.name}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 leading-none">
          <span className="tabular font-display text-2xl font-extrabold min-[380px]:text-3xl md:text-4xl">
            <span className="sr-only">Record: </span>
            {row.record.label}
          </span>
          <span className="text-[0.7rem] font-medium text-text-muted">W-L-T</span>
          {row.streak ? (
            <span className="tabular mt-1 text-xs font-semibold">
              <span className="font-medium text-text-muted">Streak </span>
              <span className={STREAK_TONE[row.streak.result]}>{row.streak.label}</span>
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
