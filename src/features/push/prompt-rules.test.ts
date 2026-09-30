import { describe, expect, it } from "vitest";
import {
  PROMPT_SNOOZE_MS,
  isPromptPath,
  parseDismissal,
  recordDismissal,
  shouldShowPrompt,
  type PromptContext,
} from "./prompt-rules";

const NOW = Date.UTC(2026, 8, 29, 12);
const DAY = 24 * 60 * 60 * 1000;

const base: PromptContext = {
  support: { status: "ready", permission: "default" },
  hasSubscription: false,
  signedIn: true,
  ownsTeam: true,
  pathname: "/feed",
  dismissal: null,
  now: NOW,
};
const show = (over: Partial<PromptContext> = {}) => shouldShowPrompt({ ...base, ...over });

describe("shouldShowPrompt", () => {
  it("shows for a signed-in team owner who can turn alerts on", () => {
    expect(show()).toBe(true);
  });

  it.each([
    ["/", true],
    ["/feed", true],
    ["/trades", true],
    ["/trades/abc-123", true],
    ["/tradesfoo", false],
    ["/me", false],
    ["/teams/bears", false],
    ["/admin/results", false],
    ["/feedback", false],
  ])("on %s: %s", (pathname, expected) => {
    expect(isPromptPath(pathname)).toBe(expected);
    expect(show({ pathname })).toBe(expected);
  });

  it("asks only signed-in members who own a team, since anyone else would be sent nothing", () => {
    expect(show({ signedIn: false })).toBe(false);
    expect(show({ ownsTeam: false })).toBe(false);
  });

  it("shows for granted permission only when there is no subscription yet", () => {
    const granted = { status: "ready", permission: "granted" } as const;
    expect(show({ support: granted, hasSubscription: false })).toBe(true);
    expect(show({ support: granted, hasSubscription: true })).toBe(false);
  });

  it("shows the install hint on iOS outside the Home Screen app", () => {
    expect(show({ support: { status: "ios_needs_install" } })).toBe(true);
  });

  it.each(["unsupported", "not_configured", "denied"] as const)("never shows for %s", (status) => {
    expect(show({ support: { status } })).toBe(false);
  });

  describe("after Not now", () => {
    const at = (msAgo: number, count = 1) => ({ count, at: NOW - msAgo });

    it("stays away for 14 days after the first, then comes back", () => {
      expect(show({ dismissal: at(1000) })).toBe(false);
      expect(show({ dismissal: at(PROMPT_SNOOZE_MS - 1) })).toBe(false);
      expect(show({ dismissal: at(PROMPT_SNOOZE_MS) })).toBe(true);
      expect(show({ dismissal: at(365 * DAY) })).toBe(true);
    });

    it("stays away for good after the second", () => {
      expect(show({ dismissal: at(365 * DAY, 2) })).toBe(false);
      expect(show({ dismissal: at(365 * DAY, 9) })).toBe(false);
    });

    it("tolerates a little clock skew but ignores a stamp far in the future", () => {
      expect(show({ dismissal: { count: 1, at: NOW + 1000 } })).toBe(false);
      expect(show({ dismissal: { count: 1, at: NOW + 400 * DAY } })).toBe(true);
      // Ignoring the stamp never forgives a second dismissal.
      expect(show({ dismissal: { count: 2, at: NOW + 400 * DAY } })).toBe(false);
    });
  });
});

describe("dismissal storage", () => {
  it("counts up to the point it is permanent, and stamps the time", () => {
    const first = recordDismissal(null, NOW);
    expect(first).toEqual({ count: 1, at: NOW });
    expect(recordDismissal(first, NOW + 1)).toEqual({ count: 2, at: NOW + 1 });
    expect(recordDismissal({ count: 2, at: NOW }, NOW + 2).count).toBe(2);
  });

  it("round-trips through JSON", () => {
    const stored = JSON.stringify(recordDismissal(null, NOW));
    expect(parseDismissal(stored)).toEqual({ count: 1, at: NOW });
  });

  it.each([
    ["nothing stored", null],
    ["not JSON", "{oops"],
    ["a string", '"yes"'],
    ["a zero count", '{"count":0,"at":1}'],
    ["a negative time", '{"count":1,"at":-5}'],
    ["a fractional count", '{"count":1.5,"at":5}'],
    ["missing fields", "{}"],
    ["null", "null"],
  ])("reads %s as never dismissed", (_name, raw) => {
    expect(parseDismissal(raw)).toBeNull();
  });
});
