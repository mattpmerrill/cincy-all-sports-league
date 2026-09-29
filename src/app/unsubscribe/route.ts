import { NextResponse } from "next/server";
import { z } from "zod";
import { getUnsubscribeService } from "@/features/digest/unsubscribe.server";
import { logger } from "@/lib/logger";

// RFC 8058 one-click unsubscribe. The address in the List-Unsubscribe header points here: mail
// providers POST `List-Unsubscribe=One-Click` to it with no cookies, no page and no confirmation,
// so the signed token in the query string is the only credential. Person-facing GETs are sent on
// to the confirmation page; a scanner that prefetches the link therefore changes nothing.

const tokenSchema = z.string().min(1).max(512);

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const target = new URL("/unsubscribe/confirm", url);
  const token = tokenSchema.safeParse(url.searchParams.get("t"));
  if (token.success) target.searchParams.set("t", token.data);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(new URL(request.url).searchParams.get("t"));
  const form = await request.formData().catch(() => null);
  if (!token.success || form?.get("List-Unsubscribe") !== "One-Click") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const service = getUnsubscribeService();
  const result = service ? await service.unsubscribe(token.data) : null;
  if (!result?.ok) {
    logger.warn("one-click unsubscribe refused", { code: result?.error.code ?? "not_configured" });
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
