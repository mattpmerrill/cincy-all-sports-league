import { MESSAGE_MAX_LENGTH } from "@/domain/feed";
import type { FreeAgentMovePayloadDraft, TradeTeamLink } from "@/domain/feed";
import type { ParticipantData } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import { truncate, withSport } from "@/domain/trades/copy";

/**
 * The feed post for a move. `make_free_agent_move` writes it in the same transaction as the move,
 * so the domain hands it the finished body and payload. The payload has no `moveId`: the function
 * injects it, because the move does not exist until it runs.
 */
export type FreeAgentPost = { body: string; payload: FreeAgentMovePayloadDraft };

export function freeAgentMovePost(input: {
  team: TradeTeamLink;
  sport: SportCode;
  dropped: ParticipantData;
  added: ParticipantData;
}): FreeAgentPost {
  const { team, sport, dropped, added } = input;
  // Only the dropped name carries the sport tag: the pick-up is in the same sport by rule, and
  // the sentence reads better with the tag once.
  const body = `${team.name} dropped ${withSport({ sport, participant: dropped })} and picked up ${added.name}.`;
  return {
    // Names are free text from ESPN, so a body always fits the feed's limit, even for absurd ones.
    body: truncate(body, MESSAGE_MAX_LENGTH),
    payload: {
      type: "free_agent_move",
      team: { name: team.name, slug: team.slug },
      sport,
      dropped: dropped.name,
      added: added.name,
    },
  };
}
