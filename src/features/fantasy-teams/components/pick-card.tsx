import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { formatPoints } from "@/domain/league";
import { ParticipantImage } from "@/ui/participant-image";
import { SportIcon } from "@/ui/sport-icon";
import { StatusPill } from "@/ui/status-pill";
import { cn } from "cn";
import type { PickView } from "../fantasy-teams.service";

/** One pick: who it is, where its season stands, what it has earned, and the math behind it. */
export function PickCard({ pick, index }: { pick: PickView; index: number }) {
  // The team's own color tints the card corner; text always uses the design tokens.
  const style = pick.primaryColor
    ? ({ "--pick-color": pick.primaryColor, animationDelay: `${index * 45}ms` } as CSSProperties)
    : ({ animationDelay: `${index * 45}ms` } as CSSProperties);

  return (
    <article
      style={style}
      className="pick-glow flex animate-rise flex-col gap-3 rounded-2xl border border-line p-4 shadow-lift"
    >
      <div className="flex items-start gap-3">
        <ParticipantImage
          name={pick.participantName}
          src={pick.logoUrl}
          kind={pick.participantKind}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-sans text-base leading-tight font-semibold tracking-normal normal-case">
            {pick.participantName}
          </h3>
          <p className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <SportIcon sport={pick.sport} className="size-3.5" />
            {pick.sportName}
          </p>
          <StatusPill status={pick.status} />
        </div>
        <p
          className={cn(
            "tabular font-display text-4xl leading-none font-extrabold",
            pick.points === 0 && "text-text-muted",
          )}
        >
          {formatPoints(pick.points)}
        </p>
      </div>

      <details className="group border-t border-line/70 pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 text-sm font-medium text-text-muted outline-none marker:hidden hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
          How it scores
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        {pick.lines.length === 0 ? (
          <p className="pt-2 pb-1 text-sm text-text-muted">No points yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 pt-2 pb-1 text-sm">
            {pick.lines.map((line, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className={line.isAdjustment ? "text-brand-bright" : "text-text"}>
                  {line.text}
                </span>
                <span className="tabular font-display text-lg font-bold">
                  {line.points < 0 ? "−" : ""}
                  {formatPoints(Math.abs(line.points))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
