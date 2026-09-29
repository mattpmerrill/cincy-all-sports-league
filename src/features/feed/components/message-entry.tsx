"use client";

import { MessageSquareReply, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import {
  summarizeReactions,
  type Message,
  type ReactionName,
  type ReactionRow,
} from "@/domain/feed";
import type { Actor } from "@/domain/membership/membership";
import { isAdminRole } from "@/domain/membership/membership";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { UserAvatar } from "@/ui/user-avatar";
import { cn } from "cn";
import { LeagueBadge, LeaguePostContent } from "./league-post-card";
import { ReactionBar } from "./reaction-bar";
import { RelativeTime } from "./relative-time";

export type EntryProps = {
  message: Message;
  reactions: readonly ReactionRow[];
  viewer: Actor | null;
  /** Owns an approved team: may react. Others only read. */
  canPost: boolean;
  serverNow: string;
  compact?: boolean;
  onReact: (messageId: string, emoji: ReactionName, on: boolean) => void;
  onDelete: (messageId: string) => Promise<void>;
  /** The Reply button, rendered by the card that owns the reply composer. */
  replyControl?: ReactNode;
};

const teamChip =
  "inline-flex max-w-full items-center truncate rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[0.7rem] leading-none font-semibold text-brand-bright outline-none hover:bg-surface-high focus-visible:ring-3 focus-visible:ring-ring/60";

/** One message (or reply): who, when, what, reactions and the actions the viewer may take. */
export function MessageEntry({
  message,
  reactions,
  viewer,
  canPost,
  serverNow,
  compact = false,
  onReact,
  onDelete,
  replyControl,
}: EntryProps) {
  const [confirming, setConfirming] = useState(false);
  const [removing, startRemoving] = useTransition();
  const isLeague = message.kind === "league";
  const mayDelete =
    viewer !== null &&
    !message.deleted &&
    (message.author?.id === viewer.id || isAdminRole(viewer.role));

  const header = isLeague ? (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <LeagueBadge />
      <RelativeTime iso={message.createdAt} serverNow={serverNow} />
    </div>
  ) : message.author ? (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar
        displayName={message.author.displayName}
        avatarUrl={message.author.avatarUrl}
        size={compact ? "sm" : "default"}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-semibold">{message.author.displayName}</span>
        {message.author.team ? (
          <Link href={`/teams/${message.author.team.slug}`} className={teamChip}>
            {message.author.team.name}
          </Link>
        ) : null}
        <span className="text-xs text-text-muted">
          <RelativeTime iso={message.createdAt} serverNow={serverNow} />
        </span>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span>Former member</span>
      <span className="text-xs">
        <RelativeTime iso={message.createdAt} serverNow={serverNow} />
      </span>
    </div>
  );

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
      <div className="flex items-start justify-between gap-2">
        {header}
        {mayDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 shrink-0 text-text-muted hover:text-danger"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only">Remove this message</span>
          </Button>
        ) : null}
      </div>

      {message.deleted ? (
        <p className="text-sm text-text-muted italic">Message removed</p>
      ) : isLeague ? (
        <LeaguePostContent message={message} />
      ) : (
        <p className="text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap">
          {message.body}
        </p>
      )}

      {message.deleted ? null : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <ReactionBar
            summaries={summarizeReactions(reactions, message.id, viewer?.id ?? null)}
            interactive={canPost}
            onToggle={(name, on) => onReact(message.id, name, on)}
          />
          {replyControl}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove this message?</DialogTitle>
            <DialogDescription>
              It will show as removed for everyone. Replies stay in place.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-9 px-3">
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="h-9 px-3"
              disabled={removing}
              onClick={() =>
                startRemoving(async () => {
                  await onDelete(message.id);
                  setConfirming(false);
                })
              }
            >
              {removing ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ReplyButton({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-expanded={open}
      className="h-8 gap-1.5 px-2 text-text-muted hover:text-text"
      onClick={onClick}
    >
      <MessageSquareReply aria-hidden="true" />
      {count > 0 ? `Reply (${count})` : "Reply"}
    </Button>
  );
}
