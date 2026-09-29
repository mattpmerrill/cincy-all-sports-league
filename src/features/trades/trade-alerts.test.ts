import { describe, expect, it, vi } from "vitest";
import type { TradeRecipient } from "@/data/trade-recipients.repository";
import type { EmailSender, OutgoingEmail } from "@/integrations/resend";
import { createLogger } from "@/lib/logger";
import { err, ok } from "@/lib/result";
import { createTradeAlertSender, type TradeAlert } from "./trade-alerts";

const alert = (recipientId: string, over: Partial<TradeAlert> = {}): TradeAlert => ({
  event: "new_offer",
  recipientId,
  listingId: "l1",
  offerId: "o1",
  content: { subject: "Offer", lines: ["Line one."] },
  ...over,
});

function setup(
  recipients: Record<string, TradeRecipient | null | Error>,
  send: EmailSender["sendEmail"] = async () => ok({ id: "e1" }),
) {
  const sent: OutgoingEmail[] = [];
  const logs: { level: string; msg: string; fields?: Record<string, unknown> }[] = [];
  const logger = createLogger();
  const record = (level: string) => (msg: string, fields?: Record<string, unknown>) =>
    logs.push({ level, msg, fields });
  const sender = createTradeAlertSender({
    recipients: {
      getRecipient: async (id) => {
        const found = recipients[id] ?? null;
        if (found instanceof Error) throw found;
        return found;
      },
    },
    sender: {
      sendEmail: async (email) => {
        sent.push(email);
        return send(email);
      },
    },
    renderEmail: async (props) => ({
      html: `<p>${props.viewUrl}|${props.settingsUrl}</p>`,
      text: props.heading,
    }),
    siteUrl: "https://league.test/",
    logger: {
      ...logger,
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      child: () => ({
        ...logger,
        info: record("info"),
        warn: record("warn"),
        error: record("error"),
      }),
    },
    newCorrelationId: () => "corr-1",
    sleep: async () => {},
  });
  return { sender, sent, logs };
}

describe("createTradeAlertSender", () => {
  it("sends to a member with trade emails on, with a stable idempotency key and the links", async () => {
    const { sender, sent } = setup({ u1: { email: "sam@example.com", tradeEmails: true } });
    await sender.deliver([alert("u1", { event: "lost", offerId: "o9" })]);
    expect(sent).toEqual([
      expect.objectContaining({
        to: "sam@example.com",
        subject: "Offer",
        idempotencyKey: "trade-o9-lost-u1",
        html: "<p>https://league.test/trades/l1|https://league.test/me</p>",
      }),
    ]);
  });

  it("skips members who turned trade emails off or have no confirmed address", async () => {
    const { sender, sent, logs } = setup({
      off: { email: "off@example.com", tradeEmails: false },
      none: null,
    });
    await sender.deliver([alert("off"), alert("none")]);
    expect(sent).toEqual([]);
    expect(logs.map((l) => l.fields?.reason)).toEqual(["trade_emails_off", "no_confirmed_email"]);
  });

  it("logs a failed send and keeps going, never exposing the address", async () => {
    const send = vi
      .fn<EmailSender["sendEmail"]>()
      .mockResolvedValueOnce(err("email_unavailable", "down"))
      .mockResolvedValueOnce(ok({ id: "e2" }));
    const { sender, sent, logs } = setup(
      {
        a: { email: "alice@example.com", tradeEmails: true },
        b: { email: "bob@example.com", tradeEmails: true },
      },
      send,
    );
    await sender.deliver([alert("a"), alert("b", { offerId: "o2" })]);
    expect(sent.map((e) => e.to)).toEqual(["alice@example.com", "bob@example.com"]);
    expect(logs.find((l) => l.level === "warn")?.fields).toMatchObject({
      code: "email_unavailable",
      to: "a***@example.com",
    });
    expect(JSON.stringify(logs)).not.toContain("alice@example.com");
  });

  it("swallows a lookup error so one bad recipient cannot stop the rest", async () => {
    const { sender, sent, logs } = setup({
      bad: new Error("db down"),
      ok: { email: "ok@example.com", tradeEmails: true },
    });
    await expect(sender.deliver([alert("bad"), alert("ok")])).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(logs.some((l) => l.level === "error")).toBe(true);
  });

  it("stops quietly at the first send when email is not configured", async () => {
    const send = vi.fn<EmailSender["sendEmail"]>(async () => err("email_not_configured", "no key"));
    const { sender, sent, logs } = setup(
      {
        a: { email: "a@example.com", tradeEmails: true },
        b: { email: "b@example.com", tradeEmails: true },
      },
      send,
    );
    await sender.deliver([alert("a"), alert("b")]);
    expect(sent).toHaveLength(1);
    expect(logs.filter((l) => l.level !== "info")).toEqual([]);
  });
});
