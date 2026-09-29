import { ArrowLeftRight } from "lucide-react";
import { JoinPrompt } from "@/ui/join-prompt";

/**
 * Shown to people who can look at trades but not make them. Visitors get the sign-up ask (and come
 * back to `next` afterwards); members without a team get the claim step on their profile.
 */
export function TradesJoinPrompt({
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
      titleId="trades-join-title"
      icon={<ArrowLeftRight className="size-5" />}
      signedInTitle="Claim your team to trade"
      signedInBody="Once an admin approves your team, you can put players on the block and make offers."
      visitorTitle="Want in on the trading?"
      visitorBody="Claim your team to put players on the block, make offers and swap picks. Everyone can watch the deals in the meantime."
    />
  );
}
