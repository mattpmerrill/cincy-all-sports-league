import { describe, expect, it } from "vitest";
import { renderTradesLaunchEmail } from "./render";

const siteUrl = "https://www.cincysports.xyz";

describe("renderTradesLaunchEmail", () => {
  it("links the banner, the Trades area and the rules from the site", async () => {
    const { html, text } = await renderTradesLaunchEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    expect(html).toContain(`${siteUrl}/email/trades-live.gif`);
    expect(html).toContain(`href="${siteUrl}/trades"`);
    expect(html).toContain("Hi Coop,");
    expect(text).toContain(`Make your first trade: ${siteUrl}/trades`);
    expect(html).not.toContain("Claim it on your profile");
  });

  it("tells a member without a team to claim one first, in both versions", async () => {
    const { html, text } = await renderTradesLaunchEmail({
      displayName: "Sam",
      hasTeam: false,
      siteUrl,
    });
    expect(html).toContain("Claim it on your profile");
    expect(text).toContain(`${siteUrl}/me`);
  });

  it("keeps human copy free of em dashes", async () => {
    const { html, text } = await renderTradesLaunchEmail({
      displayName: "Coop",
      hasTeam: false,
      siteUrl,
    });
    expect(html).not.toContain("—");
    expect(text).not.toContain("—");
  });
});
