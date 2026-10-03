import { describe, expect, it } from "vitest";
import {
  addDays,
  clampWeekStart,
  easternClock,
  easternDateOf,
  easternMidnight,
  easternWeekStart,
  easternWeekdayShort,
  formatDayHeading,
  formatEasternTime,
  formatWeekRange,
  isIsoDate,
  isWeekStart,
  mondayOf,
  stepWeek,
  weekDays,
  weekInstants,
  weekdayIndex,
} from "./week";

const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

describe("easternClock", () => {
  it("reads daylight time as UTC-4 and standard time as UTC-5", () => {
    expect(easternClock(new Date("2026-10-04T17:00:00Z"))).toEqual({
      date: "2026-10-04",
      hour: 13,
      minute: 0,
      weekday: 6,
    });
    expect(easternClock(new Date("2026-11-04T17:00:00Z"))).toMatchObject({
      date: "2026-11-04",
      hour: 12,
    });
  });

  it("reports midnight as hour 0, never 24", () => {
    expect(easternClock(new Date("2026-10-05T04:00:00Z"))).toMatchObject({
      date: "2026-10-05",
      hour: 0,
      minute: 0,
    });
  });
});

describe("easternDateOf (the day a game belongs to)", () => {
  it("keeps a 10:30 pm Sunday tip-off on Sunday although UTC has already rolled to Monday", () => {
    expect(easternDateOf(new Date("2026-10-05T02:30:00Z"))).toBe("2026-10-04");
  });

  it("flips at Eastern midnight in daylight time (04:00 UTC)", () => {
    expect(easternDateOf(new Date("2026-10-05T03:59:59Z"))).toBe("2026-10-04");
    expect(easternDateOf(new Date("2026-10-05T04:00:00Z"))).toBe("2026-10-05");
  });

  it("flips at Eastern midnight in standard time (05:00 UTC)", () => {
    expect(easternDateOf(new Date("2026-12-08T04:59:59Z"))).toBe("2026-12-07");
    expect(easternDateOf(new Date("2026-12-08T05:00:00Z"))).toBe("2026-12-08");
  });

  it("holds across the November fall-back: 1:30 am happens twice and both are Nov 1", () => {
    expect(easternDateOf(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01"); // 1:30 EDT
    expect(easternDateOf(new Date("2026-11-01T06:30:00Z"))).toBe("2026-11-01"); // 1:30 EST
    expect(easternDateOf(new Date("2026-11-02T04:59:00Z"))).toBe("2026-11-01"); // 11:59 pm EST
    expect(easternDateOf(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("holds across the March spring-forward, which skips 2 am", () => {
    expect(easternDateOf(new Date("2027-03-14T06:59:00Z"))).toBe("2027-03-14"); // 1:59 am EST
    expect(easternDateOf(new Date("2027-03-14T07:00:00Z"))).toBe("2027-03-14"); // 3:00 am EDT
    expect(easternDateOf(new Date("2027-03-15T03:59:00Z"))).toBe("2027-03-14"); // 11:59 pm EDT
  });
});

describe("isIsoDate", () => {
  it("accepts real dates, including a leap day", () => {
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible dates and anything that is not zero-padded YYYY-MM-DD", () => {
    for (const bad of [
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-10-5",
      "20261005",
      "",
      "x",
    ]) {
      expect(isIsoDate(bad), bad).toBe(false);
    }
  });
});

describe("mondayOf and weekdayIndex", () => {
  it("maps every day of a week to the same Monday", () => {
    for (const day of weekDays("2026-10-05")) expect(mondayOf(day)).toBe("2026-10-05");
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(weekdayIndex("2026-10-11")).toBe(6);
  });

  it("crosses month and year boundaries", () => {
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(mondayOf("2028-03-01")).toBe("2028-02-28"); // leap year
  });
});

describe("easternWeekStart", () => {
  it("uses the Eastern date, so Sunday night in Cincinnati is still the old week", () => {
    expect(easternWeekStart(new Date("2026-10-05T03:00:00Z"))).toBe("2026-09-28");
    expect(easternWeekStart(new Date("2026-10-05T04:00:00Z"))).toBe("2026-10-05");
  });
});

describe("stepWeek and weekDays", () => {
  it("steps by whole weeks in either direction, over DST and New Year", () => {
    expect(stepWeek("2026-10-05", 1)).toBe("2026-10-12");
    expect(stepWeek("2026-10-05", -1)).toBe("2026-09-28");
    expect(stepWeek("2026-10-26", 1)).toBe("2026-11-02"); // spans the fall-back
    expect(stepWeek("2026-12-28", 1)).toBe("2027-01-04");
    expect(stepWeek("2026-10-05", 8)).toBe("2026-11-30");
    expect(stepWeek("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("lists seven consecutive days, Monday first", () => {
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("does not lose or repeat a day across the March spring-forward", () => {
    expect(weekDays("2027-03-08")).toContain("2027-03-14");
    expect(new Set(weekDays("2027-03-08")).size).toBe(7);
    expect(addDays("2027-03-13", 1)).toBe("2027-03-14");
    expect(addDays("2027-03-14", 1)).toBe("2027-03-15");
  });
});

describe("clampWeekStart", () => {
  // A season from Thu Aug 27 2026 to Mon Nov 15 2027 covers the weeks of Aug 24 2026 .. Nov 15 2027.
  const clamp = (week: string) => clampWeekStart(week, "2026-08-27", "2027-11-15");

  it("leaves a week inside the season alone", () => {
    expect(clamp("2026-10-05")).toBe("2026-10-05");
    expect(clamp("2026-08-24")).toBe("2026-08-24");
    expect(clamp("2027-11-15")).toBe("2027-11-15");
  });

  it("pulls an earlier week to the season's first week, which starts on the Monday before day one", () => {
    expect(clamp("2026-08-17")).toBe("2026-08-24");
    expect(clamp("1999-01-04")).toBe("2026-08-24");
  });

  it("pulls a later week back to the week of the season's last day", () => {
    expect(clamp("2027-11-22")).toBe("2027-11-15");
    expect(clamp("2099-01-05")).toBe("2027-11-15");
  });
});

describe("isWeekStart (the ?week= rule)", () => {
  it("accepts only Mondays", () => {
    expect(isWeekStart("2026-10-05")).toBe(true);
    expect(isWeekStart("2026-10-06")).toBe(false);
    expect(isWeekStart("2026-10-11")).toBe(false);
  });

  it("rejects non-dates", () => {
    expect(isWeekStart("2026-02-30")).toBe(false);
    expect(isWeekStart("next-week")).toBe(false);
  });
});

describe("easternMidnight and weekInstants", () => {
  it("is 04:00 UTC in daylight time and 05:00 UTC in standard time", () => {
    expect(easternMidnight("2026-10-05").toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(easternMidnight("2026-12-07").toISOString()).toBe("2026-12-07T05:00:00.000Z");
  });

  it("is right on both clock-change days (the change happens at 2 am, after midnight)", () => {
    expect(easternMidnight("2026-11-01").toISOString()).toBe("2026-11-01T04:00:00.000Z"); // EDT
    expect(easternMidnight("2026-11-02").toISOString()).toBe("2026-11-02T05:00:00.000Z"); // EST
    expect(easternMidnight("2027-03-14").toISOString()).toBe("2027-03-14T05:00:00.000Z"); // EST
    expect(easternMidnight("2027-03-15").toISOString()).toBe("2027-03-15T04:00:00.000Z"); // EDT
  });

  it("makes the week containing the fall-back 169 hours and the spring-forward week 167", () => {
    const normal = weekInstants("2026-10-05");
    expect(hoursBetween(normal.from, normal.to)).toBe(168);
    const fallBack = weekInstants("2026-10-26");
    expect(hoursBetween(fallBack.from, fallBack.to)).toBe(169);
    const springForward = weekInstants("2027-03-08");
    expect(hoursBetween(springForward.from, springForward.to)).toBe(167);
  });

  it("puts a game at 11:59 pm Sunday in this week and 12:00 am Monday in the next", () => {
    const { from, to } = weekInstants("2026-10-05");
    const lastMoment = new Date("2026-10-12T03:59:59Z"); // Sun Oct 11, 11:59:59 pm EDT
    expect(lastMoment >= from && lastMoment < to).toBe(true);
    expect(new Date("2026-10-12T04:00:00Z") < to).toBe(false);
  });

  it("rejects a date that does not exist", () => {
    expect(() => easternMidnight("2026-02-30")).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("formats a week range, adding the year once or on both ends", () => {
    expect(formatWeekRange("2026-10-05")).toBe("Oct 5 – 11, 2026");
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  it("formats a day heading", () => {
    expect(formatDayHeading("2026-10-04")).toBe("Sunday, Oct 4");
    expect(formatDayHeading("2026-10-05")).toBe("Monday, Oct 5");
  });

  it("formats Eastern times with a plain space, noon as PM and midnight as AM", () => {
    expect(formatEasternTime(new Date("2026-10-04T17:00:00Z"))).toBe("1:00 PM");
    expect(formatEasternTime(new Date("2026-10-04T16:00:00Z"))).toBe("12:00 PM");
    expect(formatEasternTime(new Date("2026-10-05T04:00:00Z"))).toBe("12:00 AM");
    expect(formatEasternTime(new Date("2026-12-08T00:35:00Z"))).toBe("7:35 PM"); // EST
    expect(formatEasternTime(new Date("2026-10-04T17:00:00Z"))).not.toMatch(/ | /);
  });

  it("names the Eastern weekday of an instant", () => {
    expect(easternWeekdayShort(new Date("2026-10-04T17:00:00Z"))).toBe("Sun");
    expect(easternWeekdayShort(new Date("2026-10-05T02:30:00Z"))).toBe("Sun");
  });
});
