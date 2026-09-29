import "server-only";
import { createFantasyTeamsRepository } from "@/data/fantasy-teams.repository";
import { createMessagesRepository } from "@/data/messages.repository";
import { createReactionsRepository } from "@/data/reactions.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createFeedService } from "./feed.service";

/** Feed service acting as the visitor (signed in or anon), so RLS is the final authority. */
export async function getFeedService() {
  const db = await createSupabaseServerClient();
  return createFeedService({
    messages: createMessagesRepository(db),
    reactions: createReactionsRepository(db),
    teams: createFantasyTeamsRepository(db),
  });
}
