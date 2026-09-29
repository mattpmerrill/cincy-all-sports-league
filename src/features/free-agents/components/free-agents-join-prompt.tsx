import { UserPlus } from "lucide-react";
import { JoinPrompt } from "@/ui/join-prompt";

/** Shown to people who can browse free agents but not sign them. */
export function FreeAgentsJoinPrompt({
  signedIn,
  next = "/me",
}: {
  signedIn: boolean;
  /** Where to land after signing up or in. Same-origin path. */
  next?: string;
}) {
  return (
    <JoinPrompt
      signedIn={signedIn}
      next={next}
      titleId="free-agents-join-title"
      icon={<UserPlus className="size-5" />}
      signedInTitle="Claim your team to make moves"
      signedInBody="Once an admin approves your team, you can drop a pick and add a free agent in the same sport."
      visitorTitle="Want to pick up a free agent?"
      visitorBody="Claim your team to swap a pick for a free agent. Everyone can browse the free agents and watch the moves in the meantime."
    />
  );
}
