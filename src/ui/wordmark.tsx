import Link from "next/link";

/** Logo lockup: brand-colored tile plus the league name. */
export function Wordmark() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-brand font-display text-xl leading-none font-extrabold text-on-brand shadow-glow-brand"
      >
        C
      </span>
      <span className="flex flex-col font-display text-lg leading-[0.95] font-extrabold tracking-tight uppercase">
        Cincy&apos;s
        <span className="text-xs font-semibold tracking-[0.14em] text-text-muted">
          All-Sports League
        </span>
      </span>
    </Link>
  );
}
