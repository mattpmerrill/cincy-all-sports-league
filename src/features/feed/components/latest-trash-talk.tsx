import { MessageSquare } from "lucide-react";
import Link from "next/link";
import type { Message } from "@/domain/feed";
import { relativeTime } from "@/lib/time";
import { UserAvatar } from "@/ui/user-avatar";
import { getFeedService } from "../feed.server";
import { LeagueBadge } from "./league-post-card";

const PREVIEW_COUNT = 3;

/** The one-line summary of a message for the preview: league posts use their headline text. */
function Line({ message, now }: { message: Message; now: Date }) {
  const isLeague = message.kind === "league";
  return (
    <li className="flex items-start gap-2.5 py-2">
      {isLeague || !message.author ? (
        <span className="mt-0.5 shrink-0">
          <LeagueBadge />
        </span>
      ) : (
        <span className="mt-0.5 shrink-0">
          <UserAvatar
            displayName={message.author.displayName}
            avatarUrl={message.author.avatarUrl}
            size="sm"
          />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-sm break-words">
          {!isLeague && message.author ? (
            <span className="font-semibold">{message.author.displayName} </span>
          ) : null}
          <span className={isLeague ? "text-text-muted" : "text-text"}>{message.body}</span>
        </p>
        <span className="text-xs text-text-muted">
          {relativeTime(new Date(message.createdAt), now)}
        </span>
      </div>
    </li>
  );
}

/** A compact look at the latest messages, linking to the full feed. */
export async function LatestTrashTalk({ className }: { className?: string }) {
  const messages = await (await getFeedService()).getLatest(PREVIEW_COUNT);
  const now = new Date();
  return (
    <section
      aria-labelledby="latest-trash-talk"
      className={`flex flex-col gap-1 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-lift ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="latest-trash-talk" className="flex items-center gap-2 text-base font-bold">
          <MessageSquare aria-hidden="true" className="size-4 text-brand-bright" />
          Latest trash talk
        </h2>
        <Link
          href="/feed"
          className="rounded-md text-sm font-semibold text-brand-bright underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Open feed
        </Link>
      </div>
      {messages.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">Quiet so far. Be the first to say something.</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {messages.map((m) => (
            <Line key={m.id} message={m} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
