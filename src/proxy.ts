import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy-session";

/** Session upkeep only. Authorization is re-checked in every action, route and service. */
export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  // Skip static assets; everything else may render with a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
