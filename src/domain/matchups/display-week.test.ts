import { describe, expect, it } from "vitest";
import { displayWeek } from "./display-week";
import { matchup } from "./fixtures";

const CURRENT = "2026-10-12";

describe("displayWeek", () => {
  it("shows the current week once it has matchups", () => {
    const rows = [matchup("2026-10-05", "a", "b", { end: [1, 0] }), matchup(CURRENT, "a", "c")];
    expect(displayWeek(CURRENT, rows)).toEqual({ weekStart: CURRENT, awaitingRollover: false });
  });

  it("keeps showing last week while it is still live and this week has not opened", () => {
    const rows = [matchup("2026-10-05", "a", "b"), matchup("2026-10-05", "c", "d")];
    expect(displayWeek(CURRENT, rows)).toEqual({
      weekStart: "2026-10-05",
      awaitingRollover: true,
    });
  });

  it("picks the latest earlier live week when a missed Monday left several open", () => {
    const rows = [matchup("2026-09-28", "a", "b"), matchup("2026-10-05", "a", "c")];
    expect(displayWeek(CURRENT, rows).weekStart).toBe("2026-10-05");
  });

  it("is the empty current week when everything earlier is final", () => {
    const rows = [matchup("2026-10-05", "a", "b", { end: [1, 0] })];
    expect(displayWeek(CURRENT, rows)).toEqual({ weekStart: CURRENT, awaitingRollover: false });
  });

  it("is the empty current week for a season with no matchups", () => {
    expect(displayWeek(CURRENT, [])).toEqual({ weekStart: CURRENT, awaitingRollover: false });
  });

  it("ignores later weeks", () => {
    const rows = [matchup("2026-10-19", "a", "b")];
    expect(displayWeek(CURRENT, rows)).toEqual({ weekStart: CURRENT, awaitingRollover: false });
  });
});
