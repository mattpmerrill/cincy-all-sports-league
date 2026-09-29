import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import type { ParticipantData } from "@/domain/league";
import { SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type {
  EffectiveListingStatus,
  EffectiveOfferStatus,
  ListingKind,
  TradeTeamRef,
} from "@/domain/trades";
import { ParticipantImage } from "@/ui/participant-image";
import { SportIcon } from "@/ui/sport-icon";
import { UserAvatar } from "@/ui/user-avatar";
import { cn } from "cn";

/** Shared building blocks for the Trades screens: who, what and how it stands. */

export const KIND_LABEL: Record<ListingKind, string> = {
  block: "Trading block",
  direct: "Direct offer",
};

const PILL_TONE = {
  live: { text: "text-brand-bright", dot: "bg-brand" },
  done: { text: "text-success", dot: "bg-success" },
  quiet: { text: "text-text-muted", dot: "bg-text-muted" },
} as const;

const LISTING_PILL: Record<
  EffectiveListingStatus,
  { label: string; tone: keyof typeof PILL_TONE }
> = {
  open: { label: "Open", tone: "live" },
  accepted: { label: "Traded", tone: "done" },
  cancelled: { label: "Cancelled", tone: "quiet" },
  expired: { label: "Expired", tone: "quiet" },
};

const OFFER_PILL: Record<EffectiveOfferStatus, { label: string; tone: keyof typeof PILL_TONE }> = {
  pending: { label: "Pending", tone: "live" },
  accepted: { label: "Accepted", tone: "done" },
  rejected: { label: "Rejected", tone: "quiet" },
  withdrawn: { label: "Withdrawn", tone: "quiet" },
  void: { label: "Void", tone: "quiet" },
  expired: { label: "Expired", tone: "quiet" },
};

function Pill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: keyof typeof PILL_TONE;
  className?: string;
}) {
  const t = PILL_TONE[tone];
  // The dot is decoration; the word carries the status, so color is never the only signal.
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", t.text, className)}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", t.dot)} />
      {label}
    </span>
  );
}

export function ListingStatusPill({
  status,
  className,
}: {
  status: EffectiveListingStatus;
  className?: string;
}) {
  return <Pill {...LISTING_PILL[status]} className={className} />;
}

export function OfferStatusPill({
  status,
  className,
}: {
  status: EffectiveOfferStatus;
  className?: string;
}) {
  return <Pill {...OFFER_PILL[status]} className={className} />;
}

/** A team's name as a link to its page, optionally with its owner's photo and name. */
export function TeamLine({
  team,
  showOwner = false,
  className,
}: {
  team: TradeTeamRef;
  showOwner?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {showOwner && team.owner ? (
        <UserAvatar
          displayName={team.owner.displayName}
          avatarUrl={team.owner.avatarUrl}
          size="sm"
        />
      ) : null}
      <span className="flex min-w-0 flex-col leading-tight">
        <Link
          href={`/teams/${team.slug}`}
          className="rounded-sm font-semibold break-words text-text underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          {team.name}
        </Link>
        {showOwner && team.owner ? (
          <span className="truncate text-xs text-text-muted">{team.owner.displayName}</span>
        ) : null}
      </span>
    </span>
  );
}

/** A sport's participant: sport glyph, picture and name. The sport name is read out, not shown. */
export function PlayerLine({
  sport,
  participant,
  size = "sm",
  sportLabel = "sr-only",
  className,
}: {
  sport: SportCode;
  participant: ParticipantData;
  size?: "sm" | "md";
  /** Where the sport name goes: under the name, read out only, or left to the caller. */
  sportLabel?: "visible" | "sr-only" | "none";
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ParticipantImage
        name={participant.name}
        src={participant.logoUrl}
        kind={SPORTS[sport].participantKind}
        size={size}
      />
      <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
        <span className="text-sm font-semibold break-words">{participant.name}</span>
        {sportLabel === "none" ? null : (
          <span
            className={cn(
              "flex items-center gap-1 text-xs text-text-muted",
              sportLabel === "sr-only" && "sr-only",
            )}
          >
            <SportIcon sport={sport} className="size-3.5" />
            {SPORTS[sport].name}
          </span>
        )}
      </span>
    </span>
  );
}

/** "Give ⇄ get" for one sport. `for` is spoken between the sides, the arrow is decoration. */
export function SwapRow({
  sport,
  leftLabel,
  left,
  rightLabel,
  right,
  className,
}: {
  sport: SportCode;
  leftLabel?: string;
  left: ParticipantData;
  rightLabel?: string;
  right: ParticipantData;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3",
        className,
      )}
    >
      <Side sport={sport} label={leftLabel} participant={left} />
      <ArrowLeftRight aria-hidden="true" className="mt-7 size-4 text-text-muted" />
      <span className="sr-only">for</span>
      <Side sport={sport} label={rightLabel} participant={right} />
    </div>
  );
}

/** The sport a row is about, above its players. */
export function SportTag({ sport, className }: { sport: SportCode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase",
        className,
      )}
    >
      <SportIcon sport={sport} className="size-4" />
      {SPORTS[sport].name}
    </span>
  );
}

function Side({
  sport,
  label,
  participant,
}: {
  sport: SportCode;
  label?: string;
  participant: ParticipantData;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {label ? (
        <span className="text-[0.7rem] font-semibold tracking-wide text-text-muted uppercase">
          {label}
        </span>
      ) : null}
      <PlayerLine sport={sport} participant={participant} sportLabel="none" />
    </div>
  );
}
