# integrations

One adapter per outside vendor (today: `espn/`, `resend/`, `webpush/`). Handles timeouts, bounded retries and schema validation, and returns domain types so vendor shapes never leak. Only `features` may import from here.

`webpush/` sends Web Push alerts. `send.ts` wraps the `web-push` library (VAPID signing and payload encryption only) and does the request through our own `fetch`; `deliver.ts` is the orchestration (find devices, claim the dedupe key, send, prune) behind the `PushStore` port declared in `domain/push`; `notifier.ts` is the `PushNotifier` a feature calls, running delivery after the response. `test-utils.ts` decrypts what was sent so tests can check it.
