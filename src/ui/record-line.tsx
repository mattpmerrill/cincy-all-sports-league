import type { RecordLine } from "@/domain/records";
import { cn } from "cn";

/**
 * A participant's record or ranking ("10-4", "No. 4 WTA"). Inline text, so the caller decides
 * the line and the muted styling around it; the label is for screen readers because a bare
 * "10-4" says nothing without it.
 */
export function RecordText({ record, className }: { record: RecordLine; className?: string }) {
  return (
    <span className={cn("tabular", className)}>
      <span className="sr-only">{record.label}: </span>
      {record.text}
    </span>
  );
}
