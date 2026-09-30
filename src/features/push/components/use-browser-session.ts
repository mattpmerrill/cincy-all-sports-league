"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { DeviceSession } from "../device-sync";

/**
 * The browser's view of the session, in the terms `decideDeviceSync` wants. Same approach as the
 * header's account menu (a feature may not import another): the root layout stays static, so the
 * session is read here in the browser, and it starts as `loading`, never as "signed out".
 *
 * Signing in or out runs as a Server Action that sets the cookie and then navigates on the
 * client, so the auth client never sees an event; the cookie is re-read on every route change.
 */
export function useBrowserSession(): DeviceSession {
  const pathname = usePathname();
  const [session, setSession] = useState<DeviceSession>({ status: "loading" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Only state is set inside the callback: awaiting Supabase calls in it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next ? { status: "signed_in", userId: next.user.id } : { status: "signed_out" }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        const next = data.session;
        // Keeps the same object when nothing changed, so effects keyed on it do not re-run.
        setSession((prev) => {
          if (!next) return prev.status === "signed_out" ? prev : { status: "signed_out" };
          return prev.status === "signed_in" && prev.userId === next.user.id
            ? prev
            : { status: "signed_in", userId: next.user.id };
        });
      })
      // Stays `loading`, which does nothing: the safe reading of a session we could not read.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  return session;
}
