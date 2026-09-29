import { describe, expect, it } from "vitest";
import { resetRequestSchema, signInSchema, signUpSchema, updatePasswordSchema } from "./schemas";

describe("signUpSchema", () => {
  const valid = { displayName: "  Matt M  ", email: " Matt@Example.COM ", password: "longenough1" };

  it("trims the name and normalizes the email", () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed).toMatchObject({ displayName: "Matt M", email: "matt@example.com" });
  });

  it("rejects a blank name, a bad email and a short password with per-field errors", () => {
    const result = signUpSchema.safeParse({ displayName: "   ", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors).sort()).toEqual([
        "displayName",
        "email",
        "password",
      ]);
    }
  });

  it("caps the password at bcrypt's 72 bytes", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "a".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, password: "a".repeat(72) }).success).toBe(true);
  });
});

describe("signInSchema", () => {
  it("does not apply strength rules, so old short passwords can still sign in", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("requires a password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("resetRequestSchema", () => {
  it("requires a valid email", () => {
    expect(resetRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(resetRequestSchema.parse({ email: "A@B.co" }).email).toBe("a@b.co");
  });
});

describe("updatePasswordSchema", () => {
  it("requires the confirmation to match, reporting on the confirmation field", () => {
    const result = updatePasswordSchema.safeParse({
      password: "longenough1",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("accepts matching, long-enough passwords", () => {
    expect(
      updatePasswordSchema.safeParse({ password: "longenough1", confirmPassword: "longenough1" })
        .success,
    ).toBe(true);
  });
});
