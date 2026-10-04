import { describe, expect, it } from "vitest";
import { matchup } from "@/domain/matchups/fixtures";
import { buildMatchupsSection } from "./build-matchups-section";
import type { MatchupsSectionTeam } from "./build-matchups-section";

const THIS_WEEK = "2026-10-12";
const LAST_WEEK = "2026-10-05";
const WEEK_BEFORE = "2026-09-28";

// Season order: Sher Bear, Papie, Coop, Dirk. Home is the better-ranked side by convention.
const teams: MatchupsSectionTeam[] = [
  { teamId: "sher", teamName: "Sher Bear", rank: 1 },
  { teamId: "papie", teamName: "Papie", rank: 2 },
  { teamId: "coop", teamName: "Coop Doggies", rank: 3 },
  { teamId: "dirk", teamName: "Dirk", rank: 4 },
];

const build = (
  matchups: ReturnType<typeof matchup>[],
  recipientTeamId?: string | null,
  weekStart = THIS_WEEK,
) => buildMatchupsSection({ matchups, teams, weekStart, recipientTeamId });

// Last week: Sher Bear 12.4 vs Papie 8 (home wins), Coop 3 vs Dirk 5 (away wins). Both final.
const lastWeekFinal = () => [
  matchup(LAST_WEEK, "sher", "papie", { start: [10, 10], end: [22.4, 18] }),
  matchup(LAST_WEEK, "coop", "dirk", { start: [4, 4], end: [7, 9] }),
];
// This week: Sher Bear vs Coop, Papie vs Dirk.
const thisWeekLive = () => [
  matchup(THIS_WEEK, "sher", "coop", { start: [22.4, 7] }),
  matchup(THIS_WEEK, "papie", "dirk", { start: [18, 9] }),
];

describe("buildMatchupsSection", () => {
  it("is null before the feature's first week", () => {
    expect(build([], "sher")).toBeNull();
  });

  it("words last week from the recipient's side when they won, and lists the rest compactly", () => {
    const section = build([...lastWeekFinal(), ...thisWeekLive()], "sher");
    expect(section?.lastWeek).toEqual({
      mine: { text: "You beat Papie 12.4 to 8", outcome: "win" },
      others: [{ text: "Dirk beat Coop Doggies 5 to 3", outcome: null }],
    });
    expect(section?.thisWeek).toEqual({
      mine: { text: "You play Coop Doggies this week", outcome: null },
      others: [{ text: "Papie vs Dirk", outcome: null }],
    });
  });

  it("words a loss with the winner's number first", () => {
    const section = build([...lastWeekFinal(), ...thisWeekLive()], "papie");
    expect(section?.lastWeek?.mine).toEqual({
      text: "You lost to Sher Bear 12.4 to 8",
      outcome: "loss",
    });
    expect(section?.lastWeek?.others.map((l) => l.text)).toEqual(["Dirk beat Coop Doggies 5 to 3"]);
    expect(section?.thisWeek?.mine?.text).toBe("You play Dirk this week");
  });

  it("words a win from the away side too", () => {
    const section = build(lastWeekFinal(), "dirk");
    expect(section?.lastWeek?.mine).toEqual({
      text: "You beat Coop Doggies 5 to 3",
      outcome: "win",
    });
  });

  it("words a tie for the recipient and for everyone else", () => {
    const tied = [matchup(LAST_WEEK, "sher", "papie", { start: [10, 10], end: [20, 20] })];
    expect(build(tied, "papie")?.lastWeek?.mine).toEqual({
      text: "You tied Sher Bear at 10",
      outcome: "tie",
    });
    expect(build(tied)?.lastWeek?.others[0]?.text).toBe("Sher Bear and Papie tied at 10");
  });

  it("calls a 0 to 0 week a tie rather than a win", () => {
    const quiet = [matchup(LAST_WEEK, "sher", "papie", { start: [5, 5], end: [5, 5] })];
    expect(build(quiet)?.lastWeek?.others[0]?.text).toBe("Sher Bear and Papie tied at 0");
  });

  it("shows only the neutral lists to a recipient without a team", () => {
    const section = build([...lastWeekFinal(), ...thisWeekLive()], null);
    expect(section?.lastWeek?.mine).toBeNull();
    expect(section?.thisWeek?.mine).toBeNull();
    expect(section?.lastWeek?.others.map((l) => l.text)).toEqual([
      "Sher Bear beat Papie 12.4 to 8",
      "Dirk beat Coop Doggies 5 to 3",
    ]);
    expect(section?.thisWeek?.others.map((l) => l.text)).toEqual([
      "Sher Bear vs Coop Doggies",
      "Papie vs Dirk",
    ]);
    expect(section?.recordText).toBeNull();
  });

  it("gives a recipient whose team has no matchup that week the neutral lists for it", () => {
    const section = build(
      [
        matchup(LAST_WEEK, "coop", "dirk", { start: [0, 0], end: [3, 5] }),
        matchup(THIS_WEEK, "coop", "dirk", { start: [3, 5] }),
      ],
      "sher",
    );
    expect(section?.lastWeek?.mine).toBeNull();
    expect(section?.thisWeek?.mine).toBeNull();
    expect(section?.thisWeek?.others).toHaveLength(1);
  });

  it("shows this week's pairings alone in the first week", () => {
    const section = build(thisWeekLive(), "sher");
    expect(section?.lastWeek).toBeNull();
    expect(section?.thisWeek?.mine?.text).toBe("You play Coop Doggies this week");
    expect(section?.recordText).toBeNull();
    expect(section?.linkLabel).toBe("Follow the matchups live");
  });

  it("shows results alone when the season has closed with no new week", () => {
    const section = build(lastWeekFinal(), "sher");
    expect(section?.thisWeek).toBeNull();
    expect(section?.lastWeek?.mine?.text).toBe("You beat Papie 12.4 to 8");
    expect(section?.linkLabel).toBe("See the full results");
  });

  it("omits the section when the rollover has not run, never showing live numbers as results", () => {
    // Last week is still live (no end totals) and this week has no rows yet.
    const missed = [
      matchup(LAST_WEEK, "sher", "papie", { start: [10, 10] }),
      matchup(LAST_WEEK, "coop", "dirk", { start: [4, 4] }),
    ];
    expect(build(missed, "sher")).toBeNull();
  });

  it("does not present older finished weeks as 'last week' once a week has been skipped", () => {
    const stale = [matchup(WEEK_BEFORE, "sher", "papie", { start: [0, 0], end: [5, 2] })];
    expect(build(stale, "sher")).toBeNull();
  });

  it("keeps pairings of the current week out of the results and finished rows out of the pairings", () => {
    const section = build(
      [
        matchup(LAST_WEEK, "sher", "papie", { start: [0, 0], end: [5, 2] }),
        // A current-week row that somehow carries end totals is not a pairing.
        matchup(THIS_WEEK, "coop", "dirk", { start: [0, 0], end: [1, 1] }),
      ],
      "sher",
    );
    expect(section?.thisWeek).toBeNull();
    expect(section?.lastWeek?.others).toEqual([]);
  });

  it("shows a negative gain with its sign", () => {
    const section = build(
      [matchup(LAST_WEEK, "sher", "papie", { start: [10, 10], end: [9, 7.5] })],
      "sher",
    );
    expect(section?.lastWeek?.mine?.text).toBe("You beat Papie -1 to -2.5");
  });

  it("widens decimals for a near-tie so the two numbers differ, like the feed post", () => {
    const section = build(
      [matchup(LAST_WEEK, "sher", "papie", { start: [0, 0], end: [1.2349, 1.2301] })],
      "papie",
    );
    expect(section?.lastWeek?.mine?.text).toBe("You lost to Sher Bear 1.235 to 1.23");
  });

  it("orders the others by the better season rank of the pairing", () => {
    const section = build(
      [
        matchup(THIS_WEEK, "coop", "dirk", { start: [0, 0] }),
        matchup(THIS_WEEK, "sher", "papie", { start: [0, 0] }),
      ],
      null,
    );
    expect(section?.thisWeek?.others.map((l) => l.text)).toEqual([
      "Sher Bear vs Papie",
      "Coop Doggies vs Dirk",
    ]);
  });

  it("puts the recipient's own matchup first even when it is the lowest ranked", () => {
    const section = build(thisWeekLive(), "dirk");
    expect(section?.thisWeek?.mine?.text).toBe("You play Papie this week");
    expect(section?.thisWeek?.others.map((l) => l.text)).toEqual(["Sher Bear vs Coop Doggies"]);
  });

  it("shows the recipient's matchup record once a week has finished", () => {
    const earlier = matchup(WEEK_BEFORE, "sher", "coop", { start: [0, 0], end: [3, 1] });
    const section = build([earlier, ...lastWeekFinal(), ...thisWeekLive()], "sher");
    expect(section?.recordText).toBe("Your matchup record: 2-0-0 (wins, losses, ties)");
  });

  it("skips a matchup whose team is no longer in the league instead of printing a blank", () => {
    const section = build(
      [
        matchup(THIS_WEEK, "sher", "ghost", { start: [0, 0] }),
        matchup(THIS_WEEK, "coop", "dirk", { start: [0, 0] }),
      ],
      "sher",
    );
    expect(section?.thisWeek?.mine).toBeNull();
    expect(section?.thisWeek?.others.map((l) => l.text)).toEqual(["Coop Doggies vs Dirk"]);
  });
});
