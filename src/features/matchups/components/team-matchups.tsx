import Link from "next/link";
import { formatGain } from "@/domain/league";
import { SideTag, toneOfTag } from "@/ui/matchup-row";
import { cn } from "cn";
import type { TeamMatchupEntry, TeamMatchups } from "../matchups.service";

const STREAK_TONE = { win: "text-success", loss: "text-danger", tie: "text-text-muted" } as const;

/**
 * Record and streak as one line for the team page header, linking down to the week-by-week list.
 * Nothing before a first week has finished, or for a team that has not been paired.
 */
export function TeamMatchupSummary({ matchups }: { matchups: TeamMatchups }) {
  if (!matchups.record || matchups.entries.length === 0) return null;
  return (
    <Link
      href="#matchups"
      className="inline-flex min-h-8 w-fit flex-wrap items-center gap-x-2 rounded-full border border-line bg-canvas/60 px-3 py-1 text-xs font-medium text-text-muted outline-none hover:border-text-muted focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <span className="whitespace-nowrap">
        Matchups <span className="sr-only">record </span>
        <span className="tabular font-semibold text-text">{matchups.record.label}</span>
      </span>
      {matchups.streak ? (
        <span className="whitespace-nowrap">
          Streak{" "}
          <span className={cn("tabular font-semibold", STREAK_TONE[matchups.streak.result])}>
            {matchups.streak.label}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function Entry({ entry }: { entry: TeamMatchupEntry }) {
  const { status } = entry;
  const kind = status.state === "final" ? status.result : status.lead;
  const tone = toneOfTag(kind);
  const mine = entry.gain === null ? null : formatGain(entry.gain);
  const theirs = entry.opponentGain === null ? null : formatGain(entry.opponentGain);
  const unknown = (
    <>
      <span aria-hidden="true">?</span>
      <span className="sr-only">Score not available</span>
    </>
  );
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          {entry.rangeLabel}
          {status.state === "live" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-bright">
              <span aria-hidden="true" className="size-1.5 animate-live rounded-full bg-brand" />
              Live
            </span>
          ) : null}
        </span>
        <Link
          href={`/teams/${entry.opponent.slug}`}
          className="line-clamp-2 w-fit rounded-sm py-0.5 text-sm leading-tight font-semibold break-words outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <span className="font-medium text-text-muted">vs </span>
          {entry.opponent.name}
        </Link>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="tabular flex items-baseline gap-1 font-display text-xl leading-none font-extrabold">
          <span className={tone === "trail" ? "text-text-muted" : undefined}>
            {mine ?? unknown}
          </span>
          <span className="font-sans text-xs font-medium text-text-muted">to</span>
          <span className="text-text-muted">{theirs ?? unknown}</span>
        </span>
        {kind ? <SideTag kind={kind} /> : null}
      </div>
    </li>
  );
}

/**
 * Every week the team has played, newest first, each with the opponent, both weekly scores and
 * the result (or who is ahead while live). Left out when the team has no matchups.
 */
export function TeamMatchupsSection({ matchups }: { matchups: TeamMatchups }) {
  if (matchups.entries.length === 0) return null;
  return (
    <section
      id="matchups"
      aria-labelledby="team-matchups"
      className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="team-matchups" className="text-2xl font-bold">
        Matchups
      </h2>
      <ul className="flex flex-col divide-y divide-line/70">
        {matchups.entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}
