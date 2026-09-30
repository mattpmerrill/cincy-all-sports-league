/**
 * What is safe to log about a caught value when it may have touched credentials. A Postgres error
 * carries the failing row in `details` ("Failing row contains (...)"), and an Error's message can
 * quote whatever it was handed, so neither text is kept: only the error's name and a short
 * SQLSTATE-style code, each checked against a strict shape so a hostile value cannot smuggle text
 * through them. Pair it with a fixed message and a correlation id.
 */
export function safeErrorFields(error: unknown): { errorName: string; errorCode?: string } {
  const name = error instanceof Error && /^[A-Za-z][\w.]{0,59}$/.test(error.name) ? error.name : "";
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return {
    errorName: name || (error instanceof Error ? "Error" : "NonError"),
    ...(typeof code === "string" && /^[A-Za-z0-9_]{1,20}$/.test(code) ? { errorCode: code } : {}),
  };
}
