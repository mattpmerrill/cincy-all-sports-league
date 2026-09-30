/* Push alerts only. It never intercepts requests, so nothing is ever cached.
   Hand-written because a worker cannot import TypeScript. The rules mirror pushPayloadSchema in
   src/domain/push/payload.ts, and src/features/push/service-worker.test.ts fails if they drift. */

const FALLBACK = {
  title: "Cincy's All-Sports League",
  body: "Something new in the league.",
  url: "/",
  tag: "alert",
  renotify: false,
};
// A path on this site only: browsers read a backslash as a slash and drop tabs and newlines.
const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\s\\\p{Cc}]*$/u;
const TAG = /^[A-Za-z0-9:_-]{1,64}$/;

// Code points, never .length: an emoji is two UTF-16 units and must count once.
const size = (s) => Array.from(s).length;
const isText = (v, min, max) => typeof v === "string" && size(v) >= min && size(v) <= max;
const isPath = (v) => isText(v, 1, 300) && SAME_ORIGIN_PATH.test(v);

// Returns the message to show, or the fallback for anything the contract does not allow. A push
// that shows nothing breaks userVisibleOnly and gets the permission revoked on Safari.
function readMessage(event) {
  try {
    if (!event.data) return FALLBACK;
    const d = event.data.json();
    if (d === null || typeof d !== "object" || Array.isArray(d)) return FALLBACK;
    const valid =
      d.v === 1 &&
      isText(d.title, 1, 80) &&
      isText(d.body, 0, 200) &&
      isPath(d.url) &&
      typeof d.tag === "string" &&
      TAG.test(d.tag) &&
      typeof d.renotify === "boolean";
    return valid ? d : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// Never trust the stored url: resolve it and fall back to the home page if it leaves this origin.
function targetUrl(data) {
  const raw = data && isPath(data.url) ? data.url : "/";
  const target = new URL(raw, self.location.origin);
  return target.origin === self.location.origin ? target.href : self.location.origin + "/";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const m = readMessage(event);
  event.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      tag: m.tag,
      renotify: m.renotify,
      icon: "/icon",
      badge: "/push-badge",
      data: { url: m.url },
      lang: "en",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data);
  const sameOrigin = (c) => {
    try {
      return new URL(c.url).origin === self.location.origin;
    } catch {
      return false;
    }
  };
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .catch(() => [])
      .then(async (list) => {
        // Prefer the window the member is looking at over one buried in another tab.
        const mine = list.filter(sameOrigin);
        const client = mine.find((c) => c.focused || c.visibilityState === "visible") || mine[0];
        if (!client) return self.clients.openWindow(url);
        try {
          await client.focus();
        } catch {
          return self.clients.openWindow(url);
        }
        try {
          await client.navigate(url);
        } catch {
          // navigate() is missing or refused (older Safari, uncontrolled client): the focused
          // window stays. Opening another one here could leave two app contexts on iOS.
        }
      }),
  );
});
