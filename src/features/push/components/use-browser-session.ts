"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { nextSessionState } from "@/lib/supabase/session-state";
import type { DeviceSession } from "../device-sync";

/**
 * The browser's view of the session, in the terms `decideDeviceSync` wants. Same approach as the
 * header's account menu (a feature may not import another): the root layout stays static, so the
 * session is read here in the browser, and it starts as `loading`, never as "signed out".
 *
 * What a signal means is decided by `nextSessionState`, shared with the header: a session the
 * auth client could not refresh (offline, an auth outage) is NOT a sign-out, and reading it as one
 * would drop this device's push subscription. Signing in or out runs as a Server Action that sets
 * the cookie and then navigates on the client, so the auth client never sees an event; the cookie
 * is re-read on every route change.
 */
export function useBrowserSession(): DeviceSession {
  const pathname = usePathname();
  const [session, setSession] = useState<DeviceSession>({ status: "loading" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Only state is set inside the callback: awaiting Supabase calls in it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, next) =>
      setSession((prev) => nextSessionState(prev, { source: "event", event, session: next })),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession((prev) =>
          nextSessionState(prev, { source: "read", session: data.session, error }),
        );
      })
      // Stays as it was: the safe reading of a session we could not read.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  return session;
}
