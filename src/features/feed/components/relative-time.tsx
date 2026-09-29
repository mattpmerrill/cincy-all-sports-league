"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/time";

/**
 * "3 min ago" that stays fresh. It starts from the server's clock so the first client render
 * matches the server HTML, then ticks once a minute.
 */
export function RelativeTime({ iso, serverNow }: { iso: string; serverNow: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    // Catch up right after hydration (the server clock is already seconds old), then every minute.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className="whitespace-nowrap">
      {relativeTime(new Date(iso), now)}
    </time>
  );
}
