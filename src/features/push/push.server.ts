import "server-only";
import { createProfilesRepository } from "@/data/profiles.repository";
import { createPushRepository } from "@/data/push.repository";
import type { Actor } from "@/domain/membership/membership";
import { createPushDelivery, createPushSender } from "@/integrations/webpush";
import { pushConfig } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { err, type AppError, type Result } from "@/lib/result";
import { safeErrorFields } from "@/lib/safe-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPushAvailable } from "./push-availability.server";
import { createPushService, type PushSettings } from "./push.service";

/**
 * "Can this deploy send alerts" is owned by `push-availability.server.ts`: environment only, and
 * no `web-push` import, so the root layout can use it. The sender's own check stays here as
 * defense in depth, because it also proves the keys can sign, which comparing them cannot.
 */
function pushSetup() {
  const config = pushConfig();
  // One sender for both jobs, so "configured" and "can send" cannot disagree.
  const sender = createPushSender({ config });
  return { config, sender, available: isPushAvailable() && sender.ready() };
}

export { isPushAvailable };

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
  const { config, sender, available } = pushSetup();

  return createPushService({
    subscriptions,
    profiles: createProfilesRepository(session),
    delivery: createPushDelivery({ store: subscriptions, config, sender, logger: log }),
    configured: () => available,
    now: () => new Date(),
    logger: log,
  });
}

/**
 * The settings for the profile page, as a value. Building the service and reading the settings can
 * throw (a missing secret, a database error), and the profile page also holds Sign out, so a
 * failure here must cost the alerts section only. Only the error's name and code are logged: a
 * database error can quote the failing row.
 */
export async function loadPushSettings(actor: Actor): Promise<Result<PushSettings, AppError>> {
  try {
    return { ok: true, value: await (await getPushService()).getSettings(actor) };
  } catch (error) {
    const correlationId = newCorrelationId();
    logger.error("push settings failed to load", {
      scope: "push",
      correlationId,
      ...safeErrorFields(error),
    });
    return err(
      "unexpected",
      "We couldn't load your alert settings. Refresh the page to try again.",
    );
  }
}
