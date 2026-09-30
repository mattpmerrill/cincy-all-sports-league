import "server-only";
import { pushConfig } from "@/lib/env.server";

let cached: boolean | undefined;

/**
 * Whether push alerts can be sent at all: both VAPID keys are set, well formed, and a pair
 * (`pushConfig` checks all three). Environment only, no cookies and no database, so the root
 * layout can pass it to the prompt without making static pages dynamic.
 *
 * It lives apart from `push.server.ts` because that module pulls in the sender and `web-push`,
 * and the layout is in every route's graph, static ones included. The environment cannot change
 * within a running instance, so the answer is computed once.
 */
export function isPushAvailable(): boolean {
  return (cached ??= pushConfig() !== null);
}
