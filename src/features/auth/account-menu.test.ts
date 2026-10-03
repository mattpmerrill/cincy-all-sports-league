import { describe, expect, it } from "vitest";
import { FALLBACK_ACCOUNT_MENU, toAccountMenu } from "./account-menu";

describe("toAccountMenu", () => {
  it("shows the member's name and photo, and Admin only for admins", () => {
    const base = { id: "u1", displayName: "Cooper", avatarUrl: "https://x/y.png" };
    expect(toAccountMenu({ ...base, role: "member" })).toEqual({
      displayName: "Cooper",
      avatarUrl: "https://x/y.png",
      isAdmin: false,
      label: "Account menu for Cooper",
      team: null,
    });
    expect(toAccountMenu({ ...base, role: "admin" }).isAdmin).toBe(true);
  });

  it("falls back to a generic account with no admin link when the profile is missing or malformed", () => {
    for (const bad of [null, undefined, {}, { displayName: "", avatarUrl: null, role: "admin" }]) {
      expect(toAccountMenu(bad)).toEqual(FALLBACK_ACCOUNT_MENU);
    }
    expect(FALLBACK_ACCOUNT_MENU.isAdmin).toBe(false);
  });

  it("carries the member's team for the My team row, even when the profile fell back", () => {
    const team = { name: "Coop Doggies", slug: "coop-doggies" };
    const base = { id: "u1", displayName: "Cooper", avatarUrl: null, role: "member" };
    expect(toAccountMenu(base, team).team).toEqual(team);
    expect(toAccountMenu(null, team)).toEqual({ ...FALLBACK_ACCOUNT_MENU, team });
  });
});
