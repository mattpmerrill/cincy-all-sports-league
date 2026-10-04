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
  matchup("2026-10-05", "sher", "papie", {
    start: [10, 10],
    end: [22.4, 18],
    finalizedAt: "2026-10-12T11:00:00.000Z",
  }),
  matchup("2026-10-12", "sher", "coop", { start: [30, 10] }),
];

const props = (
  recipientTeamId: string | null,
  withMatchups = true,
  rows = matchups,
): DigestEmailProps => ({
  displayName: "Ann",
  weekLabel: "Oct 12",
  seasonName: "2026-27",
  digest: buildWeeklyDigest({
    current,
    weekAgo: null,
    recipientTeamId,
    matchups: withMatchups ? { matchups: rows, weekStart: "2026-10-12" } : null,
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
        "Your record: 0 wins, 1 loss, 0 ties",
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
    expect(text).not.toContain("Your record");
  });

  it("has no matchups text at all when the digest has no section", () => {
    const text = renderDigestText(props("sher", false));
    expect(text).not.toContain("MATCHUPS");
    expect(text).not.toContain("/week");
  });

  it("prints the settling notice and no scores when last week is still live", () => {
    const live = [matchup("2026-10-05", "sher", "papie", { start: [10, 10] })];
    const text = renderDigestText(props("sher", true, live));
    expect(text).toContain(
      [
        "MATCHUPS",
        "Last week's matchups are still being settled.",
        "",
        "Follow the matchups live: https://www.cincysports.xyz/week",
      ].join("\n"),
    );
    expect(text).not.toMatch(/ to \d/);
  });

  it("cuts the lists and counts every matchup in the link, in HTML and text alike", async () => {
    const league = Array.from({ length: 20 }, (_, i) =>
      team(`t${i + 1}`, `Team ${i + 1}`, 100 - i),
    );
    const pairings = Array.from({ length: 10 }, (_, i) =>
      matchup("2026-10-12", `t${2 * i + 1}`, `t${2 * i + 2}`, { start: [0, 0] }),
    );
    const cut: DigestEmailProps = {
      ...props(null),
      digest: buildWeeklyDigest({
        current: league,
        weekAgo: null,
        matchups: { matchups: pairings, weekStart: "2026-10-12" },
      }),
    };
    const text = renderDigestText(cut);
    expect(text.match(/Team \d+ vs Team \d+/g)).toHaveLength(4);
    expect(text).toContain("See all 10 matchups: https://www.cincysports.xyz/week");
    const { html } = await renderDigestEmail(cut);
    expect(html).toContain("See all 10 matchups");
    expect(html).not.toContain("Team 19 vs Team 20");
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

  it("prints the settling notice and the Week link, and no scores, when last week is live", async () => {
    const live = [matchup("2026-10-05", "sher", "papie", { start: [10, 10] })];
    const { html } = await renderDigestEmail(props("sher", true, live));
    expect(html).toContain("Last week&#x27;s matchups are still being settled.");
    expect(html).toContain('href="https://www.cincysports.xyz/week"');
    expect(html).not.toMatch(/ to \d/);
  });

  it("leaves the matchups out of the HTML when there is no section", async () => {
    const { html } = await renderDigestEmail(props("sher", false));
    expect(html).not.toContain("matchups");
    expect(html).not.toContain("/week");
  });
});
