"use client";

import { useActionState, useId, useState } from "react";
import type { TargetRule } from "@/data/sport-targets.repository";
import type { SportCode } from "@/domain/sports/sports";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Badge } from "@/ui/badge";
import { FormMessage } from "@/ui/form-message";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { NativeSelect } from "@/ui/native-select";
import { EmptyState } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { usesEventLabel, usesQuantity } from "../result-input";
import type { ParticipantResults, ResultLine } from "../results-admin.service";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type EditorActions = { save: Action; remove: Action; lock: Action };

type Props = {
  sport: SportCode;
  rules: TargetRule[];
  participants: ParticipantResults[];
  actions: EditorActions;
};

export function SportResultsEditor({ sport, rules, participants, actions }: Props) {
  if (participants.length === 0) {
    return <EmptyState title="No picks yet" description="Participants appear once teams pick." />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {participants.map((participant) => (
        <li key={participant.id}>
          <ParticipantCard
            sport={sport}
            rules={rules}
            participant={participant}
            actions={actions}
          />
        </li>
      ))}
    </ul>
  );
}

function ParticipantCard({
  sport,
  rules,
  participant,
  actions,
}: {
  sport: SportCode;
  rules: TargetRule[];
  participant: ParticipantResults;
  actions: EditorActions;
}) {
  return (
    <section
      aria-label={participant.name}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">{participant.name}</h3>
        {participant.externalId ? null : <Badge variant="outline">No feed id</Badge>}
      </div>

      {participant.results.length === 0 ? (
        <p className="text-sm text-text-muted">No results recorded.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {participant.results.map((line) => (
            <li key={line.id} className="py-2 first:pt-0">
              <ResultRow
                sport={sport}
                rules={rules}
                participantId={participant.id}
                line={line}
                actions={actions}
              />
            </li>
          ))}
        </ul>
      )}

      <ResultFormDisclosure
        summary="Add result"
        sport={sport}
        rules={rules}
        participantId={participant.id}
        action={actions.save}
        submitLabel="Add result"
        summaryClassName="h-9"
      />
    </section>
  );
}

function describeQuantity(line: ResultLine): string {
  switch (line.ruleKind) {
    case "per_win":
    case "per_tie":
      return `× ${line.quantity}`;
    case "final_rank_band":
      return `rank ${line.quantity}`;
    default:
      return "";
  }
}

function ResultRow({
  sport,
  rules,
  participantId,
  line,
  actions,
}: {
  sport: SportCode;
  rules: TargetRule[];
  participantId: string;
  line: ResultLine;
  actions: EditorActions;
}) {
  const [lockState, lockAction] = useActionState(actions.lock, idleFormState);
  const [removeState, removeAction] = useActionState(actions.remove, idleFormState);
  const message = removeState.status !== "idle" ? removeState : lockState;
  const name = line.eventLabel ? `${line.ruleLabel}, ${line.eventLabel}` : line.ruleLabel;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{line.ruleLabel}</span>
          {line.eventLabel ? (
            <span className="text-text-muted"> · {line.eventLabel}</span>
          ) : null}{" "}
          <span className="text-text-muted">{describeQuantity(line)}</span>
        </p>
        <Badge variant={line.source === "espn" ? "secondary" : "outline"}>
          {line.source === "espn" ? "ESPN" : "Manual"}
        </Badge>
        {line.isLocked ? <Badge>Locked</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={lockAction}>
          <input type="hidden" name="sport" value={sport} />
          <input type="hidden" name="resultId" value={line.id} />
          <input type="hidden" name="locked" value={line.isLocked ? "off" : "on"} />
          <SubmitButton
            className="h-8"
            variant="outline"
            pendingLabel="Saving..."
            aria-label={`${line.isLocked ? "Unlock" : "Lock"} ${name}`}
          >
            {line.isLocked ? "Unlock" : "Lock"}
          </SubmitButton>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="sport" value={sport} />
          <input type="hidden" name="resultId" value={line.id} />
          <SubmitButton
            className="h-8"
            variant="destructive"
            pendingLabel="Deleting..."
            aria-label={`Delete ${name}`}
          >
            Delete
          </SubmitButton>
        </form>
        <ResultFormDisclosure
          summary="Edit"
          summaryLabel={`Edit ${name}`}
          sport={sport}
          rules={rules}
          participantId={participantId}
          action={actions.save}
          submitLabel="Save changes"
          line={line}
          summaryClassName="h-8"
        />
      </div>
      <FormMessage state={message} />
    </div>
  );
}

const KIND_HINT: Record<string, string> = {
  per_win: "Regular-season wins so far.",
  per_tie: "Ties (NFL) or draws (MLS).",
  final_rank_band: "The rank itself, inside this rule's range.",
};

type FormProps = {
  sport: SportCode;
  rules: TargetRule[];
  participantId: string;
  action: Action;
  submitLabel: string;
  line?: ResultLine;
};

/** A collapsed form whose outcome message sits outside the fold, so it is seen after it closes. */
function ResultFormDisclosure({
  summary,
  summaryLabel,
  summaryClassName,
  ...formProps
}: FormProps & { summary: string; summaryLabel?: string; summaryClassName: string }) {
  const [state, formAction] = useActionState(formProps.action, idleFormState);
  return (
    <div className="flex flex-col gap-2">
      <details>
        <summary
          aria-label={summaryLabel}
          className={`inline-flex ${summaryClassName} cursor-pointer items-center rounded-lg border border-line px-3 text-sm font-medium outline-none select-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          {summary}
        </summary>
        <div className="pt-3">
          <ResultFields {...formProps} formAction={formAction} />
        </div>
      </details>
      <FormMessage state={state} />
    </div>
  );
}

function ResultFields({
  sport,
  rules,
  participantId,
  submitLabel,
  line,
  formAction,
}: Omit<FormProps, "action"> & { formAction: (formData: FormData) => void }) {
  const uid = useId();
  const [ruleId, setRuleId] = useState(line?.ruleId ?? rules[0]?.id ?? "");
  const kind = rules.find((r) => r.id === ruleId)?.kind;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sport" value={sport} />
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="id" value={line?.id ?? ""} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-rule`}>Result type</Label>
        <NativeSelect
          id={`${uid}-rule`}
          name="ruleId"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          {rules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {kind && usesQuantity(kind) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-qty`}>Quantity</Label>
          <Input
            id={`${uid}-qty`}
            name="quantity"
            inputMode="numeric"
            className="h-10"
            defaultValue={line ? String(line.quantity) : ""}
            aria-describedby={`${uid}-qty-hint`}
          />
          <p id={`${uid}-qty-hint`} className="text-xs text-text-muted">
            {KIND_HINT[kind]}
          </p>
        </div>
      ) : (
        <input type="hidden" name="quantity" value="1" />
      )}

      {kind && usesEventLabel(kind) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-event`}>Event</Label>
          <Input
            id={`${uid}-event`}
            name="eventLabel"
            className="h-10"
            defaultValue={line?.eventLabel ?? ""}
            placeholder="US Open"
          />
        </div>
      ) : (
        <input type="hidden" name="eventLabel" value="" />
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="locked"
          defaultChecked={line ? line.isLocked : true}
          className="size-4 accent-brand"
        />
        Lock so sync never overwrites it
      </label>

      <SubmitButton className="h-9 self-start" pendingLabel="Saving...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
