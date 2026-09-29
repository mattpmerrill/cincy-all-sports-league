import { describe, expect, it } from "vitest";
import { makeMoveSchema } from "./schemas";

const A = "5d0f6a52-6b0e-4f0e-9a51-0f0c2f3f9a01";
const B = "7c1b2d34-1e2f-4a5b-8c9d-0e1f2a3b4c5d";

/** The form's fields are hidden, so the action shows the first message as is: never a Zod default. */
describe("makeMoveSchema", () => {
  const firstMessage = (input: Record<string, string>) => {
    const parsed = makeMoveSchema.safeParse(input);
    return parsed.success ? null : parsed.error.issues[0]?.message;
  };

  it("accepts a sport and two different uuids", () => {
    expect(
      makeMoveSchema.safeParse({ sport: "mlb", dropParticipantId: A, addParticipantId: B }).success,
    ).toBe(true);
  });

  it.each([
    [{ sport: "", dropParticipantId: A, addParticipantId: B }],
    [{ sport: "cricket", dropParticipantId: A, addParticipantId: B }],
    [{ sport: "mlb", dropParticipantId: "", addParticipantId: B }],
    [{ sport: "mlb", dropParticipantId: A, addParticipantId: "not-a-uuid" }],
    [{ sport: "mlb", dropParticipantId: A, addParticipantId: A }],
  ])("refuses %j with a message of our own", (input) => {
    const message = firstMessage(input);
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/^Invalid/);
  });
});
