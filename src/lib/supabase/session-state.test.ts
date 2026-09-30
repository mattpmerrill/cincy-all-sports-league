import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { nextSessionState, type BrowserSessionState } from "./session-state";

const loading: BrowserSessionState = { status: "loading" };
const signedOut: BrowserSessionState = { status: "signed_out" };
const signedIn = (userId: string): BrowserSessionState => ({ status: "signed_in", userId });
const session = (id: string) => ({ user: { id } });

describe("nextSessionState", () => {
  it("is signed in for any signal that carries a session", () => {
    expect(
      nextSessionState(loading, {
        source: "event",
        event: "INITIAL_SESSION",
        session: session("u1"),
      }),
    ).toEqual(signedIn("u1"));
    expect(
      nextSessionState(signedOut, { source: "read", session: session("u2"), error: null }),
    ).toEqual(signedIn("u2"));
  });

  it("keeps the same object when the member did not change, and follows a switch", () => {
    const prev = signedIn("u1");
    expect(nextSessionState(prev, { source: "read", session: session("u1"), error: null })).toBe(
      prev,
    );
    expect(nextSessionState(prev, { source: "read", session: session("u2"), error: null })).toEqual(
      signedIn("u2"),
    );
  });

  describe("a null session that is NOT proof of a sign-out", () => {
    it("an INITIAL_SESSION of null is ambiguous: the state stays", () => {
      expect(
        nextSessionState(loading, { source: "event", event: "INITIAL_SESSION", session: null }),
      ).toBe(loading);
      const prev = signedIn("u1");
      expect(
        nextSessionState(prev, { source: "event", event: "INITIAL_SESSION", session: null }),
      ).toBe(prev);
    });

    it("a getSession() failing with a retryable network error keeps the state (regression: it dropped push subscriptions)", () => {
      const error = new AuthRetryableFetchError("fetch failed", 0);
      expect(nextSessionState(loading, { source: "read", session: null, error })).toBe(loading);
      const prev = signedIn("u1");
      expect(nextSessionState(prev, { source: "read", session: null, error })).toBe(prev);
    });
  });

  describe("a null session that IS a sign-out", () => {
    it("a SIGNED_OUT event resolves (a dead refresh token emits one)", () => {
      expect(
        nextSessionState(signedIn("u1"), { source: "event", event: "SIGNED_OUT", session: null }),
      ).toEqual(signedOut);
    });

    it("a getSession() with no session and no error resolves (a Server Action sign-out, or a visitor)", () => {
      expect(
        nextSessionState(signedIn("u1"), { source: "read", session: null, error: null }),
      ).toEqual(signedOut);
      expect(nextSessionState(loading, { source: "read", session: null, error: null })).toEqual(
        signedOut,
      );
    });

    it("a non-retryable error resolves signed out", () => {
      const error = new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found");
      expect(nextSessionState(signedIn("u1"), { source: "read", session: null, error })).toEqual(
        signedOut,
      );
    });

    it("keeps the same object when already signed out", () => {
      expect(nextSessionState(signedOut, { source: "read", session: null, error: null })).toBe(
        signedOut,
      );
    });
  });
});
