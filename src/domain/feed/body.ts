import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 500;

/** Trimmed, 1..500 characters: the same bounds the database CHECK enforces. */
export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(MESSAGE_MAX_LENGTH, `Keep it to ${MESSAGE_MAX_LENGTH} characters.`);
