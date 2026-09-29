"use client";

import { useActionState } from "react";
import type { PendingClaim } from "@/data/team-claims.repository";
import { idleFormState, type FormState } from "@/lib/form-state";
import { FormMessage } from "@/ui/form-message";
import { EmptyState } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { UserAvatar } from "@/ui/user-avatar";

type ReviewAction = (prev: FormState, formData: FormData) => Promise<FormState>;

type Props = {
  claims: PendingClaim[];
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
};

export function PendingClaimsList({ claims, approveAction, rejectAction }: Props) {
  if (claims.length === 0) {
    return (
      <EmptyState title="No claims waiting" description="New requests from members show up here." />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {claims.map((claim) => (
        <li key={claim.id}>
          <ClaimRow claim={claim} approveAction={approveAction} rejectAction={rejectAction} />
        </li>
      ))}
    </ul>
  );
}

function ClaimRow({
  claim,
  approveAction,
  rejectAction,
}: { claim: PendingClaim } & Omit<Props, "claims">) {
  const [approveState, approve] = useActionState(approveAction, idleFormState);
  const [rejectState, reject] = useActionState(rejectAction, idleFormState);
  const message = rejectState.status !== "idle" ? rejectState : approveState;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <UserAvatar displayName={claim.claimant.displayName} avatarUrl={claim.claimant.avatarUrl} />
        <p className="min-w-0">
          <span className="font-medium">{claim.claimant.displayName}</span>{" "}
          <span className="text-text-muted">wants</span>{" "}
          <span className="font-medium">{claim.team.name}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={approve}>
          <input type="hidden" name="claimId" value={claim.id} />
          <SubmitButton
            className="h-9"
            pendingLabel="Approving..."
            aria-label={`Approve ${claim.claimant.displayName} for ${claim.team.name}`}
          >
            Approve
          </SubmitButton>
        </form>
        <form action={reject}>
          <input type="hidden" name="claimId" value={claim.id} />
          <SubmitButton
            className="h-9"
            variant="destructive"
            pendingLabel="Rejecting..."
            aria-label={`Reject ${claim.claimant.displayName} for ${claim.team.name}`}
          >
            Reject
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={message} />
    </div>
  );
}
