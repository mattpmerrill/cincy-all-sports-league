"use client";

import { useActionState } from "react";
import { echoedValue, idleFormState } from "@/lib/form-state";
import { Field } from "@/ui/field";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { signUpAction } from "../actions";

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUpAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        name="displayName"
        label="Your name"
        defaultValue={echoedValue(state, "displayName")}
        hint="Shown to the league next to your team."
        autoComplete="name"
        required
        errors={fieldErrors(state, "displayName")}
      />
      <Field
        name="email"
        label="Email"
        type="email"
        defaultValue={echoedValue(state, "email")}
        autoComplete="email"
        required
        errors={fieldErrors(state, "email")}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        errors={fieldErrors(state, "password")}
      />
      <FormMessage state={state} />
      <SubmitButton className="h-10 w-full" pendingLabel="Creating account...">
        Create account
      </SubmitButton>
    </form>
  );
}
