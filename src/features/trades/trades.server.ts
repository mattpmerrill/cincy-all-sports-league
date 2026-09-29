import "server-only";
import { after } from "next/server";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createLeagueRepository } from "@/data/league.repository";
import { createTradeRecipientsRepository } from "@/data/trade-recipients.repository";
import { createTradesRepository } from "@/data/trades.repository";
import { createEmailSender } from "@/integrations/resend";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderTradeEmail } from "./email/render";
import { createTradeAlertSender } from "./trade-alerts";
import type { TradeNotifier } from "./trade-alerts";
import { createTradesService } from "./trades.service";

/**
 * Sends alerts with `after()`, so the response is not held up by Resend and a failed email cannot
 * fail the trade. Secrets are read inside the callback, so a deploy without them only skips alerts.
 */
function afterResponseNotifier(): TradeNotifier {
  const log = logger.child({ scope: "trade-alerts" });
  return {
    notify(alerts) {
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
