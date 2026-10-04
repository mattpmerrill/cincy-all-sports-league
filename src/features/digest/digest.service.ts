import { buildWeeklyDigest, digestHeadline, subtractDays, weekWindow } from "@/domain/digest";
import { buildLeagueModel, formatMonthDay } from "@/domain/league";
import type { LeagueData } from "@/domain/league";
import type { Matchup } from "@/domain/matchups";
import type { DigestRepository } from "@/data/digest.repository";
import type { MatchupsRepository } from "@/data/matchups.repository";
import type { StandingsSnapshotsRepository } from "@/data/standings-snapshots.repository";
import type { EmailSender } from "@/integrations/resend";
import type { Logger } from "@/lib/logger";
import { maskEmail } from "@/lib/mask-email";
import { err, ok, type AppError, type Result } from "@/lib/result";
import { easternDate } from "@/lib/time";
import type { DigestEmailProps } from "./email/render";

export type DigestErrorCode =
  "email_not_configured" | "digest_not_configured" | "recipient_not_found";

export type SkipReason = "before_send_time" | "already_sent" | "no_season" | "no_recipients";

export type DigestReport = {
  correlationId: string;
  weekStart: string;
} & (
  | { outcome: "skipped"; reason: SkipReason }
  | {
      outcome: "sent" | "partial" | "failed";
      attempted: number;
      sent: number;
      failed: number;
      /** Failure counts by error code, never by recipient. */
      failures: Record<string, number>;
    }
);

export type DigestServiceDeps = {
  league: { load: () => Promise<LeagueData | null> };
  snapshots: Pick<StandingsSnapshotsRepository, "latestOnOrBefore">;
  digests: Pick<DigestRepository, "listConfirmedMembers" | "getSend" | "recordSend">;
  /** Public-read table, so any client works; the digest passes the one it already reads with. */
  matchups: Pick<MatchupsRepository, "listSeason">;
  sender: EmailSender;
  renderEmail: (props: DigestEmailProps) => Promise<{ html: string; text: string }>;
  /** Null when DIGEST_SIGNING_SECRET is unset: without it no unsubscribe link can be made. */
  signToken: ((userId: string) => string) | null;
  siteUrl: string;
  logger: Logger;
  newCorrelationId: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Resend's default is 2 requests a second; two workers each pausing 1s stays at or under it. */
  concurrency?: number;
  spacingMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type DigestService = ReturnType<typeof createDigestService>;

export function createDigestService(deps: DigestServiceDeps) {
  const sleep = deps.sleep ?? defaultSleep;
  const concurrency = deps.concurrency ?? 2;
  const spacingMs = deps.spacingMs ?? 1000;
  const siteUrl = deps.siteUrl.replace(/\/+$/, "");

  return {
    /**
     * Sends the Monday digest. Two pg_cron jobs call this (08:00 in EDT and in EST), so it must be
     * a no-op before Monday 08:00 Eastern and after the week's digest went out. `only` is the
     * admin test path: one address, no time guard, and nothing written to digest_sends.
     */
    async sendWeeklyDigest(input: {
      now: Date;
      only?: string;
    }): Promise<Result<DigestReport, AppError<DigestErrorCode>>> {
      const correlationId = deps.newCorrelationId();
      const log = deps.logger.child({ correlationId });
      const { weekStart, pastSendTime } = weekWindow(input.now);
      const only = input.only?.trim().toLowerCase();
      const skipped = (reason: SkipReason): Result<DigestReport, never> => {
        log.info("digest skipped", { weekStart, reason });
        return ok({ correlationId, weekStart, outcome: "skipped", reason });
      };

      if (!only) {
        if (!pastSendTime) return skipped("before_send_time");
        const existing = await deps.digests.getSend(weekStart);
        // A fully failed run is retried; 'partial' is not, because we cannot tell who is missing.
        if (existing && existing.status !== "failed") return skipped("already_sent");
      }

      const signToken = deps.signToken;
      if (!signToken) {
        return err(
          "digest_not_configured",
          "Unsubscribe signing is not configured (DIGEST_SIGNING_SECRET).",
        );
      }

      const data = await deps.league.load();
      if (!data) return skipped("no_season");
      const model = buildLeagueModel(data, easternDate(input.now));
      const weekAgo = await deps.snapshots.latestOnOrBefore(
        data.season.id,
        subtractDays(weekStart, 7),
      );

      const members = await deps.digests.listConfirmedMembers();
      const recipients = only
        ? members.filter((m) => m.email.toLowerCase() === only)
        : members.filter((m) => m.optedIn);
      if (only && recipients.length === 0) {
        return err("recipient_not_found", "No confirmed member has that email address.");
      }
      if (recipients.length === 0) return skipped("no_recipients");

      // Read once for the whole run. The section is a bonus: a failed read must never cost the
      // league its Monday email, so it is logged and the digest goes out without the section.
      let seasonMatchups: Matchup[] | null = null;
      try {
        seasonMatchups = await deps.matchups.listSeason(data.season.id);
      } catch (error) {
        log.error("digest matchups read failed", { error });
      }
      const matchups = seasonMatchups ? { matchups: seasonMatchups, weekStart } : null;

      const currentTeams = model.standings.map((row) => ({
        ...row,
        ownerName: row.owner?.displayName ?? null,
      }));
      const shared = buildWeeklyDigest({ current: currentTeams, weekAgo: weekAgo?.rows ?? null });
      const subject = `Week of ${formatMonthDay(weekStart)}: ${digestHeadline(shared)}`;
      const preheader = shared.top5[0]
        ? `${shared.top5[0].teamName} leads at ${shared.top5[0].rankLabel}. See who moved.`
        : "See who moved this week.";

      let notConfigured = false;
      let sent = 0;
      const failures: Record<string, number> = {};
      const fail = (code: string) => {
        failures[code] = (failures[code] ?? 0) + 1;
      };

      let next = 0;
      const worker = async () => {
        while (next < recipients.length && !notConfigured) {
          const member = recipients[next++];
          if (!member) return;
          const recipientTeamId = model.standings.find(
            (r) => r.owner?.id === member.userId,
          )?.teamId;
          const unsubscribeUrl = `${siteUrl}/unsubscribe?t=${signToken(member.userId)}`;
          try {
            const { html, text } = await deps.renderEmail({
              displayName: member.displayName,
              weekLabel: formatMonthDay(weekStart),
              seasonName: model.seasonName,
              digest: buildWeeklyDigest({
                current: currentTeams,
                weekAgo: weekAgo?.rows ?? null,
                recipientTeamId,
                matchups,
              }),
              siteUrl,
              unsubscribeUrl,
              preheader,
            });
            const result = await deps.sender.sendEmail({
              to: member.email,
              subject,
              html,
              text,
              headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
              idempotencyKey: only
                ? `digest-test-${correlationId}`
                : `digest-${weekStart}-${member.userId}`,
            });
            if (result.ok) {
              sent++;
              log.info("digest sent", { to: maskEmail(member.email) });
            } else {
              if (result.error.code === "email_not_configured") notConfigured = true;
              fail(result.error.code);
              log.warn("digest send failed", {
                to: maskEmail(member.email),
                code: result.error.code,
              });
            }
          } catch (error) {
            fail("render_failed");
            log.error("digest render failed", { to: maskEmail(member.email), error });
          }
          if (next < recipients.length) await sleep(spacingMs);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, recipients.length) }, worker));

      if (notConfigured) {
        // Nothing was sent, so record nothing: the next run (after the key is set) starts clean.
        return err("email_not_configured", "Email sending is not configured (RESEND_API_KEY).");
      }

      const failed = Object.values(failures).reduce((a, b) => a + b, 0);
      const outcome = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
      if (!only) {
        await deps.digests.recordSend({
          weekStart,
          status: outcome,
          recipientCount: sent,
          sentAt: input.now.toISOString(),
        });
      }
      log.info("digest finished", {
        weekStart,
        outcome,
        attempted: recipients.length,
        sent,
        failed,
        test: Boolean(only),
      });
      return ok({
        correlationId,
        weekStart,
        outcome,
        attempted: recipients.length,
        sent,
        failed,
        failures,
      });
    },
  };
}
