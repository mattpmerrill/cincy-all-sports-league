import { z } from "zod";
import { displayNameSchema } from "@/domain/membership/display-name";

/** Supabase hashes passwords with bcrypt, which ignores everything past 72 bytes. */
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.");

// Normalized before validation: pasted addresses often carry stray spaces, and Supabase treats
// emails case-insensitively.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email is too long."));

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email,
  password,
});

export const signInSchema = z.object({
  email,
  // No strength rules on sign-in: an old password must still work.
  password: z.string().min(1, "Enter your password.").max(72, "That password is too long."),
});

export const resetRequestSchema = z.object({
  email,
});

export const updatePasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });
