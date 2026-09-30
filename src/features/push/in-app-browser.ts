const IOS = /iPhone|iPad|iPod/;
/** Apps that open links in their own web view: Facebook, Instagram, Snapchat, X, LinkedIn, Line, WeChat, Google. */
const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Snapchat|Twitter|LinkedInApp|Line\/|MicroMessenger|GSA\//;

/**
 * Whether this is an iPhone or iPad web view inside another app. Those cannot "Add to Home
 * Screen", so the install steps only work after the page is opened in Safari. Real Safari and
 * Chrome for iOS carry a `Safari/` token; a bare web view does not, and neither does an installed
 * Home Screen app (which is why this is only asked of a browser that is NOT installed).
 */
export function isIosInAppBrowser(userAgent: string): boolean {
  if (!IOS.test(userAgent)) return false;
  return IN_APP.test(userAgent) || !/Safari\//.test(userAgent);
}
