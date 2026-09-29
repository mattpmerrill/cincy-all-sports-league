import Link from "next/link";
import { MessageSquare } from "lucide-react";

const PRIMARY =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Shown in place of the composer to visitors who can read but not post. Visitors get a sign-up
 * ask (trash talk is the fun part, so it's the pitch); members still waiting get the claim step.
 */
export function JoinPrompt({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-brand/50 bg-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-sm text-text-muted">
        <MessageSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-bright" />
        {signedIn ? (
          <span>
            <span className="font-semibold text-text">
              Claim your team to join the conversation.
            </span>{" "}
            Once an admin approves your team, you can post, reply and react here.
          </span>
        ) : (
          <span>
            <span className="font-semibold text-text">Sign up to talk trash.</span> Claim your team
            and you can post, reply and react. Everyone can read along in the meantime.
          </span>
        )}
      </p>
      {signedIn ? (
        <Link href="/me" className={PRIMARY}>
          Claim your team
        </Link>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/signup?next=%2Fme" className={PRIMARY}>
            Join the league
          </Link>
          <Link
            href="/login?next=%2Ffeed"
            className="rounded-md text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
