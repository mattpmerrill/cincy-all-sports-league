import type { DbClient } from "./db-client";

const BUCKET = "avatars";

/**
 * Profile photos in Supabase Storage. Run with the member's session client: storage RLS only lets
 * a member write inside their own `<user id>/` folder, so a wrong id fails instead of overwriting.
 */
export type AvatarsRepository = ReturnType<typeof createAvatarsRepository>;

export function createAvatarsRepository(db: DbClient) {
  const bucket = () => db.storage.from(BUCKET);
  const publicUrl = (path: string) => bucket().getPublicUrl(path).data.publicUrl;
  // Every public URL in this bucket starts here; used to tell an uploaded photo from a Google one.
  const bucketPrefix = publicUrl("");

  return {
    /** Stores a new photo under a fresh name (no CDN cache to bust) and returns its public URL. */
    async upload(userId: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
      const path = `${userId}/${Date.now()}.${contentType === "image/png" ? "png" : "jpg"}`;
      const { error } = await bucket().upload(path, bytes, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      return publicUrl(path);
    },

    /** Deletes every photo in the member's folder except `keepUrl` (all of them when null). */
    async removeAllExcept(userId: string, keepUrl: string | null): Promise<void> {
      const { data, error } = await bucket().list(userId, { limit: 100 });
      if (error) throw error;
      const stale = data
        .map((file) => `${userId}/${file.name}`)
        .filter((path) => publicUrl(path) !== keepUrl);
      if (stale.length === 0) return;
      const { error: removeError } = await bucket().remove(stale);
      if (removeError) throw removeError;
    },

    /** True when the URL points at a photo a member uploaded here (not a Google photo). */
    isUploaded(url: string | null): boolean {
      return url !== null && url.startsWith(bucketPrefix);
    },
  };
}
