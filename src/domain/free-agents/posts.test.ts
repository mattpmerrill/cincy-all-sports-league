import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, parseLeaguePayload } from "@/domain/feed";
import { participant } from "@/domain/trades/fixtures";
import { freeAgentMovePost } from "./posts";

const team = { name: "Coop Doggies", slug: "coop-doggies" };

describe("freeAgentMovePost", () => {
  const post = freeAgentMovePost({
    team,
    sport: "mlb",
    dropped: participant("Texas Rangers"),
    added: participant("St. Louis Cardinals"),
  });

  it("says who dropped whom and picked up whom, with the sport tag on the drop", () => {
    expect(post.body).toBe(
      "Coop Doggies dropped Texas Rangers (MLB) and picked up St. Louis Cardinals.",
    );
  });

  it("builds a payload without moveId that round-trips once the function injects it", () => {
    expect(post.payload).not.toHaveProperty("moveId");
    expect(parseLeaguePayload({ ...post.payload, moveId: "m1" })).toEqual({
      ...post.payload,
      moveId: "m1",
    });
  });

  it("never uses an em dash, which the human-facing copy rules forbid", () => {
    expect(post.body).not.toContain("—");
  });

  it("fits the feed limit even for absurdly long names, and keeps the payload whole", () => {
    const long = "x".repeat(300);
    const huge = freeAgentMovePost({
      team: { name: long, slug: "s" },
      sport: "wta",
      dropped: participant(long),
      added: participant(long),
    });
    expect(huge.body.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
    expect(huge.payload.added).toBe(long);
  });

  it("leaves a body of ordinary length untouched", () => {
    const short = freeAgentMovePost({
      team: { name: "A", slug: "a" },
      sport: "nfl",
      dropped: participant("Bears"),
      added: participant("Jets"),
    });
    expect(short.body).toBe("A dropped Bears (NFL) and picked up Jets.");
  });
});
