"use client";

import { usePendingTradeCount } from "./trades-badge-provider";

const CAP = 9;

/**
 * The count pill on the Trades tab. It only reads the count that `TradesBadgeProvider` owns, so
 * the phone bar and the top nav can both show it without a second subscription. Renders nothing
 * for signed-out visitors and at zero.
 */
export function TradesBadge() {
  const count = usePendingTradeCount();
  if (count === 0) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.65rem] leading-none font-bold text-on-brand">
      <span aria-hidden="true">{count > CAP ? `${CAP}+` : count}</span>
      <span className="sr-only">
        {count === 1 ? "1 trade offer waiting on you" : `${count} trade offers waiting on you`}
      </span>
    </span>
  );
}
