"use client";

import { useActionState } from "react";
import type { Profile } from "@/data/profiles.repository";
import { isAdminRole } from "@/domain/membership/membership";
import { idleFormState, type FormState } from "@/lib/form-state";
import { Badge } from "@/ui/badge";
import { FormMessage } from "@/ui/form-message";
import { EmptyState } from "@/ui/page";
import { SubmitButton } from "@/ui/submit-button";
import { UserAvatar } from "@/ui/user-avatar";

type Props = {
  members: Profile[];
  currentUserId: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

export function MembersList({ members, currentUserId, action }: Props) {
  if (members.length === 0) {
    return (
      <EmptyState title="No members yet" description="People appear here after they sign up." />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {members.map((member) => (
        <li key={member.id}>
          <MemberRow member={member} isSelf={member.id === currentUserId} action={action} />
        </li>
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  isSelf,
  action,
}: {
  member: Profile;
  isSelf: boolean;
  action: Props["action"];
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const admin = isAdminRole(member.role);
  const nextRole = admin ? "member" : "admin";

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <UserAvatar displayName={member.displayName} avatarUrl={member.avatarUrl} />
        <p className="min-w-0 flex-1 truncate font-medium">
          {member.displayName}
          {isSelf ? <span className="text-text-muted"> (you)</span> : null}
        </p>
        <Badge variant={admin ? "default" : "secondary"}>{admin ? "Admin" : "Member"}</Badge>
        <form action={formAction}>
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="role" value={nextRole} />
          <SubmitButton
            className="h-9"
            variant={admin ? "destructive" : "secondary"}
            pendingLabel="Saving..."
            aria-label={`${admin ? "Remove admin from" : "Make admin"} ${member.displayName}`}
          >
            {admin ? "Demote" : "Make admin"}
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
