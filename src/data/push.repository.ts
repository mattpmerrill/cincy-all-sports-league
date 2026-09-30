import "server-only";
import { z } from "zod";
import type { PushFailureOutcome, PushStore, PushTarget, PushTopic } from "@/domain/push";
import type { AppError, Result } from "@/lib/result";
import type { Database, Tables } from "./database.types";
import { PG, type DbClient } from "./db-client";

/**
 * Web Push devices and the send ledger. SERVER-ONLY: it needs the admin (secret-key) client,
 * because `push_subscriptions` and `push_sends` have no policy and no grant for anon or
 * authenticated (the endpoint and keys are credentials). The caller (a Server Action, through the
 * push service) must already have authenticated the member and pass their id as `actorId`.
 *
 * Nothing here logs, returns or throws a Postgres error object. A constraint violation carries
 * "Failing row contains (...)" in `details`, and that row holds the endpoint and both keys, so a
 * failure surfaces as a `PushStorageError` with the operation and SQLSTATE only.
 */

// ===== topics =====

// The topic-to-column map lives in profiles.repository.ts: that file reaches the browser, and
// this one must not.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
/**
 * `PUSH_TOPICS` (domain) and the `push_topic` enum (SQL) are two spellings of one list. If either
 * gains or loses a value, this stops compiling: a topic the database cannot store, or one
 * `push_targets` has no CASE arm for, must not slip through to runtime.
 */
export type PushTopicsMatchDatabase = Assert<
  Equal<PushTopic, Database["public"]["Enums"]["push_topic"]>
>;

// ===== errors =====

export type PushRegisterErrorCode = "not_found" | "invalid_subscription";
export type PushRegisterError = AppError<PushRegisterErrorCode>;

/** What a person could be told for each code. Never the SQL token, message or detail. */
const REGISTER_MESSAGES: Record<PushRegisterErrorCode, string> = {
  not_found: "We couldn't find your profile.",
  invalid_subscription:
    "This device's alert subscription isn't valid. Try turning alerts on again.",
};

/** The only error this repository throws: the operation and the SQLSTATE, nothing from the row. */
export class PushStorageError extends Error {
  constructor(operation: string, sqlState: string | undefined) {
    super(`Push storage call failed (${operation}, code ${sqlState || "unknown"})`);
    this.name = "PushStorageError";
  }
}

/** Throws the sanitized error: only the SQLSTATE is read from the database error, never its text. */
function fail(operation: string, error: { code: string }): never {
  throw new PushStorageError(operation, error.code);
}

const outcomeSchema = z.enum(["counted", "pruned", "missing"]);
const idSchema = z.uuid();

// ===== read models =====

/** A member's device as the profile page shows it: no endpoint, no keys. */
export type PushDevice = {
  id: string;
  label: string;
  registeredAt: string;
  lastSuccessAt: string | null;
};

const TARGET_COLUMNS = "id, user_id, endpoint, p256dh, auth";
type TargetRow = Pick<
  Tables<"push_subscriptions">,
  "id" | "user_id" | "endpoint" | "p256dh" | "auth"
>;

const toTarget = (row: TargetRow): PushTarget => ({
  subscriptionId: row.id,
  recipientId: row.user_id,
  endpoint: row.endpoint,
  keys: { p256dh: row.p256dh, auth: row.auth },
});

export type RegisterPushInput = {
  actorId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string;
};

export type PushRepository = ReturnType<typeof createPushRepository>;

export function createPushRepository(db: DbClient) {
  // ----- the PushStore side: what delivery needs -----

  // Typed as the port, so a change to `PushStore` that this repository no longer satisfies fails
  // to compile here rather than where a feature wires the two together.
  const store: PushStore = {
    async listTargets(recipientIds, topic) {
      if (recipientIds.length === 0) return [];
      const { data, error } = await db.rpc("push_targets", {
        p_user_ids: [...recipientIds],
        p_topic: topic,
      });
      if (error) fail("listTargets", error);
      return data.map(toTarget);
    },

    async claim(recipientId, dedupeKey) {
      // ON CONFLICT DO NOTHING returns no row for a key that was already taken, so one returned
      // row means this call is the one that claimed it.
      const { data, error } = await db
        .from("push_sends")
        .upsert(
          { recipient_id: recipientId, dedupe_key: dedupeKey },
          { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true },
        )
        .select("recipient_id");
      if (error) fail("claim", error);
      return data.length === 1;
    },

    async remove(subscriptionId) {
      const { error } = await db.from("push_subscriptions").delete().eq("id", subscriptionId);
      if (error) fail("remove", error);
    },

    async recordSuccess(subscriptionIds, now) {
      if (subscriptionIds.length === 0) return;
      const { error } = await db
        .from("push_subscriptions")
        .update({ failure_count: 0, last_success_at: now.toISOString() })
        .in("id", [...subscriptionIds]);
      if (error) fail("recordSuccess", error);
    },

    async recordFailure(subscriptionId, max): Promise<PushFailureOutcome> {
      const { data, error } = await db.rpc("record_push_failure", {
        p_id: subscriptionId,
        p_max: max,
      });
      // invalid_max (a limit below 1) is a programmer error, so it throws like any other failure.
      if (error) fail("recordFailure", error);
      return outcomeSchema.parse(data);
    },
  };

  // ----- the member side: subscribe, unsubscribe, list -----

  return {
    ...store,

    /**
     * Registers or refreshes a device. `not_found` when the profile does not exist and
     * `invalid_subscription` when the database refuses the endpoint or keys; anything else throws.
     * Re-registering an endpoint that belongs to someone else moves it (a shared device).
     */
    async register(input: RegisterPushInput): Promise<Result<{ id: string }, PushRegisterError>> {
      const { data, error } = await db.rpc("register_push_subscription", {
        p_actor: input.actorId,
        p_endpoint: input.endpoint,
        p_p256dh: input.p256dh,
        p_auth: input.auth,
        p_device_label: input.deviceLabel,
      });
      if (error) {
        if (error.code === PG.raiseException) {
          if (error.message === "not_found" || error.message === "invalid_subscription") {
            return {
              ok: false,
              error: { code: error.message, message: REGISTER_MESSAGES[error.message] },
            };
          }
        }
        fail("register", error);
      }
      return { ok: true, value: { id: idSchema.parse(data) } };
    },

    /** True when this member had that device and it is gone now; false when they had no such row. */
    async removeOwned(actorId: string, endpoint: string): Promise<boolean> {
      const { data, error } = await db
        .from("push_subscriptions")
        .delete()
        .eq("user_id", actorId)
        .eq("endpoint", endpoint)
        .select("id");
      if (error) fail("removeOwned", error);
      return data.length > 0;
    },

    async countOwned(actorId: string): Promise<number> {
      const { count, error } = await db
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", actorId);
      if (error) fail("countOwned", error);
      return count ?? 0;
    },

    /** The member's own device for an endpoint, or null. Scoped by owner, so it cannot read another member's. */
    async getOwned(actorId: string, endpoint: string): Promise<PushTarget | null> {
      const { data, error } = await db
        .from("push_subscriptions")
        .select(TARGET_COLUMNS)
        .eq("user_id", actorId)
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (error) fail("getOwned", error);
      return data ? toTarget(data) : null;
    },

    /** The member's devices, most recently registered first, without endpoints or keys. */
    async listOwned(actorId: string): Promise<PushDevice[]> {
      const { data, error } = await db
        .from("push_subscriptions")
        .select("id, device_label, last_registered_at, last_success_at")
        .eq("user_id", actorId)
        .order("last_registered_at", { ascending: false })
        .order("id", { ascending: true });
      if (error) fail("listOwned", error);
      return data.map((row) => ({
        id: row.id,
        label: row.device_label,
        registeredAt: row.last_registered_at,
        lastSuccessAt: row.last_success_at,
      }));
    },
  };
}
