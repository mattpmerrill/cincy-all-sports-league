import { describe, expect, it } from "vitest";
import { safeErrorFields } from "./safe-error";

const MARKER = "Failing row contains (https://fcm.googleapis.com/secret-endpoint, BBBB)";

describe("safeErrorFields", () => {
  it("keeps the name and SQLSTATE of a database error object, and none of its text", () => {
    const postgrest = { message: MARKER, details: MARKER, hint: MARKER, code: "23514" };
    const fields = safeErrorFields(postgrest);
    expect(fields).toEqual({ errorName: "NonError", errorCode: "23514" });
    expect(JSON.stringify(fields)).not.toContain("secret-endpoint");
  });

  it("drops an Error's message and stack, keeping its class name", () => {
    class PushStorageError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "PushStorageError";
      }
    }
    const fields = safeErrorFields(new PushStorageError(MARKER));
    expect(fields).toEqual({ errorName: "PushStorageError" });
    expect(JSON.stringify(fields)).not.toContain("secret-endpoint");
  });

  it("does not let a hostile name or code carry text through", () => {
    const sneaky = Object.assign(new Error("x"), { name: MARKER, code: MARKER });
    expect(safeErrorFields(sneaky)).toEqual({ errorName: "Error" });
  });

  it("describes anything else as a non-error", () => {
    expect(safeErrorFields(MARKER)).toEqual({ errorName: "NonError" });
    expect(safeErrorFields(null)).toEqual({ errorName: "NonError" });
    expect(safeErrorFields({ code: 42 })).toEqual({ errorName: "NonError" });
  });
});
