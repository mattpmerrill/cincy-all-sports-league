/**
 * Email clients ignore CSS variables and most stylesheets, so the email carries literal values.
 * They mirror the Reds tokens in app/globals.css (brand #c6011f); the dark app canvas becomes a
 * white card here because email clients that auto-invert colors handle light cards more safely.
 * This file is the one place hex values are allowed for that reason (see eslint.config.mjs).
 */
export const palette = {
  brand: "#C6011F",
  brandDeep: "#8F0116",
  onBrand: "#FFFFFF",
  brandTint: "#FDECEE",
  page: "#F1F1F3",
  card: "#FFFFFF",
  ink: "#17171B",
  muted: "#63636E",
  line: "#E5E5EA",
  up: "#17794A",
  down: "#B42318",
} as const;

export const fonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;
