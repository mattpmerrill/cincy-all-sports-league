import Link from "next/link";
import { Button } from "@/ui/button";
import { NativeSelect } from "@/ui/native-select";
import { weekHref } from "../links";
import type { WeekPage } from "../schedule.service";

const linkClass =
  "inline-flex min-h-11 items-center rounded-md px-1 text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Narrows the page to one fantasy team. A plain GET form, so it works without JavaScript: the
 * team goes into the URL and the server renders the narrowed page. The week rides along as a
 * hidden field (the current week is the default, so it is left out then), which keeps the filter
 * and the week stepper from undoing each other.
 */
export function TeamFilter({ page }: { page: WeekPage }) {
  const week = page.isCurrentWeek ? null : page.weekStart;
  return (
    <form action="/week" method="get" className="flex flex-wrap items-end gap-x-3 gap-y-2">
      {week ? <input type="hidden" name="week" value={week} /> : null}
      <div className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-xs">
        <label htmlFor="week-team" className="text-sm font-medium text-text-muted">
          Team
        </label>
        <NativeSelect id="week-team" name="team" defaultValue={page.selectedTeam?.slug ?? ""}>
          <option value="">All teams</option>
          {page.teamOptions.map((team) => (
            <option key={team.slug} value={team.slug}>
              {team.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline" className="h-10 px-4 font-semibold">
        Show
      </Button>
      {page.myTeam && page.selectedTeam?.slug !== page.myTeam.slug ? (
        <Link href={weekHref({ week, team: page.myTeam.slug })} className={linkClass}>
          My team
        </Link>
      ) : null}
      {page.selectedTeam ? (
        <Link href={weekHref({ week })} className={linkClass}>
          All teams
        </Link>
      ) : null}
    </form>
  );
}
