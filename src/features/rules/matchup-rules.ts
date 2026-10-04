import { REMATCH_WEEKS } from "@/domain/matchups";
import type { RuleNote } from "./tie-rules";

/** How weekly matchups work, in the same plain-language shape as the other notes. The number comes from the domain. */
export const MATCHUP_NOTES: RuleNote[] = [
  {
    title: "One opponent a week",
    body: "Every Monday morning each team gets one opponent near it in the standings.",
  },
  {
    title: "Who wins",
    body: "Whichever team earns more points by the time the next week opens wins. Equal points is a tie.",
  },
  {
    title: "Bragging rights only",
    body: "Matchups never change the season standings. They are just for fun.",
  },
  {
    title: "Fresh faces",
    body: `You will not face the same team twice within ${REMATCH_WEEKS} weeks when it can be avoided.`,
  },
];
