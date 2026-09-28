type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, fields?: Fields) => void;
  info: (msg: string, fields?: Fields) => void;
  warn: (msg: string, fields?: Fields) => void;
  error: (msg: string, fields?: Fields) => void;
  /** A logger that stamps every line with extra fields, e.g. a correlation id. */
  child: (fields: Fields) => Logger;
};

/**
 * One JSON object per line on stdout so the host (Vercel) can index fields. Callers must not pass
 * secrets or personal data. Errors are flattened because Error instances serialize to `{}`.
 */
export function createLogger(base: Fields = {}): Logger {
  const write = (level: Level, msg: string, fields: Fields = {}) => {
    const line = { level, msg, time: new Date().toISOString(), ...base, ...normalize(fields) };
    console.log(JSON.stringify(line));
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (f) => createLogger({ ...base, ...f }),
  };
}

export const newCorrelationId = (): string => crypto.randomUUID();

export const logger = createLogger();

function normalize(fields: Fields): Fields {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
    ]),
  );
}
