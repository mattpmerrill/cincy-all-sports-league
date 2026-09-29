import Link from "next/link";
import { SPORTS } from "@/domain/sports/sports";
import type { FormState } from "@/lib/form-state";
import { relativeTime } from "@/lib/time";
import { Badge } from "@/ui/badge";
import { EmptyState } from "@/ui/page";
import type { SportHealth } from "../results-admin.service";
import { SyncNowForm } from "./sync-now-form";

type Props = {
  health: SportHealth[];
  now: Date;
  syncAction: (prev: FormState, formData: FormData) => Promise<FormState>;
};

const STATUS: Record<
  NonNullable<SportHealth["status"]>,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  succeeded: { label: "OK", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Skipped", variant: "secondary" },
  running: { label: "Running", variant: "outline" },
};

/** Last sync per sport, so a stuck or failing feed is visible without reading logs. */
export function SyncHealthPanel({ health, now, syncAction }: Props) {
  if (health.length === 0) {
    return (
      <EmptyState
        title="No active season"
        description="Sync health appears once a season exists."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {health.map((row) => {
        const sport = SPORTS[row.sport];
        const status = row.status ? STATUS[row.status] : null;
        const at = row.finishedAt ?? row.startedAt;
        return (
          <li
            key={row.sport}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/admin/results/${row.sport}`}
                className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {sport.name}
              </Link>
              <Badge variant={status?.variant ?? "outline"}>{status?.label ?? "Never run"}</Badge>
              {at ? (
                <time dateTime={at} className="text-sm text-text-muted">
                  {relativeTime(new Date(at), now)}
                </time>
              ) : null}
            </div>
            <p className="text-sm text-text-muted">{row.detail}</p>
            <SyncNowForm sport={row.sport} sportName={sport.name} action={syncAction} />
          </li>
        );
      })}
    </ul>
  );
}
