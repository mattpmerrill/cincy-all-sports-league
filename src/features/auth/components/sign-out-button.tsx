"use client";

import { SubmitButton } from "@/ui/submit-button";
import { signOutAfter } from "../sign-out";

/** The profile page's Sign out button, with an optional cleanup that runs before the session ends. */
export function SignOutButton({ beforeSignOut }: { beforeSignOut?: () => Promise<void> }) {
  return (
    <form action={signOutAfter(beforeSignOut)}>
      <SubmitButton variant="outline" className="h-9" pendingLabel="Signing out...">
        Sign out
      </SubmitButton>
    </form>
  );
}
