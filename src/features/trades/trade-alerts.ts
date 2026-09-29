import type { TradeRecipientsRepository } from "@/data/trade-recipients.repository";
import type { EmailSender } from "@/integrations/resend";
import type { TradeEmailContent } from "@/domain/trades";
import type { Logger } from "@/lib/logger";
import { maskEmail } from "@/lib/mask-email";
import type { TradeEmailProps } from "./email/render";

export const TRADE_ALERT_EVENTS = ["new_offer", "accepted", "rejected", "lost"] as const;
export type TradeAlertEvent = (typeof TRADE_ALERT_EVENTS)[number];

/** One email a trade event owes one member. The service decides who and what; this module sends. */
export type TradeAlert = {
  event: TradeAlertEvent;
  recipientId: string;
  listingId: string;
  /** The offer the event is about: with the event and recipient it makes the idempotency key. */
  offerId: string;
  content: TradeEmailContent;
};

/**
 * What the service depends on. `notify` must return at once and never throw: delivery happens
 * after the response, and a failed email never fails or rolls back a trade.
 */
export type TradeNotifier = { notify: (alerts: readonly TradeAlert[]) => void };

export type TradeAlertSenderDeps = {
  recipients: Pick<TradeRecipientsRepository, "getRecipient">;
  sender: EmailSender;
  renderEmail: (props: TradeEmailProps) => Promise<{ html: string; text: string }>;
  siteUrl: string;
  logger: Logger;
  newCorrelationId: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Resend's default is 2 requests a second; a lost-offer fan-out can be a dozen emails. */
  spacingMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type TradeAlertSender = ReturnType<typeof createTradeAlertSender>;

export function createTradeAlertSender(deps: TradeAlertSenderDeps) {
  const sleep = deps.sleep ?? defaultSleep;
  const spacingMs = deps.spacingMs ?? 500;
  const siteUrl = deps.siteUrl.replace(/\/+$/, "");

  return {
    /**
     * Sends each alert to a recipient who has trade emails on. Every failure is logged under one
     * correlation id and swallowed: this runs in `after()`, where a throw would only be noise.
     * Without an email key it stops at the first send and logs once at info.
     */
    async deliver(alerts: readonly TradeAlert[]): Promise<void> {
      if (alerts.length === 0) return;
      const log = deps.logger.child({ correlationId: deps.newCorrelationId() });
      let sentAny = false;

      for (const alert of alerts) {
        const fields = { event: alert.event, offerId: alert.offerId };
        try {
          const recipient = await deps.recipients.getRecipient(alert.recipientId);
          if (!recipient || !recipient.tradeEmails) {
            log.info("trade alert skipped", {
              ...fields,
              reason: recipient ? "trade_emails_off" : "no_confirmed_email",
            });
            continue;
          }

          if (sentAny) await sleep(spacingMs);
          const { html, text } = await deps.renderEmail({
            heading: alert.content.subject,
            lines: alert.content.lines,
            viewUrl: `${siteUrl}/trades/${alert.listingId}`,
            settingsUrl: `${siteUrl}/me`,
            preheader: alert.content.lines[0] ?? alert.content.subject,
          });
          const result = await deps.sender.sendEmail({
            to: recipient.email,
            subject: alert.content.subject,
            html,
            text,
            idempotencyKey: `trade-${alert.offerId}-${alert.event}-${alert.recipientId}`,
          });
          sentAny = true;

          if (result.ok) {
            log.info("trade alert sent", { ...fields, to: maskEmail(recipient.email) });
          } else if (result.error.code === "email_not_configured") {
            log.info("trade alerts skipped: email is not configured");
            return;
          } else {
            log.warn("trade alert failed", {
              ...fields,
              to: maskEmail(recipient.email),
              code: result.error.code,
            });
          }
        } catch (error) {
          log.error("trade alert failed", { ...fields, error });
        }
      }
    },
  };
}
