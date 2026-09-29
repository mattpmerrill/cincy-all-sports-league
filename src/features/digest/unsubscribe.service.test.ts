import { describe, expect, it, vi } from "vitest";
import { createUnsubscribeService } from "./unsubscribe.service";
import { signPurposeToken, signUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "a-signing-secret-of-at-least-32-characters";
const USER = "6f1d2c1e-8a44-4f57-9a3b-0c1d2e3f4a5b";

function setup(existing: boolean | null = true) {
  const setOptIn = vi.fn(async () => existing !== null);
  const getOptIn = vi.fn(async () => existing);
  const service = createUnsubscribeService({
    profiles: { setWeeklyEmailOptIn: setOptIn, getWeeklyEmailOptIn: getOptIn },
    secret: SECRET,
  });
  return { service, setOptIn, getOptIn };
}

describe("unsubscribe service", () => {
  it("turns the flag off for exactly the user inside a valid token", async () => {
    const { service, setOptIn } = setup();
    const result = await service.unsubscribe(signUnsubscribeToken(USER, SECRET));
    expect(result).toEqual({ ok: true, value: { optedIn: false } });
    expect(setOptIn).toHaveBeenCalledWith(USER, false);
  });

  it("resubscribes with the same token", async () => {
    const { service, setOptIn } = setup(false);
    const token = signUnsubscribeToken(USER, SECRET);
    await service.unsubscribe(token);
    expect(await service.resubscribe(token)).toEqual({ ok: true, value: { optedIn: true } });
    expect(setOptIn).toHaveBeenLastCalledWith(USER, true);
  });

  it.each([
    ["forged", signUnsubscribeToken(USER, "another-secret-that-is-also-32-chars-long")],
    ["wrong purpose", signPurposeToken(USER, "other", SECRET)],
    ["garbage", "nope"],
  ])("never touches the database for a %s token", async (_name, token) => {
    const { service, setOptIn, getOptIn } = setup();
    expect(await service.unsubscribe(token)).toMatchObject({ error: { code: "invalid_token" } });
    expect(await service.resubscribe(token)).toMatchObject({ error: { code: "invalid_token" } });
    expect(await service.status(token)).toMatchObject({ error: { code: "invalid_token" } });
    expect(setOptIn).not.toHaveBeenCalled();
    expect(getOptIn).not.toHaveBeenCalled();
  });

  it("reports not_found for a valid token whose profile is gone", async () => {
    const { service } = setup(null);
    const token = signUnsubscribeToken(USER, SECRET);
    expect(await service.unsubscribe(token)).toMatchObject({ error: { code: "not_found" } });
    expect(await service.status(token)).toMatchObject({ error: { code: "not_found" } });
  });
});
