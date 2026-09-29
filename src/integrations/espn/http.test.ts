import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getJson, mapWithConcurrency } from "./http";
import { jsonResponse, noSleep, scriptedFetch } from "./test-utils";

const schema = z.object({ value: z.number() });

describe("getJson", () => {
  it("retries transient failures (429, 5xx, network) and then succeeds", async () => {
    const statuses = [429, 503, "network", 200] as const;
    let call = 0;
    const { fetchImpl, calls } = scriptedFetch(() => {
      const next = statuses[call++];
      if (next === "network") throw new TypeError("fetch failed");
      return next === 200 ? jsonResponse({ value: 7 }) : jsonResponse({}, next);
    });

    const result = await getJson("https://x.test/a", schema, {
      fetchImpl,
      sleep: noSleep,
      maxAttempts: 4,
    });

    expect(result).toEqual({ ok: true, value: { value: 7 } });
    expect(calls).toHaveLength(4);
  });

  it("gives up after the bounded number of attempts with a typed error", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}, 500));
    const result = await getJson("https://x.test/a", schema, { fetchImpl, sleep: noSleep });

    expect(result).toMatchObject({ ok: false, error: { code: "espn_http" } });
    expect(calls).toHaveLength(3);
  });

  it("does not retry a 404: the request itself is wrong", async () => {
    const { fetchImpl, calls } = scriptedFetch(() => jsonResponse({}, 404));
    const result = await getJson("https://x.test/a", schema, { fetchImpl, sleep: noSleep });

    expect(result).toMatchObject({ ok: false, error: { code: "espn_not_found" } });
    expect(calls).toHaveLength(1);
  });

  it("reports a changed shape by field path without echoing payload values", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse({ value: "secret-looking-text" }));
    const result = await getJson("https://x.test/a", schema, { fetchImpl, sleep: noSleep });

    expect(result).toMatchObject({ ok: false, error: { code: "espn_shape" } });
    if (!result.ok) {
      expect(result.error.message).toContain('"value"');
      expect(result.error.message).not.toContain("secret-looking-text");
    }
  });

  it("tolerates extra fields ESPN adds", async () => {
    const { fetchImpl } = scriptedFetch(() => jsonResponse({ value: 1, brandNew: { deep: true } }));
    const result = await getJson("https://x.test/a", schema, { fetchImpl });
    expect(result).toEqual({ ok: true, value: { value: 1 } });
  });
});

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n * 10;
    });

    expect(peak).toBe(3);
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });
});
