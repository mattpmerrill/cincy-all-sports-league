"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/guards";
import { getResultsAdminService } from "@/features/results-admin/results-admin.server";
import {
  deleteResultSchema,
  isChecked,
  lockResultSchema,
  saveResultSchema,
  syncNowSchema,
} from "@/features/results-admin/schemas";
import { getSyncService } from "@/features/sync/sync.server";
import { SPORTS } from "@/domain/sports/sports";
import { formError, formSuccess, formText, zodFormError, type FormState } from "@/lib/form-state";
import { revalidateLeague } from "@/lib/league-cache";
import { logger, newCorrelationId } from "@/lib/logger";

// Admin-only transport. requireAdmin() runs on every call; the service and RLS check again.

function refresh(sport: string) {
  revalidatePath("/admin/results");
  revalidatePath(`/admin/results/${sport}`);
  // A correction changes standings, so the public pages must not keep serving the old read.
  revalidateLeague();
}

export async function saveResultAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = saveResultSchema.safeParse({
    sport: formText(formData, "sport"),
    id: formText(formData, "id"),
    participantId: formText(formData, "participantId"),
    ruleId: formText(formData, "ruleId"),
    quantity: formText(formData, "quantity"),
    eventLabel: formText(formData, "eventLabel"),
    locked: isChecked(formData, "locked"),
  });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getResultsAdminService()).saveResult(admin.value, parsed.data);
  if (!result.ok) return formError(result.error.message);
  refresh(parsed.data.sport);
  return formSuccess(parsed.data.id ? "Result updated." : "Result added.");
}

export async function deleteResultAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = deleteResultSchema.safeParse({ resultId: formText(formData, "resultId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (
    await getResultsAdminService()
  ).deleteResult(admin.value, parsed.data.resultId);
  if (!result.ok) return formError(result.error.message);
  refresh(formText(formData, "sport"));
  return formSuccess("Result deleted.");
}

export async function setResultLockedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = lockResultSchema.safeParse({
    resultId: formText(formData, "resultId"),
    locked: formText(formData, "locked") === "on",
  });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (
    await getResultsAdminService()
  ).setLocked(admin.value, parsed.data.resultId, parsed.data.locked);
  if (!result.ok) return formError(result.error.message);
  refresh(formText(formData, "sport"));
  return formSuccess(parsed.data.locked ? "Locked." : "Unlocked.");
}

/** Runs the same service as the cron route for one sport; the secret-key client is server-only. */
export async function syncNowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = syncNowSchema.safeParse({ sport: formText(formData, "sport") });
  if (!parsed.success) return zodFormError(parsed.error);

  try {
    const report = await getSyncService().syncLeague({
      now: new Date(),
      sports: [parsed.data.sport],
    });
    refresh(parsed.data.sport);
    const outcome = report.sports[0];
    const name = SPORTS[parsed.data.sport].name;
    if (!outcome) return formError(`${name} isn't part of the active season.`);
    if (outcome.status === "skipped") {
      return formSuccess(
        outcome.code === "after_season_end"
          ? `${name} season is over; nothing to sync.`
          : `${name} hasn't started; nothing to sync.`,
      );
    }
    if (outcome.status === "failed") {
      return formError(`${name} sync failed (${outcome.code ?? "error"}). See the log above.`);
    }
    return formSuccess(`${name} synced: ${outcome.upserted} written, ${outcome.deleted} removed.`);
  } catch (error) {
    const correlationId = newCorrelationId();
    logger.error("sync now failed", { correlationId, error });
    return formError(`Sync failed. Reference ${correlationId}.`);
  }
}
