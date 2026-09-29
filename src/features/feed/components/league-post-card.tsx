import { Radio } from "lucide-react";
import Link from "next/link";
import { groupScoreUpdateItems, type Message } from "@/domain/feed";
import { formatPoints } from "@/domain/league/format";
import { SPORTS } from "@/domain/sports/sports";
import { SportIcon } from "@/ui/sport-icon";

const MAX_ROWS = 5;

const teamLink =
  "font-medium text-text underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/** The League badge that marks an automatic post. */
export function LeagueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[0.7rem] leading-none font-bold text-on-brand">
      <Radio aria-hidden="true" className="size-3" />
      League
    </span>
  );
}

/**
 * The content of an automatic post, drawn from its structured payload. A post whose payload is
 * missing or of an unknown type falls back to the plain body text.
 */
export function LeaguePostContent({ message }: { message: Message }) {
  const payload = message.payload;

  if (payload?.type === "score_update") {
    const groups = groupScoreUpdateItems(payload.items);
    const shown = groups.slice(0, MAX_ROWS);
    return (
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg leading-none font-bold tracking-tight uppercase">
          Scores update
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {shown.map((g) => (
            <li
              key={`${g.sport}:${g.participantName}`}
              className="flex items-start justify-between gap-3 py-1.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <SportIcon sport={g.sport} className="size-4 shrink-0 text-text-muted" />
                  <span className="truncate">{g.participantName}</span>
                  <span className="sr-only">({SPORTS[g.sport].name})</span>
                </span>
                <span className="text-xs text-text-muted">
                  {g.teams.map((t, i) => (
                    <span key={t.teamSlug}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/teams/${t.teamSlug}`} className={teamLink}>
                        {t.teamName}
                      </Link>
                    </span>
                  ))}
                </span>
              </div>
              <span className="tabular shrink-0 font-display text-xl leading-none font-extrabold">
                {g.pointsDelta > 0 ? "+" : "-"}
                {formatPoints(Math.abs(g.pointsDelta))}
              </span>
            </li>
          ))}
        </ul>
        {groups.length > shown.length ? (
          <p className="text-xs text-text-muted">and {groups.length - shown.length} more</p>
        ) : null}
      </div>
    );
  }

  if (payload?.type === "movers") {
    const shown = payload.items.slice(0, MAX_ROWS);
    return (
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg leading-none font-bold tracking-tight uppercase">
          Movers
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {shown.map((m) => (
            <li key={m.teamSlug} className="flex items-center justify-between gap-3 py-1.5">
              <Link href={`/teams/${m.teamSlug}`} className={`${teamLink} truncate text-sm`}>
                {m.teamName}
              </Link>
              <span className="tabular flex shrink-0 items-center gap-2 text-sm">
                <span
                  className={
                    m.direction === "up"
                      ? "font-display text-base font-bold text-text"
                      : "font-display text-base font-bold text-text-muted"
                  }
                >
                  <span aria-hidden="true">
                    {m.direction === "up" ? "▲" : "▼"}
                    {m.places}
                  </span>
                  <span className="sr-only">
                    {m.direction === "up" ? "Up" : "Down"} {m.places}
                  </span>
                </span>
                <span className="text-text-muted">to {m.rankLabel}</span>
              </span>
            </li>
          ))}
        </ul>
        {payload.items.length > shown.length ? (
          <p className="text-xs text-text-muted">and {payload.items.length - shown.length} more</p>
        ) : null}
      </div>
    );
  }

  return <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>;
}
