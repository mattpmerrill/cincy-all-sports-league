import type { PushActions } from "@/features/push/push-actions";
import {
  sendTestPushAction,
  setPushTopicAction,
  subscribePushAction,
  unsubscribePushAction,
} from "./me/alerts-actions";

/**
 * The four push Server Actions as one `PushActions` value. A feature may not import from `app`,
 * so the prompt, the profile page and the sign-out button receive this as a prop. It is not a
 * "use server" file, which may only export functions.
 *
 * Import it from a client module (the layout's mounts do), never from a server component: a
 * server component importing the actions would put them, and `web-push` behind them, in its own
 * server graph.
 */
export const pushActions: PushActions = {
  subscribe: subscribePushAction,
  unsubscribe: unsubscribePushAction,
  setTopic: setPushTopicAction,
  sendTest: sendTestPushAction,
};
