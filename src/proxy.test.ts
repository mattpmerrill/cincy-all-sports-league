import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Next compiles a matcher string as a path pattern whose regex part is used as written.
const [pattern] = config.matcher;
const runsOn = (path: string) => new RegExp(`^${pattern}$`).test(path);

describe("proxy matcher", () => {
  it("keeps the push worker and its badge out of session refresh, so no cookie is set on them", () => {
    expect(runsOn("/sw.js")).toBe(false);
    expect(runsOn("/push-badge")).toBe(false);
  });

  it("still refreshes the session on pages and other routes", () => {
    for (const path of ["/", "/feed", "/me", "/trades/abc", "/api/cron/sync", "/swim", "/push"]) {
      expect(runsOn(path), path).toBe(true);
    }
  });

  it("still skips the static assets it always skipped", () => {
    for (const path of ["/_next/static/x.js", "/icon", "/apple-icon", "/manifest.webmanifest"]) {
      expect(runsOn(path), path).toBe(false);
    }
  });
});
