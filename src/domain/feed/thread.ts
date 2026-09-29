import type { Message, Thread } from "./types";

const byTime = (a: Message, b: Message) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Top-level messages newest first, each with its replies oldest first (a conversation reads
 * downward). A reply whose parent is not in the list is dropped: it belongs to a page not loaded.
 */
export function assembleThreads(messages: readonly Message[]): Thread[] {
  const replies = new Map<string, Message[]>();
  for (const m of messages) {
    if (m.parentId) replies.set(m.parentId, [...(replies.get(m.parentId) ?? []), m]);
  }
  return messages
    .filter((m) => m.parentId === null)
    .sort((a, b) => byTime(b, a))
    .map((message) => ({ message, replies: (replies.get(message.id) ?? []).sort(byTime) }));
}
