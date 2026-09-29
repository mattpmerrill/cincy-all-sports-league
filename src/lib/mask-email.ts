/** "sam@example.com" -> "s***@example.com": enough to correlate a log line, not to contact. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at <= 0 ? "***" : `${email[0]}***${email.slice(at)}`;
}
