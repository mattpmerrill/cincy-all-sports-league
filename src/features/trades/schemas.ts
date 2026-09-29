import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";

/** Longest note an offer can carry; the database column has the same limit. */
export const NOTE_MAX_LENGTH = 140;

/**
 * Forms submit sports as repeated `sport` checkbox fields (`<input type="checkbox" name="sport"
 * value="nfl">`). `formSports` reads them all; the schema then checks each one and rejects
 * repeats, so the UI never has to.
 */
export const SPORT_FIELD = "sport";

export const formSports = (data: FormData): string[] =>
  data.getAll(SPORT_FIELD).filter((v): v is string => typeof v === "string");

export const sportsSchema = z
  .array(z.enum(SPORT_CODES, "Pick a valid sport."))
  .min(1, "Pick at least one sport.")
  .max(SPORT_CODES.length)
  .refine(
    (sports) => new Set(sports).size === sports.length,
    "Each sport can only be picked once.",
  );

/** Trimmed; an empty note is no note. */
export const noteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX_LENGTH, `Keep the note to ${NOTE_MAX_LENGTH} characters.`)
  .transform((note) => (note === "" ? null : note));

export const createListingSchema = z.object({ sports: sportsSchema });

export const proposeDirectSchema = z.object({
  teamId: z.uuid("Choose a team."),
  sports: sportsSchema,
  note: noteSchema,
});

export const makeOfferSchema = z.object({
  listingId: z.uuid("That listing isn't valid."),
  sports: sportsSchema,
  note: noteSchema,
});

export const offerIdSchema = z.object({ offerId: z.uuid("That offer isn't valid.") });

export const listingIdSchema = z.object({ listingId: z.uuid("That listing isn't valid.") });

/** The `[id]` route segment. A malformed one just means "no such listing". */
export const listingParamSchema = z.uuid();

/** Key in a failed `FormState.data` that carries the listing blocking an `already_listed` error. */
export const BLOCKING_LISTING_KEY = "blockingListingId";
