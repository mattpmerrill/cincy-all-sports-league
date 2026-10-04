import type { Metadata } from "next";
import { RuleNotes } from "@/features/rules/components/rule-notes";
import { SportRulesCard } from "@/features/rules/components/sport-rules-card";
import { getRules } from "@/features/rules/rules.server";
import { EmptyState, PageHeader, PageMain } from "@/ui/page";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  const rules = await getRules();
  if (!rules) {
    return (
      <PageMain>
        <EmptyState
          title="No rules yet"
          description="The scoring table appears once a season is set up."
        />
      </PageMain>
    );
  }
  return (
    <PageMain width="wide">
      <PageHeader
        title="Rules"
        description={`How points are earned in the ${rules.seasonName} season.`}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <RuleNotes title="Playoffs" notes={[rules.notes.playoffs]} />
        <RuleNotes title="Game ties" notes={rules.notes.gameTies} />
        <RuleNotes title="Leaderboard ties" notes={rules.notes.leaderboardTies} />
      </div>
      <RuleNotes title="Trades" notes={rules.notes.trades} spread />
      <RuleNotes title="Free agents" notes={rules.notes.freeAgents} spread />
      <RuleNotes title="Weekly matchups" notes={rules.notes.matchups} spread />
      <div className="grid items-start gap-3 md:grid-cols-2">
        {rules.sports.map((sport) => (
          <SportRulesCard key={sport.code} sport={sport} />
        ))}
      </div>
    </PageMain>
  );
}
