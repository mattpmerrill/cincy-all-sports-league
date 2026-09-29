import { describe, expect, it } from "vitest";
import { participant } from "./fixtures";
import { newOfferEmail, offerAcceptedEmail, offerLostEmail, offerRejectedEmail } from "./emails";

const legs = [
  {
    sport: "nfl" as const,
    gives: participant("Kansas City Chiefs"),
    gets: participant("Chicago Bears"),
  },
];

describe("trade emails", () => {
  it("tells an owner about a direct offer, with the note and the deadline", () => {
    const mail = newOfferEmail({ offerKind: "direct", from: "Papie", legs, note: "Fair swap?" });
    expect(mail.subject).toBe("Papie wants to trade with you");
    expect(mail.lines).toEqual([
      "Papie offered Kansas City Chiefs (NFL) for your Chicago Bears (NFL).",
      'They wrote: "Fair swap?"',
      "You have 24 hours to accept or reject it.",
    ]);
  });

  it("tells an owner about a competing offer on the block", () => {
    const mail = newOfferEmail({ offerKind: "competing", from: "Papie", legs });
    expect(mail.subject).toBe("New offer on your trading block from Papie");
    expect(mail.lines).toHaveLength(2);
  });

  it("tells the offerer the outcome, and that earned points stay when it was accepted", () => {
    const accepted = offerAcceptedEmail({ owner: "Coop Doggies", legs });
    expect(accepted.subject).toBe("Coop Doggies accepted your offer");
    expect(accepted.lines.join(" ")).toMatch(/already earned stay with your team/);
    expect(offerRejectedEmail({ owner: "Coop Doggies", legs }).lines[0]).toBe(
      "Coop Doggies rejected your offer of Kansas City Chiefs (NFL) for Coop Doggies' Chicago Bears (NFL).",
    );
    expect(offerLostEmail({ owner: "Coop Doggies", legs }).subject).toBe(
      "Coop Doggies chose a different offer",
    );
  });

  it("uses no em dashes anywhere", () => {
    const all = [
      newOfferEmail({ offerKind: "direct", from: "Papie", legs }),
      offerAcceptedEmail({ owner: "Coop Doggies", legs }),
      offerRejectedEmail({ owner: "Coop Doggies", legs }),
      offerLostEmail({ owner: "Coop Doggies", legs }),
    ];
    for (const mail of all) expect([mail.subject, ...mail.lines].join(" ")).not.toMatch(/—/);
  });
});
