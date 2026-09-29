"use server";

import { requireUser } from "@/features/auth/guards";
import { getFeedService } from "@/features/feed/feed.server";
import {
  messageIdSchema,
  olderSchema,
  postSchema,
  reactionSchema,
  replySchema,
} from "@/features/feed/schemas";
import type { z } from "zod";
import { err, type AppError, type Result } from "@/lib/result";

// Transport and auth for the feed. Each action re-checks the session (a Server Action is a public
// POST endpoint) and validates its input; the service re-checks ownership and RLS backs it up.
// Reads are public, so the two load actions skip the session check.

function parse<S extends z.ZodType>(schema: S, input: unknown): Result<z.output<S>, AppError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return err("invalid", parsed.error.issues[0]?.message ?? "That doesn't look right.");
}

export async function postMessageAction(input: unknown) {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = parse(postSchema, input);
  if (!parsed.ok) return parsed;
  return (await getFeedService()).post(user.value, parsed.value.body);
}

export async function replyAction(input: unknown) {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = parse(replySchema, input);
  if (!parsed.ok) return parsed;
  return (await getFeedService()).reply(user.value, parsed.value.parentId, parsed.value.body);
}

export async function reactAction(input: unknown) {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = parse(reactionSchema, input);
  if (!parsed.ok) return parsed;
  const { messageId, emoji, on } = parsed.value;
  return (await getFeedService()).setReaction(user.value, messageId, emoji, on);
}

export async function deleteMessageAction(input: unknown) {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = parse(messageIdSchema, input);
  if (!parsed.ok) return parsed;
  return (await getFeedService()).remove(user.value, parsed.value.messageId);
}

export async function loadOlderAction(input: unknown) {
  const parsed = parse(olderSchema, input);
  if (!parsed.ok) return parsed;
  return { ok: true as const, value: await (await getFeedService()).getPage(parsed.value.before) };
}

export async function loadMessageAction(input: unknown) {
  const parsed = parse(messageIdSchema, input);
  if (!parsed.ok) return parsed;
  const message = await (await getFeedService()).getMessage(parsed.value.messageId);
  return message ? { ok: true as const, value: message } : err("not_found", "Message not found.");
}
