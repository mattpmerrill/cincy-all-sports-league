"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { MESSAGE_MAX_LENGTH } from "@/domain/feed";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { cn } from "cn";

type Props = {
  /** Resolves to an error message to show, or null when the message went through. */
  onSubmit: (body: string) => Promise<string | null>;
  label: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  rows?: number;
  autoFocus?: boolean;
  onCancel?: () => void;
  className?: string;
};

/** A textarea with a live counter. Cmd or Ctrl plus Enter sends; a plain Enter is a new line. */
export function Composer({
  onSubmit,
  label,
  placeholder,
  submitLabel,
  pendingLabel,
  rows = 3,
  autoFocus,
  onCancel,
  className,
}: Props) {
  const id = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const length = body.trim().length;
  const over = body.length > MESSAGE_MAX_LENGTH;
  const canSend = length > 0 && !over && !pending;

  function send() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const failure = await onSubmit(body.trim());
      if (failure) {
        setError(failure);
        return;
      }
      setBody("");
      ref.current?.focus();
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={rows}
        readOnly={pending}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        className="min-h-20 w-full resize-y rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-base text-text outline-none placeholder:text-text-muted focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger"
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex items-center justify-between gap-3">
        <span
          id={`${id}-count`}
          className={cn("tabular text-xs", over ? "font-semibold text-danger" : "text-text-muted")}
        >
          {body.length}/{MESSAGE_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" className="h-9 px-3" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={!canSend} className="h-9 px-4 font-semibold">
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
