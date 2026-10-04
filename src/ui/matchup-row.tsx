import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "cn";

/**
 * What to say next to a team's score. Finals read W, L or T; a live matchup reads Ahead, Behind or
 * Tied. Colour backs the words up, it never carries the meaning alone.
 */
export type SideTagKind = "win" | "loss" | "tie" | "ahead" | "behind" | "tied";

const TAG: Record<SideTagKind, { text: string; spoken: string; className: string }> = {
  win: { text: "W", spoken: "Won", className: "bg-success/15 text-success" },
  loss: { text: "L", spoken: "Lost", className: "bg-danger/10 text-danger" },
  tie: { text: "T", spoken: "Tied", className: "bg-surface-high text-text-muted" },
  ahead: { text: "Ahead", spoken: "Ahead", className: "bg-success/15 text-success" },
  behind: { text: "Behind", spoken: "Behind", className: "bg-surface-high text-text-muted" },
  tied: { text: "Tied", spoken: "Tied", className: "bg-surface-high text-text-muted" },
};

export function SideTag({ kind, className }: { kind: SideTagKind; className?: string }) {
  const tag = TAG[kind];
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[0.7rem] leading-none font-bold whitespace-nowrap",
        tag.className,
        className,
      )}
    >
      <span aria-hidden="true">{tag.text}</span>
      <span className="sr-only">{tag.spoken}</span>
    </span>
  );
}

/** What to print where a live total is unknown. The words carry it; there is no number to fake. */
export function UnknownScore() {
  return (
    <>
      <span aria-hidden="true" className="text-base font-semibold text-text-muted">
        n/a
      </span>
      <span className="sr-only">Score not available</span>
    </>
  );
}

/** A score is bold when it is winning or won, quiet when it is not. */
export type ScoreTone = "lead" | "trail" | "even";

export function toneOfTag(kind: SideTagKind | null): ScoreTone {
  if (kind === "win" || kind === "ahead") return "lead";
  if (kind === "loss" || kind === "behind") return "trail";
  return "even";
}

/**
 * One team's line in a matchup: name (a link), a small line under it, a tag, and the score as a
 * tabular number so a column of scores lines up. Two of these stacked make a matchup. `score` is
 * already formatted; null means the live total is unknown.
 */
export function MatchupSideRow({
  name,
  href,
  detail,
  isMine = false,
  score,
  tone,
  tag,
}: {
  name: string;
  href: string;
  detail?: ReactNode;
  isMine?: boolean;
  score: string | null;
  tone: ScoreTone;
  tag: SideTagKind | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <Link
            href={href}
            className="line-clamp-2 min-w-0 rounded-sm py-0.5 text-sm leading-tight font-semibold break-words outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            {name}
          </Link>
          {isMine ? (
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-on-brand">
              You
            </span>
          ) : null}
        </span>
        {detail ? <span className="tabular truncate text-xs text-text-muted">{detail}</span> : null}
      </div>
      {tag ? <SideTag kind={tag} /> : null}
      <span
        className={cn(
          "tabular min-w-[3.25rem] shrink-0 text-right font-display text-2xl leading-none font-extrabold",
          tone === "trail" && "text-text-muted",
        )}
      >
        {score ?? <UnknownScore />}
      </span>
    </div>
  );
}
