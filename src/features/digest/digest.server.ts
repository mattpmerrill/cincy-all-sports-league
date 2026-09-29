import "server-only";
import { createDigestRepository } from "@/data/digest.repository";
import { createLeagueRepository } from "@/data/league.repository";
import { createStandingsSnapshotsRepository } from "@/data/standings-snapshots.repository";
import { createEmailSender } from "@/integrations/resend";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createDigestService } from "./digest.service";
import { renderDigestEmail } from "./email/render";
import { signUnsubscribeToken } from "./unsubscribe-token";

/**
 * The digest service on the secret-key client. Callers must have authorized the request first:
 * the cron route checks CRON_SECRET.
 */
export function getDigestService() {
  const env = serverEnv();
  const db = createSupabaseAdminClient();
  const secret = env.DIGEST_SIGNING_SECRET;
  return createDigestService({
    league: createLeagueRepository(db),
    snapshots: createStandingsSnapshotsRepository(db),
    digests: createDigestRepository(db),
    sender: createEmailSender({ apiKey: env.RESEND_API_KEY, from: env.DIGEST_FROM }),
    renderEmail: renderDigestEmail,
    signToken: secret ? (userId) => signUnsubscribeToken(userId, secret) : null,
    siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
    logger: logger.child({ scope: "digest" }),
    newCorrelationId,
  });
}
