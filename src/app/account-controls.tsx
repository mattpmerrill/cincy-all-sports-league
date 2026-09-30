"use client";

import { HeaderAccount } from "@/features/auth/components/header-account";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { releaseDeviceBeforeSignOut } from "@/features/push/push-device";
import { pushActions } from "./push-actions";

// Signing out must also end this device's push subscription, or alerts for the member who just
// left would keep arriving on a shared phone. `features/auth` cannot import `features/push`, so
// the two are joined here: the auth controls take a cleanup, and this supplies the push one.
const beforeSignOut = () => releaseDeviceBeforeSignOut(pushActions);

/** The header's account menu, with device cleanup on sign-out. */
export function AppHeaderAccount() {
  return <HeaderAccount beforeSignOut={beforeSignOut} />;
}

/** The profile page's Sign out button, with device cleanup. */
export function ProfileSignOutButton() {
  return <SignOutButton beforeSignOut={beforeSignOut} />;
}
