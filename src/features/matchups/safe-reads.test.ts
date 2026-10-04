import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@/lib/logger";
import type { MatchupsService } from "./matchups.service";
import { createSafeMatchupReads } from "./safe-reads";

const quietLogger = () => {
  const log: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => log,
  };
  return log;
};

/** A service whose every read rejects, the way a dead cache or database would. */
const broken = (): MatchupsService => {
  const boom = () => Promise.reject(new Error("cache down"));
  return {
    getWeekMatchups: boom,
    getMatchupStandings: boom,
    getTeamMatchups: boom,
    getMatchupRecords: boom,
  };
};

describe("createSafeMatchupReads", () => {
  it("turns a failed read into an unavailable result and logs the cause", async () => {
    const log = quietLogger();
    const reads = createSafeMatchupReads(broken(), log);
    const results = await Promise.all([
      reads.weekMatchups({}),
      reads.standings({}),
      reads.teamMatchups("a"),
      reads.records(),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "matchups_unavailable" } });
    }
    expect(log.error).toHaveBeenCalledTimes(4);
    expect(log.error).toHaveBeenCalledWith(
      "matchups read failed",
      expect.objectContaining({ read: "week", error: expect.any(Error) }),
    );
  });

  it("passes a value, and a null, through untouched", async () => {
    const service = { ...broken(), getWeekMatchups: async () => null };
    const reads = createSafeMatchupReads(service, quietLogger());
    expect(await reads.weekMatchups({ viewerId: "u1" })).toEqual({ ok: true, value: null });
  });
});
