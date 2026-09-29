"use client";

import { useActionState, useRef, useState } from "react";
import type { MoveSideEffects } from "@/domain/free-agents";
import { formatPoints } from "@/domain/league";
import type { SportCode } from "@/domain/sports/sports";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import { useFlash } from "@/ui/flash-slot";
import { FormMessage } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import { possessive, sideEffectsWarning } from "../copy";
import type { FreeAgentRow, MyPickView } from "../free-agents.service";

/** A Server Action passed down by the route, so this feature never imports `app`. */
export type MoveAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * The confirmation for one move: the Add button and the dialog it opens. A move is permanent, so
 * the dialog says in plain words what stays with the team and what does not before the last click.
 *
 * Success goes to the surrounding `FlashSlot` (this dialog leaves with the row once the page
 * refreshes); an error stays here, where the person is looking, and the dialog stays open.
 */
export function MoveDialog({
  sport,
  dropped,
  added,
  sideEffects,
  action,
  onMoved,
}: {
  sport: SportCode;
  dropped: MyPickView;
  added: FreeAgentRow;
  sideEffects: MoveSideEffects;
  action: MoveAction;
  /** Called once after a move went through, to put focus somewhere that still exists. */
  onMoved?: () => void;
}) {
  const flash = useFlash();
  const [open, setOpen] = useState(false);
  const moved = useRef(false);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.status === "success") {
      moved.current = true;
      flash?.(result);
      setOpen(false);
    }
    return result;
  }, idleFormState);

  const droppedName = dropped.participant.name;
  const warning = sideEffectsWarning(droppedName, sideEffects);
  // With a flash slot the success shows above the list; without one it would have nowhere to go.
  const inline = flash && state.status === "success" ? idleFormState : state;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          aria-label={`Add ${added.name}`}
          className="h-11 min-w-16 shrink-0 px-4 font-semibold"
        >
          Add
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          // The row (and this trigger) is gone after a move, so Radix would drop focus on the page.
          if (!moved.current) return;
          event.preventDefault();
          onMoved?.();
        }}
      >
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="sport" value={sport} />
          <input type="hidden" name="dropParticipantId" value={dropped.participant.id} />
          <input type="hidden" name="addParticipantId" value={added.id} />
          <DialogHeader>
            <DialogTitle className="font-sans text-lg leading-snug font-bold tracking-normal break-words normal-case">
              Drop {droppedName}, add {added.name}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2 text-text-muted">
                <p>
                  Points {droppedName} earned for you ({formatPoints(dropped.points)}) stay with
                  your team.
                </p>
                <p>
                  {possessive(added.name)} {formatPoints(added.points)} points so far don&apos;t
                  count for you.
                </p>
                {warning ? <p className="text-text">{warning}</p> : null}
                <p>This can&apos;t be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <FormMessage state={inline} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11 px-4">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton className="h-11 px-4 font-semibold" pendingLabel="Making the move...">
              Confirm move
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
