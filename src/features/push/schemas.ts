import { z } from "zod";
import { PUSH_TOPICS, isAllowedPushEndpoint, pushServiceHost } from "@/domain/push";

/** The database allows 1024 characters; a longer address is not a real push endpoint. */
const ENDPOINT_MAX_LENGTH = 1024;

const endpointField = z
  .string()
  .max(ENDPOINT_MAX_LENGTH)
  // The database's own check (`^https://\S+$`), mirrored so such an address gets the fixed parse
  // error here instead of a round trip that ends in `invalid_subscription`.
  .regex(/^https:\/\/\S+$/, "That device's push address isn't valid.")
  // The SSRF guard: our server will POST to this address, so only real push services pass.
  .refine(isAllowedPushEndpoint, "That device's push service isn't supported.");

/**
 * Real browsers (Firefox, Safari) may return base64url WITH `=` padding, while the database
 * requires exactly 87 (p256dh, a 65-byte point) and 22 (auth, 16 bytes) unpadded characters. The
 * padding is stripped first, so a padded key is accepted and stored in the canonical form. The
 * length cap before the transform keeps a huge string from being processed at all.
 */
const base64UrlKey = (length: number) =>
  z
    .string()
    .max(length + 2)
    .transform((value) => value.replace(/=+$/, ""))
    .pipe(z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${length}}$`), "That key isn't valid."));

/** What `PushSubscription.toJSON()` gives, minus the fields we do not use. */
export const subscriptionSchema = z.object({
  endpoint: endpointField,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: base64UrlKey(87), auth: base64UrlKey(22) }),
});

/** What the client sends (padding allowed) versus what the service gets (canonical keys). */
export type PushSubscriptionInput = z.input<typeof subscriptionSchema>;
export type ParsedPushSubscription = z.output<typeof subscriptionSchema>;

/** The endpoint alone names a device for unsubscribe and the test alert. */
export const endpointSchema = z.object({ endpoint: endpointField });

export const topicSchema = z.object({
  topic: z.enum(PUSH_TOPICS),
  /** The state the caller wants, not a toggle, so a retry or a double tap cannot flip it back. */
  on: z.boolean(),
});

/**
 * The host of a subscription's endpoint when it was refused, for the log. An address we refuse
 * may be a real push service we forgot, and only the host tells us so; the path and query
 * identify a device and never go in a log. Null when the input has no usable endpoint or it is on
 * the list.
 */
export function refusedEndpointHost(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("endpoint" in input)) return null;
  const { endpoint } = input;
  if (typeof endpoint !== "string" || isAllowedPushEndpoint(endpoint)) return null;
  return pushServiceHost(endpoint);
}
