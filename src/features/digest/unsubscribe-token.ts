import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const UNSUBSCRIBE_PURPOSE = "digest_unsub";

const payloadSchema = z.object({ u: z.uuid(), p: z.string() });

const b64 = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const mac = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest();

/**
 * `<base64url(json {u: userId, p: purpose})>.<base64url(hmac-sha256)>`. No expiry on purpose: an
 * unsubscribe link in an old email must keep working. The purpose stops a token minted for one
 * job from being replayed for another if we ever sign a second kind.
 */
export function signPurposeToken(userId: string, purpose: string, secret: string): string {
  const payload = b64(JSON.stringify({ u: userId, p: purpose }));
  return `${payload}.${b64(mac(payload, secret))}`;
}

/** The user id when the signature is valid for exactly this purpose; otherwise null. */
export function verifyPurposeToken(token: string, purpose: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const given = Buffer.from(signature, "base64url");
  const expected = mac(payload, secret);
  // timingSafeEqual throws on unequal lengths, and a length mismatch is not a secret.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(decoded);
  return parsed.success && parsed.data.p === purpose ? parsed.data.u : null;
}

export const signUnsubscribeToken = (userId: string, secret: string) =>
  signPurposeToken(userId, UNSUBSCRIBE_PURPOSE, secret);

export const verifyUnsubscribeToken = (token: string, secret: string) =>
  verifyPurposeToken(token, UNSUBSCRIBE_PURPOSE, secret);
