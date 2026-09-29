import type { Metadata } from "next";
import { getCurrentUser } from "@/features/auth/guards";
import { FreeAgentsJoinPrompt } from "@/features/free-agents/components/free-agents-join-prompt";
import { RecentMoves } from "@/features/free-agents/components/recent-moves";
import { SportPicker } from "@/features/free-agents/components/sport-picker";
import { getFreeAgentsReader } from "@/features/free-agents/free-agents.server";
import { MovesSwitch } from "@/ui/moves-switch";
import { EmptyState, PageHeader, PageMain, PageSection } from "@/ui/page";

export const metadata: Metadata = { title: "Free agents" };

export default async function FreeAgentsPage() {
  const user = await getCurrentUser();
  const hub = await (await getFreeAgentsReader()).getHub(user);
  const now = new Date();

  return (
    <PageMain width="wide">
      <PageHeader
        title="Free agents"
        description="Drop your pick in a sport and add a free agent. It happens right away."
      />

      <MovesSwitch current="free-agents" />

      {hub.myTeam ? null : <FreeAgentsJoinPrompt signedIn={user !== null} />}

      {hub.sports.length === 0 ? (
        <EmptyState
          title="No season yet"
          description={hub.blockedReason ?? "Free agents appear once a season is set up."}
        />
      ) : (
        <>
          <PageSection
            title="Pick a sport"
            description="Each team holds one pick per sport. Choose a sport to see who is free."
          >
            <SportPicker sports={hub.sports} />
          </PageSection>

          <PageSection title="Recent moves" description="The latest drops and pickups.">
            <RecentMoves moves={hub.recentMoves} now={now} />
          </PageSection>
        </>
      )}
    </PageMain>
  );
}
