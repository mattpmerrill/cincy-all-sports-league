import { describe, expect, it } from "vitest";
import { matchup } from "@/domain/matchups/fixtures";
import {
  OTHER_MATCHUPS_WITHOUT_TEAM,
  OTHER_MATCHUPS_WITH_TEAM,
  SETTLING_MESSAGE,
  buildMatchupsSection,
} from "./build-matchups-section";
import type { MatchupsSectionTeam } from "./build-matchups-section";

const THIS_WEEK = "2026-10-12";
const LAST_WEEK = "2026-10-05";
const WEEK_BEFORE = "2026-09-28";
/** The rollover closes a week at 07:00 EDT on the Monday that opens the next one. */
const CLOSED_THIS_MONDAY = "2026-10-12T11:00:00.000Z";

// Season order: Sher Bear, Papie, Coop, Dirk. Home is the better-ranked side by convention.
const teams: MatchupsSectionTeam[] = [
  { teamId: "sher", teamName: "Sher Bear", rank: 1 },
  { teamId: "papie", teamName: "Papie", rank: 2 },
  { teamId: "coop", teamName: "Coop Doggies", rank: 3 },
  { teamId: "dirk", teamName: "Dirk", rank: 4 },
];

type Built = ReturnType<typeof matchup>;

/** A matchup of `week` that the rollover closed on the Monday this digest is for. */
const closed = (
  week: string,
  home: string,
  away: string,
  start: [number, number],
  end: [number, number],
  finalizedAt = CLOSED_THIS_MONDAY,
) => matchup(week, home, away, { start, end, finalizedAt });

const build = (
  matchups: Built[],
  recipientTeamId?: string | null,
  weekStart = THIS_WEEK,
  roster: readonly MatchupsSectionTeam[] = teams,
) => buildMatchupsSection({ matchups, teams: roster, weekStart, recipientTeamId });

/** The built section, asserted to be the normal (not "settling") one. */
function ready(section: ReturnType<typeof build>) {
  if (section?.state !== "ready")
    throw new Error(`expected a ready section, got ${section?.state}`);
  return section;
}
const texts = (lines: { text: string }[] | undefined) => lines?.map((l) => l.text);

// Last week: Sher Bear 12.4 vs Papie 8 (home wins), Coop 3 vs Dirk 5 (away wins). Both final.
const lastWeekFinal = () => [
  closed(LAST_WEEK, "sher", "papie", [10, 10], [22.4, 18]),
  closed(LAST_WEEK, "coop", "dirk", [4, 4], [7, 9]),
];
// This week: Sher Bear vs Coop, Papie vs Dirk.
const thisWeekLive = () => [
  matchup(THIS_WEEK, "sher", "coop", { start: [22.4, 7] }),
  matchup(THIS_WEEK, "papie", "dirk", { start: [18, 9] }),
];

describe("buildMatchupsSection wording", () => {
  it("is null before the feature's first week", () => {
    expect(build([], "sher")).toBeNull();
  });

  it("words last week from the recipient's side when they won, and lists the rest compactly", () => {
    const section = ready(build([...lastWeekFinal(), ...thisWeekLive()], "sher"));
    expect(section.lastWeek).toEqual({
      title: "Last week's matchups",
      mine: { text: "You beat Papie 12.4 to 8", outcome: "win" },
      others: [{ text: "Dirk beat Coop Doggies 5 to 3", outcome: null }],
      moreCount: 0,
    });
    expect(section.thisWeek).toEqual({
      title: "This week's matchups",
      mine: { text: "You play Coop Doggies this week", outcome: null },
      others: [{ text: "Papie vs Dirk", outcome: null }],
      moreCount: 0,
    });
  });

  it("words a loss from the away side with the winner's number first", () => {
    const section = ready(build([...lastWeekFinal(), ...thisWeekLive()], "papie"));
    expect(section.lastWeek?.mine).toEqual({
      text: "You lost to Sher Bear 12.4 to 8",
      outcome: "loss",
    });
    expect(texts(section.lastWeek?.others)).toEqual(["Dirk beat Coop Doggies 5 to 3"]);
    expect(section.thisWeek?.mine?.text).toBe("You play Dirk this week");
  });

  it("words a loss from the home side too", () => {
    const section = ready(build([closed(LAST_WEEK, "sher", "papie", [0, 0], [5, 9.5])], "sher"));
    expect(section.lastWeek?.mine).toEqual({
      text: "You lost to Papie 9.5 to 5",
      outcome: "loss",
    });
  });

  it("words a win from the away side", () => {
    const section = ready(build(lastWeekFinal(), "dirk"));
    expect(section.lastWeek?.mine).toEqual({
      text: "You beat Coop Doggies 5 to 3",
      outcome: "win",
    });
  });

  it("words a tie for the recipient and for everyone else", () => {
    const tied = [closed(LAST_WEEK, "sher", "papie", [10, 10], [20, 20])];
    expect(ready(build(tied, "papie")).lastWeek?.mine).toEqual({
      text: "You tied Sher Bear at 10",
      outcome: "tie",
    });
    expect(texts(ready(build(tied)).lastWeek?.others)).toEqual(["Sher Bear and Papie tied at 10"]);
  });

  it("calls a 0 to 0 week a tie rather than a win", () => {
    const quiet = [closed(LAST_WEEK, "sher", "papie", [5, 5], [5, 5])];
    expect(texts(ready(build(quiet)).lastWeek?.others)).toEqual(["Sher Bear and Papie tied at 0"]);
  });

  it("shows a negative gain with its sign", () => {
    const section = ready(build([closed(LAST_WEEK, "sher", "papie", [10, 10], [9, 7.5])], "sher"));
    expect(section.lastWeek?.mine?.text).toBe("You beat Papie -1 to -2.5");
  });

  it("widens decimals for a near-tie so the two numbers differ, like the feed post", () => {
    const section = ready(
      build([closed(LAST_WEEK, "sher", "papie", [0, 0], [1.2349, 1.2301])], "papie"),
    );
    expect(section.lastWeek?.mine?.text).toBe("You lost to Sher Bear 1.235 to 1.23");
  });

  it("shows only the neutral lists to a recipient without a team, and no record", () => {
    const section = ready(build([...lastWeekFinal(), ...thisWeekLive()], null));
    expect(section.lastWeek?.mine).toBeNull();
    expect(section.thisWeek?.mine).toBeNull();
    expect(texts(section.lastWeek?.others)).toEqual([
      "Sher Bear beat Papie 12.4 to 8",
      "Dirk beat Coop Doggies 5 to 3",
    ]);
    expect(texts(section.thisWeek?.others)).toEqual(["Sher Bear vs Coop Doggies", "Papie vs Dirk"]);
    expect(section.recordText).toBeNull();
  });

  it("gives a recipient whose team has no matchup that week the neutral lists for it", () => {
    const section = ready(
      build(
        [
          closed(LAST_WEEK, "coop", "dirk", [0, 0], [3, 5]),
          matchup(THIS_WEEK, "coop", "dirk", { start: [3, 5] }),
        ],
        "sher",
      ),
    );
    expect(section.lastWeek?.mine).toBeNull();
    expect(section.thisWeek?.mine).toBeNull();
    expect(section.thisWeek?.others).toHaveLength(1);
  });

  it("skips a matchup whose team is no longer in the league instead of printing a blank", () => {
    const section = ready(
      build(
        [
          matchup(THIS_WEEK, "sher", "ghost", { start: [0, 0] }),
          matchup(THIS_WEEK, "coop", "dirk", { start: [0, 0] }),
        ],
        "sher",
      ),
    );
    expect(section.thisWeek?.mine).toBeNull();
    expect(texts(section.thisWeek?.others)).toEqual(["Coop Doggies vs Dirk"]);
  });

  it("spells the record out with the right singular and plural", () => {
    const section = ready(
      build(
        [
          closed(WEEK_BEFORE, "sher", "coop", [0, 0], [3, 1], "2026-10-05T11:00:00.000Z"),
          closed(WEEK_BEFORE, "papie", "dirk", [0, 0], [1, 1], "2026-10-05T11:00:00.000Z"),
          ...lastWeekFinal(),
          ...thisWeekLive(),
        ],
        "sher",
      ),
    );
    expect(section.recordText).toBe("Your record: 2 wins, 0 losses, 0 ties");
    const lost = ready(build([closed(LAST_WEEK, "sher", "papie", [0, 0], [1, 2])], "sher"));
    expect(lost.recordText).toBe("Your record: 0 wins, 1 loss, 0 ties");
    const tied = ready(build([closed(LAST_WEEK, "sher", "papie", [0, 0], [2, 2])], "sher"));
    expect(tied.recordText).toBe("Your record: 0 wins, 0 losses, 1 tie");
  });
});

describe("buildMatchupsSection which weeks it shows", () => {
  it("shows this week's pairings alone in the first week", () => {
    const section = ready(build(thisWeekLive(), "sher"));
    expect(section.lastWeek).toBeNull();
    expect(section.thisWeek?.mine?.text).toBe("You play Coop Doggies this week");
    expect(section.recordText).toBeNull();
    expect(section.linkLabel).toBe("Follow the matchups live");
  });

  it("shows results alone when the season has closed with no new week", () => {
    const section = ready(build(lastWeekFinal(), "sher"));
    expect(section.thisWeek).toBeNull();
    expect(section.lastWeek?.mine?.text).toBe("You beat Papie 12.4 to 8");
    expect(section.linkLabel).toBe("See the full results");
  });

  it("says last week is still being settled, with no scores, when the rollover has not run", () => {
    // Last week is still live (no end totals) and this week has no rows yet.
    const missed = [
      matchup(LAST_WEEK, "sher", "papie", { start: [10, 10] }),
      matchup(LAST_WEEK, "coop", "dirk", { start: [4, 4] }),
    ];
    expect(build(missed, "sher")).toEqual({
      state: "settling",
      message: SETTLING_MESSAGE,
      linkLabel: "Follow the matchups live",
    });
    expect(SETTLING_MESSAGE).toBe("Last week's matchups are still being settled.");
  });

  it("gives an older week closed before this Monday no results", () => {
    // The Monday after a season ends: the last week closed a week ago and nothing is new.
    const stale = [
      closed(WEEK_BEFORE, "sher", "papie", [0, 0], [5, 2], "2026-10-05T11:00:00.000Z"),
    ];
    expect(build(stale, "sher")).toBeNull();
  });

  it("shows an older week that was closed this Monday, headed as the latest results", () => {
    // A fully missed week: Sep 28 was open, nothing opened for Oct 5, and the Oct 12 rollover
    // closed Sep 28 this morning and opened Oct 12.
    const section = ready(
      build(
        [
          closed(WEEK_BEFORE, "sher", "papie", [0, 0], [5, 2]),
          matchup(THIS_WEEK, "sher", "coop", { start: [5, 0] }),
        ],
        "sher",
      ),
    );
    expect(section.lastWeek?.title).toBe("Latest matchup results");
    expect(section.lastWeek?.mine?.text).toBe("You beat Papie 5 to 2");
    expect(section.recordText).toBe("Your record: 1 win, 0 losses, 0 ties");
    expect(section.thisWeek?.title).toBe("This week's matchups");
  });

  it("reproduces the missed-week case across the fall-back change, in Eastern dates", () => {
    // Week of Oct 26 open, no rollover in the week of Nov 2, rollover Mon Nov 9 at 06:45 EST.
    const section = ready(
      build(
        [
          closed("2026-10-26", "sher", "papie", [0, 0], [4, 1], "2026-11-09T11:45:00.000Z"),
          matchup("2026-11-09", "sher", "coop", { start: [4, 0] }),
        ],
        "sher",
        "2026-11-09",
      ),
    );
    expect(section.lastWeek?.title).toBe("Latest matchup results");
    expect(section.lastWeek?.mine?.text).toBe("You beat Papie 4 to 1");
  });

  it("compares the Eastern date of the close, not the UTC one", () => {
    // 03:00 UTC on Mon Oct 12 is still Sunday night in Eastern: that close belongs to last week.
    const early = [closed(LAST_WEEK, "sher", "papie", [0, 0], [5, 2], "2026-10-12T03:00:00.000Z")];
    expect(build(early, "sher")).toBeNull();
  });

  it("titles the usual case 'Last week's matchups'", () => {
    expect(ready(build(lastWeekFinal(), "sher")).lastWeek?.title).toBe("Last week's matchups");
  });

  it("shows only the latest closed week when several qualify", () => {
    const section = ready(
      build(
        [
          closed(WEEK_BEFORE, "sher", "papie", [0, 0], [5, 2]),
          closed(LAST_WEEK, "coop", "dirk", [0, 0], [1, 3]),
        ],
        null,
      ),
    );
    expect(texts(section.lastWeek?.others)).toEqual(["Dirk beat Coop Doggies 3 to 1"]);
  });

  it("does not treat a final row in the current week as a pairing", () => {
    const section = ready(
      build(
        [
          closed(LAST_WEEK, "sher", "papie", [0, 0], [5, 2]),
          // A current-week row that somehow carries end totals is not a pairing.
          closed(THIS_WEEK, "coop", "dirk", [0, 0], [1, 1]),
        ],
        "sher",
      ),
    );
    expect(section.thisWeek).toBeNull();
    expect(section.lastWeek?.others).toEqual([]);
  });
});

describe("buildMatchupsSection ordering and caps", () => {
  it("orders the others by the better season rank of the pairing", () => {
    const section = ready(
      build(
        [
          matchup(THIS_WEEK, "coop", "dirk", { start: [0, 0] }),
          matchup(THIS_WEEK, "sher", "papie", { start: [0, 0] }),
        ],
        null,
      ),
    );
    expect(texts(section.thisWeek?.others)).toEqual(["Sher Bear vs Papie", "Coop Doggies vs Dirk"]);
  });

  it("puts the recipient's own matchup first even when it is the lowest ranked", () => {
    const section = ready(build(thisWeekLive(), "dirk"));
    expect(section.thisWeek?.mine?.text).toBe("You play Papie this week");
    expect(texts(section.thisWeek?.others)).toEqual(["Sher Bear vs Coop Doggies"]);
  });

  // A full 20-team league: ten results last week, ten pairings this week. t1 owns rank 1, and so on.
  const league: MatchupsSectionTeam[] = Array.from({ length: 20 }, (_, i) => ({
    teamId: `t${i + 1}`,
    teamName: `Team ${i + 1}`,
    rank: i + 1,
  }));
  const fullLeague = (): Built[] =>
    Array.from({ length: 10 }, (_, i) => [
      closed(LAST_WEEK, `t${2 * i + 1}`, `t${2 * i + 2}`, [0, 0], [i + 2, 1]),
      matchup(THIS_WEEK, `t${2 * i + 1}`, `t${2 * i + 2}`, { start: [i + 2, 1] }),
    ]).flat();

  it("caps a recipient with a team at their own cards plus three of the others", () => {
    expect(OTHER_MATCHUPS_WITH_TEAM).toBe(3);
    const section = ready(build(fullLeague(), "t5", THIS_WEEK, league));
    expect(section.lastWeek?.mine?.text).toBe("You beat Team 6 4 to 1");
    expect(section.lastWeek?.others).toHaveLength(3);
    expect(section.lastWeek?.moreCount).toBe(6);
    expect(section.thisWeek?.mine?.text).toBe("You play Team 6 this week");
    expect(section.thisWeek?.others).toHaveLength(3);
    expect(section.thisWeek?.moreCount).toBe(6);
    // The best-ranked pairings survive the cut, in order.
    expect(texts(section.thisWeek?.others)).toEqual([
      "Team 1 vs Team 2",
      "Team 3 vs Team 4",
      "Team 7 vs Team 8",
    ]);
  });

  it("caps a recipient without a team at four of each", () => {
    expect(OTHER_MATCHUPS_WITHOUT_TEAM).toBe(4);
    const section = ready(build(fullLeague(), null, THIS_WEEK, league));
    expect(section.lastWeek?.others).toHaveLength(4);
    expect(section.lastWeek?.moreCount).toBe(6);
    expect(section.thisWeek?.others).toHaveLength(4);
    expect(section.thisWeek?.moreCount).toBe(6);
  });

  it("tells the reader how many matchups there are when anything was left out", () => {
    const withTeam = ready(build(fullLeague(), "t5", THIS_WEEK, league));
    expect(withTeam.total).toBe(10);
    expect(withTeam.linkLabel).toBe("See all 10 matchups");
    expect(ready(build(fullLeague(), null, THIS_WEEK, league)).linkLabel).toBe(
      "See all 10 matchups",
    );
  });

  it("counts results when there is no current week", () => {
    const resultsOnly = fullLeague().filter((m) => m.weekStart === LAST_WEEK);
    const section = ready(build(resultsOnly, null, THIS_WEEK, league));
    expect(section.thisWeek).toBeNull();
    expect(section.total).toBe(10);
    expect(section.linkLabel).toBe("See all 10 matchups");
  });

  it("cuts nothing in a league small enough to fit, and keeps the usual link", () => {
    const section = ready(build([...lastWeekFinal(), ...thisWeekLive()], "sher"));
    expect(section.lastWeek?.moreCount).toBe(0);
    expect(section.thisWeek?.moreCount).toBe(0);
    expect(section.linkLabel).toBe("Follow the matchups live");
  });

  it("cuts nothing at exactly the cap", () => {
    // Own pairing plus three others is four matchups with a team, and four others without.
    const four = (week: "live" | "closed") =>
      Array.from({ length: 4 }, (_, i) =>
        week === "live"
          ? matchup(THIS_WEEK, `t${2 * i + 1}`, `t${2 * i + 2}`, { start: [0, 0] })
          : closed(LAST_WEEK, `t${2 * i + 1}`, `t${2 * i + 2}`, [0, 0], [2, 1]),
      );
    const withTeam = ready(build(four("live"), "t1", THIS_WEEK, league));
    expect(withTeam.thisWeek?.others).toHaveLength(3);
    expect(withTeam.thisWeek?.moreCount).toBe(0);
    expect(withTeam.linkLabel).toBe("Follow the matchups live");
    const without = ready(build(four("live"), null, THIS_WEEK, league));
    expect(without.thisWeek?.others).toHaveLength(4);
    expect(without.thisWeek?.moreCount).toBe(0);
  });

  it("flags a cut in only one block", () => {
    const manyPairings = Array.from({ length: 6 }, (_, i) =>
      matchup(THIS_WEEK, `t${2 * i + 1}`, `t${2 * i + 2}`, { start: [0, 0] }),
    );
    const section = ready(
      build(
        [closed(LAST_WEEK, "t1", "t2", [0, 0], [2, 1]), ...manyPairings],
        null,
        THIS_WEEK,
        league,
      ),
    );
    expect(section.lastWeek?.moreCount).toBe(0);
    expect(section.thisWeek?.moreCount).toBe(2);
    expect(section.linkLabel).toBe("See all 6 matchups");
  });
});
