import { NextResponse } from "next/server";
import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getSyncService } from "@/features/sync/sync.server";

// Hobby's ceiling. One sport per request keeps even the ~440-team softball pool inside it (the
// scheduler sends one request per sport); the roster load and the college scoring both run here.
export const maxDuration = 60;

// Exactly one sport: a whole-league load would not fit the time limit, so `all` is not an option.
const querySchema = z.object({ sport: z.enum(SPORT_CODES) });

async function run(request: Request): Promise<Response> {
  // Checked first, and by the route itself: the proxy is not an authorization boundary.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sports = new URL(request.url).searchParams.getAll("sport");
  const parsed = querySchema.safeParse({ sport: sports.length === 1 ? sports[0] : undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const report = await getSyncService().refreshFreeAgents({
      now: new Date(),
      sport: parsed.data.sport,
    });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...report,
    });
  } catch (error) {
    // Anything that escapes the per-step isolation (database down, bad config). Details stay in
    // the log; the caller only gets a correlation id to quote.
    const correlationId = newCorrelationId();
    logger.error("free-agents route failed", { correlationId, error });
    return NextResponse.json(
      { ok: false, error: "free_agents_failed", correlationId },
      { status: 500 },
    );
  }
}

export const POST = run;
export const GET = run;
