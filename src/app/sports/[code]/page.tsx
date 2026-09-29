import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSportCode, SPORTS } from "@/domain/sports/sports";
import { getCurrentUser } from "@/features/auth/guards";
import { SportHeader } from "@/features/sports/components/sport-header";
import { SportPickRow } from "@/features/sports/components/sport-pick-row";
import { getSportView } from "@/features/sports/sports.server";
import { PageMain } from "@/ui/page";

export async function generateMetadata({ params }: PageProps<"/sports/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: isSportCode(code) ? SPORTS[code].name : "Sport not found" };
}

export default async function SportPage({ params }: PageProps<"/sports/[code]">) {
  const { code } = await params;
  if (!isSportCode(code)) notFound();
  const [sport, user] = await Promise.all([getSportView(code), getCurrentUser()]);
  if (!sport) notFound();

  return (
    <PageMain
      width="wide"
      className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-8"
    >
      <SportHeader sport={sport} />
      <ol aria-label={`${sport.name} picks, ranked`} className="flex flex-col gap-2.5">
        {sport.picks.map((pick, index) => (
          <SportPickRow
            key={pick.teamSlug}
            pick={pick}
            sport={sport.code}
            index={index}
            isMine={user !== null && pick.owner?.id === user.id}
          />
        ))}
      </ol>
    </PageMain>
  );
}
