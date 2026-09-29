import type { Metadata } from "next";
import Link from "next/link";
import { requireUserOrRedirect } from "@/features/auth/guards";
import { TradeModeSwitch } from "@/features/trades/components/mode-switch";
import { BlockForm, DirectForm } from "@/features/trades/components/trade-forms";
import { newTradeSearchSchema } from "@/features/trades/schemas";
import { getTradesService } from "@/features/trades/trades.server";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";
import { createListingAction, proposeDirectAction } from "../actions";

export const metadata: Metadata = { title: "New trade" };

export default async function NewTradePage({ searchParams }: PageProps<"/trades/new">) {
  const user = await requireUserOrRedirect("/trades/new");
  const { mode, team } = newTradeSearchSchema.parse(await searchParams);
  const options = await (await getTradesService()).getNewTradeOptions(user);

  if (!options) {
    return (
      <PageMain>
        <PageHeader title="New trade" description="Swap players with other teams." />
        <EmptyState
          title="Claim your team first"
          description="You need an approved team before you can trade. Claim yours on your profile."
        />
        <Link
          href="/me"
          className="self-start font-medium text-brand-bright underline-offset-4 hover:underline"
        >
          Go to your profile
        </Link>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <PageHeader
        title="New trade"
        description={`Trading as ${options.myTeam.name}. One player for one player, same sport.`}
      />
      <TradeModeSwitch mode={mode} />
      {mode === "block" ? (
        <BlockForm picks={options.myPicks} action={createListingAction} />
      ) : (
        <DirectForm
          teams={options.teams}
          defaultTeamId={team ?? null}
          action={proposeDirectAction}
        />
      )}
    </PageMain>
  );
}
