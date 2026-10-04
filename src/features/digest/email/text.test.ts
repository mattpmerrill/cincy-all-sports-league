import { describe, expect, it } from "vitest";
import { buildWeeklyDigest } from "@/domain/digest";
import type { DigestTeamInput } from "@/domain/digest";
import { matchup } from "@/domain/matchups/fixtures";
import { renderDigestEmail } from "./render";
import type { DigestEmailProps } from "./render";
import { renderDigestText } from "./text";

const team = (id: string, name: string, total: number): DigestTeamInput => ({
  teamId: id,
  teamName: name,
  ownerName: `Owner ${name}`,
  total,
  sportSubtotals: [],
  championships: 0,
  postseasonPoints: 0,
  sportsWithPoints: 0,
});

const current = [
  team("sher", "Sher Bear", 30),
  team("papie", "Papie", 20),
  team("coop", "Coop", 10),
];
const matchups = [
  matchup("2026-10-05", "sher", "papie", { start: [10, 10], end: [22.4, 18] }),
  matchup("2026-10-12", "sher", "coop", { start: [30, 10] }),
];

const props = (recipientTeamId: string | null, withMatchups = true): DigestEmailProps => ({
  displayName: "Ann",
  weekLabel: "Oct 12",
  seasonName: "2026-27",
  digest: buildWeeklyDigest({
    current,
    weekAgo: null,
    recipientTeamId,
    matchups: withMatchups ? { matchups, weekStart: "2026-10-12" } : null,
  }),
  siteUrl: "https://www.cincysports.xyz",
  unsubscribeUrl: "https://www.cincysports.xyz/unsubscribe?t=x",
  preheader: "See who moved.",
});

describe("renderDigestText matchups", () => {
  it("lists the recipient's own results and pairing first, ahead of the standings", () => {
    const text = renderDigestText(props("papie"));
    expect(text).toContain(
      [
        "LAST WEEK'S MATCHUPS",
        "You lost to Sher Bear 12.4 to 8",
        "",
        "THIS WEEK'S MATCHUPS",
        "Sher Bear vs Coop",
        "",
        "Your matchup record: 0-1-0 (wins, losses, ties)",
        "",
        "Follow the matchups live: https://www.cincysports.xyz/week",
      ].join("\n"),
    );
    expect(text.indexOf("LAST WEEK'S MATCHUPS")).toBeLessThan(text.indexOf("YOUR TEAM"));
    expect(text.indexOf("LAST WEEK'S MATCHUPS")).toBeLessThan(text.indexOf("TOP 5"));
  });

  it("gives a recipient without a team the neutral lists and no record", () => {
    const text = renderDigestText(props(null));
    expect(text).toContain("Sher Bear beat Papie 12.4 to 8");
    expect(text).toContain("Sher Bear vs Coop");
    expect(text).not.toMatch(/You (beat|lost|tied|play)/);
    expect(text).not.toContain("Your matchup record");
  });

  it("has no matchups text at all when the digest has no section", () => {
    const text = renderDigestText(props("sher", false));
    expect(text).not.toContain("MATCHUPS");
    expect(text).not.toContain("/week");
  });

  it("never uses an em-dash", () => {
    expect(renderDigestText(props("sher"))).not.toContain("—");
  });
});

describe("renderDigestEmail matchups", () => {
  it("carries the same lines and the Week link in the HTML", async () => {
    const { html, text } = await renderDigestEmail(props("sher"));
    expect(html).toContain("You beat Papie 12.4 to 8");
    expect(html).toContain("You play Coop this week");
    expect(html).toContain('href="https://www.cincysports.xyz/week"');
    expect(html).not.toContain("—");
    expect(text).toContain("You beat Papie 12.4 to 8");
  });

  it("leaves the matchups out of the HTML when there is no section", async () => {
    const { html } = await renderDigestEmail(props("sher", false));
    expect(html).not.toContain("matchups");
    expect(html).not.toContain("/week");
  });
});
