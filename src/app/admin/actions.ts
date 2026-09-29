"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUsersService } from "@/features/admin-users/admin-users.server";
import { changeRoleSchema } from "@/features/admin-users/schemas";
import { requireAdmin } from "@/features/auth/guards";
import { getClaimsService } from "@/features/claims/claims.server";
import { reviewClaimSchema } from "@/features/claims/schemas";
import { formError, formSuccess, formText, zodFormError, type FormState } from "@/lib/form-state";

// Admin-only transport. requireAdmin() runs on every call; the services and the SQL functions
// check the role again, so a bypass at one layer is not a bypass of the system.

async function review(formData: FormData, decision: "approve" | "reject"): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = reviewClaimSchema.safeParse({ claimId: formText(formData, "claimId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const claims = await getClaimsService();
  const result =
    decision === "approve"
      ? await claims.approveClaim(admin.value, parsed.data.claimId)
      : await claims.rejectClaim(admin.value, parsed.data.claimId);

  revalidatePath("/admin");
  revalidatePath("/me");
  if (!result.ok) return formError(result.error.message);
  return formSuccess(decision === "approve" ? "Claim approved." : "Claim rejected.");
}

export async function approveClaimAction(_prev: FormState, formData: FormData) {
  return review(formData, "approve");
}

export async function rejectClaimAction(_prev: FormState, formData: FormData) {
  return review(formData, "reject");
}

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return formError(admin.error.message);

  const parsed = changeRoleSchema.safeParse({
    userId: formText(formData, "userId"),
    role: formText(formData, "role"),
  });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (
    await getAdminUsersService()
  ).setRole(admin.value, parsed.data.userId, parsed.data.role);
  revalidatePath("/admin/members");
  if (!result.ok) return formError(result.error.message);
  // Stepping down removes access to this very page, so leave rather than re-render into a 404.
  if (parsed.data.userId === admin.value.id && parsed.data.role !== "admin") redirect("/me");
  return formSuccess(parsed.data.role === "admin" ? "Promoted to admin." : "Changed to member.");
}
