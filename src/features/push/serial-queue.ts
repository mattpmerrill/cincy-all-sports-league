/**
 * Runs tasks one at a time, in the order they were queued, and keeps going after a failure. The
 * device code uses one queue for everything that touches the browser's push subscription, so a
 * subscribe can never overlap an unsubscribe (a late unsubscribe would kill the next member's
 * fresh subscription) and a background check never runs between a subscribe and the marker write
 * (it would read "a subscription nobody owns" and drop it).
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    // `tail` never rejects, so one failed task cannot stop the ones behind it.
    tail = result.catch(() => undefined);
    return result;
  };
}
