"use client";

import type { Message } from "@/domain/feed";
import { MessageEntry, type EntryProps } from "./message-entry";

type Props = Omit<EntryProps, "message" | "compact" | "replyControl"> & {
  replies: readonly Message[];
};

/** Replies sit under their parent, oldest first, on a rule that reads as a thread on a phone. */
export function ReplyList({ replies, ...entry }: Props) {
  return (
    <ul aria-label="Replies" className="flex flex-col gap-3 border-l-2 border-line pl-3">
      {replies.map((reply) => (
        <li key={reply.id}>
          <MessageEntry {...entry} message={reply} compact />
        </li>
      ))}
    </ul>
  );
}
