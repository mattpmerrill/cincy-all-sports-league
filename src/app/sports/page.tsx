import type { Metadata } from "next";
import { SportTile } from "@/features/sports/components/sport-tile";
import { listSports } from "@/features/sports/sports.server";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";

export const metadata: Metadata = { title: "Sports" };

export default async function SportsPage() {
  const sports = await listSports();
  return (
    <PageMain width="wide">
      <PageHeader
        title="Sports"
        description="Every team has one pick in each of these 11 sports."
      />
      {sports.length === 0 ? (
        <EmptyState title="No sports yet" description="They appear once a season is set up." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((sport, index) => (
            <SportTile key={sport.code} sport={sport} index={index} />
          ))}
        </ul>
      )}
    </PageMain>
  );
}
