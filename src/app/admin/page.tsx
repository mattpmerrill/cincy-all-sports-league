import type { Metadata } from "next";
import { requireAdminOrNotFound } from "@/features/auth/guards";
import { getClaimsService } from "@/features/claims/claims.server";
import { PendingClaimsList } from "@/features/claims/components/pending-claims-list";
import { PageSection } from "@/ui/page";
import { approveClaimAction, rejectClaimAction } from "./actions";

export const metadata: Metadata = { title: "Admin: claims" };

export default async function AdminClaimsPage() {
  const admin = await requireAdminOrNotFound("/admin");
  const result = await (await getClaimsService()).listPendingClaims(admin);
  // requireAdminOrNotFound already refused non-admins; a forbidden here means roles changed
  // mid-request, so treat it the same way.
  if (!result.ok) throw new Error(`Unexpected ${result.error.code} listing claims`);

  return (
    <PageSection
      title="Team claims"
      description="Approve a claim to make that member the team's owner."
    >
      <PendingClaimsList
        claims={result.value}
        approveAction={approveClaimAction}
        rejectAction={rejectClaimAction}
      />
    </PageSection>
  );
}
