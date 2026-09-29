import Link from "next/link";
import { MessageSquare } from "lucide-react";

/** Shown in place of the composer to visitors who can read but not post. */
export function JoinPrompt({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-sm text-text-muted">
        <MessageSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-bright" />
        <span>
          <span className="font-semibold text-text">
            Sign in and claim your team to join the conversation.
          </span>{" "}
          {signedIn
            ? "Once an admin approves your team, you can post, reply and react here."
            : "Everyone can read along in the meantime."}
        </span>
      </p>
      <Link
        href={signedIn ? "/me" : "/login?next=%2Ffeed"}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        {signedIn ? "Claim your team" : "Sign in"}
      </Link>
    </div>
  );
}
