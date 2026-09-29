import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/lib/result";

export type EspnErrorCode =
  | "espn_network" // DNS, connection reset, offline
  | "espn_timeout"
  | "espn_not_found" // 404: unknown team, season or event
  | "espn_http" // any other non-2xx
  | "espn_invalid_json"
  | "espn_shape" // response no longer matches the fields we rely on
  | "espn_unsupported"; // caller asked for a sport/feature this adapter has no feed for

export type EspnError = AppError<EspnErrorCode>;

/** Injectable so tests and the smoke script never need the real network or real sleeping. */
export type EspnClientOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

const DEFAULTS = { timeoutMs: 10_000, maxAttempts: 3, baseDelayMs: 300 };
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Only failures that can succeed on a second try. 4xx (except 429) means our request is wrong.
const isTransientStatus = (status: number) => status === 429 || status >= 500;

type Attempt =
  { kind: "done"; result: Result<unknown, EspnError> } | { kind: "retry"; error: EspnError };

async function attemptOnce(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Attempt> {
  let response: Response;
  try {
    // Node's fetch sends Accept-Encoding and transparently gunzips ESPN's responses.
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
    const code = timedOut ? "espn_timeout" : "espn_network";
    return { kind: "retry", error: { code, message: `ESPN request failed (${code})` } };
  }

  if (isTransientStatus(response.status)) {
    return {
      kind: "retry",
      error: { code: "espn_http", message: `ESPN responded ${response.status}` },
    };
  }
  if (response.status === 404) {
    return { kind: "done", result: err("espn_not_found", "ESPN has no data for this request") };
  }
  if (!response.ok) {
    return {
      kind: "done",
      result: err("espn_http", `ESPN responded ${response.status}`),
    };
  }

  try {
    return { kind: "done", result: ok(await response.json()) };
  } catch {
    return {
      kind: "done",
      result: err("espn_invalid_json", "ESPN returned a body that is not JSON"),
    };
  }
}

/**
 * GET + validate. Schemas list only the fields we consume and ignore the rest, so ESPN adding
 * fields never breaks us but removing or renaming one fails loudly with `espn_shape`.
 * The URL is never logged with the payload; error messages carry no response body.
 */
export async function getJson<S extends z.ZodType>(
  url: string,
  schema: S,
  options: EspnClientOptions = {},
): Promise<Result<z.output<S>, EspnError>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;

  let last: EspnError = { code: "espn_network", message: "ESPN request failed" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptOnce(url, fetchImpl, timeoutMs);
    if (outcome.kind === "done") {
      if (!outcome.result.ok) return outcome.result;
      const parsed = schema.safeParse(outcome.result.value);
      if (!parsed.success) {
        // Path only, never values: keeps payload contents out of logs and error messages.
        const path = parsed.error.issues[0]?.path.join(".") ?? "";
        return err("espn_shape", `ESPN response changed shape at "${path}"`);
      }
      return ok(parsed.data);
    }
    last = outcome.error;
    if (attempt < maxAttempts) await sleep(DEFAULTS.baseDelayMs * 2 ** (attempt - 1));
  }
  return { ok: false, error: last };
}

/** Runs `worker` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}
