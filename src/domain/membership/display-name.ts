import { z } from "zod";

export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * Trimmed, and required after trimming: the profiles table rejects blank names too, so this gives
 * a readable message before the database would give an error.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(DISPLAY_NAME_MAX_LENGTH, `Use ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`);
