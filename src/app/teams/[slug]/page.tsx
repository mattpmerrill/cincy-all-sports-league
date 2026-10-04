import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/features/auth/guards";
import { PickCard } from "@/features/fantasy-teams/components/pick-card";
import {
  TeamMatchupsSection,
  TeamMatchupSummary,
} from "@/features/matchups/components/team-matchups";
import { getSafeMatchupReads } from "@/features/matchups/matchups.server";
import { TeamHeader } from "@/features/fantasy-teams/components/team-header";
import { getTeamDetail } from "@/features/fantasy-teams/fantasy-teams.server";
import { TeamWeekCard } from "@/features/schedule/components/team-week-card";
import { getTeamWeekOrNull } from "@/features/schedule/schedule.server";
import { PageMain } from "@/ui/page";

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const team = await getTeamDetail((await params).slug);
  return { title: team?.name ?? "Team not found" };
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  const [team, user, week, matchupsResult] = await Promise.all([
    getTeamDetail(slug),
    getCurrentUser(),
    getTeamWeekOrNull(slug),
    getSafeMatchupReads().teamMatchups(slug),
  ]);
  if (!team) notFound();
  // Like "This week": secondary to the picks, so a failed read leaves the section out.
  const matchups = matchupsResult.ok ? matchupsResult.value : null;

  const isMine = user !== null && team.owner?.id === user.id;

  return (
    <PageMain width="wide">
      <TeamHeader team={team} isMine={isMine}>
        {matchups ? <TeamMatchupSummary matchups={matchups} /> : null}
      </TeamHeader>
      {/* Above the picks: what is on this week is the first thing a visitor wants to know, and the
          eleven pick cards below it are a long scroll on a phone. */}
      {week ? <TeamWeekCard week={week} /> : null}
      <section aria-label="Picks" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {team.picks.map((pick, index) => (
          <PickCard
            key={pick.sport}
            pick={pick}
            index={index}
            footer={
              isMine && pick.movable ? (
                <Link
                  href={`/free-agents/${pick.sport}`}
                  className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  Drop / add
                  <span className="sr-only"> {pick.sportName} pick</span>
                </Link>
              ) : undefined
            }
          />
        ))}
      </section>
      {matchups ? <TeamMatchupsSection matchups={matchups} /> : null}
    </PageMain>
  );
}
