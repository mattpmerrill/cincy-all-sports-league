import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SPORTS } from "@/domain/sports/sports";
import { getCurrentUser } from "@/features/auth/guards";
import { CurrentPickCard } from "@/features/free-agents/components/current-pick-card";
import { FreeAgentList } from "@/features/free-agents/components/free-agent-list";
import { FreeAgentsJoinPrompt } from "@/features/free-agents/components/free-agents-join-prompt";
import { getFreeAgentsReader } from "@/features/free-agents/free-agents.server";
import { sportParamSchema } from "@/features/free-agents/schemas";
import { Alert } from "@/ui/alert";
import { MovesSwitch } from "@/ui/moves-switch";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";
import { makeMoveAction } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/free-agents/[sport]">): Promise<Metadata> {
  const parsed = sportParamSchema.safeParse((await params).sport);
  return { title: parsed.success ? `${SPORTS[parsed.data].name} free agents` : "Sport not found" };
}

export default async function SportFreeAgentsPage({ params }: PageProps<"/free-agents/[sport]">) {
  const parsed = sportParamSchema.safeParse((await params).sport);
  if (!parsed.success) notFound();
  const sport = parsed.data;

  const user = await getCurrentUser();
  const board = await (await getFreeAgentsReader()).getSportBoard(user, sport);
  const name = SPORTS[sport].name;

  const back = (
    <Link
      href="/free-agents"
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-md text-sm font-medium text-text-muted outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      All sports
    </Link>
  );

  if (!board) {
    return (
      <PageMain>
        {back}
        <PageHeader title={`${name} free agents`} />
        <EmptyState
          title="No season yet"
          description="Free agents appear once a season is set up."
        />
      </PageMain>
    );
  }

  // A lock applies to everyone; otherwise only members who cannot act need to hear why.
  const notice = board.lockedReason ?? (board.myTeam && !board.canAct ? board.blockedReason : null);

  return (
    <PageMain>
      {back}
      <PageHeader
        title={`${name} free agents`}
        description={
          board.canAct
            ? "Choose someone to swap for your pick. Their points so far don't count for you."
            : "Free agents you can add, best first."
        }
      />

      <MovesSwitch current="free-agents" />

      {board.myTeam ? null : <FreeAgentsJoinPrompt signedIn={user !== null} />}

      {board.myPick && board.myTeam ? (
        <CurrentPickCard
          pick={board.myPick}
          sportName={name}
          kind={SPORTS[sport].participantKind}
          status={board.status}
        />
      ) : null}

      {notice ? <Alert variant="info">{notice}</Alert> : null}

      <FreeAgentList
        sport={sport}
        sportName={name}
        kind={SPORTS[sport].participantKind}
        rows={board.freeAgents}
        dropped={board.canAct ? board.myPick : null}
        sideEffects={board.sideEffects}
        action={makeMoveAction}
      />
    </PageMain>
  );
}
