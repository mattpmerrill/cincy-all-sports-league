/**
 * Fired on `window` after the member changes their own profile (photo, name), so client pieces
 * that read the profile in the browser, like the header account menu, reload it without a
 * full page refresh. A DOM event keeps the sender and listeners in separate features.
 */
export const PROFILE_UPDATED_EVENT = "cincy:profile-updated";

export function announceProfileUpdated(): void {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}
