import { describe, expect, it, vi } from "vitest";
import { leagueData, wins } from "@/domain/league/fixtures";
import type { DigestMember, DigestSend } from "@/data/digest.repository";
import type { EmailError, OutgoingEmail } from "@/integrations/resend";
import { createLogger, type Logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import { createDigestService } from "./digest.service";

const USER_A = "6f1d2c1e-8a44-4f57-9a3b-0c1d2e3f4a5b";
const USER_B = "0b9f6a52-1d3e-4c5b-8a7f-123456789abc";
const USER_C = "9c8b7a65-4321-4fed-b0a9-abcdef012345";

const owner = (id: string, displayName: string) => ({ id, displayName, avatarUrl: null });

// Team a (owner Ann) has 6 points and team b (owner Bo) has 2. A week ago b led 4 to 0.
const data = leagueData({
  teams: [
    { id: "a", owner: owner(USER_A, "Ann") },
    { id: "b", owner: owner(USER_B, "Bo") },
  ],
  results: [wins("a-nfl", 3), wins("b-nfl", 1)],
});

const member = (userId: string, name: string, optedIn = true): DigestMember => ({
  userId,
  email: `${name.toLowerCase()}@example.com`,
  displayName: name,
  optedIn,
});

// Monday Sep 28 2026 12:00 UTC is 08:00 EDT.
const MONDAY_8AM = new Date("2026-09-28T12:00:00Z");
const MONDAY_7AM_EST = new Date("2026-11-02T12:00:00Z");

function setup(
  opts: {
    members?: DigestMember[];
    existing?: DigestSend | null;
    send?: (email: OutgoingEmail) => Result<{ id: string }, EmailError>;
    signToken?: ((userId: string) => string) | null;
    snapshotRows?: { teamId: string; rank: number; totalPoints: number }[];
  } = {},
) {
  const sent: OutgoingEmail[] = [];
  const recorded: unknown[] = [];
  const lines: string[] = [];
  const logger: Logger = createLogger();
  const logSpy = vi.spyOn(console, "log").mockImplementation((line: string) => {
    lines.push(line);
  });
  const load = vi.fn(async () => data);
  const latestOnOrBefore = vi.fn(async () => ({
    date: "2026-09-21",
    rows: opts.snapshotRows ?? [
      { teamId: "b", rank: 1, totalPoints: 4 },
      { teamId: "a", rank: 2, totalPoints: 0 },
    ],
  }));
  const service = createDigestService({
    league: { load },
    snapshots: { latestOnOrBefore },
    digests: {
      listConfirmedMembers: async () =>
        opts.members ?? [member(USER_A, "Ann"), member(USER_B, "Bo"), member(USER_C, "Cy", false)],
      getSend: async () => opts.existing ?? null,
      recordSend: async (send) => {
        recorded.push(send);
      },
    },
    sender: {
      sendEmail: async (email) => {
        sent.push(email);
        return opts.send ? opts.send(email) : ok({ id: "msg" });
      },
    },
    renderEmail: async (props) => ({
      html: `<p>${props.displayName}|${props.digest.recipient?.teamName ?? "no team"}</p>`,
      text: "text",
    }),
    signToken: opts.signToken === undefined ? (id) => `tok-${id}` : opts.signToken,
    siteUrl: "https://www.cincysports.xyz/",
    logger,
    newCorrelationId: () => "corr-1",
    sleep: async () => {},
    spacingMs: 0,
  });
  return {
    service,
    sent,
    recorded,
    lines,
    load,
    latestOnOrBefore,
    restore: () => logSpy.mockRestore(),
  };
}

describe("sendWeeklyDigest guards", () => {
  it("does nothing before Monday 08:00 Eastern, even at 12:00 UTC in winter", async () => {
    const t = setup();
    const result = await t.service.sendWeeklyDigest({ now: MONDAY_7AM_EST });
    t.restore();
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: "skipped", reason: "before_send_time" },
    });
    expect(t.sent).toHaveLength(0);
    expect(t.load).not.toHaveBeenCalled();
  });

  it("skips when this week's digest already went out, and retries a fully failed one", async () => {
    const already = setup({
      existing: { weekStart: "2026-09-28", status: "sent", recipientCount: 2 },
    });
    expect(await already.service.sendWeeklyDigest({ now: MONDAY_8AM })).toMatchObject({
      value: { outcome: "skipped", reason: "already_sent" },
    });
    expect(already.sent).toHaveLength(0);

    const partial = setup({
      existing: { weekStart: "2026-09-28", status: "partial", recipientCount: 1 },
    });
    expect(await partial.service.sendWeeklyDigest({ now: MONDAY_8AM })).toMatchObject({
      value: { reason: "already_sent" },
    });

    const failed = setup({
      existing: { weekStart: "2026-09-28", status: "failed", recipientCount: 0 },
    });
    expect(await failed.service.sendWeeklyDigest({ now: MONDAY_8AM })).toMatchObject({
      value: { outcome: "sent", sent: 2 },
    });
    [already, partial, failed].forEach((t) => t.restore());
  });

  it("refuses to send without a signing secret, since links could not be made", async () => {
    const t = setup({ signToken: null });
    const result = await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    expect(result).toMatchObject({ ok: false, error: { code: "digest_not_configured" } });
    expect(t.sent).toHaveLength(0);
  });
});

describe("sendWeeklyDigest sending", () => {
  it("emails opted-in members only, with a personal team block and one-click headers", async () => {
    const t = setup();
    const result = await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();

    expect(t.sent.map((e) => e.to).sort()).toEqual(["ann@example.com", "bo@example.com"]);
    const ann = t.sent.find((e) => e.to === "ann@example.com");
    expect(ann?.html).toContain("Ann|a");
    expect(ann?.subject).toBe("Week of Sep 28: a climbs to 1");
    expect(ann?.headers).toEqual({
      "List-Unsubscribe": `<https://www.cincysports.xyz/unsubscribe?t=tok-${USER_A}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(ann?.idempotencyKey).toBe(`digest-2026-09-28-${USER_A}`);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: "sent", attempted: 2, sent: 2, failed: 0 },
    });
  });

  it("compares against the snapshot on or before a week before the Monday", async () => {
    const t = setup();
    await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    expect(t.latestOnOrBefore).toHaveBeenCalledWith("s1", "2026-09-21");
  });

  it("sends a member without a team the league view with no team block", async () => {
    const t = setup({ members: [member(USER_C, "Cy")] });
    await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    expect(t.sent[0]?.html).toContain("Cy|no team");
  });

  it("records 'sent' with the count once", async () => {
    const t = setup();
    await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    expect(t.recorded).toEqual([
      {
        weekStart: "2026-09-28",
        status: "sent",
        recipientCount: 2,
        sentAt: MONDAY_8AM.toISOString(),
      },
    ]);
  });

  it("records 'partial' when some sends fail and 'failed' when all do, counting failures by code", async () => {
    const partial = setup({
      send: (email) => (email.to.startsWith("bo") ? err("email_rejected", "no") : ok({ id: "m" })),
    });
    const p = await partial.service.sendWeeklyDigest({ now: MONDAY_8AM });
    expect(p).toMatchObject({
      value: { outcome: "partial", sent: 1, failed: 1, failures: { email_rejected: 1 } },
    });
    expect(partial.recorded).toMatchObject([{ status: "partial", recipientCount: 1 }]);

    const all = setup({ send: () => err("email_unavailable", "down") });
    await all.service.sendWeeklyDigest({ now: MONDAY_8AM });
    expect(all.recorded).toMatchObject([{ status: "failed", recipientCount: 0 }]);
    [partial, all].forEach((t) => t.restore());
  });

  it("stops and records nothing when email is not configured", async () => {
    const t = setup({ send: () => err("email_not_configured", "no key") });
    const result = await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    expect(result).toMatchObject({ ok: false, error: { code: "email_not_configured" } });
    expect(t.recorded).toEqual([]);
    expect(t.sent.length).toBeLessThan(3);
  });

  it("never logs a full address or the message body", async () => {
    const t = setup();
    await t.service.sendWeeklyDigest({ now: MONDAY_8AM });
    t.restore();
    const output = t.lines.join("\n");
    expect(output).toContain("a***@example.com");
    expect(output).not.toContain("ann@example.com");
    expect(output).not.toContain("<p>");
  });
});

describe("sendWeeklyDigest with only", () => {
  it("sends one test to that address regardless of opt-in or time, and writes nothing", async () => {
    const t = setup();
    const result = await t.service.sendWeeklyDigest({
      now: MONDAY_7AM_EST,
      only: "CY@example.com",
    });
    t.restore();
    expect(t.sent.map((e) => e.to)).toEqual(["cy@example.com"]);
    expect(t.sent[0]?.idempotencyKey).toBe("digest-test-corr-1");
    expect(t.recorded).toEqual([]);
    expect(result).toMatchObject({ ok: true, value: { outcome: "sent", sent: 1 } });
  });

  it("still sends when this week's digest already went out", async () => {
    const t = setup({ existing: { weekStart: "2026-09-28", status: "sent", recipientCount: 2 } });
    await t.service.sendWeeklyDigest({ now: MONDAY_8AM, only: "ann@example.com" });
    t.restore();
    expect(t.sent).toHaveLength(1);
  });

  it("reports recipient_not_found for an unknown address", async () => {
    const t = setup();
    const result = await t.service.sendWeeklyDigest({ now: MONDAY_8AM, only: "who@example.com" });
    t.restore();
    expect(result).toMatchObject({ ok: false, error: { code: "recipient_not_found" } });
    expect(t.sent).toHaveLength(0);
  });
});
