import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

describe("parsePublicEnv", () => {
  it("accepts a complete environment", () => {
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "https://example.com" })).toEqual({
      ...valid,
      NEXT_PUBLIC_SITE_URL: "https://example.com",
    });
  });

  it("falls back to localhost when the site URL is unset", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("names the bad variables without echoing their values", () => {
    const attempt = () =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url-secret" });
    expect(attempt).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(attempt).not.toThrow(/not-a-url-secret/);
  });

  it("rejects a missing key", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(/PUBLISHABLE_KEY/);
  });
});
