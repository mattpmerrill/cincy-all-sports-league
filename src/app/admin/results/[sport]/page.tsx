import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isSportCode, SPORTS } from "@/domain/sports/sports";
import { requireAdminOrNotFound } from "@/features/auth/guards";
import { SportResultsEditor } from "@/features/results-admin/components/sport-results-editor";
import { SyncNowForm } from "@/features/results-admin/components/sync-now-form";
import { getResultsAdminService } from "@/features/results-admin/results-admin.server";
import { PageSection } from "@/ui/page";
import {
  deleteResultAction,
  saveResultAction,
  setResultLockedAction,
  syncNowAction,
} from "../actions";

export const metadata: Metadata = { title: "Admin: sport results" };

export const maxDuration = 60;

export default async function AdminSportResultsPage({
  params,
}: PageProps<"/admin/results/[sport]">) {
  const { sport } = await params;
  if (!isSportCode(sport)) notFound();
  const admin = await requireAdminOrNotFound(`/admin/results/${sport}`);

  const result = await (await getResultsAdminService()).getSportView(admin, sport);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    throw new Error(`Unexpected ${result.error.code} loading ${sport} results`);
  }
  const name = SPORTS[sport].name;

  return (
    <PageSection
      title={`${name} results`}
      description="Locked results are never changed by sync. Anything you add is locked unless you untick it."
    >
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href="/admin/results"
          className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          All sports
        </Link>
        <SyncNowForm sport={sport} sportName={name} action={syncNowAction} />
      </div>
      <SportResultsEditor
        sport={sport}
        rules={result.value.rules}
        participants={result.value.participants}
        actions={{
          save: saveResultAction,
          remove: deleteResultAction,
          lock: setResultLockedAction,
        }}
      />
    </PageSection>
  );
}
