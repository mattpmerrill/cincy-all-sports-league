"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const AUTH_PAGES = ["/login", "/signup", "/reset-password"];

/**
 * Sign-in and join links for the header, shown only to signed-out visitors. The session is read in
 * the browser so the root layout stays static; asking the server would make every page dynamic.
 * Nothing renders until the session is known, so members never see the links flash.
 */
export function HeaderAuthLinks() {
  const pathname = usePathname();
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => setSignedOut(data.session === null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedOut(session === null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!signedOut || AUTH_PAGES.some((p) => pathname.startsWith(p))) return null;

  const next = encodeURIComponent(pathname);
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/login?next=${next}`}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-text-muted outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        Sign in
      </Link>
      <Link
        href="/signup?next=%2Fme"
        className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        Join
      </Link>
    </div>
  );
}
