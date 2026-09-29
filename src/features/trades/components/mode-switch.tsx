import Link from "next/link";
import { cn } from "cn";
import type { TradeMode } from "../schemas";

const MODES: { mode: TradeMode; label: string; href: string }[] = [
  { mode: "block", label: "Put players on the block", href: "/trades/new" },
  { mode: "direct", label: "Offer a team a trade", href: "/trades/new?mode=direct" },
];

/**
 * A segmented control made of links, so the mode lives in the URL and the page stays server-driven.
 * `aria-current` marks the active one for assistive tech; the fill marks it for everyone else.
 */
export function TradeModeSwitch({ mode }: { mode: TradeMode }) {
  return (
    <nav aria-label="Type of trade">
      <ul className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
        {MODES.map((m) => (
          <li key={m.mode} className="contents">
            <Link
              href={m.href}
              aria-current={m.mode === mode ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                m.mode === mode
                  ? "bg-brand text-on-brand"
                  : "text-text-muted hover:bg-surface-raised hover:text-text",
              )}
            >
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
