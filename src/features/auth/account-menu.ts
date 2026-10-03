import { isAdminRole } from "@/domain/membership/membership";
import { accountProfileSchema } from "./schemas";

/** What the header's account menu needs. Admin is only true when the role is actually known. */
export type AccountMenu = {
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** The trigger button's accessible name. */
  label: string;
  /** The member's fantasy team this season, for the menu's "My team" row. */
  team: { name: string; slug: string } | null;
};

/**
 * Used when the profile could not be read or did not parse. The menu is the only way to reach
 * /me and Sign out (there is no Me tab), so a failed read must degrade to this, never to nothing.
 */
export const FALLBACK_ACCOUNT_MENU: AccountMenu = {
  displayName: "Account",
  avatarUrl: null,
  isAdmin: false,
  label: "Account menu",
  team: null,
};

/** A profile row from the browser, checked because it crosses the network; anything bad falls back. */
export function toAccountMenu(
  profile: unknown,
  team: { name: string; slug: string } | null = null,
): AccountMenu {
  const parsed = accountProfileSchema.safeParse(profile);
  if (!parsed.success) return { ...FALLBACK_ACCOUNT_MENU, team };
  const { displayName, avatarUrl, role } = parsed.data;
  return {
    displayName,
    avatarUrl,
    isAdmin: isAdminRole(role),
    label: `Account menu for ${displayName}`,
    team,
  };
}
