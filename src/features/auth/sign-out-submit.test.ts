import { describe, expect, it, vi } from "vitest";
import { createSignOutSubmitHandler, type SignOutSubmitEvent } from "./sign-out-submit";

function submitEvent() {
  const log: string[] = [];
  const submitter = {} as HTMLElement;
  const event: SignOutSubmitEvent = {
    preventDefault: () => log.push("preventDefault"),
    currentTarget: {
      requestSubmit: (s) => log.push(s === submitter ? "requestSubmit(button)" : "requestSubmit"),
    },
    nativeEvent: { submitter } as unknown as Event,
  };
  return { event, log };
}

describe("createSignOutSubmitHandler", () => {
  it("holds the first submit, runs the cleanup, then submits the form again", async () => {
    const { event, log } = submitEvent();
    const handler = createSignOutSubmitHandler(async () => {
      log.push("cleanup");
    });

    await handler(event);
    expect(log).toEqual(["preventDefault", "cleanup", "requestSubmit(button)"]);

    // The re-submitted form reaches the handler again and is let through untouched.
    const again = submitEvent();
    await handler(again.event);
    expect(again.log).toEqual([]);
  });

  it("signs out even when the cleanup throws", async () => {
    const { event, log } = submitEvent();
    await createSignOutSubmitHandler(async () => {
      throw new Error("push cleanup failed");
    })(event);
    expect(log).toEqual(["preventDefault", "requestSubmit(button)"]);
  });

  it("does not run the cleanup twice when the button is pressed again while it runs", async () => {
    const cleanup = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 5)));
    const handler = createSignOutSubmitHandler(cleanup);
    const first = submitEvent();
    const second = submitEvent();

    await Promise.all([handler(first.event), handler(second.event)]);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(second.log).toEqual(["preventDefault"]);
    expect(first.log).toEqual(["preventDefault", "requestSubmit(button)"]);
  });

  it("leaves the form alone when there is nothing to clean up", async () => {
    const { event, log } = submitEvent();
    await createSignOutSubmitHandler(undefined)(event);
    expect(log).toEqual([]);
  });

  it("reports when the cleanup starts", async () => {
    const seen: boolean[] = [];
    await createSignOutSubmitHandler(
      async () => undefined,
      (c) => seen.push(c),
    )(submitEvent().event);
    expect(seen).toEqual([true]);
  });
});
