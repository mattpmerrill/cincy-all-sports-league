import "server-only";
import { createProfilesRepository } from "@/data/profiles.repository";
import { createPushRepository } from "@/data/push.repository";
import { createPushDelivery, createPushSender } from "@/integrations/webpush";
import { pushConfig } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createPushService } from "./push.service";

/**
 * The push service for the signed-in member. Switches are read and written with the session
 * client, so RLS decides whose row they are. Devices live in tables with no policy (the endpoint
 * and keys are credentials), so they go through the secret-key client: callers must have
 * authenticated the member first, and a Server Action re-checks the session, then passes the actor.
 */
export async function getPushService() {
  const session = await createSupabaseServerClient();
  const subscriptions = createPushRepository(createSupabaseAdminClient());
  const log = logger.child({ scope: "push" });

  const config = pushConfig();
  // One sender for both jobs, so "configured" and "can send" cannot disagree: a well-formed
  // private key that does not belong to the public key is not configured, and the UI must not
  // invite members to turn on alerts nobody can send.
  const sender = createPushSender({ config });

  return createPushService({
    subscriptions,
    profiles: createProfilesRepository(session),
    delivery: createPushDelivery({ store: subscriptions, config, sender, logger: log }),
    configured: () => config !== null && sender.ready(),
    now: () => new Date(),
    logger: log,
  });
}
