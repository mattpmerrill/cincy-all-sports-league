import { describe, expect, it } from "vitest";
import { seasonStatus } from "./season-status";

describe("seasonStatus", () => {
  it("counts down before the start date and flips on the day itself", () => {
    expect(seasonStatus("2026-10-20", "2026-10-19", false)).toEqual({
      phase: "upcoming",
      label: "Starts Oct 20",
    });
    expect(seasonStatus("2026-10-20", "2026-10-20", false)).toEqual({
      phase: "in_season",
      label: "In season",
    });
  });

  it("lets a recorded champion win over the calendar", () => {
    expect(seasonStatus("2027-03-24", "2026-09-28", true).phase).toBe("complete");
  });
});
