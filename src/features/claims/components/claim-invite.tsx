import Link from "next/link";
import { Trophy } from "lucide-react";

/**
 * Signed-out nudge above the standings. The public board is the league's best invite, so instead
 * of hiding it this says plainly what an account adds and how many teams are still unowned.
 */
export function ClaimInvite({ claimed, total }: { claimed: number; total: number }) {
  return (
    <section
      aria-labelledby="claim-invite-title"
      className="flex flex-col gap-4 rounded-2xl border border-brand/50 bg-linear-to-br from-brand/15 to-surface p-4 shadow-glow-brand sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand"
        >
          <Trophy className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="claim-invite-title" className="text-xl leading-none font-extrabold">
            Is one of these teams yours?
          </h2>
          <p className="text-sm text-text-muted">
            Claim it to post in the feed, see your team highlighted and get the Monday recap email.
          </p>
          <p className="tabular text-xs font-semibold text-brand-bright">
            {claimed} of {total} teams claimed
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/signup?next=%2Fme"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Claim your team
        </Link>
        <Link
          href="/login?next=%2Fme"
          className="rounded-md text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
