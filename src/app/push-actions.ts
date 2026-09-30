import type { PushActions } from "@/features/push/push-actions";
import {
  sendTestPushAction,
  setPushTopicAction,
  subscribePushAction,
  unsubscribePushAction,
} from "./me/alerts-actions";

/**
 * The four push Server Actions as one `PushActions` value. A feature may not import from `app`,
 * so the layout (the in-app prompt), the profile page and the sign-out button pass this down as a
 * prop. It is not a "use server" file, which may only export functions.
 */
export const pushActions: PushActions = {
  subscribe: subscribePushAction,
  unsubscribe: unsubscribePushAction,
  setTopic: setPushTopicAction,
  sendTest: sendTestPushAction,
};
