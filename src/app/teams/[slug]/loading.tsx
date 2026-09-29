import { TeamSkeleton } from "@/features/fantasy-teams/components/team-skeleton";
import { PageMain } from "@/ui/page";

export default function Loading() {
  return (
    <PageMain width="wide">
      <TeamSkeleton />
    </PageMain>
  );
}
