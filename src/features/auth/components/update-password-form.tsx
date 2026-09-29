"use client";

import { useActionState } from "react";
import { idleFormState } from "@/lib/form-state";
import { Field } from "@/ui/field";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { updatePasswordAction } from "../actions";

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        errors={fieldErrors(state, "password")}
      />
      <Field
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "confirmPassword")}
      />
      <FormMessage state={state} />
      <SubmitButton className="h-10 w-full" pendingLabel="Saving...">
        Update password
      </SubmitButton>
    </form>
  );
}
