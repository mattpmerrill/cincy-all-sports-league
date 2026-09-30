export type DeviceLabel = "iPhone" | "iPad" | "Android" | "Mac" | "Windows PC" | "Linux" | "Device";

/**
 * A short name for the "Also on N other devices" line. Only this label is stored, never the user
 * agent, which is a fingerprint. Order matters: Android user agents also say "Linux", and iPads
 * say "Mac OS X". iPadOS 13+ sends a desktop Safari user agent, so an iPad in that mode is
 * indistinguishable here and is labelled "Mac".
 */
export function deviceLabel(userAgent: string | null): DeviceLabel {
  const ua = userAgent ?? "";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux|X11/.test(ua)) return "Linux";
  return "Device";
}
