import { describe, expect, it } from "vitest";
import { easternDate, relativeTime } from "./time";

describe("easternDate", () => {
  it("uses the Eastern calendar day, not UTC's", () => {
    // 01:30 UTC on Oct 20 is still the evening of Oct 19 in Cincinnati.
    expect(easternDate(new Date("2026-10-20T01:30:00Z"))).toBe("2026-10-19");
    expect(easternDate(new Date("2026-10-20T15:00:00Z"))).toBe("2026-10-20");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now);
  it("picks the coarsest fitting unit", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(12 * 60_000)).toBe("12 min ago");
    expect(ago(3 * 3_600_000)).toBe("3 hr ago");
    expect(ago(24 * 3_600_000)).toBe("1 day ago");
    expect(ago(50 * 3_600_000)).toBe("2 days ago");
  });
  it("never goes negative when the clock is slightly behind", () => {
    expect(relativeTime(new Date(now.getTime() + 5000), now)).toBe("just now");
  });
});
