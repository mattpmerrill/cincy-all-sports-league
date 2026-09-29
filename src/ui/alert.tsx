import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const alertVariants = cva("rounded-lg border px-3 py-2 text-sm", {
  variants: {
    variant: {
      error: "border-danger/40 bg-danger/10 text-danger",
      success: "border-brand/40 bg-brand/10 text-brand",
      info: "border-line bg-surface-raised text-text-muted",
    },
  },
  defaultVariants: { variant: "info" },
});

/** Errors interrupt assistive tech (role=alert); other messages are announced politely. */
function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert };
