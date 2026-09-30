/**
 * What is safe to put in a log line for a caught value. An Error is logged (name, message and
 * stack; the push repository throws only sanitized ones), but any other thrown value is replaced
 * by a fixed string: a raw database error object can carry the failing row, keys included.
 */
export function loggable(error: unknown): Error | string {
  return error instanceof Error ? error : "A non-Error value was thrown";
}
