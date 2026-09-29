"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Button } from "@/ui/button";
import { useFlash } from "@/ui/flash-slot";
import { FormMessage } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { celebrateTrade } from "./trade-celebration";
import { useRefreshPendingTrades } from "./trades-badge-provider";

/** A Server Action passed down by the route, so this feature never imports `app`. */
export type TradeAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** The first outcome worth showing: an action that ran beats one that never did. */
const latest = (...states: FormState[]) => states.find((s) => s.status !== "idle") ?? idleFormState;

/**
 * Accept and Reject for one pending offer. Accepting swaps players for good, so it takes a second
 * click on a plain-words confirmation; rejecting is undone by the bidder simply offering again.
 */
export function OfferDecisionActions({
  offerId,
  canAccept,
  canReject,
  confirmText,
  accept,
  reject,
}: {
  offerId: string;
  canAccept: boolean;
  canReject: boolean;
  /** What the swap is, in words ("You give A and get B"), shown before the final click. */
  confirmText: string;
  accept: TradeAction;
  reject: TradeAction;
}) {
  const flash = useFlash();
  const refreshBadge = useRefreshPendingTrades();
  // Inside a list that drops the offer once it is decided, report to the list instead of here.
  const report =
    (action: TradeAction): TradeAction =>
    async (prev, formData) => {
      const result = await action(prev, formData);
      flash?.(result);
      if (result.status === "success") refreshBadge();
      return result;
    };
  const acceptAndCelebrate: TradeAction = async (prev, formData) => {
    const result = await report(accept)(prev, formData);
    if (result.status === "success") celebrateTrade(offerId);
    return result;
  };
  const [acceptState, acceptAction] = useActionState(acceptAndCelebrate, idleFormState);
  const [rejectState, rejectAction] = useActionState(report(reject), idleFormState);
  const [confirming, setConfirming] = useState(false);
  const message = flash ? idleFormState : latest(acceptState, rejectState);

  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {canAccept && confirming ? (
        <div
          role="group"
          aria-label="Confirm trade"
          className="flex flex-col gap-3 rounded-xl border border-brand/50 bg-brand/10 p-3"
        >
          <p className="text-sm">
            <span className="font-semibold">{confirmText}</span> The players swap teams right away
            and this can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={acceptAction}>
              <input type="hidden" name="offerId" value={offerId} />
              <SubmitButton className="h-10 px-4 font-semibold" pendingLabel="Trading...">
                Yes, make the trade
              </SubmitButton>
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              autoFocus
              onClick={() => setConfirming(false)}
            >
              Not yet
            </Button>
          </div>
        </div>
      ) : canAccept || canReject ? (
        <div className="flex flex-wrap gap-2">
          {canAccept ? (
            <Button
              type="button"
              className="h-10 px-4 font-semibold"
              onClick={() => setConfirming(true)}
            >
              Accept this offer
            </Button>
          ) : null}
          {canReject ? (
            <form action={rejectAction}>
              <input type="hidden" name="offerId" value={offerId} />
              <SubmitButton variant="outline" className="h-10 px-4" pendingLabel="Rejecting...">
                Reject
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
      <FormMessage state={message} />
    </div>
  );
}

/** Take back your own pending offer. The message stays after it is gone from the list above. */
export function WithdrawOfferButton({
  offerId,
  canWithdraw,
  action,
}: {
  offerId: string;
  canWithdraw: boolean;
  action: TradeAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {canWithdraw ? (
        <form action={formAction}>
          <input type="hidden" name="offerId" value={offerId} />
          <SubmitButton variant="outline" className="h-10 px-4" pendingLabel="Withdrawing...">
            Withdraw offer
          </SubmitButton>
        </form>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}

/** Take a listing down. Its waiting offers close with it, so it asks first. */
export function CancelListingButton({
  listingId,
  canCancel,
  action,
}: {
  listingId: string;
  canCancel: boolean;
  action: TradeAction;
}) {
  const refreshBadge = useRefreshPendingTrades();
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.status === "success") refreshBadge();
    return result;
  }, idleFormState);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {canCancel && confirming ? (
        <div
          role="group"
          aria-label="Confirm cancel"
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-3"
        >
          <p className="text-sm">Take this listing down? Any offers waiting on it are closed.</p>
          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="listingId" value={listingId} />
              <SubmitButton className="h-10 px-4" pendingLabel="Cancelling...">
                Yes, cancel listing
              </SubmitButton>
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              autoFocus
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : canCancel ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 self-start px-4"
          onClick={() => setConfirming(true)}
        >
          Cancel listing
        </Button>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}
