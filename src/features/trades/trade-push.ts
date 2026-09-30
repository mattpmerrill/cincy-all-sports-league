import { tradePushAlert, type PushAlert } from "@/domain/push";
import type { TradeAlert } from "./trade-alerts";

/**
 * The push twin of a trade email. Only the subject and the first line go out: that line is
 * written by the domain from trade facts, while the second line of an offer email is the
 * member's own free-text note. A push crosses Apple, Google, Mozilla or Microsoft and lands on a
 * lock screen, so member-written text stays out of it.
 */
export function toTradePushAlerts(alerts: readonly TradeAlert[]): PushAlert[] {
  return alerts.map((alert) =>
    tradePushAlert({
      recipientId: alert.recipientId,
      listingId: alert.listingId,
      offerId: alert.offerId,
      eventKey: alert.event,
      title: alert.content.subject,
      body: alert.content.lines[0] ?? "",
    }),
  );
}
