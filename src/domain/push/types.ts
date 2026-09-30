/** The alert topics a member can switch on or off. The SQL enum `push_topic` mirrors this list. */
export const PUSH_TOPICS = ["trades", "feed", "scores"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

/** The Urgency header values of RFC 8030, lowest to highest. */
export const PUSH_URGENCIES = ["very-low", "low", "normal", "high"] as const;
export type PushUrgency = (typeof PUSH_URGENCIES)[number];

/** What the service worker shows. Built only by `pushMessage`, which enforces every limit. */
export type PushMessage = {
  title: string;
  body: string;
  /** A same-origin path; a tap opens it. */
  url: string;
  /** A newer notification with the same tag replaces the older one in the tray. */
  tag: string;
  /** Whether a replacement should alert again instead of swapping in silently. */
  renotify: boolean;
};

/** One notification owed to one member. Delivery finds their devices and applies their switches. */
export type PushAlert = {
  topic: PushTopic;
  recipientId: string;
  /** With the recipient it names the event, so a re-run of the same event sends nothing twice. */
  dedupeKey: string;
  message: PushMessage;
  /** How long the push service may hold the alert for an offline device. */
  ttlSeconds: number;
  urgency: PushUrgency;
};

/** An alert sent straight to one device, outside the topic switches (the test alert). */
export type PushSend = Omit<PushAlert, "topic">;

/** One device of one member, as delivery needs it. Never logged. */
export type PushTarget = {
  subscriptionId: string;
  recipientId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushTopicSettings = Record<PushTopic, boolean>;

/**
 * The one port every triggering feature shares. `notify` returns at once and never throws:
 * `build` runs after the response, so the reads it needs cost the action nothing and a failure
 * cannot change the action's result.
 */
export type PushNotifier = {
  notify: (build: () => Promise<readonly PushAlert[]> | readonly PushAlert[]) => void;
};

/** What `record_push_failure` did: counted the failure, pruned the device at the limit, or found no row. */
export type PushFailureOutcome = "counted" | "pruned" | "missing";

/**
 * What delivery needs from storage. It lives here, not beside the sender, so the data layer can
 * assert it satisfies the port (`integrations` may not import `data`, and `data` may not import
 * `integrations`): drift then fails to compile where the repository is written.
 */
export type PushStore = {
  /** Devices of these members that have the topic's switch on (applied in SQL). */
  listTargets: (recipientIds: readonly string[], topic: PushTopic) => Promise<PushTarget[]>;
  /** True when this call won the (recipient, dedupeKey) ledger row; false when it was taken. */
  claim: (recipientId: string, dedupeKey: string) => Promise<boolean>;
  remove: (subscriptionId: string) => Promise<void>;
  recordSuccess: (subscriptionIds: readonly string[], now: Date) => Promise<void>;
  recordFailure: (subscriptionId: string, max: number) => Promise<PushFailureOutcome>;
};
