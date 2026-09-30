"use client";

import { PushPrompt } from "@/features/push/components/push-prompt";
import { pushActions } from "./push-actions";

/**
 * The layout's mount for the prompt. It is a client module on purpose: imported from a server
 * component, `pushActions` would pull the push Server Actions (and with them `web-push`) into the
 * server graph of every route, static ones included. Imported here, they are only references.
 */
export function AppPushPrompt({ configured }: { configured: boolean }) {
  return <PushPrompt configured={configured} actions={pushActions} />;
}
