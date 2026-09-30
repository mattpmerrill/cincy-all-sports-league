import { describe, expect, it } from "vitest";
import { mapPool } from "./map-pool";

describe("mapPool", () => {
  it("keeps result order even when later items finish first", async () => {
    const delays = [30, 5, 15];
    const out = await mapPool(delays, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual(delays);
  });

  it("never runs more than the limit at once and still visits every item", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it("handles an empty list", async () => {
    expect(await mapPool([], 4, async (n: number) => n)).toEqual([]);
  });
});
