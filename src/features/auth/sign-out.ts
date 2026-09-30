import { signOutAction } from "./actions";

/**
 * A sign-out that first runs a cleanup the caller supplies, while the session is still valid.
 * Another feature (push alerts) needs to end its device subscription before the cookie goes, and
 * `app/` wires that in because one feature may not import another. The cleanup can never keep a
 * member signed in: whatever it does or throws, the sign-out runs.
 */
export function signOutAfter(beforeSignOut?: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await beforeSignOut?.();
    } catch {
      // Signing out matters more than the cleanup.
    }
    await signOutAction();
  };
}
