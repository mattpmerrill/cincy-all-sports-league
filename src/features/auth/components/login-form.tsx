"use client";

import Link from "next/link";
import { useActionState } from "react";
import { echoedValue, idleFormState } from "@/lib/form-state";
import { Field } from "@/ui/field";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { signInAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
        autoComplete="current-password"
        required
        errors={fieldErrors(state, "password")}
      />
      <FormMessage state={state} />
      <SubmitButton className="h-10 w-full" pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
      <Link
        href="/reset-password"
        className="text-center text-sm text-text-muted underline-offset-4 hover:text-text hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
