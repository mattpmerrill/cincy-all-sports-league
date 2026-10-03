import { describe, expect, it } from "vitest";
import type { DbClient } from "./db-client";
import { createParticipantRecordsRepository, toRecordData } from "./participant-records.repository";

const row = (id: string) => ({
  participant_id: id,
  wins: 10,
  losses: 4,
  ties: 1,
  ot_losses: 2,
});

/** Answers every `.in("participant_id", ids)` read with one row per id, recording each request. */
function fakeReadDb() {
  const requests: string[][] = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: (_column: string, ids: string[]) => {
            requests.push(ids);
            return {
              order: () => ({ range: async () => ({ data: ids.map(row), error: null }) }),
            };
          },
        }),
      }),
    }),
  } as unknown as DbClient;
  return { db, requests };
}

/** Records every upsert it is given, and can be told to fail. */
function fakeWriteDb(failWith: Error | null = null) {
  const upserts: { rows: Record<string, unknown>[]; options: unknown }[] = [];
  const db = {
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[], options: unknown) => {
        if (table === "participant_records") upserts.push({ rows, options });
        return { error: failWith };
      },
    }),
  } as unknown as DbClient;
  return { db, upserts };
}

describe("toRecordData", () => {
  it("maps database columns to the domain shape, including ot_losses", () => {
    expect(toRecordData(row("p1"))).toEqual({
      participantId: "p1",
      wins: 10,
      losses: 4,
      ties: 1,
      otLosses: 2,
    });
  });
});

describe("listForParticipants", () => {
  it("splits a large id list into requests of at most 150 ids and returns every row", async () => {
    const { db, requests } = fakeReadDb();
    const ids = Array.from({ length: 301 }, (_, i) => `p${i}`);
    const records = await createParticipantRecordsRepository(db).listForParticipants("season", ids);
    expect(requests.map((r) => r.length)).toEqual([150, 150, 1]);
    expect(records.map((r) => r.participantId).sort()).toEqual([...ids].sort());
  });

  it("makes no request for an empty list", async () => {
    const { db, requests } = fakeReadDb();
    expect(await createParticipantRecordsRepository(db).listForParticipants("season", [])).toEqual(
      [],
    );
    expect(requests).toEqual([]);
  });
});

describe("upsertMany", () => {
  const record = { participantId: "p1", wins: 3, losses: 5, ties: 0, otLosses: 1 };

  it("upserts on the primary key, so a repeat leaves one row, in chunks of 500", async () => {
    const { db, upserts } = fakeWriteDb();
    const many = Array.from({ length: 501 }, (_, i) => ({ ...record, participantId: `p${i}` }));
    const written = await createParticipantRecordsRepository(db).upsertMany("season", many);

    expect(written).toBe(501);
    expect(upserts.map((u) => u.rows.length)).toEqual([500, 1]);
    expect(upserts[0]?.options).toEqual({ onConflict: "season_id,participant_id" });
    expect(upserts[0]?.rows[0]).toEqual({
      season_id: "season",
      participant_id: "p0",
      wins: 3,
      losses: 5,
      ties: 0,
      ot_losses: 1,
    });
  });

  it("throws the database error instead of reporting a write that did not happen", async () => {
    const { db } = fakeWriteDb(new Error("permission denied"));
    await expect(
      createParticipantRecordsRepository(db).upsertMany("season", [record]),
    ).rejects.toThrow("permission denied");
  });

  it("sends nothing for an empty list", async () => {
    const { db, upserts } = fakeWriteDb();
    expect(await createParticipantRecordsRepository(db).upsertMany("season", [])).toBe(0);
    expect(upserts).toEqual([]);
  });
});
