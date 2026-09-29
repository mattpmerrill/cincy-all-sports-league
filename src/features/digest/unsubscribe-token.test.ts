import { describe, expect, it } from "vitest";
import {
  signPurposeToken,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const SECRET = "a-signing-secret-of-at-least-32-characters";
const USER = "6f1d2c1e-8a44-4f57-9a3b-0c1d2e3f4a5b";
const OTHER = "0b9f6a52-1d3e-4c5b-8a7f-123456789abc";

describe("unsubscribe token", () => {
  it("round-trips the user id", () => {
    const token = signUnsubscribeToken(USER, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER);
  });

  it("is url-safe so it survives an email link", () => {
    expect(signUnsubscribeToken(USER, SECRET)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("rejects a token signed with another secret", () => {
    const token = signUnsubscribeToken(USER, "another-secret-that-is-also-32-chars-long");
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it("rejects a payload swapped to another user while keeping the old signature", () => {
    const [, signature] = signUnsubscribeToken(USER, SECRET).split(".") as [string, string];
    const [forgedPayload] = signUnsubscribeToken(OTHER, SECRET).split(".") as [string, string];
    expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects a flipped signature character and a truncated signature", () => {
    const token = signUnsubscribeToken(USER, SECRET);
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyUnsubscribeToken(flipped, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token.slice(0, -4), SECRET)).toBeNull();
  });

  it("rejects a correctly signed token minted for a different purpose", () => {
    const token = signPurposeToken(USER, "something_else", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "not base64!.also not"])("rejects garbage %j", (junk) => {
    expect(verifyUnsubscribeToken(junk, SECRET)).toBeNull();
  });
});
