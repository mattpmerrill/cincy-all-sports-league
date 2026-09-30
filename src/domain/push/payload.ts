import { z } from "zod";
import type { PushMessage } from "./types";

export const PUSH_PAYLOAD_VERSION = 1;

/** Code points, not UTF-16 units: a limit must never cut an emoji in half. */
export const PUSH_LIMITS = { title: 60, body: 160, tag: 64, url: 200 } as const;

/** Encrypted payloads top out at 4096 bytes; the rest is headroom for the aes128gcm overhead. */
export const MAX_PAYLOAD_BYTES = 3000;

export const FALLBACK_TITLE = "Cincy's All-Sports League";

const ELLIPSIS = "…";

/**
 * Bidi overrides and isolates can reorder the text around them (a name that flips the words after
 * it), so they are dropped. ZWJ and ZWNJ stay: emoji sequences and some scripts need them.
 */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Collapses whitespace and control characters to single spaces, removes bidi overrides, then cuts
 * to `max` code points, ending in an ellipsis when it cut. Grapheme clusters are not tracked: a
 * cut inside a joined emoji leaves a valid, if different, emoji rather than broken text. A lone
 * surrogate in the input becomes U+FFFD, so the result always encodes to valid UTF-8 and JSON.
 */
export function clipText(text: string, max: number): string {
  const tidy = text
    .replace(BIDI_CONTROLS, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();
  const points = Array.from(tidy);
  if (points.length <= max) return tidy.toWellFormed();
  return `${points
    .slice(0, Math.max(0, max - 1))
    .join("")
    .trimEnd()}${ELLIPSIS}`.toWellFormed();
}

/**
 * A path on this site and nothing else. Browsers read a backslash as a slash and drop tabs and
 * newlines while parsing, so `/\evil.com` and `/<tab>/evil.com` both mean `//evil.com`: they are
 * refused along with the plain `//evil.com`, not just the double-slash form.
 */
const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\s\\\p{Cc}]*$/u;

export function isSameOriginPath(url: string): boolean {
  return SAME_ORIGIN_PATH.test(url);
}

/** A cut path is a different path, so an over-long or foreign URL falls back to the home page. */
function safeUrl(url: string): string {
  return isSameOriginPath(url) && Array.from(url).length <= PUSH_LIMITS.url ? url : "/";
}

/** The worker's tag check is `^[A-Za-z0-9:_-]{1,64}$`; anything else would not match it. */
const TAG_CHARS = /[^A-Za-z0-9:_-]+/g;

function safeTag(tag: string): string {
  const cleaned = tag.replace(TAG_CHARS, "-").slice(0, PUSH_LIMITS.tag);
  return cleaned || "alert";
}

/**
 * The only way to make a `PushMessage`. Every builder goes through it, so the limits the worker
 * re-checks by hand hold no matter what text a member typed into a name or a post.
 */
export function pushMessage(input: PushMessage): PushMessage {
  return {
    // The worker rejects an empty title, so fall back rather than send a payload it would replace.
    title: clipText(input.title, PUSH_LIMITS.title) || FALLBACK_TITLE,
    body: clipText(input.body, PUSH_LIMITS.body),
    url: safeUrl(input.url),
    tag: safeTag(input.tag),
    renotify: input.renotify,
  };
}

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** What crosses the wire: the message plus a version so the worker can refuse a shape it lacks. */
export function encodePushPayload(message: PushMessage): string {
  const json = JSON.stringify({
    v: PUSH_PAYLOAD_VERSION,
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
    renotify: message.renotify,
  });
  // Unreachable through pushMessage; guards a hand-built message that skipped it.
  if (utf8Length(json) > MAX_PAYLOAD_BYTES) {
    throw new Error(`push payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  return json;
}

/**
 * The shape the service worker accepts, with the worker's own (wider) bounds: it validates by
 * hand because it cannot import this module, and a contract test keeps the two in step.
 *
 * Every length bound here is in CODE POINTS, not UTF-16 units (Zod counts code points, and
 * `pushMessage` clips by them). The worker must count with `Array.from(s).length`: `s.length`
 * counts an emoji as two and would reject an alert this module built correctly.
 */
export const pushPayloadSchema = z.object({
  v: z.literal(PUSH_PAYLOAD_VERSION),
  title: z.string().min(1).max(80),
  body: z.string().max(200),
  url: z.string().max(300).refine(isSameOriginPath, "must be a same-origin path"),
  tag: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/),
  renotify: z.boolean(),
});
