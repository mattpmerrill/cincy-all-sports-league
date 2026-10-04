import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/ui/button";
import { cn } from "cn";
import { weekHref } from "../links";
import type { WeekPage } from "../schedule.service";

const stepClass = cn(
  buttonVariants({ variant: "outline" }),
  "h-11 min-w-11 gap-1 px-3 text-sm font-semibold",
);

/**
 * The week being shown, with previous and next links. They are plain links, so the week lives in
 * the URL (shareable, back button works) and the page needs no JavaScript. At the first and last
 * week of the season the missing direction is shown disabled rather than removed, so the layout
 * does not jump.
 */
export function WeekHeader({ page }: { page: WeekPage }) {
  const team = page.selectedTeam?.slug;
  const vs = page.selectedOpponent?.slug;
  // The current week is the default, so its link stays the clean `/week`.
  const hrefFor = (week: string) =>
    weekHref({ week: week === page.currentWeek ? null : week, team, vs });

  return (
    <nav aria-label="Week" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {page.prevWeek ? (
          <Link href={hrefFor(page.prevWeek)} className={stepClass} rel="prev">
            <ChevronLeft aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Prev</span>
            <span className="sr-only"> week</span>
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(stepClass, "opacity-40")}>
            <ChevronLeft aria-hidden="true" />
            <span className="sr-only">No earlier week</span>
          </span>
        )}

        <p className="flex min-w-0 flex-col items-center text-center">
          <span className="font-display text-2xl leading-tight font-bold">{page.rangeLabel}</span>
          <span className="text-xs font-medium text-text-muted">
            {page.isCurrentWeek ? "This week" : "Monday to Sunday"} · Eastern time
          </span>
        </p>

        {page.nextWeek ? (
          <Link href={hrefFor(page.nextWeek)} className={stepClass} rel="next">
            <span className="sr-only sm:not-sr-only">Next</span>
            <span className="sr-only"> week</span>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(stepClass, "opacity-40")}>
            <span className="sr-only">No later week</span>
            <ChevronRight aria-hidden="true" />
          </span>
        )}
      </div>

      {page.isCurrentWeek ? null : (
        <Link
          href={weekHref({ team, vs })}
          className="self-center rounded-md py-2 text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Back to this week
        </Link>
      )}
    </nav>
  );
}
