import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getAuthService } from "@/features/auth/auth.server";
import { originFromHeaders } from "@/features/auth/origin";
import { safeNextPath } from "@/features/auth/safe-next";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Landing point for OAuth and emailed links (confirm sign-up, reset password). Trades the one-time
 * code or token for a session cookie, then continues to `next`, which is reduced to a same-origin
 * path so this can never become an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = originFromHeaders(request.headers);
  const next = safeNextPath(searchParams.get("next"), "/me");

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = OTP_TYPES.find((t) => t === searchParams.get("type"));

  const credentials = code
    ? ({ kind: "code", code } as const)
    : tokenHash && type
      ? ({ kind: "token_hash", tokenHash, type } as const)
      : null;

  if (!credentials) {
    logger.warn("auth callback without credentials");
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }

  const result = await (await getAuthService()).completeCallback(credentials);
  if (!result.ok) {
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }
  // `next` is a validated relative path, so resolving it against our own origin stays on-site.
  return NextResponse.redirect(new URL(next, origin));
}
