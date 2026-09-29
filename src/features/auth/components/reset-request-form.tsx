"use client";

import { useActionState } from "react";
import { echoedValue, idleFormState } from "@/lib/form-state";
import { Field } from "@/ui/field";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { requestPasswordResetAction } from "../actions";

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordResetAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        name="email"
        label="Email"
        type="email"
        defaultValue={echoedValue(state, "email")}
        autoComplete="email"
        required
        errors={fieldErrors(state, "email")}
      />
      <FormMessage state={state} />
      <SubmitButton className="h-10 w-full" pendingLabel="Sending...">
        Send reset link
      </SubmitButton>
    </form>
  );
}
