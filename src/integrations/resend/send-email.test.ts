import { describe, expect, it, vi } from "vitest";
import { createEmailSender } from "./send-email";

const email = {
  to: "sam@example.com",
  subject: "Week of Sep 28: A climbs to 1",
  html: "<p>hi</p>",
  text: "hi",
  headers: { "List-Unsubscribe": "<https://example.com/u?t=x>" },
  idempotencyKey: "digest-2026-09-28-user-1",
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: Array<Response | Error>, overrides = {}) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const sender = createEmailSender({
    apiKey: "re_test",
    from: "League <league@example.com>",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    ...overrides,
  });
  return { sender, fetchImpl, sleep };
}

describe("createEmailSender", () => {
  it("posts the message to Resend with the bearer key and maps the id", async () => {
    const { sender, fetchImpl } = setup([json(200, { id: "msg_1" })]);
    const result = await sender.sendEmail(email);

    expect(result).toEqual({ ok: true, value: { id: "msg_1" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test",
      "idempotency-key": "digest-2026-09-28-user-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "League <league@example.com>",
      to: ["sam@example.com"],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
  });

  it("fails with email_not_configured and never touches the network without a key", async () => {
    const { sender, fetchImpl } = setup([], { apiKey: undefined });
    const result = await sender.sendEmail(email);
    expect(result).toMatchObject({ ok: false, error: { code: "email_not_configured" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a 429, waiting for Retry-After, then succeeds", async () => {
    const { sender, fetchImpl, sleep } = setup([
      json(429, { message: "slow down" }, { "retry-after": "2" }),
      json(200, { id: "msg_2" }),
    ]);
    const result = await sender.sendEmail(email);
    expect(result).toEqual({ ok: true, value: { id: "msg_2" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("retries 5xx with growing backoff and gives up with email_unavailable", async () => {
    const { sender, fetchImpl, sleep } = setup([json(503, {}), json(500, {}), json(502, {})]);
    const result = await sender.sendEmail(email);
    expect(result).toMatchObject({ ok: false, error: { code: "email_unavailable" } });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it("reports email_rate_limited when 429 outlasts the retries", async () => {
    const { sender } = setup([json(429, {}), json(429, {}), json(429, {})]);
    expect(await sender.sendEmail(email)).toMatchObject({
      ok: false,
      error: { code: "email_rate_limited" },
    });
  });

  it("does not retry a 400, and the error carries neither the body nor the address", async () => {
    const { sender, fetchImpl, sleep } = setup([
      json(400, { message: "Invalid `to` field sam@example.com" }),
    ]);
    const result = await sender.sendEmail(email);
    expect(result).toMatchObject({ ok: false, error: { code: "email_rejected" } });
    expect(JSON.stringify(result)).not.toContain("sam@example.com");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects a 2xx body without an id as email_shape", async () => {
    const { sender } = setup([json(200, { ok: true })]);
    expect(await sender.sendEmail(email)).toMatchObject({
      ok: false,
      error: { code: "email_shape" },
    });
  });

  it("does not retry a network failure or a timeout, since delivery is unknown", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const a = setup([new TypeError("fetch failed")]);
    expect(await a.sender.sendEmail(email)).toMatchObject({ error: { code: "email_network" } });
    expect(a.fetchImpl).toHaveBeenCalledTimes(1);
    const b = setup([timeout]);
    expect(await b.sender.sendEmail(email)).toMatchObject({ error: { code: "email_timeout" } });
    expect(b.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
