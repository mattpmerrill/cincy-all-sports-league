"use client";

import { useActionState } from "react";
import { echoedValue, idleFormState, type FormState } from "@/lib/form-state";
import { Field } from "@/ui/field";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";

type Props = {
  displayName: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

export function DisplayNameForm({ displayName, action }: Props) {
  const [state, formAction] = useActionState(action, idleFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <Field
        name="displayName"
        label="Display name"
        defaultValue={echoedValue(state, "displayName", displayName)}
        autoComplete="name"
        required
        errors={fieldErrors(state, "displayName")}
      />
      <FormMessage state={state} />
      <SubmitButton className="h-10 self-start" variant="secondary" pendingLabel="Saving...">
        Save name
      </SubmitButton>
    </form>
  );
}
