import { REACTIONS } from "@/domain/feed";
import type { ReactionName, ScoreUpdateItem } from "@/domain/feed";
import { formatPoints } from "@/domain/league/format";
import { fromUnits, toUnits } from "@/domain/scoring";
import { TRADE_WINDOW_HOURS } from "@/domain/trades";
import { clipText, pushMessage } from "./payload";
import type { PushAlert, PushSend } from "./types";

/**
 * The builders decide who is told and what it says; delivery decides how. Plain text, no em
 * dashes. A name is clipped before it goes into a sentence so the part after it (the verb, the
 * points) is never the part the title limit cuts off.
 */

const HOUR = 3600;
const NAME_MAX = 24;
const TEAM_NAME_MAX = 40;
const PARTICIPANT_MAX = 28;
const SNIPPET_MAX = 100;
const TOP_SCORERS = 3;
/**
 * Gains only. Deltas from the score diff are already exact to four decimals, so this is a
 * defensive floor against float noise from any other producer, not something the data needs.
 */
const GAIN_EPSILON = 1e-9;

const path = (...segments: string[]) => `/${segments.map(encodeURIComponent).join("/")}`;

export function tradePushAlert(input: {
  recipientId: string;
  listingId: string;
  offerId: string;
  /** The trade event ("new_offer", "accepted", ...): one offer can owe several alerts. */
  eventKey: string;
  title: string;
  body: string;
}): PushAlert {
  return {
    topic: "trades",
    recipientId: input.recipientId,
    dedupeKey: `trade:${input.offerId}:${input.eventKey}`,
    message: pushMessage({
      title: input.title,
      body: input.body,
      url: path("trades", input.listingId),
      tag: `trade-${input.listingId}`,
      renotify: true,
    }),
    // An offer that outlives its window is moot, so hold it no longer than the window.
    ttlSeconds: TRADE_WINDOW_HOURS * HOUR,
    urgency: "high",
  };
}

type AuthoredPost = { id: string; authorId: string | null };

/** To the author of a post, when someone else replies. League posts have no author to tell. */
export function replyPushAlert(input: {
  actorId: string;
  replyId: string;
  parent: AuthoredPost;
  replierName: string;
  replyBody: string;
}): PushAlert | null {
  const recipientId = input.parent.authorId;
  if (recipientId === null || recipientId === input.actorId) return null;
  return {
    topic: "feed",
    recipientId,
    dedupeKey: `reply:${input.replyId}`,
    message: pushMessage({
      title: `${clipText(input.replierName, NAME_MAX)} replied to your post`,
      body: input.replyBody,
      url: "/feed",
      tag: `feed-replies-${input.parent.id}`,
      renotify: true,
    }),
    ttlSeconds: 24 * HOUR,
    urgency: "normal",
  };
}

/**
 * To the author of a post, when someone else reacts. The glyph comes from the reaction catalog
 * in domain/feed, the one owner of the emoji. `reactorIds` is everyone who has reacted to the
 * post, duplicates and all: the builder counts distinct reactors other than the author and the
 * actor, so a busy post reads "Sam and 3 others" instead of one alert per reaction.
 */
export function reactionPushAlert(input: {
  actorId: string;
  actorName: string;
  reaction: ReactionName;
  message: AuthoredPost & { body: string; deleted: boolean };
  reactorIds: readonly string[];
}): PushAlert | null {
  const { message } = input;
  const recipientId = message.authorId;
  if (recipientId === null || recipientId === input.actorId || message.deleted) return null;

  const glyph = REACTIONS.find((r) => r.name === input.reaction)?.glyph ?? input.reaction;
  const who = clipText(input.actorName, NAME_MAX);
  const others = new Set(
    input.reactorIds.filter((id) => id !== recipientId && id !== input.actorId),
  ).size;
  const snippet = clipText(message.body, SNIPPET_MAX);
  return {
    topic: "feed",
    recipientId,
    // One per reactor per post, so toggling a reaction on and off cannot alert twice.
    dedupeKey: `reaction:${message.id}:${input.actorId}`,
    message: pushMessage({
      title:
        others > 0
          ? `${who} and ${others} other${others === 1 ? "" : "s"} reacted to your post`
          : `${who} reacted ${glyph} to your post`,
      body: snippet ? `"${snippet}"` : "",
      url: "/feed",
      tag: `feed-reactions-${message.id}`,
      renotify: false,
    }),
    ttlSeconds: 12 * HOUR,
    urgency: "low",
  };
}

/**
 * One alert per owned team per sync run: the sum of what it gained and its biggest gainers.
 * Losses (a corrected result) stay silent because the alert promises "your team gained points".
 * Items name a team by slug and two teams can hold the same participant (WNBA), so each owner is
 * told about their own team from their own items.
 */
export function scorePushAlerts(input: {
  runId: string;
  items: readonly ScoreUpdateItem[];
  teams: readonly { slug: string; name: string; ownerId: string | null }[];
}): PushAlert[] {
  const alerts: PushAlert[] = [];
  for (const team of input.teams) {
    if (team.ownerId === null) continue;
    const gains = input.items
      .filter((item) => item.teamSlug === team.slug && item.pointsDelta > GAIN_EPSILON)
      .sort(
        (a, b) =>
          b.pointsDelta - a.pointsDelta ||
          // Plain comparison, not localeCompare: the order must not depend on the server's locale.
          (a.participantName < b.participantName
            ? -1
            : a.participantName > b.participantName
              ? 1
              : 0),
      );
    if (gains.length === 0) continue;

    // Integer units, like the scoring module: 0.1 + 0.2 must read +0.3, not +0.30000000000000004.
    const total = fromUnits(gains.reduce((sum, item) => sum + toUnits(item.pointsDelta), 0));
    const top = gains
      .slice(0, TOP_SCORERS)
      .map(
        (item) =>
          `${clipText(item.participantName, PARTICIPANT_MAX)} +${formatPoints(item.pointsDelta)}`,
      );
    const more = gains.length - TOP_SCORERS;

    alerts.push({
      topic: "scores",
      recipientId: team.ownerId,
      dedupeKey: `score:${input.runId}:${team.slug}`,
      message: pushMessage({
        title: `${clipText(team.name, TEAM_NAME_MAX)} +${formatPoints(total)}`,
        body: `${top.join(", ")}${more > 0 ? ` and ${more} more` : ""}`,
        url: path("teams", team.slug),
        // The newest replaces the older one in the tray, and re-alerts: each run is fresh news.
        tag: `scores-${team.slug}`,
        renotify: true,
      }),
      ttlSeconds: 6 * HOUR,
      urgency: "normal",
    });
  }
  return alerts;
}

/**
 * The "send me a test alert" button. It targets one device directly, so it has no topic and no
 * switch applies. The minute in the key is a one-per-minute throttle.
 */
export function testPushAlert(input: { recipientId: string; now: Date }): PushSend {
  return {
    recipientId: input.recipientId,
    dedupeKey: `test:${input.now.toISOString().slice(0, 16)}`,
    message: pushMessage({
      title: "Alerts are working",
      body: "Alerts are working on this device.",
      url: "/me",
      tag: "test",
      renotify: true,
    }),
    ttlSeconds: 300,
    urgency: "high",
  };
}
