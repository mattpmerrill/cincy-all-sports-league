"use client";

import { useActionState } from "react";
import { idleFormState } from "@/lib/form-state";
import { FormMessage } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { signInWithGoogleAction } from "../actions";

/** Starts Google OAuth. Its own form so it works beside an email form without nesting. */
export function GoogleButton({ next, label }: { next?: string; label: string }) {
  const [state, action] = useActionState(signInWithGoogleAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton
        variant="outline"
        className="h-10 w-full"
        pendingLabel="Redirecting to Google..."
      >
        <GoogleMark />
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.88 0 3.14.8 3.86 1.49l2.63-2.53C17.5 3.8 15 2.7 12 2.7a9.3 9.3 0 1 0 0 18.6c5.37 0 8.93-3.77 8.93-9.08 0-.61-.07-1.08-.16-1.55Z" />
    </svg>
  );
}
