"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Label } from "@/ui/label";
import { NativeSelect } from "@/ui/native-select";
import { EmptyState } from "@/ui/page";
import { FormMessage, fieldErrors } from "@/ui/form-message";
import { SubmitButton } from "@/ui/submit-button";
import type { ClaimState, ClaimableTeam } from "../claims.service";
import { ClaimStatusBadge } from "./claim-status-badge";

type Props = {
  state: ClaimState;
  claimable: ClaimableTeam[];
  /** Pre-picked when the member arrived from a team's claim link. */
  defaultTeamId?: string;
  /** The claim Server Action, passed in by the route so features don't import each other. */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

/** The member's claim status and, when they can still ask, the form to request a team. */
export function ClaimTeamPanel({ state, claimable, defaultTeamId, action }: Props) {
  const [result, formAction] = useActionState(action, idleFormState);

  if (state.status === "approved") {
    return (
      <div className="flex flex-col gap-2">
        <ClaimStatusBadge status="approved" />
        <p>
          You own <strong>{state.team.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status === "pending" ? (
        <div className="flex flex-col gap-2">
          <ClaimStatusBadge status="pending" />
          <p>
            Waiting on an admin to review your request for{" "}
            {state.claims.map((c) => c.team.name).join(", ")}.
          </p>
        </div>
      ) : null}
      {state.status === "rejected" ? (
        <div className="flex flex-col gap-2">
          <ClaimStatusBadge status="rejected" />
          <p>Your last request wasn&apos;t approved. You can ask for a different team.</p>
        </div>
      ) : null}

      {claimable.length === 0 ? (
        <EmptyState
          title="No teams are open right now"
          description="Every team has an owner. Ask an admin if you think that's a mistake."
        />
      ) : (
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="teamId">
              {state.status === "none" ? "Which team is yours?" : "Request another team"}
            </Label>
            <NativeSelect
              id="teamId"
              name="teamId"
              required
              defaultValue={defaultTeamId ?? ""}
              aria-invalid={fieldErrors(result, "teamId") ? true : undefined}
              aria-describedby={fieldErrors(result, "teamId") ? "teamId-error" : undefined}
            >
              <option value="" disabled>
                Choose a team
              </option>
              {claimable.map((team) => (
                <option key={team.id} value={team.id} disabled={team.requested}>
                  {team.requested ? `${team.name} (requested)` : team.name}
                </option>
              ))}
            </NativeSelect>
            {fieldErrors(result, "teamId") ? (
              <p id="teamId-error" className="text-xs text-danger">
                {fieldErrors(result, "teamId")?.join(" ")}
              </p>
            ) : null}
          </div>
          <FormMessage state={result} />
          <SubmitButton className="h-10 self-start" pendingLabel="Sending...">
            Request this team
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
