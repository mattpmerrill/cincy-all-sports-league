"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CircleUserRound,
  LogOut,
  Settings,
  ShieldCheck,
  Shirt,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createProfilesRepository } from "@/data/profiles.repository";
import { logger } from "@/lib/logger";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { nextSessionState, type BrowserSessionState } from "@/lib/supabase/session-state";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/ui/sheet";
import { UserAvatar } from "@/ui/user-avatar";
import { FALLBACK_ACCOUNT_MENU, toAccountMenu } from "../account-menu";
import type { AccountMenu } from "../account-menu";
import { signOutAfter } from "../sign-out";

const AUTH_PAGES = ["/login", "/signup", "/reset-password"];

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/60";

/** Big, thumb-sized menu rows (56px), like a native app's drawer. */
const ROW = `flex h-14 items-center gap-4 rounded-xl px-3 text-lg font-semibold hover:bg-surface-high ${FOCUS_RING}`;

/** 44px tap target around the 32px avatar. */
const TRIGGER = `-mr-1.5 inline-flex size-11 items-center justify-center rounded-full ${FOCUS_RING}`;

/**
 * The header's menu button and the slide-out menu it opens from the right. Members tap their
 * avatar and get a card (photo, name, team), their rows (My team, Profile & settings, Admin) and
 * Sign out; visitors tap a person icon and get Join and Sign in. Both see the league rows that
 * have no bottom tab (Free agents, Rules) and Privacy and Terms. The
 * session and the member's own profile are read in the browser so the root layout stays static;
 * asking the server would make every page dynamic. Nothing renders until the session (and, for
 * members, the profile) is known, so neither variant flashes. If the profile cannot be read, the
 * menu still renders with a generic avatar: it is the only way to reach /me and Sign out.
 *
 * `beforeSignOut` runs while the session is still valid, just before it ends (the layout supplies
 * the push-alerts cleanup, since this feature cannot import that one).
 */
export function HeaderAccount({ beforeSignOut }: { beforeSignOut?: () => Promise<void> } = {}) {
  const pathname = usePathname();
  const [session, setSession] = useState<BrowserSessionState>({ status: "loading" });
  // Keyed by user id so a stale profile never shows after an account switch or sign-out.
  const [loaded, setLoaded] = useState<{ userId: string; account: AccountMenu } | null>(null);
  const userId = session.status === "signed_in" ? session.userId : null;
  const account = loaded && loaded.userId === userId ? loaded.account : null;
  // Bumped when the member edits their profile elsewhere on the page, so the photo here follows.
  const [profileVersion, setProfileVersion] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const bump = () => setProfileVersion((v) => v + 1);
    window.addEventListener(PROFILE_UPDATED_EVENT, bump);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, bump);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Fires once with the current session, then on every sign-in and sign-out. Only state is set
    // here: awaiting Supabase calls inside this callback can deadlock the auth client.
    const { data } = supabase.auth.onAuthStateChange((event, next) =>
      setSession((prev) => nextSessionState(prev, { source: "event", event, session: next })),
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
      .then(({ data, error }) => {
        if (!active) return;
        // A session that could not be refreshed (offline, an auth outage) is not a sign-out: the
        // shared mapping keeps the state instead of showing "Sign in" to a signed-in member.
        setSession((prev) =>
          nextSessionState(prev, { source: "read", session: data.session, error }),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const db = createSupabaseBrowserClient();
    // The team only feeds the "My team" row, so failing to read it must not cost the menu.
    const team = createFantasyTeamsRepository(db)
      .getOwnedBy(userId)
      .then((t) => (t ? { name: t.name, slug: t.slug } : null))
      .catch(() => null);
    Promise.all([createProfilesRepository(db).getById(userId), team])
      .then(([profile, owned]) => {
        if (!active) return;
        // A profile that does not parse falls back too, so the menu never vanishes.
        setLoaded({ userId, account: toAccountMenu(profile, owned) });
      })
      .catch((error: unknown) => {
        logger.warn("header_account_profile_failed", { error });
        if (active) setLoaded({ userId, account: FALLBACK_ACCOUNT_MENU });
      });
    return () => {
      active = false;
    };
  }, [userId, profileVersion]);

  // Close the menu when the page changes (a row was tapped), so it never covers the new page.
  // Adjusted during render rather than in an effect, as React recommends for derived state.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  if (session.status === "loading") return null;

  if (session.status === "signed_out") {
    if (AUTH_PAGES.some((p) => pathname.startsWith(p))) return null;
    const next = encodeURIComponent(pathname);
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label="Menu" className={TRIGGER}>
          <CircleUserRound aria-hidden="true" className="size-7 text-text-muted" />
        </SheetTrigger>
        <SheetContent aria-describedby={undefined}>
          <div className="px-5 pt-5 pb-4">
            <SheetTitle className="font-display text-2xl font-bold">Cincy&apos;s League</SheetTitle>
            <p className="mt-1 text-sm text-text-muted">Twenty teams, eleven sports, one family.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/signup?next=%2Fme"
                className={`inline-flex h-12 items-center justify-center rounded-xl bg-brand text-base font-semibold text-on-brand hover:bg-brand/85 ${FOCUS_RING}`}
              >
                Join the league
              </Link>
              <Link
                href={`/login?next=${next}`}
                className={`inline-flex h-12 items-center justify-center rounded-xl border border-text-muted/50 text-base font-semibold hover:bg-surface-high ${FOCUS_RING}`}
              >
                Sign in
              </Link>
            </div>
          </div>
          <MenuBody pathname={pathname} />
        </SheetContent>
      </Sheet>
    );
  }

  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label={account.label} className={TRIGGER}>
        <UserAvatar displayName={account.displayName} avatarUrl={account.avatarUrl} />
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <Link
          href={account.team ? `/teams/${account.team.slug}` : "/me"}
          className={`mx-2 mt-3 flex items-center gap-3 rounded-xl px-3 py-3 pr-12 hover:bg-surface-high ${FOCUS_RING}`}
        >
          <UserAvatar
            displayName={account.displayName}
            avatarUrl={account.avatarUrl}
            className="size-14 text-lg"
          />
          <span className="min-w-0">
            <SheetTitle className="truncate font-display text-xl leading-tight font-bold">
              {account.displayName}
            </SheetTitle>
            <span className="block truncate text-sm text-text-muted">
              {account.team ? account.team.name : "No team linked yet"}
            </span>
          </span>
        </Link>
        <MenuBody
          pathname={pathname}
          rows={[
            ...(account.team
              ? [{ href: `/teams/${account.team.slug}`, label: "My team", icon: Shirt }]
              : []),
            { href: "/me", label: "Profile & settings", icon: Settings },
            ...(account.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
          ]}
        >
          <form action={signOutAfter(beforeSignOut)} className="px-2">
            <button type="submit" className={`${ROW} w-full text-text-muted`}>
              <LogOut aria-hidden="true" className="size-6" />
              Sign out
            </button>
          </form>
        </MenuBody>
      </SheetContent>
    </Sheet>
  );
}

type MenuRow = { href: string; label: string; icon: LucideIcon };

/** League rows everyone sees, under the member's own; new pages (Matchups, History) go here. */
const LEAGUE_ROWS: MenuRow[] = [
  { href: "/free-agents", label: "Free agents", icon: UserPlus },
  { href: "/rules", label: "Rules", icon: BookOpenText },
];

function MenuBody({
  pathname,
  rows = [],
  children,
}: {
  pathname: string;
  rows?: MenuRow[];
  children?: ReactNode;
}) {
  const section = (title: string, list: MenuRow[]) =>
    list.length === 0 ? null : (
      <li>
        <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wider text-text-muted uppercase">
          {title}
        </p>
        <ul>
          {list.map(({ href, label, icon: Icon }) => {
            const current = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`${ROW} ${current ? "bg-surface-high text-brand-bright" : ""}`}
                >
                  <Icon aria-hidden="true" className="size-6" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </li>
    );
  return (
    <nav aria-label="Menu" className="flex min-h-0 flex-1 flex-col border-t border-line">
      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {section("You", rows)}
        {section("League", LEAGUE_ROWS)}
      </ul>
      <div className="border-t border-line pt-2 pb-3">
        {children}
        <div className="flex gap-2 px-3 pt-1 text-sm">
          <Link
            href="/privacy"
            className={`rounded-lg px-2 py-2 text-text-muted hover:text-text ${FOCUS_RING}`}
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className={`rounded-lg px-2 py-2 text-text-muted hover:text-text ${FOCUS_RING}`}
          >
            Terms
          </Link>
        </div>
      </div>
    </nav>
  );
}
