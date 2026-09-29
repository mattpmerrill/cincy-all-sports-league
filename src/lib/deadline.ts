import { err, type AppError, type Result } from "./result";

/**
 * Gives a promise an overall time limit. Per-request timeouts and retries add up (two attempts of
 * five seconds each, several calls), so a caller with a person waiting needs one number for the
 * whole thing. On expiry the work is not cancelled (a promise cannot be), its result is just no
 * longer awaited; if it fails later that failure is swallowed here, because the caller already
 * moved on. A failure before the deadline is rethrown as usual. The timer is always cleared, so a
 * fast result leaves nothing pending.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<Result<T, AppError<"deadline_exceeded">>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<Result<never, AppError<"deadline_exceeded">>>((resolve) => {
    timer = setTimeout(() => resolve(err("deadline_exceeded", `No answer within ${ms} ms`)), ms);
  });
  try {
    const settled = work.then((value): Result<T, never> => ({ ok: true, value }));
    return await Promise.race([settled, expired]);
  } finally {
    clearTimeout(timer);
  }
}
