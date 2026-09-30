/**
 * The push services browsers use. A subscription's endpoint is an address our server will POST
 * to, and a member supplies it, so anything off this list is refused: otherwise a member could
 * point the server at any host (SSRF). Matched as https plus a hostname suffix, because the
 * services hand out per-region and per-device subdomains (`updates.push.services.mozilla.com`,
 * `wns2-par02p.notify.windows.com`). Apple is listed as `push.apple.com` for the same reason:
 * every host under it is Apple's, so the guard is no wider in who it trusts.
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

function parseUrl(endpoint: string): URL | null {
  try {
    return new URL(endpoint);
  } catch {
    return null;
  }
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  const url = parseUrl(endpoint);
  if (!url || url.protocol !== "https:") return false;
  // `https://fcm.googleapis.com@evil.com/` parses with a login, and a custom port is never a
  // real push service: neither is worth the ambiguity.
  if (url.username !== "" || url.password !== "" || url.port !== "") return false;
  // The dot boundary is what keeps `evilfcm.googleapis.com` out. URL lower-cases the hostname,
  // and an IP address can never equal or end in ".<allowed host>".
  return PUSH_SERVICE_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

/** The host alone, for logs: the path and query of an endpoint identify a device. */
export function pushServiceHost(endpoint: string): string | null {
  return parseUrl(endpoint)?.hostname ?? null;
}
