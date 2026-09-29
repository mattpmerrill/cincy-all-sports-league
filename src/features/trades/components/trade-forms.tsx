"use client";

import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { TRADE_WINDOW_HOURS } from "@/domain/trades";
import { echoedValue, idleFormState, type FormState } from "@/lib/form-state";
import { Alert } from "@/ui/alert";
import { FormMessage } from "@/ui/form-message";
import { Label } from "@/ui/label";
import { NativeSelect } from "@/ui/native-select";
import { EmptyState } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { cn } from "cn";
import { BLOCKING_LISTING_KEY, NOTE_MAX_LENGTH, SPORT_FIELD } from "../schemas";
import type { BlockChoice, NewTradeOptions, TradeChoice } from "../trade-views";
import type { TradeAction } from "./trade-actions";
import { PlayerLine, SportTag, SwapRow } from "./trade-parts";

/** The sports that were checked when the form last failed, so a retry starts where they left off. */
const checkedSports = (state: FormState): string[] =>
  state.status === "error" ? (state.values?.sports?.split(",") ?? []) : [];

const blockingListing = (state: FormState) =>
  state.status === "error" ? state.data?.[BLOCKING_LISTING_KEY] : undefined;

/** The trade rules in one place, shown next to every submit so nobody is surprised. */
export function TradeRulesNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised p-3 text-sm",
        className,
      )}
    >
      <p className="font-semibold">Before you send</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-text-muted">
        <li>Trades are the same sport only, one player for one player.</li>
        <li>
          The trade stays open for {TRADE_WINDOW_HOURS} hours, and other owners can make offers in
          that time.
        </li>
        <li>Points a player already earned stay with the team that earned them.</li>
      </ul>
    </div>
  );
}

/** Error text, plus a way to the listing that holds the player when that is what went wrong. */
function TradeFormMessage({ state }: { state: FormState }) {
  const blocking = blockingListing(state);
  return (
    <div className="flex flex-col gap-1.5">
      <FormMessage state={state} />
      {blocking ? (
        <Link
          href={`/trades/${blocking}`}
          className="w-fit rounded-sm text-sm font-semibold text-brand-bright underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          See the listing that has this player
        </Link>
      ) : null}
    </div>
  );
}

/** One checkable sport. A row that cannot be picked says why, beside the box and to screen readers. */
function ChoiceRow({
  sport,
  disabled,
  defaultChecked,
  reason,
  blockingListingId,
  children,
}: {
  sport: string;
  disabled: boolean;
  defaultChecked: boolean;
  reason?: string;
  blockingListingId?: string;
  children: React.ReactNode;
}) {
  const reasonId = useId();
  return (
    <li className="flex flex-col gap-1.5">
      <label
        className={cn(
          "flex items-start gap-3 rounded-xl border border-line bg-surface p-3 transition-colors",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:bg-surface-raised has-checked:border-brand/70 has-checked:bg-brand/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/60",
        )}
      >
        <input
          type="checkbox"
          name={SPORT_FIELD}
          value={sport}
          disabled={disabled}
          defaultChecked={defaultChecked && !disabled}
          aria-describedby={reason ? reasonId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-brand outline-none"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-2">{children}</span>
      </label>
      {reason ? (
        <p id={reasonId} className="px-1 text-xs text-text-muted">
          {reason}
          {blockingListingId ? (
            <>
              {" "}
              <Link
                href={`/trades/${blockingListingId}`}
                className="rounded-sm font-semibold text-brand-bright underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                See the listing
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

/** An optional note with a live count. Controlled, so what was typed survives a failed send. */
function NoteField({ defaultValue }: { defaultValue: string }) {
  const id = useId();
  const [note, setNote] = useState(defaultValue);
  const over = note.length > NOTE_MAX_LENGTH;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Add a note (optional)</Label>
      <textarea
        id={id}
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Say why this works for both of you"
        aria-describedby={`${id}-count`}
        aria-invalid={over || undefined}
        className="min-h-16 w-full resize-y rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-base text-text outline-none placeholder:text-text-muted focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger"
      />
      <span
        id={`${id}-count`}
        className={cn("tabular text-xs", over ? "font-semibold text-danger" : "text-text-muted")}
      >
        {note.length}/{NOTE_MAX_LENGTH}
      </span>
    </div>
  );
}

function SwapChoiceRow({ choice, checked }: { choice: TradeChoice; checked: boolean }) {
  return (
    <ChoiceRow
      sport={choice.sport}
      disabled={!choice.tradeable}
      defaultChecked={checked}
      reason={choice.reason}
      blockingListingId={choice.blockingListingId}
    >
      <SportTag sport={choice.sport} />
      <SwapRow
        sport={choice.sport}
        leftLabel="You give"
        left={choice.youGive}
        rightLabel="You get"
        right={choice.youGet}
      />
    </ChoiceRow>
  );
}

/** Put your own players on the block: one checkbox per sport you hold a pick in. */
export function BlockForm({ picks, action }: { picks: BlockChoice[]; action: TradeAction }) {
  const [state, formAction] = useActionState(action, idleFormState);
  const checked = checkedSports(state);
  // A fresh key after a failed send re-applies the checked boxes (a form reset would clear them).
  const formKey = state.status === "error" ? `${state.message}:${state.values?.sports}` : "idle";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Which players are up for trade?</legend>
        <ul className="flex flex-col gap-2">
          {picks.map((pick) => (
            <ChoiceRow
              key={pick.sport}
              sport={pick.sport}
              disabled={!pick.tradeable}
              defaultChecked={checked.includes(pick.sport)}
              reason={pick.reason}
              blockingListingId={pick.blockingListingId}
            >
              <SportTag sport={pick.sport} />
              <PlayerLine sport={pick.sport} participant={pick.participant} sportLabel="none" />
            </ChoiceRow>
          ))}
        </ul>
      </fieldset>
      <TradeRulesNote />
      <TradeFormMessage state={state} />
      <SubmitButton className="h-11 self-start px-5 font-semibold" pendingLabel="Posting...">
        Put them on the block
      </SubmitButton>
    </form>
  );
}

/** Offer one team a swap. The team picker lives in the form, so switching teams is instant. */
export function DirectForm({
  teams,
  defaultTeamId,
  action,
}: {
  teams: NewTradeOptions["teams"];
  defaultTeamId: string | null;
  action: TradeAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const selected = teams.find((t) => t.team.id === teamId);
  const checked = checkedSports(state);
  const formKey = state.status === "error" ? `${state.message}:${state.values?.sports}` : "idle";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="teamId">Which team are you offering?</Label>
        <NativeSelect
          id="teamId"
          name="teamId"
          required
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="" disabled>
            Choose a team
          </option>
          {teams.map(({ team }) => (
            <option key={team.id} value={team.id}>
              {team.owner ? `${team.name} (${team.owner.displayName})` : team.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {selected ? (
        selected.choices.length === 0 ? (
          <EmptyState
            title="Nothing to swap"
            description="You don't share a sport with this team."
          />
        ) : (
          <fieldset key={selected.team.id} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">
              Which swaps do you want to offer {selected.team.name}?
            </legend>
            <ul className="flex flex-col gap-2">
              {selected.choices.map((choice) => (
                <SwapChoiceRow
                  key={choice.sport}
                  choice={choice}
                  checked={checked.includes(choice.sport)}
                />
              ))}
            </ul>
          </fieldset>
        )
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-4 text-sm text-text-muted">
          <ArrowLeftRight aria-hidden="true" className="size-4 shrink-0" />
          Pick a team to see the swaps you can offer.
        </p>
      )}

      {selected && selected.choices.length > 0 ? (
        <>
          <NoteField defaultValue={echoedValue(state, "note")} />
          <TradeRulesNote />
        </>
      ) : null}
      <TradeFormMessage state={state} />
      {selected && selected.choices.length > 0 ? (
        <SubmitButton className="h-11 self-start px-5 font-semibold" pendingLabel="Sending...">
          Send offer
        </SubmitButton>
      ) : null}
    </form>
  );
}

/**
 * A bidder's side of a listing: the form until they have an offer in, then a pointer to it. The
 * offer itself lives in the offers list (so its Withdraw message survives the withdrawal), and
 * "offer sent" stays here, since the form that produced it is gone by then.
 */
export function OfferPanel({
  listingId,
  choices,
  blockedReason,
  hasOffer,
  action,
}: {
  listingId: string;
  choices: TradeChoice[];
  /** Why no offer can be made right now, when that is the case. */
  blockedReason: string | null;
  /** The bidder already has a pending offer here. */
  hasOffer: boolean;
  action: TradeAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const checked = checkedSports(state);
  const formKey = state.status === "error" ? `${state.message}:${state.values?.sports}` : "idle";

  if (hasOffer || blockedReason) {
    return (
      <div className="flex flex-col gap-3">
        {state.status === "success" ? <FormMessage state={state} /> : null}
        <Alert>
          {hasOffer
            ? "Your offer is in, listed first below. Withdraw it there if you want to send a different one."
            : blockedReason}
        </Alert>
      </div>
    );
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="listingId" value={listingId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Which swaps do you want to offer?</legend>
        <ul className="flex flex-col gap-2">
          {choices.map((choice) => (
            <SwapChoiceRow
              key={choice.sport}
              choice={choice}
              checked={checked.includes(choice.sport)}
            />
          ))}
        </ul>
      </fieldset>
      <NoteField defaultValue={echoedValue(state, "note")} />
      <TradeRulesNote />
      <TradeFormMessage state={state} />
      <SubmitButton className="h-11 self-start px-5 font-semibold" pendingLabel="Sending...">
        Send offer
      </SubmitButton>
    </form>
  );
}
