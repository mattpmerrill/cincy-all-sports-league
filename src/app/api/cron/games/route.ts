import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { gamesRangeSchema } from "@/features/schedule/schemas";
import { getGamesSyncService } from "@/features/schedule/schedule.server";

// Hobby's ceiling. A weeks run is ~15 scoreboard days per pro sport plus one call per held college
// team, six at a time per sport and three sports at a time (see ADR-006 for the call budget).
export const maxDuration = 60;

async function run(request: Request): Promise<Response> {
  // Checked first, and by the route itself: the proxy is not an authorization boundary.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `?range=live` (yesterday and today) or `?range=weeks` (this week and next). No default: a
  // caller that forgets the parameter should hear about it, not silently run the cheap one.
  const parsed = gamesRangeSchema.safeParse(new URL(request.url).searchParams.get("range"));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const report = await getGamesSyncService().refreshGames({
      now: new Date(),
      range: parsed.data,
    });
    return NextResponse.json({
      // A sport that failed still leaves the run finished (200), but `ok` must not claim success.
      ok: report.sports.every((s) => s.status !== "failed"),
      durationMs: Date.now() - startedAt,
      ...report,
    });
  } catch (error) {
    // Anything that escapes the per-sport isolation (database down, bad config). Details stay in
    // the log; the caller only gets a correlation id to quote.
    const correlationId = newCorrelationId();
    logger.error("games route failed", { correlationId, error });
    return NextResponse.json({ ok: false, error: "games_failed", correlationId }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
