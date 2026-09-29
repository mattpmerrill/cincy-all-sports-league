import { describe, expect, it } from "vitest";
import { AN_HOUR_AGO, IN_AN_HOUR, NOW, listing, offer, teamRef } from "./fixtures";
import { effectiveListingStatus, effectiveOfferStatus, formatTimeLeft, timeLeft } from "./status";

describe("effectiveListingStatus", () => {
  it("is open until the window closes and expired from the exact closing instant", () => {
    expect(effectiveListingStatus(listing({ closesAt: IN_AN_HOUR }), NOW)).toBe("open");
    expect(effectiveListingStatus(listing({ closesAt: NOW.toISOString() }), NOW)).toBe("expired");
    expect(effectiveListingStatus(listing({ closesAt: AN_HOUR_AGO }), NOW)).toBe("expired");
  });

  it("keeps resolved statuses even after the window passed", () => {
    for (const status of ["accepted", "cancelled"] as const) {
      expect(effectiveListingStatus(listing({ status, closesAt: AN_HOUR_AGO }), NOW)).toBe(status);
    }
  });

  it("reads timestamps with an offset the way the database returns them", () => {
    const l = listing({ closesAt: "2026-09-29T12:00:00+00:00" });
    expect(effectiveListingStatus(l, NOW)).toBe("expired");
  });
});

describe("effectiveOfferStatus", () => {
  const o = (status: "pending" | "rejected") => offer({ offeringTeam: teamRef("Papie"), status });

  it("reads a pending offer on an expired listing as expired", () => {
    expect(effectiveOfferStatus(o("pending"), listing({ closesAt: AN_HOUR_AGO }), NOW)).toBe(
      "expired",
    );
    expect(effectiveOfferStatus(o("pending"), listing(), NOW)).toBe("pending");
  });

  it("leaves resolved offers alone", () => {
    expect(effectiveOfferStatus(o("rejected"), listing({ closesAt: AN_HOUR_AGO }), NOW)).toBe(
      "rejected",
    );
  });
});

describe("timeLeft", () => {
  it("counts down while open and is zero once closed, resolved or expired", () => {
    expect(timeLeft(listing(), NOW)).toBe(3_600_000);
    expect(timeLeft(listing({ closesAt: AN_HOUR_AGO }), NOW)).toBe(0);
    expect(timeLeft(listing({ status: "accepted" }), NOW)).toBe(0);
  });
});

describe("formatTimeLeft", () => {
  it("shows hours and minutes, rounding minutes up", () => {
    expect(formatTimeLeft(23 * 3_600_000 + 12 * 60_000)).toBe("23h 12m");
    expect(formatTimeLeft(2 * 3_600_000)).toBe("2h");
    expect(formatTimeLeft(45 * 60_000)).toBe("45m");
    expect(formatTimeLeft(1_000)).toBe("1m");
    expect(formatTimeLeft(0)).toBe("Closed");
  });
});
