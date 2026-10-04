import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { logger, newCorrelationId } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getMatchupsRolloverService } from "@/features/matchups/matchups.server";

// Hobby's ceiling. A run is one fresh league read, a few small queries and one database function.
export const maxDuration = 60;

/** Only two failures are about the request's state; the rest mean this app built a bad call. */
const ERROR_STATUS: Partial<Record<string, number>> = {
  week_out_of_order: 409,
  season_not_found: 404,
};

async function run(request: Request): Promise<Response> {
  // Checked first, and by the route itself: the proxy is not an authorization boundary.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // The clock is not a parameter on purpose: nobody who can call this route may pick the week.
    const result = await getMatchupsRolloverService().rollWeek({ now: new Date() });
    if (!result.ok) {
      const { code, message } = result.error;
      return NextResponse.json(
        { ok: false, error: code, message },
        { status: ERROR_STATUS[code] ?? 500 },
      );
    }
    // A skipped run is a normal answer (most daily runs are), so it is a 200 like a finished one.
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result.value });
  } catch (error) {
    // Database down, bad config, a reply that does not match. Details stay in the log; the caller
    // only gets a correlation id to quote.
    const correlationId = newCorrelationId();
    logger.error("matchups route failed", { correlationId, error });
    return NextResponse.json(
      { ok: false, error: "matchups_failed", correlationId },
      { status: 500 },
    );
  }
}

export const POST = run;
export const GET = run;
