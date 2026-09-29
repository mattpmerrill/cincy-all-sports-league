import { describe, expect, it } from "vitest";
import type { DbClient } from "./db-client";
import { createParticipantResultsRepository } from "./participant-results.repository";

/** Answers every `.in("participant_id", ids)` read with one row per id, recording each request. */
function fakeDb() {
  const requests: string[][] = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: (_column: string, ids: string[]) => {
            requests.push(ids);
            return {
              order: () => ({
                range: async () => ({
                  data: ids.map((id) => ({
                    id: `r-${id}`,
                    participant_id: id,
                    scoring_rule_id: "rule",
                    quantity: 1,
                    event_label: "",
                    source: "espn",
                    is_locked: false,
                    updated_at: "2026-09-29T00:00:00Z",
                  })),
                  error: null,
                }),
              }),
            };
          },
        }),
      }),
    }),
  } as unknown as DbClient;
  return { db, requests };
}

describe("listForParticipants", () => {
  it("splits a large id list into requests of at most 150 ids and returns every row", async () => {
    const { db, requests } = fakeDb();
    const ids = Array.from({ length: 451 }, (_, i) => `p${i}`);
    const rows = await createParticipantResultsRepository(db).listForParticipants("season", ids);

    expect(requests.map((r) => r.length)).toEqual([150, 150, 150, 1]);
    expect(requests.flat()).toEqual(ids);
    expect(rows.map((r) => r.participantId).sort()).toEqual([...ids].sort());
  });

  it("makes no request at all for an empty list", async () => {
    const { db, requests } = fakeDb();
    expect(await createParticipantResultsRepository(db).listForParticipants("season", [])).toEqual(
      [],
    );
    expect(requests).toEqual([]);
  });
});
