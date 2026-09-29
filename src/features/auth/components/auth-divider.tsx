/** "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div role="separator" className="flex items-center gap-3 text-xs text-text-muted uppercase">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
