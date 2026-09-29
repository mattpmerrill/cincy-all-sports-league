"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPendingTradesRepository } from "@/data/pending-trades.repository";
import { logger } from "@/lib/logger";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const CAP = 9;

/**
 * How many offers are waiting on the signed-in member, as a count pill on the Trades tab. It reads
 * through the browser client so the root layout stays static. It goes through a data-layer
 * repository (which is client-safe: it only needs a typed client) so the rpc name and the
 * validation of its result live in one place. Renders nothing for signed-out visitors and at zero.
 */
export function TradesBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  // Realtime and auth callbacks outlive renders; they refetch through this ref.
  const refresh = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const pending = createPendingTradesRepository(supabase);
    let active = true;

    refresh.current = async () => {
      // Signed out means no badge, and the rpc is not granted to anon anyway.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (active) setCount(0);
        return;
      }
      try {
        const next = await pending.countPendingDecisions();
        if (active) setCount(next);
      } catch (error) {
        // A missing badge must not break navigation: keep the last known count and leave a trace.
        logger.warn("trades_badge_refresh_failed", { error });
      }
    };

    const { data: auth } = supabase.auth.onAuthStateChange(() => void refresh.current());
    const channel = supabase
      // Unique per mount: removeChannel is async, so a remount (Strict Mode in dev) would otherwise
      // be handed the still-subscribed channel of the same name and throw on `.on`.
      .channel(`trades-badge-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trade_offers" },
        () => void refresh.current(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trade_offers" },
        () => void refresh.current(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trade_listings" },
        () => void refresh.current(),
      )
      .subscribe();

    return () => {
      active = false;
      auth.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, []);

  // Also on every navigation: an accepted or rejected offer on another page changes the count.
  useEffect(() => {
    void refresh.current();
  }, [pathname]);

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
