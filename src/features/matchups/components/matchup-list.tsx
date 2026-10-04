import Link from "next/link";
import { MatchupSideRow } from "@/ui/matchup-row";
import { cn } from "cn";
import type { MatchupView } from "../matchups.service";
import { SideDetail, sideDisplay } from "./side-display";

const sideProps = (side: MatchupView["home"]) => {
  const { score, tone, tag } = sideDisplay(side);
  return {
    name: side.name,
    href: `/teams/${side.slug}`,
    detail: <SideDetail side={side} />,
    isMine: side.isMine,
    score,
    tone,
    tag,
  };
};

/** The state of a matchup in words: "Live" with the pulsing dot, or "Final". */
export function MatchupState({ state }: { state: MatchupView["state"] }) {
  return state === "live" ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-bright">
      <span aria-hidden="true" className="size-1.5 animate-live rounded-full bg-brand" />
      Live
    </span>
  ) : (
    <span className="text-xs font-semibold text-text-muted">Final</span>
  );
}

export const gamesLinkClass =
  "inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Matchups at one compact size: two team lines (name, small line, tag, weekly points) and a
 * footer with the state and a link to the games list narrowed to the two teams. Signed out, every
 * matchup of the week is one of these; signed in, they are the rest after the viewer's own.
 * `gamesHref` is the schedule's address for the pair, passed in because features do not import
 * each other.
 */
export function MatchupList({
  matchups,
  gamesHref,
  label,
  className,
}: {
  matchups: MatchupView[];
  /** Leave out to show no link, where the page has no week to point at. */
  gamesHref?: (matchup: MatchupView) => string;
  label: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn("grid gap-2.5 md:grid-cols-2", className)}>
      {matchups.map((m) => (
        <li
          key={m.id}
          className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-3 pt-2.5 pb-1 shadow-lift"
        >
          <div className="flex flex-col gap-1.5">
            <MatchupSideRow {...sideProps(m.home)} />
            <MatchupSideRow {...sideProps(m.away)} />
          </div>
          <div
            className={cn(
              "flex items-center justify-between gap-2 border-t border-line/70",
              !gamesHref && "py-2",
            )}
          >
            <MatchupState state={m.state} />
            {gamesHref ? (
              <Link href={gamesHref(m)} className={gamesLinkClass}>
                See games
                <span className="sr-only">
                  {" "}
                  for {m.home.name} and {m.away.name}
                </span>
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
