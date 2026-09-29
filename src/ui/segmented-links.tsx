import Link from "next/link";
import { cn } from "cn";

export type SegmentedLink = { key: string; label: string; href: string };

/**
 * A segmented control made of links, so the choice lives in the URL and the page stays
 * server-driven. `aria-current` marks the active one for assistive tech; the fill marks it for
 * everyone else. Segments share the width equally, at least 44px tall.
 */
export function SegmentedLinks({
  label,
  items,
  current,
}: {
  /** Names the navigation landmark ("Type of trade"). */
  label: string;
  items: readonly SegmentedLink[];
  /** The `key` of the active segment. */
  current: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-surface p-1">
        {items.map((item) => (
          <li key={item.key} className="contents">
            <Link
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                item.key === current
                  ? "bg-brand text-on-brand"
                  : "text-text-muted hover:bg-surface-raised hover:text-text",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
