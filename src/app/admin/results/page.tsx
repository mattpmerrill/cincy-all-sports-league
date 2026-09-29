import type { Metadata } from "next";
import { requireAdminOrNotFound } from "@/features/auth/guards";
import { getResultsAdminService } from "@/features/results-admin/results-admin.server";
import { SyncHealthPanel } from "@/features/results-admin/components/sync-health-panel";
import { PageSection } from "@/ui/page";
import { syncNowAction } from "./actions";

export const metadata: Metadata = { title: "Admin: results" };

// "Sync now" runs a real sync inside this route's server action.
export const maxDuration = 60;

export default async function AdminResultsPage() {
  const admin = await requireAdminOrNotFound("/admin/results");
  const result = await (await getResultsAdminService()).getSyncHealth(admin);
  if (!result.ok) throw new Error(`Unexpected ${result.error.code} loading sync health`);

  return (
    <PageSection
      title="Sync health"
      description="Scores sync from ESPN every 30 minutes. Open a sport to correct or lock a result."
    >
      <SyncHealthPanel health={result.value} now={new Date()} syncAction={syncNowAction} />
    </PageSection>
  );
}
