import { describe, expect, it } from "vitest";
import { isRosterLocked, seasonStatus } from "./season-status";

describe("seasonStatus", () => {
  it("counts down before the start date and flips on the day itself", () => {
    expect(seasonStatus("2026-10-20", null, "2026-10-19", false)).toEqual({
      phase: "upcoming",
      label: "Starts Oct 20",
    });
    expect(seasonStatus("2026-10-20", null, "2026-10-20", false)).toEqual({
      phase: "in_season",
      label: "In season",
    });
  });

  it("lets a recorded champion win over the calendar", () => {
    expect(seasonStatus("2027-03-24", null, "2026-09-28", true).phase).toBe("complete");
  });

  it("shows Final once the sport's own end date has passed, without a champion", () => {
    expect(seasonStatus("2027-02-01", "2027-05-31", "2027-05-31", false).phase).toBe("in_season");
    expect(seasonStatus("2027-02-01", "2027-05-31", "2027-06-01", false)).toEqual({
      phase: "complete",
      label: "Final",
    });
  });

  it("keeps a sport with no end date open until a champion is recorded", () => {
    expect(seasonStatus("2027-02-01", null, "2028-01-01", false).phase).toBe("in_season");
  });
});

describe("isRosterLocked", () => {
  it("locks only a completed sport; an upcoming one is still open to moves", () => {
    expect(isRosterLocked({ phase: "complete" })).toBe(true);
    expect(isRosterLocked({ phase: "in_season" })).toBe(false);
    expect(isRosterLocked({ phase: "upcoming" })).toBe(false);
  });
});
