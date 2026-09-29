"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/guards";
import { getClaimsService } from "@/features/claims/claims.server";
import { claimTeamSchema } from "@/features/claims/schemas";
import { getProfileService } from "@/features/profile/profile.server";
import { updateDisplayNameSchema, weeklyEmailSchema } from "@/features/profile/schemas";
import {
  echoFields,
  formError,
  formSuccess,
  formText,
  zodFormError,
  type FormState,
} from "@/lib/form-state";

// Transport and auth for the member's own screen. Each action re-checks the session: a Server
// Action is a public POST endpoint, and the proxy is not an authorization boundary.

export async function updateDisplayNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = updateDisplayNameSchema.safeParse({
    displayName: formText(formData, "displayName"),
  });
  const echo = echoFields(formData, "displayName");
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const result = await (
    await getProfileService()
  ).updateDisplayName(user.value, parsed.data.displayName);
  if (!result.ok) return formError(result.error.message, undefined, echo);
  revalidatePath("/me");
  return formSuccess("Name updated.");
}

export async function claimTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = claimTeamSchema.safeParse({ teamId: formText(formData, "teamId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getClaimsService()).submitClaim(user.value, parsed.data.teamId);
  revalidatePath("/me");
  if (!result.ok) return formError(result.error.message);
  return formSuccess("Request sent. An admin will review it soon.");
}

export async function setWeeklyEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = weeklyEmailSchema.safeParse({ optIn: formText(formData, "optIn") });
  if (!parsed.success) return zodFormError(parsed.error);

  const optIn = parsed.data.optIn === "true";
  const result = await (await getProfileService()).setWeeklyEmail(user.value, optIn);
  if (!result.ok) return formError(result.error.message);
  revalidatePath("/me");
  return formSuccess(optIn ? "Weekly email is on." : "Weekly email is off.");
}
