import type { SportCode } from "@/domain/sports/sports";
import { cn } from "cn";
import { SportIcon } from "@/ui/sport-icon";

// Five distinct glyphs, spaced evenly around the logo.
const ORBIT: readonly SportCode[] = ["nba", "nfl", "mlb", "mls", "wta"];

/**
 * Route-level loading screen: the logo tile breathes a brand glow while sport balls orbit it.
 * It fades in after a short delay so fast navigations never flash it. Under reduced motion the
 * global rule in globals.css freezes the orbit and glow, leaving a still logo and label.
 */
export function PageLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[60vh] flex-1 animate-appear flex-col items-center justify-center gap-6",
        className,
      )}
    >
      <div aria-hidden="true" className="relative size-32">
        <div className="absolute inset-2 rounded-full border border-dashed border-line" />
        <div className="absolute inset-0 animate-orbit">
          {ORBIT.map((sport, i) => (
            <span
              key={sport}
              className="absolute top-1/2 left-1/2 -mt-4 -ml-4 grid size-8 place-items-center rounded-full border border-line bg-surface-raised text-brand-bright"
              style={{ transform: `rotate(${(360 / ORBIT.length) * i}deg) translateY(-3.5rem)` }}
            >
              <SportIcon sport={sport} className="size-4.5" />
            </span>
          ))}
        </div>
        <span className="absolute inset-0 m-auto grid size-14 animate-glow place-items-center rounded-xl bg-brand font-display text-3xl leading-none font-extrabold text-on-brand">
          C
        </span>
      </div>
      <p className="font-display text-sm font-semibold tracking-[0.2em] text-text-muted uppercase">
        {label}
      </p>
    </div>
  );
}
