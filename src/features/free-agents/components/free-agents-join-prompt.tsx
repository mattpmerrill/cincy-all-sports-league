import Link from "next/link";
import { UserPlus } from "lucide-react";

const PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60";
const QUIET =
  "rounded-md text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Shown to people who can browse free agents but not sign them. Visitors get the sign-up ask (and
 * come back to `next` afterwards); members without a team get the claim step on their profile.
 */
export function FreeAgentsJoinPrompt({
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
      aria-labelledby="free-agents-join-title"
      className="flex flex-col gap-4 rounded-2xl border border-brand/50 bg-linear-to-br from-brand/15 to-surface p-4 shadow-glow-brand sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand"
        >
          <UserPlus className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="free-agents-join-title" className="text-xl leading-none font-extrabold">
            {signedIn ? "Claim your team to make moves" : "Want to pick up a free agent?"}
          </h2>
          <p className="text-sm text-text-muted">
            {signedIn
              ? "Once an admin approves your team, you can drop a pick and add a free agent in the same sport."
              : "Claim your team to swap a pick for anyone nobody holds. Everyone can browse the free agents and watch the moves in the meantime."}
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
