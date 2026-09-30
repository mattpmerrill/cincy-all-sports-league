import { describe, expect, it } from "vitest";
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
});
