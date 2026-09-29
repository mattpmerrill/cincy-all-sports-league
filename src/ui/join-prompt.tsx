import Link from "next/link";
import type { ReactNode } from "react";

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand/85 focus-visible:ring-3 focus-visible:ring-ring/60";
const QUIET =
  "inline-flex min-h-11 items-center rounded-md text-sm font-medium text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * The ask shown to people who can look at a members-only feature but not use it. Visitors get the
 * sign-up ask (and come back to `next` afterwards); members without a team get the claim step on
 * their profile. Each feature supplies its own words and icon.
 */
export function JoinPrompt({
  signedIn,
  next = "/me",
  titleId,
  icon,
  signedInTitle,
  signedInBody,
  visitorTitle,
  visitorBody,
}: {
  signedIn: boolean;
  /** Where to land after signing up or in. Same-origin path. */
  next?: string;
  /** Names the section for assistive tech; unique per page. */
  titleId: string;
  icon: ReactNode;
  signedInTitle: string;
  signedInBody: string;
  visitorTitle: string;
  visitorBody: string;
}) {
  const nextParam = encodeURIComponent(next);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-2xl border border-brand/50 bg-linear-to-br from-brand/15 to-surface p-4 shadow-glow-brand sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand"
        >
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-xl leading-none font-extrabold">
            {signedIn ? signedInTitle : visitorTitle}
          </h2>
          <p className="text-sm text-text-muted">{signedIn ? signedInBody : visitorBody}</p>
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
