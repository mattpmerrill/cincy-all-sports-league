import { describe, expect, it } from "vitest";
import { messageBodySchema } from "./body";

describe("messageBodySchema", () => {
  it("trims, and rejects empty or whitespace-only text", () => {
    expect(messageBodySchema.parse("  hello  ")).toBe("hello");
    expect(messageBodySchema.safeParse("   \n ").success).toBe(false);
  });

  it("allows exactly 500 characters and rejects 501", () => {
    expect(messageBodySchema.safeParse("a".repeat(500)).success).toBe(true);
    expect(messageBodySchema.safeParse("a".repeat(501)).success).toBe(false);
  });

  it("keeps line breaks and markup as plain text for the UI to escape", () => {
    expect(messageBodySchema.parse("a\n<b>b</b>")).toBe("a\n<b>b</b>");
  });
});
