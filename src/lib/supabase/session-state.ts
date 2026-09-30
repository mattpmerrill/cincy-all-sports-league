import { isAuthRetryableFetchError, type AuthChangeEvent } from "@supabase/supabase-js";

/**
 * What a browser knows about who is signed in. `loading` is "not known yet" and stays that way
 * when the answer is unreliable; it is never a synonym for signed out.
 */
export type BrowserSessionState =
  { status: "loading" } | { status: "signed_out" } | { status: "signed_in"; userId: string };

type SessionLike = { user: { id: string } } | null;

/** Something the auth client told us: a change event, or the result of `getSession()`. */
export type SessionSignal =
  | { source: "event"; event: AuthChangeEvent; session: SessionLike }
  | { source: "read"; session: SessionLike; error: unknown };

/**
 * The next state after a signal. One implementation for every client that mirrors the session
 * (the header's account menu, the push device checks), because the wrong answer is not harmless:
 * push drops a device's subscription on "signed out".
 *
 * The auth client reports `null` for a session it could not refresh. When the stored access
 * token has expired and the refresh fails with a retryable network error (an offline phone, an
 * auth outage), `getSession()` returns `{ session: null, error }` and the initial event carries
 * `null` too, yet the member is still signed in. So a null session only means "signed out" when
 * something says so for certain:
 *   - a `SIGNED_OUT` event (a dead refresh token emits one),
 *   - a `getSession()` that returned no session and no retryable error (a Server Action sign-out
 *     clears the cookie and lands here).
 * An `INITIAL_SESSION` of null is ambiguous, and so is a retryable error: both keep the state.
 */
export function nextSessionState(
  prev: BrowserSessionState,
  signal: SessionSignal,
): BrowserSessionState {
  if (signal.session) {
    const userId = signal.session.user.id;
    // Same object when nothing changed, so effects keyed on the state do not re-run.
    return prev.status === "signed_in" && prev.userId === userId
      ? prev
      : { status: "signed_in", userId };
  }
  const signedOut: BrowserSessionState =
    prev.status === "signed_out" ? prev : { status: "signed_out" };
  if (signal.source === "event") return signal.event === "SIGNED_OUT" ? signedOut : prev;
  return isAuthRetryableFetchError(signal.error) ? prev : signedOut;
}
