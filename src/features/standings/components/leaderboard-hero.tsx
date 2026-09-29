import type { Leaderboard } from "../standings.service";
import { relativeTime } from "@/lib/time";
import { cn } from "cn";

const PHASE_STYLE = {
  in_season: "bg-brand shadow-glow-brand",
  complete: "bg-gold",
  upcoming: "bg-surface-high",
} as const;

/** League name, freshness stamp and season progress. Sits above the list on phones, beside it on desktop. */
export function LeaderboardHero({
  board,
  now,
  className,
}: {
  board: Pick<Leaderboard, "seasonName" | "updatedAt" | "progress">;
  now: Date;
  className?: string;
}) {
  const { progress } = board;
  return (
    <header
      className={cn(
        "hero-backdrop relative overflow-hidden rounded-3xl border border-line bg-surface p-5 md:p-6",
        className,
      )}
    >
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas/60 py-1 pr-3 pl-2.5 text-xs font-medium text-text-muted">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            board.updatedAt ? "animate-live bg-heat" : "bg-text-muted",
          )}
        />
        {board.updatedAt
          ? `Updated ${relativeTime(new Date(board.updatedAt), now)}`
          : "Waiting for the first score update"}
      </p>

      <h1 className="mt-4 text-[2.5rem] leading-[0.92] font-extrabold md:text-6xl lg:text-[2.25rem]">
        Cincy&apos;s <span className="block whitespace-nowrap">All-Sports League</span>
      </h1>
      <p className="mt-2 text-sm text-text-muted">{board.seasonName} season, 20 teams, 11 sports</p>

      <div className="mt-5">
        <div
          className="flex gap-1"
          role="img"
          aria-label={`${progress.inSeason} of ${progress.total} sports in season`}
        >
          {progress.phases.map((phase, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", PHASE_STYLE[phase])} />
          ))}
        </div>
        <p className="mt-2 text-sm text-text-muted">
          <span className="font-display text-lg font-bold text-text">{progress.inSeason}</span> of{" "}
          {progress.total} sports in season
          {progress.complete > 0 ? `, ${progress.complete} final` : ""}
        </p>
      </div>
    </header>
  );
}
