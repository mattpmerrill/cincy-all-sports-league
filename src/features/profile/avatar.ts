/**
 * Profile photo rules, shared by the browser (which crops and shrinks before upload) and the
 * server (which checks what actually arrived). The byte cap matches the storage bucket's limit.
 */
export const AVATAR_PIXELS = 512;
export const AVATAR_MAX_BYTES = 1_048_576;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

/**
 * What the file really is, from its first bytes. The browser's declared type is only a claim, so
 * the server trusts the signature: JPEG (FF D8 FF), PNG (89 50 4E 47), WebP ("RIFF" .... "WEBP").
 */
export function detectImageType(bytes: Uint8Array): AvatarType | null {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, text: string) =>
    [...text].every((ch, i) => at(from + i) === ch.charCodeAt(0));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && ascii(1, "PNG")) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}
