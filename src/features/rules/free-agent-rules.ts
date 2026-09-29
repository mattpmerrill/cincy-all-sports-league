import type { RuleNote } from "./tie-rules";

/** How free-agent moves work, in the same plain-language shape as the trade notes. */
export const FREE_AGENT_NOTES: RuleNote[] = [
  {
    title: "Drop and add in one step",
    body: "A move drops your pick in a sport and adds a free agent in that same sport, right away. Nothing sits in a queue.",
  },
  {
    title: "First come, first served",
    body: "A free agent is anyone no other team holds. If two teams go for the same one, the first to confirm gets them.",
  },
  {
    title: "Earned points stay put",
    body: "Points a player already earned for you stay with your team. The new player only counts for what they score after you add them.",
  },
  {
    title: "No moves after the season",
    body: "A sport can't change once its season is over.",
  },
  {
    title: "Moves cancel trade listings",
    body: "A move cancels your trade listings for the player you drop, and takes back your offers that include them.",
  },
];
