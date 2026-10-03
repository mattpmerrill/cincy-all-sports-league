import { Badge } from "@/ui/badge";
import type { DayView } from "../schedule.service";
import { GameRow } from "./game-row";

/** One Eastern day of the week: its heading, "Today" when it is, and its games or "No games". */
export function DaySection({ day }: { day: DayView }) {
  const headingId = `day-${day.date}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="flex items-center gap-2 text-xl font-bold">
        {day.heading}
        {day.isToday ? <Badge className="font-sans normal-case">Today</Badge> : null}
      </h2>
      {day.games.length === 0 ? (
        <p className="text-sm text-text-muted">No games.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {day.games.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </ul>
      )}
    </section>
  );
}
