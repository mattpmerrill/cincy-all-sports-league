import type { PushTopic } from "@/domain/push";

/**
 * What each alert topic is called on /me. `Record<PushTopic, ...>` means a new topic does not
 * compile until it has copy.
 */
export const TOPIC_COPY: Record<PushTopic, { label: string; description: string }> = {
  trades: {
    label: "Trades",
    description: "Offers on your listings, and when an offer you made is answered.",
  },
  feed: {
    label: "Replies and reactions",
    description: "When someone replies to your post or reacts to it.",
  },
  scores: {
    label: "Your team's points",
    description: "When your team gains points after a sync.",
  },
};
