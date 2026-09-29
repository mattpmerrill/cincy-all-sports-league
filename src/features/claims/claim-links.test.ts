import { describe, expect, it } from "vitest";
import { claimTeamHref, preselectedTeamId, viewerCanClaim } from "./claim-links";

describe("claimTeamHref", () => {
  it("sends members straight to the claim form with the team picked", () => {
    expect(claimTeamHref("coop-doggies", true)).toBe("/me?team=coop-doggies");
  });

  it("sends visitors through sign-up and back to the claim form afterwards", () => {
    const url = new URL(claimTeamHref("coop-doggies", false), "http://x.test");
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("next")).toBe("/me?team=coop-doggies");
  });
});

describe("viewerCanClaim", () => {
  const teams = [{ owner: { id: "u1" } }, { owner: null }];

  it("offers claims to visitors and to members without a team", () => {
    expect(viewerCanClaim(teams, null)).toBe(true);
    expect(viewerCanClaim(teams, "u2")).toBe(true);
  });

  it("hides them from a member who already owns a team", () => {
    expect(viewerCanClaim(teams, "u1")).toBe(false);
  });
});

describe("preselectedTeamId", () => {
  const claimable = [
    { id: "t1", slug: "coop-doggies", requested: false },
    { id: "t2", slug: "papie", requested: true },
  ];

  it("picks an open team by slug", () => {
    expect(preselectedTeamId(claimable, "coop-doggies")).toBe("t1");
  });

  it("ignores teams already requested, unknown slugs and malformed params", () => {
    expect(preselectedTeamId(claimable, "papie")).toBeUndefined();
    expect(preselectedTeamId(claimable, "nobody")).toBeUndefined();
    expect(preselectedTeamId(claimable, ["coop-doggies"])).toBeUndefined();
    expect(preselectedTeamId(claimable, "../admin")).toBeUndefined();
  });
});
