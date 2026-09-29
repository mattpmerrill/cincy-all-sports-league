"use client";

import { useState } from "react";
import type { Thread } from "@/domain/feed";
import { cn } from "cn";
import { Composer } from "./composer";
import { MessageEntry, ReplyButton, type EntryProps } from "./message-entry";
import { ReplyList } from "./reply-list";

type Props = Omit<EntryProps, "message" | "compact" | "replyControl"> & {
  thread: Thread;
  onReply: (parentId: string, body: string) => Promise<string | null>;
};

/** A top-level message with its replies and, for members, a reply composer. */
export function MessageCard({ thread, onReply, ...entry }: Props) {
  const { message, replies } = thread;
  const [replying, setReplying] = useState(false);
  const isLeague = message.kind === "league";

  return (
    <article
      aria-label={
        isLeague
          ? "League update"
          : `Message from ${message.author?.displayName ?? "a former member"}`
      }
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-surface px-3.5 py-3.5 shadow-lift md:px-4",
        isLeague ? "border-l-4 border-line border-l-brand" : "border-line",
      )}
    >
      <MessageEntry
        {...entry}
        message={message}
        replyControl={
          entry.canPost && !message.deleted ? (
            <ReplyButton
              count={replies.length}
              open={replying}
              onClick={() => setReplying((o) => !o)}
            />
          ) : null
        }
      />

      {replies.length > 0 ? <ReplyList replies={replies} {...entry} /> : null}

      {replying ? (
        <Composer
          label={`Reply to ${message.author?.displayName ?? "this post"}`}
          placeholder="Write a reply"
          submitLabel="Reply"
          pendingLabel="Replying"
          rows={2}
          autoFocus
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            const failure = await onReply(message.id, body);
            if (!failure) setReplying(false);
            return failure;
          }}
        />
      ) : null}
    </article>
  );
}
