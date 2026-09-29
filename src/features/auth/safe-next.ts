const PLACEHOLDER_ORIGIN = "http://next.invalid";

/**
 * Validates a post-login `next` target so it can never send the user off-site. Only a same-origin
 * relative path survives; anything else (absolute URL, protocol-relative `//host`, backslash
 * tricks, control characters, non-strings) collapses to `fallback`.
 *
 * Parsing against a placeholder origin catches what a prefix check misses: browsers treat `\` as
 * `/` and strip tabs and newlines, so "/\evil.com" and "/\t/evil.com" become "//evil.com".
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
