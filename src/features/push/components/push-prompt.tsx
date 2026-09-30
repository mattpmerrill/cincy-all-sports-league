"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { promptSupportFor } from "../device-state";
import {
  isPromptPath,
  recordDismissal,
  shouldShowPrompt,
  type PromptDismissal,
} from "../prompt-rules";
import type { PushActions } from "../push-actions";
import { readPromptDismissal, writePromptDismissal } from "../push-device";
import { IosInstallHint } from "./ios-install-hint";
import { useBrowserSession } from "./use-browser-session";
import { usePushDevice } from "./use-push-device";

/** What the rules need beyond the device: read in the browser, per member, when a prompt page opens. */
type PromptFacts = {
  userId: string;
  ownsTeam: boolean;
  dismissal: PromptDismissal | null;
  /** When `dismissal` was read, for the snooze check (kept in state so render stays pure). */
  now: number;
};

function focusMain() {
  // The card is about to disappear; without this focus falls back to the top of the page. `main`
  // takes programmatic focus (tabIndex -1) and is not a tab stop.
  document.getElementById("main")?.focus({ preventScroll: true });
}

/**
 * The in-app "Get alerts on this device?" card, mounted once in the root layout. `configured` is
 * the server's flag, passed from the layout, so a deploy that cannot send alerts never asks; that
 * check comes first so those deploys do no session, team or device work at all.
 */
export function PushPrompt({
  configured,
  actions,
}: {
  configured: boolean;
  actions: Pick<PushActions, "subscribe" | "unsubscribe">;
}) {
  if (!configured) return null;
  return <ConfiguredPushPrompt actions={actions} />;
}

function ConfiguredPushPrompt({
  actions,
}: {
  actions: Pick<PushActions, "subscribe" | "unsubscribe">;
}) {
  const pathname = usePathname();
  const session = useBrowserSession();
  const device = usePushDevice({ actions, configured: true });
  const [facts, setFacts] = useState<PromptFacts | null>(null);
  // The path where alerts were just turned on from the card, to confirm it there and nowhere else.
  const [enabledOn, setEnabledOn] = useState<string | null>(null);
  const titleId = useId();
  const knownOwners = useRef(new Set<string>());
  const { sync } = device;

  // Every route change re-checks the device against the session (a shared phone, a rotated key,
  // a lost server row). A loading session is skipped inside `sync`.
  useEffect(() => {
    void sync(session);
  }, [session, pathname, sync]);

  // Ownership and the member's "Not now" record are read where the card could show, not on every
  // page. A member known to own a team is not asked again.
  const userId = session.status === "signed_in" ? session.userId : null;
  useEffect(() => {
    if (!userId || !isPromptPath(pathname)) return;
    let active = true;
    const owns = knownOwners.current.has(userId)
      ? Promise.resolve(true)
      : createFantasyTeamsRepository(createSupabaseBrowserClient())
          .getOwnedBy(userId)
          .then((team) => team !== null)
          // Unreadable means "no": the card is a nicety, and a wrong "yes" would ask someone
          // with nothing to be alerted about.
          .catch(() => false);
    void owns.then((ownsTeam) => {
      if (!active) return;
      if (ownsTeam) knownOwners.current.add(userId);
      setFacts({ userId, ownsTeam, dismissal: readPromptDismissal(userId), now: Date.now() });
    });
    return () => {
      active = false;
    };
  }, [userId, pathname]);

  const deviceFacts = promptSupportFor(device.state);

  // Nothing renders until the session, the member's team and the device are all known.
  if (!userId || !facts || facts.userId !== userId || !deviceFacts) return null;

  if (enabledOn === pathname && device.state.status === "on") {
    return (
      <PromptFrame>
        <Alert variant="info">
          Alerts are on for this device.{" "}
          <Link href="/me" className="font-medium text-text underline underline-offset-4">
            Choose which ones on your profile
          </Link>
          .
        </Alert>
      </PromptFrame>
    );
  }

  const show = shouldShowPrompt({
    ...deviceFacts,
    signedIn: true,
    ownsTeam: facts.ownsTeam,
    pathname,
    dismissal: facts.dismissal,
    now: facts.now,
  });
  if (!show) return null;

  const working = device.state.status === "working";
  const install = device.state.status === "ios_install";

  // An arrow, not a declaration, so the `facts` narrowing above still holds inside it.
  const dismiss = () => {
    const next = recordDismissal(facts.dismissal, facts.userId, Date.now());
    writePromptDismissal(next);
    setFacts({ ...facts, dismissal: next, now: next.at });
    focusMain();
  };

  async function turnOn() {
    const next = await device.enable();
    if (next.status === "on") {
      setEnabledOn(pathname);
      focusMain();
    }
  }

  return (
    <PromptFrame>
      <aside
        aria-labelledby={titleId}
        aria-busy={working}
        className="flex flex-col gap-4 rounded-2xl border border-brand/50 bg-linear-to-br from-brand/15 to-surface p-4"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand"
          >
            <Bell className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p id={titleId} className="font-display text-xl leading-none font-extrabold uppercase">
              Get alerts on this device?
            </p>
            {install ? null : (
              <p className="text-sm text-text-muted">
                Trade offers, replies to your posts, and your team&apos;s points. You choose which
                ones on your profile.
              </p>
            )}
          </div>
        </div>

        {install ? <IosInstallHint inAppBrowser={device.inAppBrowser} /> : null}

        {device.state.status === "error" ? (
          <Alert variant="error">{device.state.message}</Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {install ? null : (
            <Button
              className="min-h-11 px-4 font-semibold"
              disabled={working}
              onClick={() => void turnOn()}
            >
              {working ? "Turning on..." : "Turn on alerts"}
            </Button>
          )}
          <Button variant="outline" className="min-h-11 px-4" disabled={working} onClick={dismiss}>
            Not now
          </Button>
          <Link
            href="/me"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            Settings
          </Link>
        </div>
      </aside>
    </PromptFrame>
  );
}

/** Same gutters as a page, so the card lines up with the content under it. */
function PromptFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 pt-4 md:pt-6">{children}</div>;
}
