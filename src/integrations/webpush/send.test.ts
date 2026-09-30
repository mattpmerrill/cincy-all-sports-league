import { describe, expect, it, vi } from "vitest";
import { createPushSender, type PushSendOptions } from "./send";
import { createDeviceKeys, noSleep, targetFor, testVapidConfig } from "./test-utils";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/SECRET-DEVICE-TOKEN";
const OPTIONS: PushSendOptions = { ttlSeconds: 600, urgency: "high" };
const PAYLOAD = '{"v":1,"title":"Hi"}';
const config = testVapidConfig();
const device = createDeviceKeys();
const target = targetFor(device, ENDPOINT);

type Step = (() => Response) | Error;

/** Answers each request with the next step (a fresh Response each time); an Error is thrown as fetch would. */
function scripted(...steps: Step[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    const step = steps[Math.min(requests.length, steps.length) - 1];
    if (step instanceof Error) throw step;
    return step();
  };
  return { fetchImpl, requests };
}

const status =
  (code: number, headers?: Record<string, string>): (() => Response) =>
  () =>
    new Response("provider body that must never be echoed", { status: code, headers });

function sender(steps: Step[], extra: { sleep?: (ms: number) => Promise<void> } = {}) {
  const { fetchImpl, requests } = scripted(...steps);
  const sleep = extra.sleep ?? noSleep;
  return { ...createPushSender({ config, fetchImpl, sleep }), requests };
}

describe("status to code", () => {
  it.each([
    [201, null],
    [404, "push_gone"],
    [410, "push_gone"],
    [400, "push_rejected"],
    [401, "push_rejected"],
    [403, "push_rejected"],
    [413, "push_rejected"],
  ])("maps %i to %s", async (code, expected) => {
    const s = sender([status(code)]);
    const result = await s.sendPush(target, PAYLOAD, OPTIONS);
    if (expected === null) expect(result).toEqual({ ok: true, value: null });
    else expect(result).toMatchObject({ ok: false, error: { code: expected } });
    expect(s.requests).toHaveLength(1);
  });

  it("treats a redirect answer as a failure and asks fetch to refuse redirects", async () => {
    const s = sender([status(302, { location: "https://evil.example/steal" })]);
    expect(await s.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_rejected" },
    });
    expect(s.requests[0]?.init.redirect).toBe("error");
  });

  it("reports a refused redirect (fetch throws) as a network failure, not a retry", async () => {
    const s = sender([new TypeError("fetch failed")]);
    expect(await s.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_network" },
    });
    expect(s.requests).toHaveLength(1);
  });
});

describe("the request", () => {
  it("is a POST of the encrypted bytes with the push headers and no Content-Length", async () => {
    const s = sender([status(201)]);
    await s.sendPush(target, PAYLOAD, OPTIONS);
    const { url, init } = s.requests[0] ?? { url: "", init: {} };
    const headers = new Headers(init.headers);
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(headers.get("ttl")).toBe("600");
    expect(headers.get("urgency")).toBe("high");
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("authorization")).toMatch(/^vapid t=\S+, k=\S+$/);
    expect(Object.keys(init.headers ?? {}).map((h) => h.toLowerCase())).not.toContain(
      "content-length",
    );
  });

  it("gives every attempt a timeout signal", async () => {
    const s = sender([status(201)]);
    await s.sendPush(target, PAYLOAD, OPTIONS);
    expect(s.requests[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("retries", () => {
  it("retries a 429 once, waiting the Retry-After it was given", async () => {
    const sleep = vi.fn(noSleep);
    const s = sender([status(429, { "retry-after": "2" }), status(201)], { sleep });
    expect(await s.sendPush(target, PAYLOAD, OPTIONS)).toEqual({ ok: true, value: null });
    expect(s.requests).toHaveLength(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2000);
  });

  it("never waits longer than three seconds", async () => {
    const sleep = vi.fn(noSleep);
    const s = sender([status(429, { "retry-after": "120" }), status(201)], { sleep });
    await s.sendPush(target, PAYLOAD, OPTIONS);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(3000);
  });

  it("gives up on a 429 after the second attempt", async () => {
    const s = sender([status(429)]);
    expect(await s.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_rate_limited" },
    });
    expect(s.requests).toHaveLength(2);
  });

  it("retries a 5xx, then reports the push service as unavailable", async () => {
    const s = sender([status(503)]);
    expect(await s.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_unavailable" },
    });
    expect(s.requests).toHaveLength(2);
  });

  it("does not retry a 4xx", async () => {
    const s = sender([status(403), status(201)]);
    await s.sendPush(target, PAYLOAD, OPTIONS);
    expect(s.requests).toHaveLength(1);
  });

  it("does not retry a timeout: the push service may already have the alert", async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const requests = vi.fn(hang);
    const slow = createPushSender({ config, fetchImpl: requests, sleep: noSleep, timeoutMs: 10 });
    expect(await slow.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_timeout" },
    });
    expect(requests).toHaveBeenCalledTimes(1);
  });
});

describe("configuration and keys", () => {
  it("makes no request without VAPID keys", async () => {
    const { fetchImpl, requests } = scripted(status(201));
    const unconfigured = createPushSender({ config: null, fetchImpl });
    expect(await unconfigured.sendPush(target, PAYLOAD, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: "push_not_configured" },
    });
    expect(requests).toHaveLength(0);
  });

  it("calls a device with unusable keys invalid, so it can be removed", async () => {
    const { fetchImpl, requests } = scripted(status(201));
    const bad = { ...target, keys: { p256dh: "not-a-key", auth: "nope" } };
    const result = await createPushSender({ config, fetchImpl }).sendPush(bad, PAYLOAD, OPTIONS);
    expect(result).toMatchObject({ ok: false, error: { code: "push_invalid_subscription" } });
    expect(requests).toHaveLength(0);
  });

  it.each([
    ["a public key from a different pair", { ...config, publicKey: testVapidConfig().publicKey }],
    ["an all-zero private key", { ...config, privateKey: "A".repeat(43) }],
  ])("blames our own keys, not the device, for %s", async (_name, broken) => {
    const { fetchImpl, requests } = scripted(status(201));
    const result = await createPushSender({ config: broken, fetchImpl }).sendPush(
      target,
      PAYLOAD,
      OPTIONS,
    );
    // Not push_rejected or push_invalid_subscription: either would count against (and finally
    // delete) every member's device over our own mistake.
    expect(result).toMatchObject({ ok: false, error: { code: "push_not_configured" } });
    expect(requests).toHaveLength(0);
  });
});

describe("messages", () => {
  it("never contain the endpoint, the keys or the response body", async () => {
    const cases: Step[] = [
      status(404),
      status(403),
      status(429),
      status(503),
      new TypeError(`fetch failed ${ENDPOINT}`),
      new DOMException("timed out", "TimeoutError"),
    ];
    for (const step of cases) {
      const result = await sender([step]).sendPush(target, PAYLOAD, OPTIONS);
      const text = JSON.stringify(result);
      for (const secret of [ENDPOINT, "SECRET-DEVICE-TOKEN", device.p256dh, device.auth]) {
        expect(text).not.toContain(secret);
      }
      expect(text).not.toContain("provider body");
    }
    const bad = { ...target, keys: { p256dh: "x", auth: "y" } };
    const invalid = JSON.stringify(await sender([status(201)]).sendPush(bad, PAYLOAD, OPTIONS));
    expect(invalid).not.toContain("SECRET-DEVICE-TOKEN");
  });
});
