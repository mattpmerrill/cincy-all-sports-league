import { NextResponse } from "next/server";
import { z } from "zod";
import { getDigestService } from "@/features/digest/digest.server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";

// Hobby's ceiling. About 20 recipients at two sends a second finishes in roughly 10 seconds.
export const maxDuration = 60;

const querySchema = z.object({ only: z.email().optional() });

const STATUS_BY_CODE = {
  email_not_configured: 503,
  digest_not_configured: 503,
  recipient_not_found: 404,
} as const;

async function run(request: Request): Promise<Response> {
  // Checked first, and by the route itself: the proxy is not an authorization boundary.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `?only=<email>` sends a test to that one member: no time guard, no digest_sends row.
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ only: params.get("only") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_only" }, { status: 400 });
  }

  try {
    const result = await getDigestService().sendWeeklyDigest({
      now: new Date(),
      only: parsed.data.only,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error.code, message: result.error.message },
        { status: STATUS_BY_CODE[result.error.code] },
      );
    }
    return NextResponse.json({ ok: true, ...result.value });
  } catch (error) {
    const correlationId = newCorrelationId();
    logger.error("weekly digest route failed", { correlationId, error });
    return NextResponse.json({ ok: false, error: "digest_failed", correlationId }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
