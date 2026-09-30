"use client";

import { useState } from "react";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Skeleton } from "@/ui/skeleton";
import { otherDeviceCount } from "../device-state";
import type { PushActions } from "../push-actions";
import type { PushSettings } from "../push.service";
import { IosInstallHint } from "./ios-install-hint";
import { TopicSwitches } from "./topic-switches";
import { usePushDevice } from "./use-push-device";

// The design system's own ring is the brand color at half strength: about 1.4:1 on the canvas, and
// invisible against a brand-red button. A light ring on every control here keeps keyboard focus
// visible (WCAG 2.4.7); the app-wide `--ring` token is a separate follow-up.
const BUTTON = "min-h-11 px-4 focus-visible:border-text focus-visible:ring-text/50";

type TestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  /** Something to tell the member that is neither a success nor a failure. */
  | { status: "notice"; message: string }
  | { status: "failed"; message: string };

const DEAD_DEVICE = "This device can't receive alerts any more. Turn them on again.";
const SET_UP_AGAIN = "This device was set up again. Try the test once more.";

/**
 * The "Push alerts" section of /me. The device row says what THIS browser can do and offers the
 * one button that fits; the switches below are the member's per-topic preferences and do not
 * depend on the browser. Every state the device can be in has its own text, so a member is never
 * left looking at a button that cannot work.
 */
export function AlertsSection({
  settings,
  actions,
}: {
  settings: PushSettings;
  actions: PushActions;
}) {
  const device = usePushDevice({ actions, configured: settings.configured });
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const { state } = device;

  // Without server-side keys there is nothing to turn on, and nothing to configure either.
  if (!settings.configured) {
    return <p className="text-sm text-text-muted">Push alerts aren&apos;t available yet.</p>;
  }

  const on = state.status === "on";
  const others = otherDeviceCount(device.deviceCount ?? settings.deviceCount, on);

  async function sendTest(endpoint: string) {
    setTest({ status: "sending" });
    try {
      const result = await actions.sendTest({ endpoint });
      if (result.ok) return setTest({ status: "sent" });
      switch (result.error.code) {
        case "invalid_subscription":
          // The push service refused this device for good and delivery deleted its row, so
          // "on" would be a lie: end it here and offer "Turn on" again.
          await device.forgetDead();
          return setTest({ status: "failed", message: DEAD_DEVICE });
        case "not_found":
          // The browser holds a subscription the server has no row for: register it again.
          return setTest(
            (await device.reRegister())
              ? { status: "notice", message: SET_UP_AGAIN }
              : { status: "failed", message: result.error.message },
          );
        default:
          return setTest({ status: "failed", message: result.error.message });
      }
    } catch {
      setTest({
        status: "failed",
        message: "We couldn't send the test alert. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-text-muted uppercase">
          This device
        </h3>

        {state.status === "checking" ? (
          <div role="status" aria-label="Checking this device" className="flex flex-col gap-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-11 w-32" />
          </div>
        ) : null}

        {state.status === "not_configured" ? (
          <p className="text-sm text-text-muted">Push alerts aren&apos;t available yet.</p>
        ) : null}

        {state.status === "unsupported" ? (
          <p className="text-sm text-text-muted">
            This browser can&apos;t show push alerts. Try Chrome, or on iPhone add the app to your
            Home Screen.
          </p>
        ) : null}

        {state.status === "ios_install" ? (
          <IosInstallHint inAppBrowser={device.inAppBrowser} />
        ) : null}

        {state.status === "denied" ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2">
              <Badge variant="secondary">Blocked</Badge>
              <span>Notifications are blocked for this site.</span>
            </p>
            <p className="text-text-muted">
              To turn alerts on, allow notifications for this site in your browser&apos;s site
              settings, then come back to this page. On an iPhone or iPad, open Settings, then
              Notifications, then Cincy&apos;s League, and allow notifications.
            </p>
          </div>
        ) : null}

        {state.status === "off" || state.status === "on" || state.status === "working" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>
              <span className="text-sm" role="status">
                {state.status === "working"
                  ? "One moment..."
                  : on
                    ? "Alerts are on for this device."
                    : "Alerts are off on this device."}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {state.status === "working" ? (
                <Button className={BUTTON} disabled>
                  Working...
                </Button>
              ) : on ? (
                <>
                  <Button
                    variant="secondary"
                    className={BUTTON}
                    onClick={() => {
                      setTest({ status: "idle" });
                      void device.disable();
                    }}
                  >
                    Turn off
                  </Button>
                  <Button
                    variant="outline"
                    className={BUTTON}
                    disabled={test.status === "sending"}
                    onClick={() => void sendTest(state.endpoint)}
                  >
                    {test.status === "sending" ? "Sending..." : "Send a test alert"}
                  </Button>
                </>
              ) : (
                <Button
                  className={BUTTON}
                  onClick={() => {
                    setTest({ status: "idle" });
                    void device.enable();
                  }}
                >
                  Turn on
                </Button>
              )}
            </div>
            {on && test.status === "sent" ? (
              <Alert variant="info">
                Test alert sent. It should show up on this device in a moment.
              </Alert>
            ) : null}
            {test.status === "notice" ? <Alert variant="info">{test.message}</Alert> : null}
            {test.status === "failed" ? <Alert variant="error">{test.message}</Alert> : null}
            {others > 0 ? (
              <p className="text-sm text-text-muted">
                Also on {others} other {others === 1 ? "device" : "devices"}.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex flex-col gap-3">
            <Alert variant="error">{state.message}</Alert>
            <div>
              <Button className={BUTTON} onClick={() => void device.enable()}>
                Try again
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-text-muted uppercase">
          What you get
        </h3>
        <TopicSwitches topics={settings.topics} setTopic={actions.setTopic} />
      </div>
    </div>
  );
}
