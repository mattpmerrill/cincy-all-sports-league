import * as React from "react";
import { cn } from "cn";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

type FieldProps = Omit<React.ComponentProps<typeof Input>, "id" | "name"> & {
  name: string;
  label: string;
  /** Validation messages for this field; announced and linked via aria-describedby. */
  errors?: readonly string[];
  hint?: string;
};

/** A labelled input with hint and error text wired up for assistive tech. */
function Field({ name, label, errors, hint, className, ...inputProps }: FieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ");

  return (
    <div data-slot="field" className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
        className={cn("h-10", className)}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-xs text-danger">
          {errors?.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
