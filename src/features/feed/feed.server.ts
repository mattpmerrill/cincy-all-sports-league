import "server-only";
import { after } from "next/server";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createMessagesRepository } from "@/data/messages.repository";
import { createPushRepository } from "@/data/push.repository";
import { createReactionsRepository } from "@/data/reactions.repository";
import { createPushDelivery, createPushNotifier } from "@/integrations/webpush";
import { pushConfig } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createFeedService } from "./feed.service";

/**
 * Feed service acting as the visitor (signed in or anon), so RLS is the final authority. Push
 * delivery is the one exception: it runs after the response on the secret-key client, because
 * finding other members' devices is not something a visitor may do. The delivery is built inside
 * `after()`, so push secrets are read after the response and a deploy without them skips alerts.
 */
export async function getFeedService() {
  const db = await createSupabaseServerClient();
  const log = logger.child({ scope: "feed" });
  return createFeedService({
    messages: createMessagesRepository(db),
    reactions: createReactionsRepository(db),
    teams: createFantasyTeamsRepository(db),
    notifier: createPushNotifier({
      schedule: after,
      delivery: () =>
        createPushDelivery({
          store: createPushRepository(createSupabaseAdminClient()),
          config: pushConfig(),
          logger: log,
          newCorrelationId,
        }),
      logger: log,
    }),
    logger: log,
  });
}
