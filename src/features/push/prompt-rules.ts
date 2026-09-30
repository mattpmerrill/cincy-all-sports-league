import { z } from "zod";
import type { PushSupport } from "./support";

/**
 * localStorage key for a member's "Not now" record. This module owns the shape; the prompt only
 * stores it. Per member, because a shared device is common in a family league: one member's
 * permanent "no" must not hide the prompt from the next person to sign in.
 */
export const promptDismissalKey = (userId: string) => `cincy:push-prompt:${userId}`;

const DAY_MS = 24 * 60 * 60 * 1000;
/** After the first "Not now" the prompt stays away this long; after the second, for good. */
export const PROMPT_SNOOZE_MS = 14 * DAY_MS;
const MAX_DISMISSALS = 2;

/** How often and when the member said "Not now". `at` is epoch milliseconds. */
export const dismissalSchema = z.object({
  userId: z.string().min(1).max(64),
  count: z.number().int().min(1).max(1000),
  at: z.number().int().min(0),
});
export type PromptDismissal = z.infer<typeof dismissalSchema>;

/**
 * localStorage is the member's to edit and other code's to overwrite, so anything unreadable, or
 * written for someone else, counts as "never dismissed": the worst outcome is one extra look at a
 * dismissible card.
 */
export function parseDismissal(raw: string | null, userId: string): PromptDismissal | null {
  if (raw === null) return null;
  try {
    const parsed = dismissalSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.userId === userId ? parsed.data : null;
  } catch {
    return null;
  }
}

export function recordDismissal(
  previous: PromptDismissal | null,
  userId: string,
  now: number,
): PromptDismissal {
  // A record for another member is not this member's history.
  const before = previous?.userId === userId ? previous.count : 0;
  return { userId, count: Math.min(before + 1, MAX_DISMISSALS), at: now };
}

/** Only where a member is already looking at the league: home, the feed and the trade screens. */
export function isPromptPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/feed" ||
    pathname === "/trades" ||
    pathname.startsWith("/trades/")
  );
}

function isDismissed(dismissal: PromptDismissal | null, now: number): boolean {
  if (!dismissal) return false;
  if (dismissal.count >= MAX_DISMISSALS) return true;
  const elapsed = now - dismissal.at;
  // A stamp a day or more in the future is not clock skew, it is garbage (or a clock that was
  // wrong when it was written). Trusting it would hide the prompt until that date, so it is
  // ignored and the next "Not now" writes a good one.
  if (elapsed < -DAY_MS) return false;
  return elapsed < PROMPT_SNOOZE_MS;
}

export type PromptContext = {
  support: PushSupport;
  /** Whether this browser already has a push subscription (`pushManager.getSubscription()`). */
  hasSubscription: boolean;
  signedIn: boolean;
  /** Owns a fantasy team. Members without one would never be sent anything, so they are not asked. */
  ownsTeam: boolean;
  pathname: string;
  dismissal: PromptDismissal | null;
  now: number;
};

/**
 * Whether to show the "Get alerts on this device?" card. Every "no" is the safe default, so a
 * state that is still loading should pass `support: unsupported` rather than guess.
 */
export function shouldShowPrompt(ctx: PromptContext): boolean {
  if (!ctx.signedIn || !ctx.ownsTeam) return false;
  if (!isPromptPath(ctx.pathname)) return false;
  if (isDismissed(ctx.dismissal, ctx.now)) return false;

  switch (ctx.support.status) {
    case "ios_needs_install":
      return true;
    case "ready":
      // Permission already granted with a live subscription means alerts are on: nothing to ask.
      return ctx.support.permission === "default" || !ctx.hasSubscription;
    default:
      return false;
  }
}
