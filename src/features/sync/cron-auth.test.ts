import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

const SECRET = "s3cret-value-that-is-long-enough";

describe("isAuthorizedCronRequest", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["a missing header", null],
    ["an empty header", ""],
    ["the bare secret", SECRET],
    ["a wrong secret", "Bearer nope"],
    ["a longer secret", `Bearer ${SECRET}x`],
    ["a shorter secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["another scheme", `Basic ${SECRET}`],
    ["different casing", `bearer ${SECRET}`],
  ])("rejects %s", (_name, header) => {
    expect(isAuthorizedCronRequest(header, SECRET)).toBe(false);
  });
});
