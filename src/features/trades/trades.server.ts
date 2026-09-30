import "server-only";
import { after } from "next/server";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createLeagueRepository } from "@/data/league.repository";
import { createTradeRecipientsRepository } from "@/data/trade-recipients.repository";
import { createPushRepository } from "@/data/push.repository";
import { createTradesRepository } from "@/data/trades.repository";
import { createEmailSender } from "@/integrations/resend";
import { createPushDelivery, createPushNotifier } from "@/integrations/webpush";
import { publicEnv } from "@/lib/env";
import { pushConfig, serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderTradeEmail } from "./email/render";
import { createTradeAlertSender } from "./trade-alerts";
import type { TradeNotifier } from "./trade-alerts";
import { toTradePushAlerts } from "./trade-push";
import { createTradesService } from "./trades.service";

/**
 * Sends alerts with `after()`, so the response is not held up by Resend and a failed email cannot
 * fail the trade. Secrets are read inside the callback, so a deploy without them only skips alerts.
 */
function afterResponseNotifier(): TradeNotifier {
  const log = logger.child({ scope: "trade-alerts" });
  const pushLog = logger.child({ scope: "trade-push" });
  // Push rides beside the email, not through it: each has its own `after()` task, so a failure in
  // one cannot skip the other. The delivery is built inside that task, so push secrets are read
  // after the response like the email key.
  const push = createPushNotifier({
    schedule: after,
    delivery: () =>
      createPushDelivery({
        store: createPushRepository(createSupabaseAdminClient()),
        config: pushConfig(),
        logger: pushLog,
        newCorrelationId,
      }),
    logger: pushLog,
  });
  return {
    notify(alerts) {
      push.notify(() => toTradePushAlerts(alerts));
      after(async () => {
        try {
          const env = serverEnv();
          await createTradeAlertSender({
            recipients: createTradeRecipientsRepository(createSupabaseAdminClient()),
            sender: createEmailSender({ apiKey: env.RESEND_API_KEY, from: env.DIGEST_FROM }),
            renderEmail: renderTradeEmail,
            siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
            logger: log,
            newCorrelationId,
          }).deliver(alerts);
        } catch (error) {
          // Only setup can throw here (deliver logs its own failures); still never fail the trade.
          log.error("trade alerts could not start", { error });
        }
      });
    },
  };
}

/**
 * The trades service. Reads and the league load run as the visitor (RLS applies; the tables are
 * publicly readable). Mutations run on the secret-key client because the SQL functions are
 * service_role only, so callers must have authenticated the user first (ADR-003): a Server
 * Action re-checks the session, then passes the actor.
 */
export async function getTradesService() {
  const session = await createSupabaseServerClient();
  return createTradesService({
    trades: createTradesRepository(session),
    mutations: () => createTradesRepository(createSupabaseAdminClient()),
    loadLeague: () => createLeagueRepository(session).load(),
    teams: createFantasyTeamsRepository(session),
    notifier: afterResponseNotifier(),
    now: () => new Date(),
    logger: logger.child({ scope: "trades" }),
  });
}
