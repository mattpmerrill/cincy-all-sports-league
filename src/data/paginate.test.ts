import { describe, expect, it } from "vitest";
import { fetchAllRows, PAGE_SIZE } from "./paginate";

const source = (total: number) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from(
      { length: Math.max(0, Math.min(to + 1, total) - from) },
      (_, i) => from + i,
    );
    return { data, error: null };
  };
  return { page, calls };
};

describe("fetchAllRows", () => {
  it("keeps reading while pages come back full, then stops on the short one", async () => {
    const { page, calls } = source(PAGE_SIZE * 2 + 5);
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(PAGE_SIZE * 2 + 5);
    expect(calls).toHaveLength(3);
  });

  it("needs one extra empty read when the total is an exact multiple", async () => {
    const { page, calls } = source(PAGE_SIZE);
    expect(await fetchAllRows(page)).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
  });

  it("throws the database error instead of returning a partial list", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: new Error("boom") })),
    ).rejects.toThrow("boom");
  });
});
