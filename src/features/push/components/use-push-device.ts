"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveDeviceState, type PushDeviceState } from "../device-state";
import type { DeviceSession } from "../device-sync";
import { isIosInAppBrowser } from "../in-app-browser";
import { PUSH_DEVICE_CHANGED_EVENT, createBrowserDeviceController } from "../push-device";
import type { PushActions } from "../push-actions";

export type PushDevice = {
  state: PushDeviceState;
  /** The device count the last subscribe or unsubscribe reported, or null before either ran. */
  deviceCount: number | null;
  /** True on an iPhone or iPad web view inside another app, where "Add to Home Screen" is not offered. */
  inAppBrowser: boolean;
  /** Call straight from a click handler: the permission prompt must start inside the tap. */
  enable: () => Promise<PushDeviceState>;
  disable: () => Promise<PushDeviceState>;
  /** Re-reads the browser. Also runs when another component changes the device. */
  refresh: () => Promise<void>;
  /** Runs the device checks for a RESOLVED session; a loading session does nothing. */
  sync: (session: DeviceSession) => Promise<void>;
  /** The push service refused this device for good: end it here and offer "Turn on" again. */
  forgetDead: () => Promise<void>;
  /** The server lost this device's row: register it again. Resolves to whether that worked. */
  reRegister: () => Promise<boolean>;
};

/**
 * React state around the device controller. `configured` is the server's flag (from the push
 * settings or the layout), never inferred from the public key. The state starts as `checking`,
 * which is also all a server render can know, so nothing flashes.
 *
 * Every browser operation goes through the controller's queue, so this hook never has to guard
 * against overlap itself; it only makes sure an older read cannot overwrite a newer result.
 */
export function usePushDevice({
  actions,
  configured,
}: {
  actions: Pick<PushActions, "subscribe" | "unsubscribe">;
  configured: boolean;
}): PushDevice {
  const [state, setState] = useState<PushDeviceState>({ status: "checking" });
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  // Built once: a Server Action reference does not change meaning when its prop object is renewed
  // by a re-render (a topic switch revalidates /me), and a new controller would re-run the read.
  const [controller] = useState(() => createBrowserDeviceController(actions, configured));
  // Bumped by every enable and disable. A read that started before one must not land after it,
  // or a refresh queued behind a failed turn-on would wipe its error message.
  const version = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const started = version.current;
    const { support, endpoint } = await controller.read();
    if (!mounted.current || started !== version.current) return;
    setInAppBrowser(isIosInAppBrowser(navigator.userAgent));
    setState(resolveDeviceState(support, endpoint));
  }, [controller]);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(PUSH_DEVICE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PUSH_DEVICE_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const enable = useCallback(() => {
    version.current += 1;
    setState({ status: "working" });
    // Started synchronously: the controller asks for permission before its first await.
    return controller.enable().then((outcome): PushDeviceState => {
      version.current += 1;
      const next: PushDeviceState =
        outcome.status === "on"
          ? { status: "on", endpoint: outcome.endpoint }
          : outcome.status === "denied"
            ? { status: "denied" }
            : { status: "error", message: outcome.message };
      if (mounted.current) {
        if (outcome.status === "on") setDeviceCount(outcome.deviceCount);
        setState(next);
      }
      return next;
    });
  }, [controller]);

  const disable = useCallback(() => {
    version.current += 1;
    setState({ status: "working" });
    return controller.disable().then(({ deviceCount: count }): PushDeviceState => {
      version.current += 1;
      const next: PushDeviceState = { status: "off" };
      if (mounted.current) {
        if (count !== null) setDeviceCount(count);
        setState(next);
      }
      return next;
    });
  }, [controller]);

  const sync = useCallback(
    async (session: DeviceSession) => {
      const changed = await controller.sync(session);
      if (changed && mounted.current) await refresh();
    },
    [controller, refresh],
  );

  const forgetDead = useCallback(async () => {
    version.current += 1;
    await controller.forgetDead();
    version.current += 1;
    if (mounted.current) setState({ status: "off" });
  }, [controller]);

  const reRegister = useCallback(() => controller.reRegister(), [controller]);

  return {
    state,
    deviceCount,
    inAppBrowser,
    enable,
    disable,
    refresh,
    sync,
    forgetDead,
    reRegister,
  };
}
