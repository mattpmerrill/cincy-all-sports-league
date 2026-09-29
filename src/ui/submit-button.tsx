"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/ui/button";

type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type"> & {
  /** Shown while the surrounding form's action is running. */
  pendingLabel?: string;
};

/** Submit button that disables itself while its form is submitting, preventing double posts. */
function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={pending || undefined}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export { SubmitButton };
