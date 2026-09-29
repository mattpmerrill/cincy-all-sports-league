"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Badge } from "@/ui/badge";
import { FormMessage } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";

type Props = {
  optedIn: boolean;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

/** One button that flips the current setting; the page re-renders with the saved value. */
export function WeeklyEmailForm({ optedIn, action }: Props) {
  const [state, formAction] = useActionState(action, idleFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="optIn" value={String(!optedIn)} />
      <div className="flex items-center gap-3">
        <Badge variant={optedIn ? "default" : "secondary"}>{optedIn ? "On" : "Off"}</Badge>
        <SubmitButton className="h-10" variant="secondary" pendingLabel="Saving...">
          {optedIn ? "Turn off" : "Turn on"}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
