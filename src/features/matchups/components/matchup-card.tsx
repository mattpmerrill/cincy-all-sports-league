import Link from "next/link";
import { cn } from "cn";
import type { MatchupOutcome, MatchupSideView, MatchupView } from "../matchups.service";
import { gamesLinkClass, MatchupState } from "./matchup-list";
import { SideDetail, sideDisplay } from "./side-display";

const LIVE_LINE = {
  ahead: { text: "Winning", className: "text-success" },
  behind: { text: "Trailing", className: "text-danger" },
  tied: { text: "Tied", className: "text-text-muted" },
} as const;

const FINAL_LINE = {
  win: { text: "Final: won", className: "text-success" },
  loss: { text: "Final: lost", className: "text-danger" },
  tie: { text: "Final: tied", className: "text-text-muted" },
} as const;

/** The viewer's status line. A live matchup whose totals are unknown stays neutral. */
function statusLine(outcome: MatchupOutcome | null): { text: string; className: string } {
  if (!outcome) return { text: "Matchup", className: "text-text-muted" };
  if (outcome.state === "final") return FINAL_LINE[outcome.result];
  return outcome.lead
    ? LIVE_LINE[outcome.lead]
    : { text: "Waiting for scores", className: "text-text-muted" };
}

/** One side of the scoreboard: the weekly points first so both scores sit on one line. */
function Side({ side, align }: { side: MatchupSideView; align: "start" | "end" }) {
  const { score, tone } = sideDisplay(side);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "end" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span
        className={cn(
          "tabular font-display text-4xl leading-none font-extrabold min-[380px]:text-5xl md:text-6xl",
          tone === "trail" && "text-text-muted",
        )}
      >
        {score ?? (
          <>
            <span aria-hidden="true">?</span>
            <span className="sr-only">Score not available</span>
          </>
        )}
      </span>
      <span className="text-[0.7rem] font-medium text-text-muted">pts</span>
      <span
        className={cn("mt-1 flex flex-wrap items-center gap-1.5", align === "end" && "justify-end")}
      >
        <Link
          href={`/teams/${side.slug}`}
          className={cn(
            "rounded-sm text-base leading-tight font-semibold break-words outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60 md:text-lg",
            align === "end" && "ml-auto",
          )}
        >
          {side.name}
        </Link>
        {side.isMine ? (
          <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
            You
          </span>
        ) : null}
      </span>
      <span className="tabular text-xs break-words text-text-muted">
        <SideDetail side={side} />
      </span>
    </div>
  );
}

/**
 * The viewer's own matchup as a scoreboard: both teams, the two weekly scores large, and a status
 * line from the viewer's side ("Winning", "Final: won"). The same highlight as the viewer's row
 * on the leaderboard marks it as theirs.
 */
export function MatchupCard({ matchup, gamesHref }: { matchup: MatchupView; gamesHref: string }) {
  const status = statusLine(matchup.viewerOutcome);
  return (
    <section
      aria-labelledby="my-matchup"
      className="flex flex-col gap-4 rounded-3xl border border-brand/70 bg-linear-to-br from-brand/10 to-surface p-4 shadow-glow-brand md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="my-matchup" className="text-lg font-bold">
          Your matchup
        </h3>
        <MatchupState state={matchup.state} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2.5">
        <Side side={matchup.home} align="start" />
        <span
          aria-hidden="true"
          className="pt-3 text-xs font-bold tracking-widest text-text-muted uppercase"
        >
          vs
        </span>
        <Side side={matchup.away} align="end" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-line/70 pt-1">
        <p
          className={cn("font-display text-xl leading-none font-bold uppercase", status.className)}
        >
          {status.text}
        </p>
        <Link href={gamesHref} className={gamesLinkClass}>
          See games
          <span className="sr-only">
            {" "}
            for {matchup.home.name} and {matchup.away.name}
          </span>
        </Link>
      </div>
    </section>
  );
}
