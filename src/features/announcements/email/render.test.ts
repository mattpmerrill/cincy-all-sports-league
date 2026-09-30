import { describe, expect, it } from "vitest";
import { FREE_AGENTS_NOTES, FREE_AGENTS_STEPS } from "./free-agents-launch-email";
import { renderFreeAgentsLaunchEmail, renderTradesLaunchEmail } from "./render";

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

describe("renderFreeAgentsLaunchEmail", () => {
  it("points the button and the rules link at the live site, in both versions", async () => {
    const { html, text } = await renderFreeAgentsLaunchEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    expect(html).toContain(`href="${siteUrl}/free-agents"`);
    expect(html).toContain(`href="${siteUrl}/rules"`);
    expect(html).toContain("Hi Coop,");
    expect(text).toContain(`Make your first move: ${siteUrl}/free-agents`);
    expect(html).not.toContain("Claim it on your profile");
  });

  it("carries every step and note in both versions, from the one source", async () => {
    const { html, text } = await renderFreeAgentsLaunchEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    // Attribute-safe: react-email escapes quotes in text nodes, so compare on words without them.
    const plain = (value: string) => value.replace(/["'\u2019]/g, "");
    const htmlPlain = plain(html.replace(/&(?:quot|#x27|#39);/g, ""));
    for (const step of FREE_AGENTS_STEPS) {
      expect(htmlPlain).toContain(plain(step.title));
      expect(text).toContain(step.title);
    }
    for (const note of FREE_AGENTS_NOTES) {
      expect(text).toContain(note);
    }
  });

  it("tells a member without a team to claim one first, in both versions", async () => {
    const { html, text } = await renderFreeAgentsLaunchEmail({
      displayName: "Sam",
      hasTeam: false,
      siteUrl,
    });
    expect(html).toContain("Claim it on your profile");
    expect(text).toContain(`${siteUrl}/me`);
  });

  it("keeps human copy free of em dashes and the old waiver wording", async () => {
    const { html, text } = await renderFreeAgentsLaunchEmail({
      displayName: "Coop",
      hasTeam: false,
      siteUrl,
    });
    for (const output of [html, text]) {
      expect(output).not.toContain("\u2014");
      expect(output).not.toContain("\u2013");
      expect(output.toLowerCase()).not.toContain("waiver");
    }
  });
});
