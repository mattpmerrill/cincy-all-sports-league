import { SportIcon } from "@/ui/sport-icon";
import { StatusPill } from "@/ui/status-pill";
import { cn } from "cn";
import type { SportRules } from "../rules.service";

/** One sport's rubric: a table per group of rules. */
export function SportRulesCard({ sport }: { sport: SportRules }) {
  return (
    <section
      id={sport.code}
      aria-labelledby={`rules-${sport.code}`}
      className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4 shadow-lift md:p-5"
    >
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-raised text-brand ring-1 ring-line">
          <SportIcon sport={sport.code} className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id={`rules-${sport.code}`} className="text-2xl leading-none font-bold">
            {sport.name}
          </h2>
          <StatusPill status={sport.status} />
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-4">
        {sport.groups.map((group) => (
          <table key={group.kind} className="w-full text-sm">
            <caption className="pb-1.5 text-left text-xs font-semibold text-text-muted">
              {group.title}
            </caption>
            <tbody className="divide-y divide-line/70">
              {group.rows.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className={cn(
                      "py-1.5 pr-3 text-left font-normal",
                      row.isChampionship && "font-semibold text-gold",
                    )}
                  >
                    {row.label}
                  </th>
                  <td className="tabular py-1.5 text-right font-display text-lg font-bold whitespace-nowrap">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {sport.majorCapNote ? (
          <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-text-muted">
            {sport.majorCapNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
