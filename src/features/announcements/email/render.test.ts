import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_AGENTS_NOTES, FREE_AGENTS_STEPS } from "./free-agents-launch-email";
import { ANDROID_STEPS, HOME_SCREEN_TIPS, IPHONE_STEPS, imageUrl } from "./home-screen-email";
import { PUSH_ALERT_TYPES, PUSH_ALERTS_NOTES, PUSH_ALERTS_STEPS } from "./push-alerts-launch-email";
import {
  renderFreeAgentsLaunchEmail,
  renderHomeScreenEmail,
  renderProductUpdateEmail,
  renderPushAlertsLaunchEmail,
  renderTradesLaunchEmail,
} from "./render";

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

describe("renderHomeScreenEmail", () => {
  const props = { displayName: "Coop", siteUrl };
  const steps = [...IPHONE_STEPS, ...ANDROID_STEPS];

  it("links a hosted picture for the hero and every step, each with alt text", async () => {
    const { html } = await renderHomeScreenEmail(props);
    expect(html).toContain(imageUrl(siteUrl, "hero"));
    for (const step of steps) {
      expect(html).toContain(imageUrl(siteUrl, step.image));
      expect(step.alt.length).toBeGreaterThan(10);
    }
  });

  it("only links pictures that exist in public/email, so nobody gets a broken image", () => {
    const files = ["hero", ...steps.map((s) => s.image)].map((id) =>
      path.join(process.cwd(), "public/email", `home-screen-${id}.png`),
    );
    expect(files.filter((file) => !existsSync(file))).toEqual([]);
  });

  it("writes every step and tip out in the plain-text version too", async () => {
    const { text } = await renderHomeScreenEmail(props);
    for (const step of steps) expect(text).toContain(step.title);
    for (const tip of HOME_SCREEN_TIPS) expect(text).toContain(tip.lead);
    expect(text).toContain("PUSH ALERTS ARE LIVE");
    expect(text).toContain(`Open Cincy's League: ${siteUrl}`);
  });

  it("keeps human copy free of em dashes, in both versions", async () => {
    const { html, text } = await renderHomeScreenEmail(props);
    for (const output of [html, text]) {
      expect(output).not.toContain("\u2014");
      expect(output).not.toContain("\u2013");
    }
  });
});

describe("renderPushAlertsLaunchEmail", () => {
  it("points the button at the profile page, where the Alerts section lives", async () => {
    const { html, text } = await renderPushAlertsLaunchEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    expect(html).toContain(`href="${siteUrl}/me"`);
    expect(html).toContain("Hi Coop,");
    expect(text).toContain(`Turn on alerts: ${siteUrl}/me`);
    expect(html).not.toContain("Claim it on your profile");
  });

  it("names every alert type and every step, in both versions", async () => {
    const { html, text } = await renderPushAlertsLaunchEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    const plain = (value: string) =>
      value.replace(/["'\u2019]/g, "").replace(/&(?:quot|#x27|#39);/g, "");
    for (const item of [...PUSH_ALERT_TYPES, ...PUSH_ALERTS_STEPS]) {
      expect(plain(html)).toContain(plain(item.title));
      expect(text).toContain(item.title);
    }
    for (const note of PUSH_ALERTS_NOTES) expect(text).toContain(note.lead);
  });

  it("tells a member without a team to claim one first, in both versions", async () => {
    const { html, text } = await renderPushAlertsLaunchEmail({
      displayName: "Sam",
      hasTeam: false,
      siteUrl,
    });
    expect(html).toContain("Claim it on your profile");
    expect(text).toContain(`${siteUrl}/me`);
  });

  it("does not claim more than has been checked, and keeps human copy free of em dashes", async () => {
    const { html, text } = await renderPushAlertsLaunchEmail({
      displayName: "Coop",
      hasTeam: false,
      siteUrl,
    });
    for (const output of [html, text]) {
      expect(output).not.toContain("\u2014");
      expect(output).not.toContain("\u2013");
      expect(output.toLowerCase()).not.toContain("coming soon");
    }
    // Only iPhone and desktop Chrome have been verified; Android and other browsers are "should work".
    expect(text).toContain("should work too");
  });
});

describe("renderProductUpdateEmail", () => {
  it("lists every feature, calls out Papi, and links the Week tab in both versions", async () => {
    const { html, text } = await renderProductUpdateEmail({
      displayName: "Coop",
      hasTeam: true,
      siteUrl,
    });
    for (const title of ["The Week tab", "Team records", "Head to head", "A new slide-out menu"]) {
      expect(html).toContain(title);
      expect(text).toContain(title);
    }
    expect(html).toContain("Hi Coop,");
    expect(html).toContain("Papi");
    expect(text).toContain("Papi");
    expect(html).toContain(`href="${siteUrl}/week"`);
    expect(text).toContain(`See this week: ${siteUrl}/week`);
    expect(html).not.toContain("Claim it on your profile");
  });

  it("tells a member without a team to claim one, and keeps copy free of em dashes", async () => {
    const { html, text } = await renderProductUpdateEmail({
      displayName: "Sam",
      hasTeam: false,
      siteUrl,
    });
    expect(html).toContain("Claim it on your profile");
    expect(text).toContain(`${siteUrl}/me`);
    expect(html).not.toContain("\u2014");
    expect(text).not.toContain("\u2014");
  });
});
