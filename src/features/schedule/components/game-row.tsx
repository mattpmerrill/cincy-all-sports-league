import { Swords } from "lucide-react";
import type { GameSide } from "@/domain/schedule";
import { SPORTS } from "@/domain/sports/sports";
import { Badge } from "@/ui/badge";
import { ParticipantImage } from "@/ui/participant-image";
import { SportIcon } from "@/ui/sport-icon";
import { cn } from "cn";
import type { GameView } from "../schedule.service";
import { GameStatus } from "./game-status";
import { StakeChip } from "./stake-chip";

function SideLine({ side, muted }: { side: GameSide; muted: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ParticipantImage name={side.name} src={side.logoUrl} kind="team" size="sm" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-base font-semibold",
          muted && "font-medium text-text-muted",
        )}
      >
        {side.name}
      </span>
      {side.score !== null ? (
        <span
          className={cn(
            "tabular font-display text-2xl leading-none font-bold",
            muted && "text-text-muted",
          )}
        >
          {side.score}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One game: sport and status on top, the two sides with their scores, and below them every
 * fantasy team holding either side. A game two teams hold opposite sides of is a showdown.
 */
export function GameRow({ game }: { game: GameView }) {
  const decided = game.status === "final";
  const context = [game.note, game.neutralSite ? "Neutral site" : null].filter(Boolean).join(" · ");
  const holders = [
    { side: game.away, stakes: game.stakes.away },
    { side: game.home, stakes: game.stakes.home },
  ].flatMap(({ side, stakes }) => stakes.map((stake) => ({ stake, label: side.shortName })));

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-surface p-3 md:p-4",
        game.isShowdown ? "border-brand/60" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-muted">
          <SportIcon sport={game.sport} className="size-3.5 shrink-0" />
          <span className="shrink-0">{SPORTS[game.sport].shortLabel}</span>
          {context ? <span className="truncate">· {context}</span> : null}
        </p>
        <GameStatus line={game.line} />
      </div>

      <h3 className="sr-only">
        {game.away.name} at {game.home.name}
      </h3>
      <div className="flex flex-col gap-2">
        <SideLine side={game.away} muted={decided && game.away.winner === false} />
        <SideLine side={game.home} muted={decided && game.home.winner === false} />
      </div>

      {holders.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
          {game.isShowdown ? (
            <Badge className="gap-1 px-2">
              <Swords aria-hidden="true" />
              Showdown
            </Badge>
          ) : null}
          {holders.map(({ stake, label }) => (
            <StakeChip key={`${stake.teamId}:${label}`} stake={stake} sideLabel={label} />
          ))}
        </div>
      ) : null}
    </li>
  );
}
