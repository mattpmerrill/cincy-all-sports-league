/**
 * Longest a task may hold the queue before the next one is let in. It has to stay longer than the
 * longest single bounded call (`SUBSCRIBE_TIMEOUT_MS`, 45 s), or a legitimately slow first
 * subscribe would be released early and could overlap the next task. A task made of several slow
 * calls can still outlast it, but only when the network is already failing, and each of its awaits
 * is bounded on its own.
 */
export const QUEUE_RELEASE_MS = 60_000;

/**
 * Runs tasks one at a time, in the order they were queued, and keeps going after a failure. The
 * device code uses one queue for everything that touches the browser's push subscription, so a
 * subscribe can never overlap an unsubscribe (a late unsubscribe would kill the next member's
 * fresh subscription) and a background check never runs between a subscribe and the marker write
 * (it would read "a subscription nobody owns" and drop it).
 *
 * A task that never settles (a hung request, a browser call that never answers) must not wedge
 * the page for good: after `releaseAfterMs` the next task goes ahead. The hung one keeps running
 * and its caller keeps waiting, so tasks should bound their own awaits well inside this limit;
 * this is the backstop that keeps sign-out cleanup and the profile section alive.
 */
export function createSerialQueue({ releaseAfterMs = QUEUE_RELEASE_MS } = {}) {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    // `tail` never rejects, so one failed task cannot stop the ones behind it.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const released = new Promise<void>((resolve) => {
      // The clock starts when this task starts (`tail` reached it), not when it was queued.
      void tail.then(() => {
        timer = setTimeout(resolve, releaseAfterMs);
      });
    });
    tail = Promise.race([settled, released]).then(() => clearTimeout(timer));
    return result;
  };
}
