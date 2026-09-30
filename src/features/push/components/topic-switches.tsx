"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { PUSH_TOPICS, type PushTopic, type PushTopicSettings } from "@/domain/push";
import { Alert } from "@/ui/alert";
import { Switch } from "@/ui/switch";
import { TOPIC_COPY } from "../copy";
import type { PushActions } from "../push-actions";

const SAVE_FAILED = "We couldn't save that change. Your setting is unchanged.";

/**
 * One switch per alert topic. These are the member's preferences, kept on their profile and
 * applied to every device, so they work whether or not this browser has alerts on. A tap shows
 * the new position at once (`useOptimistic`); if the save fails the switch springs back to the
 * saved value and the failure is announced.
 */
export function TopicSwitches({
  topics,
  setTopic,
}: {
  topics: PushTopicSettings;
  setTopic: PushActions["setTopic"];
}) {
  const groupId = useId();
  const [optimistic, applyOptimistic] = useOptimistic(
    topics,
    (current, change: { topic: PushTopic; on: boolean }) => ({
      ...current,
      [change.topic]: change.on,
    }),
  );
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(topic: PushTopic, on: boolean) {
    setFailed(false);
    startTransition(async () => {
      applyOptimistic({ topic, on });
      try {
        const result = await setTopic({ topic, on });
        if (!result.ok) setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {PUSH_TOPICS.map((topic) => {
          const labelId = `${groupId}-${topic}-label`;
          const descriptionId = `${groupId}-${topic}-description`;
          const { label, description } = TOPIC_COPY[topic];
          return (
            <li key={topic} className="flex items-center justify-between gap-3 px-3 py-1">
              <div className="flex min-w-0 flex-col gap-0.5 py-2">
                <span id={labelId} className="text-sm font-medium">
                  {label}
                </span>
                <span id={descriptionId} className="text-sm text-text-muted">
                  {description}
                </span>
              </div>
              <Switch
                checked={optimistic[topic]}
                onCheckedChange={(on) => toggle(topic, on)}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-text-muted">These apply to every device where alerts are on.</p>
      {failed ? <Alert variant="error">{SAVE_FAILED}</Alert> : null}
    </div>
  );
}
