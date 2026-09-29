import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when `authorization` is exactly `Bearer <secret>`. Both sides are hashed first so the
 * comparison is constant-time regardless of length, and a missing header just fails.
 */
export function isAuthorizedCronRequest(authorization: string | null, secret: string): boolean {
  if (!authorization) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
