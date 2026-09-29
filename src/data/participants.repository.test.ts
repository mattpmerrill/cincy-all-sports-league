import { describe, expect, it } from "vitest";
import type { DbClient } from "./db-client";
import { createParticipantsRepository, type NewParticipant } from "./participants.repository";

const row = (i: number): NewParticipant => ({
  sportId: "sport",
  espnId: `e${i}`,
  name: `Team ${i}`,
  shortName: `T${i}`,
  logoUrl: null,
  primaryColor: null,
});

describe("insertMany", () => {
  it("writes in chunks of 500, ignoring existing ESPN ids, and sums what was created", async () => {
    const chunks: { size: number; options: unknown }[] = [];
    const db = {
      from: () => ({
        upsert: (values: unknown[], options: unknown) => {
          chunks.push({ size: values.length, options });
          // Pretend the database already had 2 rows of every chunk.
          return {
            select: async () => ({ data: new Array(values.length - 2).fill({}), error: null }),
          };
        },
      }),
    } as unknown as DbClient;

    const inserted = await createParticipantsRepository(db).insertMany(
      Array.from({ length: 1100 }, (_, i) => row(i)),
    );

    expect(chunks.map((c) => c.size)).toEqual([500, 500, 100]);
    expect(chunks[0]?.options).toEqual({ onConflict: "sport_id,espn_id", ignoreDuplicates: true });
    expect(inserted).toBe(498 + 498 + 98);
  });

  it("throws the database error rather than reporting a partial insert as success", async () => {
    const db = {
      from: () => ({
        upsert: () => ({ select: async () => ({ data: null, error: new Error("boom") }) }),
      }),
    } as unknown as DbClient;
    await expect(createParticipantsRepository(db).insertMany([row(1)])).rejects.toThrow("boom");
  });

  it("does nothing for an empty list", async () => {
    let called = false;
    const db = {
      from: () => {
        called = true;
      },
    } as unknown as DbClient;
    expect(await createParticipantsRepository(db).insertMany([])).toBe(0);
    expect(called).toBe(false);
  });
});
