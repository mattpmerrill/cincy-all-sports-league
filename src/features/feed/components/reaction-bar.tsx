"use client";

import type { ReactionName, ReactionSummary } from "@/domain/feed";
import { cn } from "cn";

/**
 * The five reactions with counts. Members toggle them; everyone else sees the counts that exist.
 * The glyph is decoration: the accessible name says the reaction, the count and your own state.
 */
export function ReactionBar({
  summaries,
  interactive,
  onToggle,
}: {
  summaries: readonly ReactionSummary[];
  interactive: boolean;
  onToggle: (name: ReactionName, on: boolean) => void;
}) {
  const visible = interactive ? summaries : summaries.filter((s) => s.count > 0);
  if (visible.length === 0) return null;
  return (
    <ul aria-label="Reactions" className="flex flex-wrap items-center gap-1.5">
      {visible.map((s) => {
        const label = `${s.label}, ${s.count} ${s.count === 1 ? "reaction" : "reactions"}${
          s.reactedByMe ? ", including yours" : ""
        }`;
        const chip = cn(
          "inline-flex h-8 min-w-9 items-center justify-center gap-1 rounded-full border px-2 text-sm leading-none",
          s.reactedByMe
            ? "border-brand/70 bg-brand/15 text-text"
            : s.count > 0
              ? "border-line bg-surface-raised text-text"
              : "border-transparent text-text-muted",
        );
        const content = (
          <>
            <span aria-hidden="true">{s.glyph}</span>
            {s.count > 0 ? (
              <span aria-hidden="true" className="tabular text-xs font-semibold">
                {s.count}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={s.name}>
            {interactive ? (
              <button
                type="button"
                aria-pressed={s.reactedByMe}
                aria-label={label}
                onClick={() => onToggle(s.name, !s.reactedByMe)}
                className={cn(
                  chip,
                  "cursor-pointer transition-colors outline-none hover:bg-surface-high focus-visible:ring-3 focus-visible:ring-ring/60",
                )}
              >
                {content}
              </button>
            ) : (
              <span role="img" aria-label={label} className={chip}>
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
