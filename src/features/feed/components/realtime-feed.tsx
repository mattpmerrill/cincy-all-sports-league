"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  addReaction,
  assembleThreads,
  markDeleted,
  mergeMessages,
  mergeReactions,
  removeReaction,
  type Message,
  type ReactionName,
  type ReactionRow,
} from "@/domain/feed";
import type { Actor } from "@/domain/membership/membership";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/page";
import type { FeedActions } from "../feed-actions";
import type { FeedPage } from "../feed.service";
import { realtimeMessageSchema, realtimeReactionSchema } from "../schemas";
import { Composer } from "./composer";
import { JoinPrompt } from "./join-prompt";
import { MessageCard } from "./message-card";

type State = { messages: Message[]; reactions: ReactionRow[]; hasMore: boolean };
type Action =
  | { type: "messages"; messages: Message[] }
  | { type: "deleted"; id: string }
  | { type: "react"; row: ReactionRow }
  | { type: "unreact"; row: ReactionRow }
  | { type: "older"; page: FeedPage };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "messages":
      return { ...state, messages: mergeMessages(state.messages, action.messages) };
    case "deleted":
      return { ...state, messages: markDeleted(state.messages, action.id) };
    case "react":
      return { ...state, reactions: addReaction(state.reactions, action.row) };
    case "unreact":
      return { ...state, reactions: removeReaction(state.reactions, action.row) };
    case "older":
      return {
        messages: mergeMessages(state.messages, action.page.messages),
        reactions: mergeReactions(state.reactions, action.page.reactions),
        hasMore: action.page.hasMore,
      };
  }
}

type Props = {
  initial: FeedPage;
  viewer: Actor | null;
  canPost: boolean;
  serverNow: string;
  actions: FeedActions;
};

/**
 * The live feed. Starts from the server-rendered page, then merges Supabase Realtime changes and
 * the viewer's own actions into local state. Reactions and removals apply immediately and roll
 * back if the server refuses; a new post appears once the server confirms it.
 */
export function RealtimeFeed({ initial, viewer, canPost, serverNow, actions }: Props) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingOlder, startLoadingOlder] = useTransition();
  // Realtime callbacks outlive renders; they read the current ids through a ref.
  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set(state.messages.map((m) => m.id));
  }, [state.messages]);

  const { loadMessage } = actions;
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("league-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (change) => {
          const row = realtimeMessageSchema.safeParse(change.new);
          if (!row.success || knownIds.current.has(row.data.id)) return;
          knownIds.current.add(row.data.id);
          void loadMessage({ messageId: row.data.id }).then((res) => {
            if (res.ok) dispatch({ type: "messages", messages: [res.value] });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (change) => {
          const row = realtimeMessageSchema.safeParse(change.new);
          if (row.success && row.data.deleted_at) dispatch({ type: "deleted", id: row.data.id });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (change) => {
          const row = realtimeReactionSchema.safeParse(change.new);
          if (!row.success) return;
          dispatch({
            type: "react",
            row: {
              messageId: row.data.message_id,
              userId: row.data.user_id,
              emoji: row.data.emoji,
            },
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (change) => {
          const row = realtimeReactionSchema.safeParse(change.old);
          if (!row.success) return;
          dispatch({
            type: "unreact",
            row: {
              messageId: row.data.message_id,
              userId: row.data.user_id,
              emoji: row.data.emoji,
            },
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMessage]);

  const threads = useMemo(() => assembleThreads(state.messages), [state.messages]);

  const submit = useCallback(
    async (input: Promise<Awaited<ReturnType<FeedActions["post"]>>>): Promise<string | null> => {
      setNotice(null);
      const res = await input;
      if (!res.ok) return res.error.message;
      knownIds.current.add(res.value.id);
      dispatch({ type: "messages", messages: [res.value] });
      return null;
    },
    [],
  );

  const react = useCallback(
    async (messageId: string, emoji: ReactionName, on: boolean) => {
      if (!viewer) return;
      const row = { messageId, userId: viewer.id, emoji };
      dispatch({ type: on ? "react" : "unreact", row });
      setNotice(null);
      const res = await actions.react({ messageId, emoji, on });
      if (!res.ok) {
        dispatch({ type: on ? "unreact" : "react", row });
        setNotice(res.error.message);
      }
    },
    [actions, viewer],
  );

  const remove = useCallback(
    async (messageId: string) => {
      const original = state.messages.find((m) => m.id === messageId);
      dispatch({ type: "deleted", id: messageId });
      setNotice(null);
      const res = await actions.remove({ messageId });
      if (!res.ok) {
        if (original) dispatch({ type: "messages", messages: [original] });
        setNotice(res.error.message);
      }
    },
    [actions, state.messages],
  );

  function loadOlder() {
    const oldest = state.messages
      .filter((m) => m.parentId === null)
      .reduce<string | null>(
        (min, m) => (min === null || m.createdAt < min ? m.createdAt : min),
        null,
      );
    if (!oldest) return;
    startLoadingOlder(async () => {
      const res = await actions.loadOlder({ before: oldest });
      if (res.ok) dispatch({ type: "older", page: res.value });
      else setNotice(res.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {viewer && canPost ? (
        <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-lift">
          <Composer
            label="Write a message to the league"
            placeholder="Say something to the league"
            submitLabel="Post"
            pendingLabel="Posting"
            onSubmit={(body) => submit(actions.post({ body }))}
          />
        </div>
      ) : (
        <JoinPrompt signedIn={viewer !== null} />
      )}

      {notice ? <Alert variant="error">{notice}</Alert> : null}

      {threads.length === 0 ? (
        <EmptyState
          title="No trash talk yet"
          description={
            canPost ? "Be the first to say something." : "Posts and score updates show up here."
          }
        />
      ) : (
        <ol aria-label="League feed" className="flex flex-col gap-3">
          {threads.map((thread) => (
            <li key={thread.message.id}>
              <MessageCard
                thread={thread}
                reactions={state.reactions}
                viewer={viewer}
                canPost={canPost}
                serverNow={serverNow}
                onReact={react}
                onDelete={remove}
                onReply={(parentId, body) => submit(actions.reply({ parentId, body }))}
              />
            </li>
          ))}
        </ol>
      )}

      {state.hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 self-center px-5"
          disabled={loadingOlder}
          onClick={loadOlder}
        >
          {loadingOlder ? "Loading" : "Load older messages"}
        </Button>
      ) : null}
    </div>
  );
}
