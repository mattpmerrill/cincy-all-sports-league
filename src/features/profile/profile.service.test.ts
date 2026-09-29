import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/data/profiles.repository";
import { AVATAR_MAX_BYTES, detectImageType } from "./avatar";
import { createProfileService } from "./profile.service";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
const BUCKET = "https://x.supabase.co/storage/v1/object/public/avatars/";
const actor = { id: "u1", role: "member" as const };

const profile = (avatarUrl: string | null): Profile => ({
  id: "u1",
  displayName: "Coop",
  avatarUrl,
  role: "member",
  createdAt: "2026-09-01T00:00:00Z",
});

function setup(opts: { cleanupFails?: boolean; provider?: string | null; noRow?: boolean } = {}) {
  const setAvatarUrl = vi.fn(async (_id: string, url: string | null) =>
    opts.noRow ? null : profile(url),
  );
  const upload = vi.fn(async (userId: string) => `${BUCKET}${userId}/1.jpg`);
  const removeAllExcept = vi.fn(async () => {
    if (opts.cleanupFails) throw new Error("storage down");
  });
  const warn = vi.fn();
  const service = createProfileService({
    profiles: {
      setAvatarUrl,
      updateDisplayName: vi.fn(),
      getOptIn: vi.fn(),
      setOptIn: vi.fn(),
    },
    avatars: {
      upload,
      removeAllExcept,
      isUploaded: (url) => url !== null && url.startsWith(BUCKET),
    },
    auth: { getProviderAvatarUrl: async () => opts.provider ?? null },
    logger: { warn },
  });
  return { service, setAvatarUrl, upload, removeAllExcept, warn };
}

describe("detectImageType", () => {
  it("knows JPEG, PNG and WebP by their first bytes, whatever the file claims", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("updateAvatar", () => {
  it("stores the photo as its real type, points the profile at it and clears older ones", async () => {
    const { service, upload, setAvatarUrl, removeAllExcept } = setup();
    const result = await service.updateAvatar(actor, PNG);
    expect(result).toMatchObject({ ok: true, value: { avatarUrl: `${BUCKET}u1/1.jpg` } });
    expect(upload).toHaveBeenCalledWith("u1", expect.any(ArrayBuffer), "image/png");
    expect(setAvatarUrl).toHaveBeenCalledWith("u1", `${BUCKET}u1/1.jpg`);
    expect(removeAllExcept).toHaveBeenCalledWith("u1", `${BUCKET}u1/1.jpg`);
  });

  it("refuses a file that isn't an image before storing anything", async () => {
    const { service, upload } = setup();
    const result = await service.updateAvatar(actor, new TextEncoder().encode("hello"));
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_image" } });
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a file over the cap", async () => {
    const { service, upload } = setup();
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(JPEG);
    expect(await service.updateAvatar(actor, big)).toMatchObject({
      ok: false,
      error: { code: "too_large" },
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("still saves when cleaning up old files fails, and logs it", async () => {
    const { service, warn } = setup({ cleanupFails: true });
    expect((await service.updateAvatar(actor, JPEG)).ok).toBe(true);
    expect(warn).toHaveBeenCalledWith("avatar cleanup failed", expect.anything());
  });

  it("removes the stray upload when the profile row is missing", async () => {
    const { service, removeAllExcept } = setup({ noRow: true });
    expect(await service.updateAvatar(actor, JPEG)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(removeAllExcept).toHaveBeenCalledWith("u1", null);
  });
});

describe("removeAvatar", () => {
  it("goes back to the Google photo when the account has one", async () => {
    const { service, setAvatarUrl, removeAllExcept } = setup({
      provider: "https://lh3.googleusercontent.com/a/abc",
    });
    expect((await service.removeAvatar(actor)).ok).toBe(true);
    expect(setAvatarUrl).toHaveBeenCalledWith("u1", "https://lh3.googleusercontent.com/a/abc");
    expect(removeAllExcept).toHaveBeenCalledWith("u1", null);
  });

  it("falls back to initials otherwise", async () => {
    const { service, setAvatarUrl } = setup();
    await service.removeAvatar(actor);
    expect(setAvatarUrl).toHaveBeenCalledWith("u1", null);
  });
});

describe("avatarSource", () => {
  it("tells an upload from a Google photo from none", () => {
    const { service } = setup();
    expect(service.avatarSource(`${BUCKET}u1/1.jpg`)).toBe("upload");
    expect(service.avatarSource("https://lh3.googleusercontent.com/a/abc")).toBe("provider");
    expect(service.avatarSource(null)).toBe("none");
  });
});
