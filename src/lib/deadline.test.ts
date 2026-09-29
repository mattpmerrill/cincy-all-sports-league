import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withDeadline } from "./deadline";

describe("withDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the value and leaves no timer behind when the work is fast", async () => {
    const result = await withDeadline(Promise.resolve("done"), 1000);
    expect(result).toEqual({ ok: true, value: "done" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up with a typed error once the deadline passes", async () => {
    const pending = withDeadline(new Promise<string>(() => undefined), 1000);
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({
      ok: false,
      error: { code: "deadline_exceeded", message: "No answer within 1000 ms" },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rethrows a failure that happens before the deadline, and clears the timer", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not raise an unhandled rejection when the work fails after the deadline", async () => {
    let fail: (e: Error) => void = () => undefined;
    const late = new Promise<string>((_, reject) => (fail = reject));
    const pending = withDeadline(late, 10);
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).ok).toBe(false);
    fail(new Error("too late"));
    await vi.advanceTimersByTimeAsync(0);
  });
});
