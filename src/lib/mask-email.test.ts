import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("sam@example.com")).toBe("s***@example.com");
    expect(maskEmail("nonsense")).toBe("***");
  });
});
