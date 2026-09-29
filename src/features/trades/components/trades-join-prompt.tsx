import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

const PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60";
const QUIET =
  "rounded-md text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Shown to people who can look at trades but not make them. Visitors get the sign-up ask (and come
 * back to `next` afterwards); members without a team get the claim step on their profile.
 */
export function TradesJoinPrompt({
  signedIn,
  next = "/me",
}: {
  signedIn: boolean;
  /** Where to land after signing up or in. Same-origin path. */
  next?: string;
}) {
  const nextParam = encodeURIComponent(next);
  return (
    <section
      aria-labelledby="trades-join-title"
      className="flex flex-col gap-4 rounded-2xl border border-brand/50 bg-linear-to-br from-brand/15 to-surface p-4 shadow-glow-brand sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand"
        >
          <ArrowLeftRight className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="trades-join-title" className="text-xl leading-none font-extrabold">
            {signedIn ? "Claim your team to trade" : "Want in on the trading?"}
          </h2>
          <p className="text-sm text-text-muted">
            {signedIn
              ? "Once an admin approves your team, you can put players on the block and make offers."
              : "Claim your team to put players on the block, make offers and swap picks. Everyone can watch the deals in the meantime."}
          </p>
        </div>
      </div>
      {signedIn ? (
        <Link href="/me" className={`${PRIMARY} shrink-0`}>
          Claim your team
        </Link>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          <Link href={`/signup?next=${nextParam}`} className={PRIMARY}>
            Join the league
          </Link>
          <Link href={`/login?next=${nextParam}`} className={QUIET}>
            Sign in
          </Link>
        </div>
      )}
    </section>
  );
}
