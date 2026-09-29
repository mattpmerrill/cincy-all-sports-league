"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createProfilesRepository } from "@/data/profiles.repository";
import { logger } from "@/lib/logger";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { UserAvatar } from "@/ui/user-avatar";
import { signOutAction } from "../actions";
import { FALLBACK_ACCOUNT_MENU, toAccountMenu } from "../account-menu";
import type { AccountMenu } from "../account-menu";

const AUTH_PAGES = ["/login", "/signup", "/reset-password"];

type Session = { status: "unknown" } | { status: "out" } | { status: "in"; userId: string };

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * The header's account control: Sign in / Join for visitors, an avatar menu for members. The
 * session and the member's own profile are read in the browser so the root layout stays static;
 * asking the server would make every page dynamic. Nothing renders until the session (and, for
 * members, the profile) is known, so neither variant flashes. If the profile cannot be read, the
 * menu still renders with a generic avatar: it is the only way to reach /me and Sign out.
 */
export function HeaderAccount() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session>({ status: "unknown" });
  // Keyed by user id so a stale profile never shows after an account switch or sign-out.
  const [loaded, setLoaded] = useState<{ userId: string; account: AccountMenu } | null>(null);
  const userId = session.status === "in" ? session.userId : null;
  const account = loaded && loaded.userId === userId ? loaded.account : null;
  // Bumped when the member edits their profile elsewhere on the page, so the photo here follows.
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    const bump = () => setProfileVersion((v) => v + 1);
    window.addEventListener(PROFILE_UPDATED_EVENT, bump);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, bump);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Fires once with the current session, then on every sign-in and sign-out. Only state is set
    // here: awaiting Supabase calls inside this callback can deadlock the auth client.
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next ? { status: "in", userId: next.user.id } : { status: "out" }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  // Signing in or out runs as a Server Action that sets the cookie and then navigates on the
  // client, so the browser auth client never sees an event. Re-read the cookie on every route
  // change to pick that up without a full reload.
  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        const next = data.session;
        setSession((prev) => {
          if (!next) return prev.status === "out" ? prev : { status: "out" };
          return prev.status === "in" && prev.userId === next.user.id
            ? prev
            : { status: "in", userId: next.user.id };
        });
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    createProfilesRepository(createSupabaseBrowserClient())
      .getById(userId)
      .then((profile) => {
        if (!active) return;
        // A profile that does not parse falls back too, so the menu never vanishes.
        setLoaded({ userId, account: toAccountMenu(profile) });
      })
      .catch((error: unknown) => {
        logger.warn("header_account_profile_failed", { error });
        if (active) setLoaded({ userId, account: FALLBACK_ACCOUNT_MENU });
      });
    return () => {
      active = false;
    };
  }, [userId, profileVersion]);

  if (session.status === "unknown") return null;

  if (session.status === "out") {
    if (AUTH_PAGES.some((p) => pathname.startsWith(p))) return null;
    const next = encodeURIComponent(pathname);
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/login?next=${next}`}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold text-text-muted hover:text-text ${FOCUS_RING}`}
        >
          Sign in
        </Link>
        <Link
          href="/signup?next=%2Fme"
          className={`inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand/85 ${FOCUS_RING}`}
        >
          Join
        </Link>
      </div>
    );
  }

  if (!account) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={account.label}
        className={`inline-flex size-8 items-center justify-center rounded-full ${FOCUS_RING}`}
      >
        <UserAvatar displayName={account.displayName} avatarUrl={account.avatarUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">{account.displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">Your profile</Link>
        </DropdownMenuItem>
        {account.isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
