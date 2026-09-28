/**
 * Expected failures (validation, not found, forbidden) are returned, not thrown, so callers must
 * handle them. Unexpected failures still throw and are logged at the boundary.
 * `code` is a stable machine-readable string; `message` is safe to show a user.
 */
export type AppError<Code extends string = string> = {
  code: Code;
  message: string;
};

export type Result<T, E extends AppError = AppError> =
  { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <Code extends string>(
  code: Code,
  message: string,
): Result<never, AppError<Code>> => ({ ok: false, error: { code, message } });
