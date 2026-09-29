import { NextResponse } from "next/server";
import { z } from "zod";
import { SPORT_CODES } from "@/domain/sports/sports";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/features/sync/cron-auth";
import { getSyncService } from "@/features/sync/sync.server";

// Hobby's ceiling. A full all-sports run measured well under this (see README, "Score sync").
export const maxDuration = 60;

const querySchema = z.object({ sports: z.array(z.enum(SPORT_CODES)).max(SPORT_CODES.length) });

async function run(request: Request): Promise<Response> {
  // Checked first, and by the route itself: the proxy is not an authorization boundary.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `?sport=nfl` (repeatable) syncs just those sports; no parameter means all of them.
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ sports: params.getAll("sport") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const report = await getSyncService().syncLeague({
      now: new Date(),
      sports: parsed.data.sports.length > 0 ? parsed.data.sports : undefined,
    });
    return NextResponse.json({
      ok: true,
      correlationId: report.correlationId,
      durationMs: Date.now() - startedAt,
      changed: report.changed,
      snapshot: report.snapshot,
      sports: report.sports,
    });
  } catch (error) {
    // Anything that escapes the per-sport isolation (database down, bad config). Details stay in
    // the log; the caller only gets a correlation id to quote.
    const correlationId = newCorrelationId();
    logger.error("sync route failed", { correlationId, error });
    return NextResponse.json({ ok: false, error: "sync_failed", correlationId }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
