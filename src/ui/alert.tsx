import * as React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const alertVariants = cva("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", {
  variants: {
    variant: {
      error: "border-danger/40 bg-danger/10 text-danger",
      success: "animate-pop-in border-success/45 bg-success/10 text-success",
      info: "border-line bg-surface-raised text-text-muted",
    },
  },
  defaultVariants: { variant: "info" },
});

/**
 * Errors interrupt assistive tech (role=alert); other messages are announced politely. Success and
 * error carry an icon as well as a color, so the two never depend on color alone.
 */
function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {variant === "success" ? (
        <CircleCheck aria-hidden="true" className="mt-px size-4 shrink-0 animate-check" />
      ) : variant === "error" ? (
        <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
      ) : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export { Alert };
