import { afterEach, describe, expect, it, vi } from "vitest";
import { createSerialQueue } from "./serial-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createSerialQueue", () => {
  it("never overlaps two tasks and keeps their order", async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    const task = (name: string, ms: number) => async () => {
      running += 1;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      running -= 1;
      return name;
    };

    const results = await Promise.all([run(task("a", 15)), run(task("b", 0)), run(task("c", 5))]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("keeps running after a task fails, and still reports that failure to its caller", async () => {
    const run = createSerialQueue();
    const failing = run(async () => {
      await tick();
      throw new Error("first failed");
    });
    const next = run(async () => "second ran");

    await expect(failing).rejects.toThrow("first failed");
    await expect(next).resolves.toBe("second ran");
  });

  describe("a task that never settles", () => {
    afterEach(() => vi.useRealTimers());

    it("does not block later tasks forever", async () => {
      vi.useFakeTimers();
      const run = createSerialQueue({ releaseAfterMs: 30_000 });
      run(() => new Promise<never>(() => undefined)).catch(() => undefined);
      const order: string[] = [];
      const later = run(async () => {
        order.push("later");
        return "ran";
      });
      const another = run(async () => {
        order.push("another");
        return "ran too";
      });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(order).toEqual([]);
      await vi.advanceTimersByTimeAsync(2);
      await expect(later).resolves.toBe("ran");
      await expect(another).resolves.toBe("ran too");
      expect(order).toEqual(["later", "another"]);
    });

    it("counts the wait from when a task starts, not from when it was queued", async () => {
      vi.useFakeTimers();
      const run = createSerialQueue({ releaseAfterMs: 30_000 });
      const slow = run(
        () => new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 20_000)),
      );
      const next = run(async () => "next");
      // 20 s of waiting behind the slow task must not count against `next`.
      await vi.advanceTimersByTimeAsync(20_001);
      await expect(slow).resolves.toBe("slow");
      await expect(next).resolves.toBe("next");
    });
  });
});
