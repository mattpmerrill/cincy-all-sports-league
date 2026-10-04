import { ArrowLeftRight, ArrowRight, Radio } from "lucide-react";
import Link from "next/link";
import {
  groupScoreUpdateItems,
  type MatchupsWeekOutcome,
  type Message,
  type TradeTeamLink,
} from "@/domain/feed";
import { formatGain, formatMonthDay, formatPoints } from "@/domain/league/format";
import { SPORTS, type SportCode } from "@/domain/sports/sports";
import { MatchupSideRow, toneOfTag, type SideTagKind } from "@/ui/matchup-row";
import { SportIcon } from "@/ui/sport-icon";

const MAX_ROWS = 5;

const teamLink =
  "font-medium text-text underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

const cardTitle = "font-display text-lg leading-none font-bold tracking-tight uppercase";

function TeamLink({ team }: { team: TradeTeamLink }) {
  return (
    <Link href={`/teams/${team.slug}`} className={teamLink}>
      {team.name}
    </Link>
  );
}

function SportLabel({ sport }: { sport: SportCode }) {
  return (
    <>
      <SportIcon sport={sport} className="size-4 shrink-0 text-text-muted" />
      <span className="sr-only">{SPORTS[sport].name}:</span>
    </>
  );
}

/** One sport of a trade: what one side gives for what the other gives. */
function TradeLegRow({ sport, left, right }: { sport: SportCode; left: string; right: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm font-semibold">
      <SportLabel sport={sport} />
      <span className="min-w-0 break-words">{left}</span>
      <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
      <span className="sr-only">for</span>
      <span className="min-w-0 break-words">{right}</span>
    </li>
  );
}

/** Which tag each side wears for a result, read from the home side's point of view. */
const OUTCOME_TAGS: Record<MatchupsWeekOutcome, { home: SideTagKind; away: SideTagKind }> = {
  home: { home: "win", away: "loss" },
  away: { home: "loss", away: "win" },
  tie: { home: "tie", away: "tie" },
};

function ViewTradeLink({ listingId }: { listingId: string }) {
  return (
    <Link href={`/trades/${listingId}`} className={`${teamLink} w-fit text-sm underline`}>
      View trade
    </Link>
  );
}

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

  if (payload?.type === "trade_listed") {
    return (
      <div className="flex flex-col gap-2">
        <p className={cardTitle}>Trading block</p>
        <p className="text-sm">
          <TeamLink team={payload.team} /> put these players up for trade.
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {payload.items.map((item) => (
            <li key={item.sport} className="flex items-center gap-2 py-1.5 text-sm font-semibold">
              <SportLabel sport={item.sport} />
              <span className="min-w-0 break-words">{item.participantName}</span>
            </li>
          ))}
        </ul>
        <ViewTradeLink listingId={payload.listingId} />
      </div>
    );
  }

  if (payload?.type === "trade_offer") {
    return (
      <div className="flex flex-col gap-2">
        <p className={cardTitle}>Trade offer</p>
        <p className="text-sm">
          <TeamLink team={payload.from} />{" "}
          {payload.offerKind === "direct" ? "offered a trade to" : "made a competing offer to"}{" "}
          <TeamLink team={payload.to} />.
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {payload.legs.map((leg) => (
            <TradeLegRow key={leg.sport} sport={leg.sport} left={leg.gives} right={leg.gets} />
          ))}
        </ul>
        {payload.note ? (
          <p className="text-sm break-words text-text-muted italic">&ldquo;{payload.note}&rdquo;</p>
        ) : null}
        <ViewTradeLink listingId={payload.listingId} />
      </div>
    );
  }

  if (payload?.type === "trade_completed") {
    return (
      <div className="flex flex-col gap-2">
        <p className={cardTitle}>Trade done</p>
        <p className="text-sm">
          <TeamLink team={payload.owner} /> and <TeamLink team={payload.offerer} /> swapped players.
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {payload.legs.map((leg) => (
            <TradeLegRow
              key={leg.sport}
              sport={leg.sport}
              left={leg.ownerGave}
              right={leg.offererGave}
            />
          ))}
        </ul>
        <ViewTradeLink listingId={payload.listingId} />
      </div>
    );
  }

  if (payload?.type === "free_agent_move") {
    return (
      <div className="flex flex-col gap-2">
        <p className={cardTitle}>Free agent move</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <SportLabel sport={payload.sport} />
          <TeamLink team={payload.team} />
          <span>dropped</span>
          <span className="min-w-0 font-semibold break-words text-text-muted line-through">
            {payload.dropped}
          </span>
          <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
          <span className="sr-only">picked up</span>
          <span className="min-w-0 font-semibold break-words">{payload.added}</span>
        </p>
        <Link href="/free-agents" className={`${teamLink} w-fit text-sm underline`}>
          See moves
        </Link>
      </div>
    );
  }

  if (payload?.type === "matchups_week") {
    return (
      <div className="flex flex-col gap-3">
        <p className={cardTitle}>Weekly matchups</p>
        {payload.results.length > 0 ? (
          <section className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted">Last week&apos;s results</p>
            <ul className="flex flex-col divide-y divide-line/70">
              {payload.results.map((r) => {
                const tags = OUTCOME_TAGS[r.outcome];
                return (
                  <li key={`${r.home.slug}:${r.away.slug}`} className="flex flex-col gap-1 py-2">
                    <MatchupSideRow
                      name={r.home.name}
                      href={`/teams/${r.home.slug}`}
                      score={formatGain(r.homeGain)}
                      tone={toneOfTag(tags.home)}
                      tag={tags.home}
                    />
                    <MatchupSideRow
                      name={r.away.name}
                      href={`/teams/${r.away.slug}`}
                      score={formatGain(r.awayGain)}
                      tone={toneOfTag(tags.away)}
                      tag={tags.away}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {payload.pairings.length > 0 ? (
          <section className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted">
              Matchups for the week of {formatMonthDay(payload.weekStart)}
            </p>
            <ul className="flex flex-col divide-y divide-line/70">
              {payload.pairings.map((p) => (
                <li
                  key={`${p.home.slug}:${p.away.slug}`}
                  className="flex flex-wrap items-center gap-x-2 py-1.5 text-sm"
                >
                  <TeamLink team={p.home} />
                  <span className="text-text-muted">vs</span>
                  <TeamLink team={p.away} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  return <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>;
}
