import type { ReactionRow } from "./reactions";
import type { Message } from "./types";

/** Insert or replace by id. Realtime and the local action can both report the same message. */
export function upsertMessage(messages: readonly Message[], next: Message): Message[] {
  const exists = messages.some((m) => m.id === next.id);
  return exists ? messages.map((m) => (m.id === next.id ? next : m)) : [...messages, next];
}

export function mergeMessages(messages: readonly Message[], more: readonly Message[]): Message[] {
  return more.reduce<Message[]>((all, m) => upsertMessage(all, m), [...messages]);
}

/** A removed message keeps its row (replies hang off it) but loses its text. */
export function markDeleted(messages: readonly Message[], id: string): Message[] {
  return messages.map((m) => (m.id === id ? { ...m, deleted: true, body: "" } : m));
}

const sameReaction = (a: ReactionRow, b: ReactionRow) =>
  a.messageId === b.messageId && a.userId === b.userId && a.emoji === b.emoji;

/** Idempotent: an optimistic add followed by the realtime echo must not double count. */
export function addReaction(rows: readonly ReactionRow[], row: ReactionRow): ReactionRow[] {
  return rows.some((r) => sameReaction(r, row)) ? [...rows] : [...rows, row];
}

export function removeReaction(rows: readonly ReactionRow[], row: ReactionRow): ReactionRow[] {
  return rows.filter((r) => !sameReaction(r, row));
}

export function mergeReactions(
  rows: readonly ReactionRow[],
  more: readonly ReactionRow[],
): ReactionRow[] {
  return more.reduce<ReactionRow[]>((all, r) => addReaction(all, r), [...rows]);
}
