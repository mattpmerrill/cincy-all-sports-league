import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";

const sport = z.enum(SPORT_CODES, "Choose a sport.");

/** Create when `id` is blank, edit otherwise. Quantity and label are checked against the rule. */
export const saveResultSchema = z.object({
  sport,
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  participantId: z.uuid("Choose a participant."),
  ruleId: z.uuid("Choose a result type."),
  quantity: z.string().max(12),
  eventLabel: z.string().max(200),
  locked: z.boolean(),
});
export type SaveResultInput = z.infer<typeof saveResultSchema>;

export const deleteResultSchema = z.object({ resultId: z.uuid("That result isn't valid.") });

export const lockResultSchema = z.object({
  resultId: z.uuid("That result isn't valid."),
  locked: z.boolean(),
});

export const syncNowSchema = z.object({ sport });

/** Reads a checkbox: present in FormData only when ticked. */
export const isChecked = (data: FormData, name: string) => data.get(name) === "on";

/** What a stored sync_runs.summary is expected to look like. Everything is optional: old or
 * partial rows must still render. */
export const runSummarySchema = z.object({
  upserted: z.number().optional(),
  deleted: z.number().optional(),
  unchanged: z.number().optional(),
  unmatchedExternalIds: z.array(z.string()).optional(),
  missingExternalIds: z.number().optional(),
  reason: z.string().optional(),
  error: z.object({ code: z.string(), message: z.string() }).partial().optional(),
});
