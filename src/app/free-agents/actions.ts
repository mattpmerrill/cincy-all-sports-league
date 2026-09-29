"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/guards";
import { getFreeAgentsService } from "@/features/free-agents/free-agents.server";
import { makeMoveSchema } from "@/features/free-agents/schemas";
import { getSyncService } from "@/features/sync/sync.server";
import { formError, formSuccess, formText, type FormState } from "@/lib/form-state";
import { withDeadline } from "@/lib/deadline";
import { revalidateLeague } from "@/lib/league-cache";
import { logger, newCorrelationId } from "@/lib/logger";

// Transport and auth for free-agent moves. The action re-checks the session (a Server Action is a
// public POST endpoint, and `make_free_agent_move` trusts the actor id we pass it), validates the
// form, wires the ESPN refresh into the service and turns its Result into a FormState.
//
// FormData fields:
//   sport              the sport code ("mlb", "nba", ...)
//   dropParticipantId  the participant being dropped (a staleness check; SQL uses the current pick)
//   addParticipantId   the free agent being added

/**
 * The whole ESPN refresh gets this long, however many attempts it makes: a person is waiting, and
 * a move that cannot be priced in time is refused (`facts_unavailable`) rather than left hanging.
 */
const REFRESH_DEADLINE_MS = 20_000;

/** Shown when the form itself is malformed: its fields are hidden, so there is nothing to point at. */
const BAD_REQUEST = "Something looks off with that request. Refresh the page and try again.";

/**
 * A move changes picks and banked points, so the cached league read goes, and so does every page
 * rendered from it. `[slug]`, `[code]` and `[sport]` cover every team and sport, so there is no
 * need to work out which ones. The feed gets a post, and the trade screens can lose listings.
 * Revalidating a route that does not exist yet is harmless: it only marks a cache tag.
 */
function revalidateAfterMove() {
  revalidateLeague();
  revalidatePath("/");
  revalidatePath("/teams/[slug]", "page");
  revalidatePath("/sports/[code]", "page");
  revalidatePath("/free-agents");
  revalidatePath("/free-agents/[sport]", "page");
  revalidatePath("/feed");
  revalidatePath("/trades");
  revalidatePath("/trades/[id]", "page");
}

export async function makeMoveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = makeMoveSchema.safeParse({
    sport: formText(formData, "sport"),
    dropParticipantId: formText(formData, "dropParticipantId"),
    addParticipantId: formText(formData, "addParticipantId"),
  });
  if (!parsed.success) {
    // Every schema message is ours; a raw Zod default ("Invalid input...") would be a leak.
    const message = parsed.error.issues[0]?.message;
    return formError(message && !message.startsWith("Invalid") ? message : BAD_REQUEST);
  }
  const { sport, dropParticipantId, addParticipantId } = parsed.data;

  try {
    const service = await getFreeAgentsService({
      // A person is waiting on this response, so ESPN gets a short leash. The sync service (and its
      // secret-key client) is only built if the service gets as far as needing fresh facts.
      refreshFacts: async (moveSport, participantIds) => {
        const refreshed = await withDeadline(
          getSyncService({ espn: { timeoutMs: 5000, maxAttempts: 2 } }).refreshParticipants({
            sport: moveSport,
            participantIds,
            now: new Date(),
          }),
          REFRESH_DEADLINE_MS,
        );
        return refreshed.ok ? refreshed.value : refreshed;
      },
    });
    const result = await service.makeMove(user.value, {
      sport,
      dropId: dropParticipantId,
      addId: addParticipantId,
    });
    if (!result.ok) return formError(result.error.message);

    revalidateAfterMove();
    return formSuccess(
      `Done. You dropped ${result.value.dropped.name} and picked up ${result.value.added.name}.`,
    );
  } catch (error) {
    const correlationId = newCorrelationId();
    logger.error("free agent move failed", { correlationId, error });
    return formError(`Something went wrong. Reference ${correlationId}.`);
  }
}
