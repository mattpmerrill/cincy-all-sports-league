/** Test-only helpers: a scripted fetch so no test touches the network or real timers. */

export const noSleep = async () => {};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Answers each request from `handler(url)`; records every URL requested. */
export function scriptedFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  };
  return { fetchImpl, calls };
}
