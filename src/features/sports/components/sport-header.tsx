import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SportIcon } from "@/ui/sport-icon";
import { StatusPill } from "@/ui/status-pill";
import type { SportSummary } from "../sports.service";

export function SportHeader({ sport }: { sport: SportSummary }) {
  return (
    <header className="hero-backdrop relative overflow-hidden rounded-3xl border border-line bg-surface p-5 md:p-7">
      <Link
        href="/sports"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-text-muted outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All sports
      </Link>
      <div className="mt-4 flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-on-brand shadow-glow-brand">
          <SportIcon sport={sport.code} className="size-9" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-none font-extrabold md:text-6xl">{sport.name}</h1>
          <StatusPill status={sport.status} />
        </div>
      </div>
    </header>
  );
}
