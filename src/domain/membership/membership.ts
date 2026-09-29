/**
 * The single owner of the membership vocabulary: who a user is (role) and where a team claim
 * stands (status). The DB enums mirror these values; repositories map between them.
 */

export const USER_ROLES = ["member", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CLAIM_STATUSES = ["pending", "approved", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const isAdminRole = (role: UserRole): boolean => role === "admin";

/** The initials shown when a profile has no avatar image: first letters of up to two words. */
export function initialsOf(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** Who is performing an action, reduced to what authorization needs. */
export type Actor = { id: string; role: UserRole };
