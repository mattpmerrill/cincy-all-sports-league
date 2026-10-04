import { describe, expect, it } from "vitest";
import { isSeasonWeek, rolloverAction, rolloverWindow } from "./rollover-window";

describe("rolloverWindow", () => {
  it("finds the Monday of the Eastern week for any weekday", () => {
    // Wed Sep 30 2026 15:00 EDT
    expect(rolloverWindow(new Date("2026-09-30T19:00:00Z")).weekStart).toBe("2026-09-28");
    // Sun Oct 4 2026 22:00 EDT is still the week of Sep 28
    expect(rolloverWindow(new Date("2026-10-05T02:00:00Z")).weekStart).toBe("2026-09-28");
  });

  it("uses Eastern time for the date, not UTC", () => {
    // Sun Sep 27 23:30 EDT is already Monday Sep 28 in UTC.
    expect(rolloverWindow(new Date("2026-09-28T03:30:00Z"))).toEqual({
      weekStart: "2026-09-21",
      due: true,
    });
    expect(rolloverWindow(new Date("2026-09-28T04:30:00Z"))).toEqual({
      weekStart: "2026-09-28",
      due: false,
    });
  });

  describe("in daylight time (EDT, UTC-4)", () => {
    it("is not due at 06:29 Eastern and is due at 06:30", () => {
      expect(rolloverWindow(new Date("2026-09-28T10:29:00Z")).due).toBe(false);
      expect(rolloverWindow(new Date("2026-09-28T10:30:00Z")).due).toBe(true);
    });

    it("is due for the 06:45 Eastern job (10:45 UTC)", () => {
      expect(rolloverWindow(new Date("2026-09-28T10:45:00Z"))).toEqual({
        weekStart: "2026-09-28",
        due: true,
      });
    });
  });

  describe("after the November fall-back (EST, UTC-5)", () => {
    // Sun Nov 1 2026 clocks go back. Mon Nov 2 06:30 EST is 11:30 UTC, so the 10:45 UTC job is early.
    it("treats 10:45 UTC on Nov 2 as 05:45 and 11:45 UTC as 06:45", () => {
      expect(rolloverWindow(new Date("2026-11-02T10:45:00Z"))).toEqual({
        weekStart: "2026-11-02",
        due: false,
      });
      expect(rolloverWindow(new Date("2026-11-02T11:45:00Z"))).toEqual({
        weekStart: "2026-11-02",
        due: true,
      });
    });

    it("flips exactly at 11:30 UTC", () => {
      expect(rolloverWindow(new Date("2026-11-02T11:29:00Z")).due).toBe(false);
      expect(rolloverWindow(new Date("2026-11-02T11:30:00Z")).due).toBe(true);
    });

    it("keeps the previous Monday on the fall-back Sunday", () => {
      expect(rolloverWindow(new Date("2026-11-01T12:00:00Z"))).toEqual({
        weekStart: "2026-10-26",
        due: true,
      });
    });
  });

  describe("around the March spring-forward (2027-03-14)", () => {
    it("is still EST on Mon Mar 8, so 10:45 UTC is early and 11:45 UTC is on time", () => {
      expect(rolloverWindow(new Date("2027-03-08T10:45:00Z")).due).toBe(false);
      expect(rolloverWindow(new Date("2027-03-08T11:45:00Z")).due).toBe(true);
    });

    it("is EDT on Mon Mar 15, so 10:45 UTC is on time", () => {
      expect(rolloverWindow(new Date("2027-03-15T10:29:00Z")).due).toBe(false);
      expect(rolloverWindow(new Date("2027-03-15T10:45:00Z"))).toEqual({
        weekStart: "2027-03-15",
        due: true,
      });
    });

    it("does not lose or repeat a day across the change", () => {
      expect(rolloverWindow(new Date("2027-03-14T15:00:00Z")).weekStart).toBe("2027-03-08");
      expect(rolloverWindow(new Date("2027-03-14T05:30:00Z")).weekStart).toBe("2027-03-08");
    });
  });

  it("counts every later day of the week as due so a missed Monday is caught up", () => {
    expect(rolloverWindow(new Date("2026-09-29T05:00:00Z")).due).toBe(true); // Tue 01:00 EDT
    expect(rolloverWindow(new Date("2026-10-04T14:00:00Z")).due).toBe(true); // Sun
  });
});

describe("isSeasonWeek and rolloverAction", () => {
  // A season from Wed Sep 2 2026 to Fri Jun 30 2027: weeks Aug 31 2026 through Jun 28 2027.
  const season = { firstDay: "2026-09-02", lastDay: "2027-06-30" };

  it("includes both end weeks, even though the first and last days are mid-week", () => {
    expect(isSeasonWeek("2026-08-31", season)).toBe(true);
    expect(isSeasonWeek("2027-06-28", season)).toBe(true);
    expect(isSeasonWeek("2026-10-05", season)).toBe(true);
  });

  it("excludes weeks before the first and after the last", () => {
    expect(isSeasonWeek("2026-08-24", season)).toBe(false);
    expect(isSeasonWeek("2027-07-05", season)).toBe(false);
  });

  it("pairs inside the season", () => {
    expect(rolloverAction("2026-10-05", season)).toBe("pair");
    expect(rolloverAction("2027-06-28", season)).toBe("pair");
  });

  it("closes only on the Monday after the last week", () => {
    expect(rolloverAction("2027-07-05", season)).toBe("close_only");
  });

  it("skips before the season and after the closing Monday", () => {
    expect(rolloverAction("2026-08-24", season)).toBe("skip");
    expect(rolloverAction("2027-07-12", season)).toBe("skip");
  });

  it("works when the last day is itself a Monday", () => {
    const monday = { firstDay: "2026-09-07", lastDay: "2027-05-31" };
    expect(rolloverAction("2027-05-31", monday)).toBe("pair");
    expect(rolloverAction("2027-06-07", monday)).toBe("close_only");
  });
});
