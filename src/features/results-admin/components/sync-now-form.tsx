"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { FormMessage } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";

type Props = {
  sport: string;
  sportName: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  variant?: "default" | "outline";
};

/** Runs one sport's sync right now, as the signed-in admin. */
export function SyncNowForm({ sport, sportName, action, variant = "outline" }: Props) {
  const [state, formAction] = useActionState(action, idleFormState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sport" value={sport} />
      <SubmitButton
        className="h-9"
        variant={variant}
        pendingLabel="Syncing..."
        aria-label={`Sync ${sportName} now`}
      >
        Sync now
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
