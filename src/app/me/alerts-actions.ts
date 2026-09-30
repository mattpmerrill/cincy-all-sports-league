"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";
import { requireUser } from "@/features/auth/guards";
import { getPushService } from "@/features/push/push.server";
import {
  endpointSchema,
  refusedEndpointHost,
  subscriptionSchema,
  topicSchema,
} from "@/features/push/schemas";
import { logger, newCorrelationId } from "@/lib/logger";
import { err, type AppError, type Result } from "@/lib/result";

// Transport and auth for push alerts. Each action re-checks the session (a Server Action is a
// public POST endpoint), validates its input, and hands the service the actor. The input carries
// a device address and keys, which are credentials: nothing here logs or returns them, and a
// refused address is logged by host only.

const log = logger.child({ scope: "push-actions" });

/** Fixed on purpose: a raw Zod message would describe the input, and the input is a credential. */
const BAD_REQUEST = "That request didn't look right. Refresh the page and try again.";

function parse<S extends z.ZodType>(schema: S, input: unknown): Result<z.output<S>, AppError> {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : err("invalid", BAD_REQUEST);
}

/**
 * Runs an action body, turning an unexpected failure into a logged, correlated, safe message. The
 * error is logged as is: the push repository throws only a sanitized `PushStorageError`, and
 * nothing else in these paths handles an endpoint or key.
 */
async function guarded<T>(
  operation: string,
  work: () => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  try {
    return await work();
  } catch (error) {
    const correlationId = newCorrelationId();
    log.error("push action failed", { operation, correlationId, error });
    return err("unexpected", `Something went wrong. Reference ${correlationId}.`);
  }
}

export async function subscribePushAction(input: unknown) {
  return guarded("subscribe", async () => {
    const user = await requireUser();
    if (!user.ok) return user;
    const parsed = parse(subscriptionSchema, input);
    if (!parsed.ok) {
      // An address off the allow-list may be a real push service we do not know yet; the host is
      // how that gets noticed, and the only part of an endpoint that is safe to record.
      const host = refusedEndpointHost(input);
      if (host) log.warn("push subscription refused: endpoint host not allowed", { host });
      return parsed;
    }
    const userAgent = (await headers()).get("user-agent");
    return (await getPushService()).subscribe(user.value, parsed.value, userAgent);
  });
}

export async function unsubscribePushAction(input: unknown) {
  return guarded("unsubscribe", async () => {
    const user = await requireUser();
    if (!user.ok) return user;
    const parsed = parse(endpointSchema, input);
    if (!parsed.ok) return parsed;
    return (await getPushService()).unsubscribe(user.value, parsed.value.endpoint);
  });
}

export async function setPushTopicAction(input: unknown) {
  return guarded("setTopic", async () => {
    const user = await requireUser();
    if (!user.ok) return user;
    const parsed = parse(topicSchema, input);
    if (!parsed.ok) return parsed;
    const result = await (
      await getPushService()
    ).setTopic(user.value, parsed.value.topic, parsed.value.on);
    revalidatePath("/me");
    return result;
  });
}

export async function sendTestPushAction(input: unknown) {
  return guarded("sendTest", async () => {
    const user = await requireUser();
    if (!user.ok) return user;
    const parsed = parse(endpointSchema, input);
    if (!parsed.ok) return parsed;
    return (await getPushService()).sendTest(user.value, parsed.value.endpoint);
  });
}
