import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/me", "/me"],
    ["/admin/members?tab=1#top", "/admin/members?tab=1#top"],
    ["/teams/coop-doggies", "/teams/coop-doggies"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input, "/fallback")).toBe(expected);
  });

  it.each([
    ["absolute URL", "https://evil.com/steal"],
    ["protocol-relative", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["encoded-looking backslash path", "/\\/evil.com"],
    ["tab-smuggled host", "/\t/evil.com"],
    ["newline", "/me\n/evil"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative without slash", "me"],
    ["empty", ""],
  ])("falls back for %s", (_label, input) => {
    expect(safeNextPath(input, "/fallback")).toBe("/fallback");
  });

  it("falls back for non-strings", () => {
    expect(safeNextPath(null, "/fallback")).toBe("/fallback");
    expect(safeNextPath(undefined, "/fallback")).toBe("/fallback");
    expect(safeNextPath(["/me"], "/fallback")).toBe("/fallback");
  });

  it("defaults the fallback to the home page", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
  });
});
