import { describe, expect, it } from "vitest";
import { renderTradeEmail } from "./render";

describe("renderTradeEmail", () => {
  const props = {
    heading: "Coop accepted your offer",
    lines: ["Coop accepted your offer.", "Nothing else changed."],
    viewUrl: "https://league.test/trades/l1",
    settingsUrl: "https://league.test/me",
    preheader: "Coop accepted your offer.",
  };

  it("renders the lines, a View trade button and the way to turn trade emails off", async () => {
    const { html, text } = await renderTradeEmail(props);
    expect(html).toContain("Coop accepted your offer");
    expect(html).toContain('href="https://league.test/trades/l1"');
    expect(html).toContain("View trade");
    expect(html).toContain('href="https://league.test/me"');
    expect(text).toContain("View trade: https://league.test/trades/l1");
    expect(text).toContain("Turn them off on your profile page: https://league.test/me");
  });
});
