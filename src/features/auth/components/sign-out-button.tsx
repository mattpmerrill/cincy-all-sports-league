"use client";

import { useMemo, useState, type FormEvent } from "react";
import { SubmitButton } from "@/ui/submit-button";
import { signOutAction } from "../actions";
import { createSignOutSubmitHandler } from "../sign-out-submit";

/**
 * The profile page's Sign out button, with an optional cleanup that runs before the session ends.
 * The form is the plain server action, so it works without JavaScript; the cleanup is an
 * enhancement on top (see `createSignOutSubmitHandler`).
 */
export function SignOutButton({ beforeSignOut }: { beforeSignOut?: () => Promise<void> }) {
  const [cleaning, setCleaning] = useState(false);
  const onSubmit = useMemo(
    () => createSignOutSubmitHandler(beforeSignOut, setCleaning),
    [beforeSignOut],
  );
  return (
    <form
      action={signOutAction}
      onSubmit={(event: FormEvent<HTMLFormElement>) => void onSubmit(event)}
    >
      <SubmitButton
        variant="outline"
        className="h-9"
        pendingLabel="Signing out..."
        disabled={cleaning}
      >
        {cleaning ? "Signing out..." : "Sign out"}
      </SubmitButton>
    </form>
  );
}
