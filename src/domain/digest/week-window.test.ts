import { describe, expect, it } from "vitest";
import { subtractDays, weekWindow } from "./week-window";

describe("weekWindow", () => {
  it("finds the Monday of the Eastern week for any weekday", () => {
    // Wed Sep 30 2026 15:00 EDT
    expect(weekWindow(new Date("2026-09-30T19:00:00Z")).weekStart).toBe("2026-09-28");
    // Sun Oct 4 2026 22:00 EDT is still the week of Sep 28
    expect(weekWindow(new Date("2026-10-05T02:00:00Z")).weekStart).toBe("2026-09-28");
  });

  it("uses Eastern time for the date, not UTC", () => {
    // Mon Sep 28 00:30 EDT is Sep 28 04:30 UTC; Sun 23:30 EDT is already Mon in UTC.
    expect(weekWindow(new Date("2026-09-28T03:30:00Z"))).toEqual({
      weekStart: "2026-09-21",
      pastSendTime: true,
    });
    expect(weekWindow(new Date("2026-09-28T04:30:00Z"))).toEqual({
      weekStart: "2026-09-28",
      pastSendTime: false,
    });
  });

  describe("in daylight time (EDT, UTC-4)", () => {
    it("is early at 11:59 UTC and on time at 12:00 UTC", () => {
      expect(weekWindow(new Date("2026-09-28T11:59:00Z")).pastSendTime).toBe(false);
      expect(weekWindow(new Date("2026-09-28T12:00:00Z")).pastSendTime).toBe(true);
    });
  });

  describe("after the November fall-back (EST, UTC-5)", () => {
    // Sun Nov 1 2026 clocks go back; Mon Nov 2 08:00 EST is 13:00 UTC, so the 12:00 UTC job is early.
    it("treats 12:00 UTC on Nov 2 as 07:00 and 13:00 UTC as 08:00", () => {
      expect(weekWindow(new Date("2026-11-02T12:00:00Z"))).toEqual({
        weekStart: "2026-11-02",
        pastSendTime: false,
      });
      expect(weekWindow(new Date("2026-11-02T13:00:00Z"))).toEqual({
        weekStart: "2026-11-02",
        pastSendTime: true,
      });
    });

    it("keeps the previous Monday on the fall-back Sunday", () => {
      expect(weekWindow(new Date("2026-11-01T12:00:00Z")).weekStart).toBe("2026-10-26");
    });
  });

  describe("around the March spring-forward (2027-03-14)", () => {
    it("is still EST on Mon Mar 8, so 12:00 UTC is early", () => {
      expect(weekWindow(new Date("2027-03-08T12:00:00Z")).pastSendTime).toBe(false);
      expect(weekWindow(new Date("2027-03-08T13:00:00Z")).pastSendTime).toBe(true);
    });

    it("is EDT on Mon Mar 15, so 12:00 UTC is on time", () => {
      expect(weekWindow(new Date("2027-03-15T11:59:00Z")).pastSendTime).toBe(false);
      expect(weekWindow(new Date("2027-03-15T12:00:00Z"))).toEqual({
        weekStart: "2027-03-15",
        pastSendTime: true,
      });
    });

    it("does not lose or repeat a day across the change", () => {
      expect(weekWindow(new Date("2027-03-14T15:00:00Z")).weekStart).toBe("2027-03-08");
      expect(weekWindow(new Date("2027-03-14T05:30:00Z")).weekStart).toBe("2027-03-08");
    });
  });

  it("counts the rest of the week as past send time so a missed Monday can be recovered", () => {
    expect(weekWindow(new Date("2026-09-29T14:00:00Z")).pastSendTime).toBe(true);
    expect(weekWindow(new Date("2026-10-04T14:00:00Z")).pastSendTime).toBe(true);
  });
});

describe("subtractDays", () => {
  it("crosses month and year boundaries and DST", () => {
    expect(subtractDays("2026-09-28", 7)).toBe("2026-09-21");
    expect(subtractDays("2027-01-03", 7)).toBe("2026-12-27");
    expect(subtractDays("2027-03-15", 7)).toBe("2027-03-08");
  });
});
