import { describe, expect, it } from "vitest";
import { statusLine } from "./status-line";

describe("statusLine", () => {
  it("reads a live lead from the viewer's side", () => {
    expect(statusLine({ state: "live", lead: "ahead" }).text).toBe("Winning");
    expect(statusLine({ state: "live", lead: "behind" }).text).toBe("Trailing");
    expect(statusLine({ state: "live", lead: "tied" }).text).toBe("Tied");
  });

  it("stays neutral when a live total is unknown, rather than calling it", () => {
    expect(statusLine({ state: "live", lead: null })).toEqual({
      text: "Waiting for scores",
      className: "text-text-muted",
    });
  });

  it("reads a final result, and has a neutral label for a viewer with no matchup", () => {
    expect(statusLine({ state: "final", result: "win" }).text).toBe("Final: won");
    expect(statusLine({ state: "final", result: "loss" }).text).toBe("Final: lost");
    expect(statusLine({ state: "final", result: "tie" }).text).toBe("Final: tied");
    expect(statusLine(null).text).toBe("Matchup");
  });
});
