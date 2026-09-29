import "server-only";
import { headers } from "next/headers";

/**
 * The public origin a request was addressed to, from its headers. `request.nextUrl.origin` can't
 * be trusted for this: in dev it reports `localhost` even when the browser used `127.0.0.1`, and
 * cookies are per-host, so redirecting across that gap would drop the session.
 *
 * Supabase only honours redirect targets on its allow-list, so a spoofed header cannot send a user
 * anywhere Supabase wasn't told about.
 */
export function originFromHeaders(h: Headers): string {
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestOrigin(): Promise<string> {
  return originFromHeaders(await headers());
}
