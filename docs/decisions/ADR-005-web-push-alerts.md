# ADR-005: Web Push alerts through VAPID, delivered after the response

Status: accepted

## Context

Members were promised push alerts for trades, replies and points. Several facts shape the design:

- Push on iPhone and iPad works only for an app added to the Home Screen (iOS 16.4 or later). In a
  Safari tab there is no `PushManager` at all, and the Home Screen app keeps its own sign-in.
- Trade emails already go out inside Next's `after()`, so a failed email never fails a trade. Push
  should behave the same way.
- Three features need to send (trades, the feed, score sync) and features cannot import each other.
- A subscription's address and keys are credentials: whoever holds them can push to that device.
- The site had no service worker, and offline caching is not wanted. A worker must never stand
  between a member and the live league.

## Decision

**Standard Web Push with VAPID, and a static worker.** `public/sw.js` is plain JavaScript with no
imports and no `fetch` handler, so it can never cache or intercept a request. It does two things:
show a notification on `push`, and open or focus the right page on `notificationclick`. The worker
cannot import TypeScript, so it re-checks every payload by hand (version, lengths counted in code
points, a same-origin path, a tag pattern). That hand-written copy of `pushPayloadSchema` in
`domain/push` is the one accepted exception to "one owner per concept", and a contract test
(`service-worker.test.ts`) fails if the two disagree on any builder output or on the adversarial
URL table. A payload it refuses still shows a generic notification, because a push that shows
nothing breaks `userVisibleOnly` and makes Safari revoke the permission. The worker is registered
only from the "turn on" click. Everywhere else the app uses `getRegistration()`, so a visitor who
never turns alerts on never gets a worker. `next.config.ts` serves `/sw.js` with
`Cache-Control: no-cache, no-store, must-revalidate`, a `default-src 'self'; script-src 'self'`
CSP, `nosniff` and an explicit JavaScript content type, and `src/proxy.ts` skips it so a session
refresh never sets cookies on the script. No site-wide headers were added.

**The `web-push` dependency (MIT, web-push-libs).** This is the ADR line for a new dependency. We
call one function, `generateRequestDetails`, for the RFC 8292 VAPID JWT and the RFC 8291 aes128gcm
payload encryption, which are the parts not worth hand-writing. The transport is our own `fetch`
in `integrations/webpush/send.ts`: `redirect: "error"` (a push service must not bounce our POST to
another host), a 5 second timeout per attempt, two attempts at most, retry only on 429 and 5xx
(honoring `Retry-After`, capped at 3 seconds), never on a timeout or network error (a second copy
of an alert is worse than a missed one), and `Content-Length` removed because `fetch` computes it.
It needs the Node runtime, which actions and routes use by default. Error text never contains the
endpoint, the keys or a response body.

**Preferences are `profiles.push_trades`, `push_feed` and `push_scores`.** They follow
`trade_emails`: boolean, default true, readable like the rest of the public profile, writable by the
owner through a column grant. The real consent is turning alerts on for a device, which needs a
browser permission. The switches apply to every device of the member and are enforced in SQL by
`push_targets`, so pgTAP covers them. Push and email stay independent.

**Devices live in `push_subscriptions`, private to `service_role`.** RLS is on with no policy, and
`anon`, `authenticated` and even `service_role` have their default grants revoked and the needed
ones granted back, so an owner cannot read their own row through the API. Every access goes
through the admin client after a Server Action re-checked the session. `register_push_subscription`
is one function: it moves an endpoint that belonged to someone else to the caller (a
shared phone, where a different member just turned alerts on) and trims the caller to 5 devices,
ranked by `last_registered_at`. That column is separate from `updated_at` on purpose: the shared
trigger stamps `updated_at` on every failure count and success stamp, so ranking by it would evict
a random device after a batch of sends. `push_targets` and `record_push_failure` are also
service_role-only. All three are SECURITY INVOKER because their only caller already holds the
grants, so DEFINER would add privilege for nothing. The registration function validates its input
and raises a stable `invalid_subscription` token, because a CHECK violation would put the endpoint
and both keys in the error's `details`.

**`push_sends` is an at-most-once ledger.** A send is claimed as `(recipient, dedupe_key)` before it
goes out. That stops a reaction toggled on and off from alerting twice and makes a re-run of the
same event a no-op. A pg_cron job (`cincy-push-sends-cleanup`, 09:40 UTC) deletes rows older than
90 days. The window only needs to outlast a burst of repeats. Keys that can legitimately recur, such
as `reaction:{message}:{actor}`, may alert again after that.

**Delivery runs in `after()` through a `PushNotifier` port.** `domain/push` declares two ports:
`PushNotifier` (`notify(build)`, which returns at once and never throws) and `PushStore` (what
delivery needs from storage). The ports live in the domain because `integrations` may not import
`data` and `data` may not import `integrations`; the data repository is typed as `PushStore`, so
drift fails to compile where it is written. Each triggering feature composes the same four lines
in its own `*.server.ts` (`createPushNotifier({ schedule: after, delivery, logger })`), and the
`build` function runs after the response. The reads a reaction alert needs therefore cost the action
nothing, and a failure in them cannot change its result. The delivery is built inside the task, so
the VAPID secrets are read after the response, like the Resend key.

**Wording lives in the domain.** `domain/push` builds every message (`tradePushAlert`,
`replyPushAlert`, `reactionPushAlert`, `scorePushAlerts`, `testPushAlert`) through one
`pushMessage` function that collapses whitespace, strips bidi overrides, clips by code points so an
emoji is never split, forces the URL to a same-origin path and caps the encoded payload at 3000
bytes (the encrypted limit is 4096). The builders also choose who is told: the actor never is, a
League post has no author to tell, gains only for scores, one score alert per owned team per sync
run. A trade push carries the subject and first line of the trade email and never the member's
free-text note, because a push crosses Apple, Google, Mozilla or Microsoft and lands on a lock
screen.

**Failure policy.** Only a real rejection (`push_rejected`: 400, 401, 403, 413 and similar) counts
against a device, once per run, and never for a device that took a send in the same run. Five
counted rejections prune the device. Transient problems (429, 5xx, timeout, network) never count:
a push-service outage must not prune healthy devices. A 404 or 410 removes the device at once, as
does an address that is not on the allow-list of push services. Delivery refuses to POST to a host
off the allow-list in `domain/push/endpoint.ts` (https, no login or port, and either a hostname
suffix from `PUSH_SERVICE_HOSTS` or a full-hostname match on `PUSH_SERVICE_HOST_PATTERNS`), so a
member cannot point our server at an arbitrary address. `isAllowedPushEndpoint` is the single
entry point: the action's schema, the registration check and delivery all call it. A refused host
is logged by host only. Chrome's push service answers on numbered hosts (`jmt17.google.com`), which
the first version of the list missed, so the pattern list allows exactly `jmt` plus one to three
digits on `google.com`. A `google.com` suffix would also admit hosts anyone can publish to (Sites,
Apps Script), which would defeat the guard. If the VAPID pair is missing, malformed, or not actually a
pair, push reads as "not available": the UI says so, delivery logs the variable names once and
touches neither the store nor the network, and no other caller of `serverEnv()` is affected. A
mismatched pair is caught before anything is claimed, because every push service would answer 403
and each failure would otherwise be counted against every device.

**The client is one serial queue.** Every operation on the browser's push subscription (enable,
disable, device sync, sign-out cleanup) runs through `createSerialQueue`, so a subscribe never
overlaps an unsubscribe and a background check never runs between `pushManager.subscribe` and the
marker write. `Notification.requestPermission()` is the first call in the click handler, before
the queue, because Safari ties the prompt to the tap. Every browser or server call is bounded so
one hung call cannot wedge the page: 15 seconds for a server call, 45 seconds for the browser's
`pushManager.subscribe` (the first one in a fresh Chromium profile was measured at 22 to 33
seconds, while registering with Google's push service), and a queue release of 60 seconds so a
slow subscribe is never released early. A subscription that arrives after its turn-on gave up is
ended, unless a retry has registered it. A localStorage marker (`cincy:push-device`, holding the user id
and the last sync time) is the only link between a browser subscription and a member; a
subscription with no marker, or with someone else's, is dropped. The route-change check refreshes
the server row at most once a day. **Sign-out deletes the server row immediately**: an app-level
wrapper (`app/account-controls.tsx`, because `features/auth` cannot import `features/push`) calls
the unsubscribe action while the session is still valid, then ends the browser subscription, waiting
at most 4 seconds. The lazy prune on 404 or 410 is the fallback, not the plan. When the VAPID key
changes, a browser that already granted permission **re-subscribes silently** and removes the old
row, so a member who dismissed the prompt for good does not quietly lose alerts. `isPushAvailable()`
is environment only, no cookies and no `web-push` import, so the root layout can pass "configured"
to the prompt without turning `/rules`, `/sports`, `/privacy` and `/terms` into dynamic pages. The
`VAPID_SUBJECT` is the site address (`https://www.cincysports.xyz`), so no personal email goes to
push services.

## Consequences

- A new topic needs an enum value in `PUSH_TOPICS` and in the SQL `push_topic` type (a compile-time
  check fails if they differ), a `profiles` column and its entry in `PUSH_TOPIC_COLUMN`, a builder,
  copy in `features/push/copy.ts` (a new topic does not compile without it), and a `CASE` arm in
  `push_targets`. A topic without an arm alerts nobody.
- Rotating the VAPID keys invalidates every subscription. A browser that already granted
  permission re-subscribes silently the next time it opens the site, but any member whose browser
  does not (permission revoked, app never reopened) must turn alerts back on. Lose the private key
  and this is the only way out, so it belongs in a password manager (Vercel sensitive values cannot
  be read back).
- Delivery is at most once. A key is claimed before the send, so a transient failure is not retried
  later and a run that crashes between claiming and sending loses that alert. That suits alerts that
  go stale within hours.
- Alert text passes, encrypted, through Apple, Google, Mozilla or Microsoft. Payloads are kept
  minimal, and the privacy page says so.
- `after()` shares the route's 60 second `maxDuration` with the response, so delivery has a 20
  second budget, plus a 3 second tail for recording outcomes. Sends run six at a time. The test
  alert has its own 8 second budget because a person is waiting.
- `web-push` is bundled only for the routes that send. Next registers every Server Action for every
  route, so a static route's server graph still lists the `web-push` chunk; it is never evaluated
  there (measured with a sentinel), and the client bundle contains none of it.

- A new real push host shows up as a refused host in the logs. Add it to the allow-list
  deliberately and as tightly as the two lists allow, with a test.

### Known limits

Stated plainly, none of them fixed in this change.

- **Overlapping sync runs can duplicate a score alert.** The 30-minute cron and an admin "Sync now"
  can both read the same pre-write state and each send an alert for the same points. Their run ids
  differ, so the ledger does not dedupe. The League feed already posts a duplicate score message in
  that case; that predates push. The fix is a per-sport lock or a skip-if-running check in
  `runs.start`.
- **Some points are never announced.** Points recorded outside a regular sync run
  (`refreshParticipants` before a free-agent move, the free-agent runs) produce no alert, and neither
  the feed post nor push will ever announce them.
- **No keys still costs a little.** With no VAPID keys every reaction does two small database reads
  after the response, plus one info log, because the build runs before delivery checks the config.
- **Deferred reads use the request's session client** inside `after()`. This was verified safe (docs,
  source, an experiment). A rare extra token refresh can happen and its cookie write fails
  silently, which is harmless because Supabase Auth accepts the old refresh token within its reuse
  interval.
- **"Also on N other devices" can undercount** while this browser's server row is missing. The
  daily refresh heals it, and so does a test alert that finds no row (it registers the device
  again).
- **Safari desktop ITP can lose the marker.** Script-writable storage is capped at 7 days there. A
  still-signed-in member whose marker was cleared has the subscription dropped as "no marker" and
  is asked again. A sturdier fix would be a "whose is this endpoint" action instead of dropping.
- **A forgotten device is cleaned up lazily.** When permission is revoked in browser settings, the
  browser side is cleaned up at once, but the marker stores no endpoint, so the server row goes when
  the push service next answers 404 or 410. The sign-out wrapper covers the common case.
- **A forged endpoint moves a row to the caller, by design.** It requires the victim's secret
  endpoint URL, the victim's browser cannot decrypt what the attacker's account sends, and nothing
  confidential leaks. Severity is low.
- **Reply and reaction alerts link to `/feed`**, not to the message.
- **Firefox `pushsubscriptionchange` is not handled.** The daily refresh covers it.
- **Focus ring contrast.** `--ring` (the brand color) gives about 1.4:1 on the dark canvas across
  the whole app. The push controls use a lighter ring of their own. Fixing the token is an
  app-wide follow-up.
- **Text clipping has two owners.** `domain/push` has a code-point-safe `clipText`, while the trades
  code still truncates by UTF-16 units and can split an emoji. One shared clipper in `src/domain`
  used by trades, free agents and push is a follow-up.
- **Not built:** updating the Home Screen email's "push alerts are coming soon" line, and a launch
  announcement email (`pnpm announce:*`). Both are follow-ups for after launch.
- **Not verified on real devices.** See "Known limits and follow-ups" in
  [docs/status.md](../status.md). Real iPhone, Android and Safari delivery, Apple's push service,
  and notification taps have not been exercised.

### Lessons from review that shaped the design

Kept because each one is easy to undo by accident.

- Counting every failure against a device would let a push-service outage, or a half-rotated key
  pair, prune every healthy device. Hence "rejections only" and the key-pair check before a claim.
- Postgres constraint errors quote the failing row, which here holds the endpoint and keys. Nothing
  in the push code logs an error object or `details`; the repository throws a `PushStorageError`
  with the operation and SQLSTATE only.
- "The session is null" is not "signed out". A phone that is offline when the app opens gets a null
  session from the auth client. Push reads the session through the shared `nextSessionState`, which
  treats only a `SIGNED_OUT` event or a definite empty read as a sign-out, because the wrong answer
  drops the subscription.
- Real browsers may return base64url keys with `=` padding, while the database requires exactly 87
  and 22 unpadded characters. The action's schema strips padding first.
- A URL check on `^/` is not enough: browsers read `/\evil.com` and `/<tab>/evil.com` as
  `//evil.com`. The same-origin rule rejects backslashes, whitespace and control characters, in the
  domain and in the worker.
- A static page must not call the push service in the layout. Reading cookies would make
  `/rules`, `/sports`, `/privacy` and `/terms` dynamic, so the layout gets one environment-only flag.
