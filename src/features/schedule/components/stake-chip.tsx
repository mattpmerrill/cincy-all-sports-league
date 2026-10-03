import Link from "next/link";
import type { Stake } from "@/domain/schedule";
import { UserAvatar } from "@/ui/user-avatar";

/**
 * A fantasy team with a stake in a game: its owner's photo, its name and the side it holds. Links
 * to the team's page.
 */
export function StakeChip({ stake, sideLabel }: { stake: Stake; sideLabel: string }) {
  return (
    <Link
      href={`/teams/${stake.slug}`}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface-raised py-0.5 pr-2.5 pl-1 text-xs font-medium outline-none hover:border-text-muted focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <UserAvatar
        displayName={stake.owner?.displayName ?? stake.name}
        avatarUrl={stake.owner?.avatarUrl ?? null}
        size="sm"
      />
      <span className="max-w-40 truncate">{stake.name}</span>
      <span className="text-text-muted">
        <span className="sr-only">holds </span>
        {sideLabel}
      </span>
    </Link>
  );
}
