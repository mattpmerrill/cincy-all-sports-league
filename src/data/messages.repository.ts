import { parseLeaguePayload } from "@/domain/feed/payload-schema";
import type { LeaguePayload, Message, MessageAuthor } from "@/domain/feed/types";
import { err, ok, type AppError, type Result } from "@/lib/result";
import type { Json } from "./database.types";
import { PG, type DbClient } from "./db-client";

export type PostMessageError = AppError<"rate_limited" | "not_allowed" | "not_found" | "invalid">;
export type DeleteMessageError = AppError<"not_allowed" | "not_found">;

const SELECT =
  "id, season_id, kind, body, parent_id, payload, deleted_at, created_at, author_id, " +
  "profiles!messages_author_id_fkey(id, display_name, avatar_url, " +
  "fantasy_teams!fantasy_teams_owner_id_fkey(name, slug, season_id))";

type TeamRow = { name: string; slug: string; season_id: string };
type Row = {
  id: string;
  season_id: string;
  kind: "member" | "league";
  body: string;
  parent_id: string | null;
  payload: Json;
  deleted_at: string | null;
  created_at: string;
  author_id: string | null;
  profiles: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    fantasy_teams: TeamRow | TeamRow[] | null;
  } | null;
};

/** Row to domain. The text of a removed message is dropped here so it can never leak to a page. */
function toMessage(row: Row): Message {
  const profile = row.profiles;
  const teams = profile ? [profile.fantasy_teams ?? []].flat() : [];
  // A member can own a team in a past season too; the chip shows the one in this message's season.
  const team = teams.find((t) => t.season_id === row.season_id) ?? null;
  const author: MessageAuthor | null = profile
    ? {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        team: team ? { name: team.name, slug: team.slug } : null,
      }
    : null;
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    body: deleted ? "" : row.body,
    deleted,
    author,
    payload: row.kind === "league" && !deleted ? parseLeaguePayload(row.payload) : null,
    createdAt: row.created_at,
  };
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>;

export function createMessagesRepository(db: DbClient) {
  async function fetchOne(id: string): Promise<Message | null> {
    const { data, error } = await db
      .from("messages")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle<Row>();
    if (error) throw error;
    return data ? toMessage(data) : null;
  }

  return {
    async getActiveSeasonId(): Promise<string | null> {
      const { data, error } = await db
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },

    getById: fetchOne,

    /**
     * One page of top-level messages, newest first, and (unless `withReplies` is false) every
     * reply under them. `before` is the createdAt of the oldest message already shown.
     */
    async listPage(
      seasonId: string,
      opts: { limit: number; before?: string; withReplies?: boolean },
    ): Promise<{ messages: Message[]; hasMore: boolean }> {
      let query = db
        .from("messages")
        .select(SELECT)
        .eq("season_id", seasonId)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(opts.limit + 1);
      if (opts.before) query = query.lt("created_at", opts.before);
      const { data, error } = await query.returns<Row[]>();
      if (error) throw error;

      const hasMore = data.length > opts.limit;
      const top = data.slice(0, opts.limit).map(toMessage);
      if (opts.withReplies === false || top.length === 0) return { messages: top, hasMore };

      const { data: replies, error: replyError } = await db
        .from("messages")
        .select(SELECT)
        .in(
          "parent_id",
          top.map((m) => m.id),
        )
        .order("created_at", { ascending: true })
        .returns<Row[]>();
      if (replyError) throw replyError;
      return { messages: [...top, ...replies.map(toMessage)], hasMore };
    },

    /** Member post or reply as the signed-in user; RLS checks author, ownership and season. */
    async insertMember(input: {
      seasonId: string;
      authorId: string;
      body: string;
      parentId: string | null;
    }): Promise<Result<Message, PostMessageError>> {
      const { data, error } = await db
        .from("messages")
        .insert({
          season_id: input.seasonId,
          author_id: input.authorId,
          kind: "member",
          body: input.body,
          parent_id: input.parentId,
        })
        .select("id")
        .single();
      if (error) {
        if (error.message === "rate_limited") {
          return err(
            "rate_limited",
            "Easy there. The limit is 10 messages a minute, so try again in a bit.",
          );
        }
        switch (error.code) {
          case PG.insufficientPrivilege:
            return err("not_allowed", "Only team owners can post.");
          case PG.foreignKeyViolation:
            return err("not_found", "That message no longer exists.");
          case PG.checkViolation:
            return err("invalid", "You can't reply to a reply.");
          default:
            throw error;
        }
      }
      const message = await fetchOne(data.id);
      if (!message) throw new Error("Inserted message is not readable");
      return ok(message);
    },

    /** Soft delete. RLS hides other people's rows from the update, so "no row" means not yours. */
    async softDelete(id: string, now: Date): Promise<Result<null, DeleteMessageError>> {
      const { data, error } = await db
        .from("messages")
        .update({ deleted_at: now.toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === PG.insufficientPrivilege) {
          return err("not_allowed", "You can only remove your own messages.");
        }
        throw error;
      }
      return data ? ok(null) : err("not_found", "That message is already gone.");
    },

    /** Automatic league post. Only meaningful on the secret-key client: RLS has no policy for it. */
    async insertLeague(seasonId: string, body: string, payload: LeaguePayload): Promise<void> {
      const { error } = await db.from("messages").insert({
        season_id: seasonId,
        author_id: null,
        kind: "league",
        body,
        payload: payload as unknown as Json,
      });
      if (error) throw error;
    },

    /** True when a league post of this type already exists for the day (movers are daily). */
    async hasLeaguePost(
      seasonId: string,
      type: LeaguePayload["type"],
      date: string,
    ): Promise<boolean> {
      const { count, error } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("season_id", seasonId)
        .eq("kind", "league")
        .eq("payload->>type", type)
        .eq("payload->>date", date);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  };
}
