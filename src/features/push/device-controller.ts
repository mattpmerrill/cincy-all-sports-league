import { DEVICE_COPY, describeSubscribeFailure, subscriptionToInput } from "./device-state";
import { decideDeviceSync, type DeviceMarker, type DeviceSession } from "./device-sync";
import type { PushActions } from "./push-actions";
import type { PushSupport } from "./support";

/**
 * The device's push logic without the browser: everything it needs from `navigator`, `Notification`,
 * localStorage and the auth client comes in through a port, so the order of operations (the part
 * that goes wrong on a shared phone) is tested with fakes. The pure decisions live in
 * `decideDeviceSync` and `support.ts`; this only carries them out.
 */

export type DeviceSubscription = {
  endpoint: string;
  /** Made with the current VAPID public key (`sameKey`). False after a key rotation. */
  usesCurrentKey: boolean;
  toJSON(): {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: Record<string, string>;
  };
  unsubscribe(): Promise<unknown>;
};

export type DevicePort = {
  support(): PushSupport;
  permission(): NotificationPermission | undefined;
  /**
   * Asks for notification permission. `enable` calls it before any await, because Safari only
   * shows the prompt while the tap that asked is still "the" user gesture. Resolves to undefined
   * where there is no `Notification` (an iOS Safari tab).
   */
  requestPermission(): Promise<NotificationPermission | undefined>;
  /** The existing subscription, without creating a service worker: visitors never get one. */
  getSubscription(): Promise<DeviceSubscription | null>;
  /** Registers the worker (the only place that does), waits for it, and subscribes. */
  subscribe(): Promise<DeviceSubscription>;
  signedInUserId(): Promise<string | null>;
  marker: { read(): DeviceMarker | null; write(marker: DeviceMarker): void; clear(): void };
  now(): number;
  /** Tells every mounted alerts component that this device changed, so each re-reads it. */
  announce(): void;
  /** Error NAMES only: a browser error message can quote the endpoint. */
  warn(message: string, fields?: { errorName: string }): void;
};

export type EnableOutcome =
  | { status: "on"; endpoint: string; deviceCount: number }
  | { status: "denied" }
  | { status: "error"; message: string };

const NOTHING_TO_SYNC: readonly PushSupport["status"][] = [
  "not_configured",
  "unsupported",
  "ios_needs_install",
];

/** How long any single browser or server call may take before the device code stops waiting. */
export const CALL_TIMEOUT_MS = 15_000;

export function createDeviceController({
  port,
  actions,
  run,
  madeHere = new Set<string>(),
  callTimeoutMs = CALL_TIMEOUT_MS,
}: {
  port: DevicePort;
  actions: Pick<PushActions, "subscribe" | "unsubscribe">;
  /** The one queue shared by every controller, so nothing overlaps across components. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
  /**
   * Endpoints this page subscribed itself, shared by every controller. A subscription made just
   * now with the current key is right by construction, so if the browser still reports a key
   * mismatch for it, that is the browser's quirk, not a rotation, and must not be answered with
   * another subscribe (which would repeat on every route change).
   */
  madeHere?: Set<string>;
  callTimeoutMs?: number;
}) {
  const errorName = (error: unknown) => (error instanceof Error ? error.name : "NonError");

  /** Every await on the browser or the server is bounded, so one hung call cannot stall the queue. */
  function bounded<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), callTimeoutMs);
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function quietly<T>(what: string, work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work();
    } catch (error) {
      port.warn(`push device: ${what} failed`, { errorName: errorName(error) });
      return undefined;
    }
  }

  const readSubscription = async () =>
    (await quietly("read subscription", () => bounded(port.getSubscription()))) ?? null;

  /** Best effort: the server row also goes on the next 404 or 410, so a failure is not fatal. */
  async function forgetOnServer(endpoint: string): Promise<number | null> {
    const result = await quietly("server unsubscribe", () =>
      bounded(actions.unsubscribe({ endpoint })),
    );
    return result?.ok ? result.value.deviceCount : null;
  }

  async function dropInBrowser(subscription: DeviceSubscription) {
    await quietly("browser unsubscribe", () => subscription.unsubscribe());
  }

  type Registered =
    { ok: true; endpoint: string; deviceCount: number } | { ok: false; message: string };

  /**
   * Subscribes this browser and registers it for the member. If the server refuses, the browser
   * subscription is dropped again, so a device the server does not know is never left holding
   * one. The marker is written last: it is what says the subscription is this member's.
   */
  async function subscribeAndRegister(userId: string): Promise<Registered> {
    let subscription: DeviceSubscription;
    try {
      subscription = await bounded(port.subscribe());
    } catch (error) {
      port.warn("push device: subscribe failed", { errorName: errorName(error) });
      return { ok: false, message: describeSubscribeFailure(error) };
    }

    const input = subscriptionToInput(subscription.toJSON());
    if (!input) {
      await dropInBrowser(subscription);
      return { ok: false, message: DEVICE_COPY.generic };
    }

    let result: Awaited<ReturnType<PushActions["subscribe"]>>;
    try {
      result = await bounded(actions.subscribe(input));
    } catch (error) {
      port.warn("push device: register failed", { errorName: errorName(error) });
      await dropInBrowser(subscription);
      return { ok: false, message: DEVICE_COPY.network };
    }
    if (!result.ok) {
      await dropInBrowser(subscription);
      // The action's own words: they say "isn't supported yet" for a push service we refuse.
      return { ok: false, message: result.error.message };
    }

    madeHere.add(subscription.endpoint);
    port.marker.write({ userId, syncedAt: port.now() });
    return { ok: true, endpoint: subscription.endpoint, deviceCount: result.value.deviceCount };
  }

  return {
    /** Never rejects. Call it straight from the click handler. */
    enable(): Promise<EnableOutcome> {
      // First thing, before anything can await: this is the call Safari ties to the tap.
      const asked = port.requestPermission().then(
        (permission) => ({ permission }),
        (error: unknown) => {
          port.warn("push device: permission request failed", { errorName: errorName(error) });
          return { permission: null };
        },
      );

      // The permission answer is awaited BEFORE joining the queue: a prompt the member ignores
      // (a Chrome bubble left open) must not hold everything else behind it.
      return asked.then(({ permission }): Promise<EnableOutcome> | EnableOutcome => {
        if (permission === undefined) {
          return { status: "error", message: DEVICE_COPY.noPermissionApi };
        }
        if (permission === null) return { status: "error", message: DEVICE_COPY.generic };
        if (permission === "denied") return { status: "denied" };
        if (permission === "default") {
          return { status: "error", message: DEVICE_COPY.closedPrompt };
        }

        return run(async (): Promise<EnableOutcome> => {
          try {
            const userId = await bounded(port.signedInUserId());
            if (!userId) return { status: "error", message: DEVICE_COPY.signedOut };

            // After a key rotation the old subscription blocks a new one (the browser refuses a
            // second key), so it goes first, and its server row with it (as `sync` does).
            const existing = await readSubscription();
            if (existing && !existing.usesCurrentKey && !madeHere.has(existing.endpoint)) {
              await forgetOnServer(existing.endpoint);
              await dropInBrowser(existing);
            }

            const registered = await subscribeAndRegister(userId);
            if (!registered.ok) return { status: "error", message: registered.message };
            port.announce();
            return {
              status: "on",
              endpoint: registered.endpoint,
              deviceCount: registered.deviceCount,
            };
          } catch (error) {
            port.warn("push device: enable failed", { errorName: errorName(error) });
            return { status: "error", message: DEVICE_COPY.generic };
          }
        });
      });
    },

    /**
     * The server first (it deletes the row, so no alert is sent to a device that just said stop),
     * then the browser whatever the server said: the member asked for silence, and a row left
     * behind is removed on its next 404 or 410.
     */
    disable(): Promise<{ deviceCount: number | null }> {
      return run(async () => {
        let deviceCount: number | null = null;
        const subscription = await readSubscription();
        if (subscription) {
          deviceCount = await forgetOnServer(subscription.endpoint);
          await dropInBrowser(subscription);
        }
        port.marker.clear();
        port.announce();
        return { deviceCount };
      });
    },

    /** What the browser can do and whether it holds a subscription, read in line with the rest. */
    read(): Promise<{ support: PushSupport; endpoint: string | null }> {
      return run(async () => {
        const support = port.support();
        if (support.status !== "ready") return { support, endpoint: null };
        return { support, endpoint: (await readSubscription())?.endpoint ?? null };
      });
    },

    /**
     * Carries out what `decideDeviceSync` says for the current session. A session that is still
     * loading does nothing at all. Resolves to true when the browser's subscription changed, so
     * the caller re-reads the device.
     */
    sync(session: DeviceSession): Promise<boolean> {
      return run(async () => {
        if (session.status === "loading") return false;
        if (NOTHING_TO_SYNC.includes(port.support().status)) return false;

        const subscription = await readSubscription();
        const decision = decideDeviceSync({
          session,
          marker: port.marker.read(),
          permission: port.permission(),
          hasSubscription: subscription !== null,
          keyMatches: subscription
            ? subscription.usesCurrentKey || madeHere.has(subscription.endpoint)
            : false,
          now: port.now(),
        });

        switch (decision) {
          case "none":
            return false;

          case "drop_browser_subscription":
            // Not this member's: its server row belongs to someone else, and goes when the push
            // service answers 410 to the subscription we just ended.
            if (subscription) await dropInBrowser(subscription);
            port.marker.clear();
            port.announce();
            return true;

          case "forget_server":
            // The marker says this member owns the subscription, so the server may delete it now.
            if (subscription) {
              await forgetOnServer(subscription.endpoint);
              await dropInBrowser(subscription);
            }
            port.marker.clear();
            port.announce();
            return true;

          case "resubscribe_needed": {
            if (!subscription || session.status !== "signed_in") return false;
            await forgetOnServer(subscription.endpoint);
            await dropInBrowser(subscription);
            // Permission is already granted, so this needs no tap. Waiting for the prompt would
            // silently lose alerts for a member who had dismissed it for good.
            if (port.permission() === "granted") {
              const registered = await subscribeAndRegister(session.userId);
              if (!registered.ok) port.marker.clear();
            } else {
              port.marker.clear();
            }
            port.announce();
            return true;
          }

          case "refresh_server": {
            if (!subscription || session.status !== "signed_in") return false;
            const input = subscriptionToInput(subscription.toJSON());
            if (input) {
              await quietly("refresh", () => bounded(actions.subscribe(input)));
              // Stamped after an attempt, not only a success: a server that keeps refusing would
              // otherwise be asked again on every route change. The next try is tomorrow.
              port.marker.write({ userId: session.userId, syncedAt: port.now() });
            }
            return false;
          }
        }
      });
    },

    /**
     * The push service refused this device for good (a test alert came back 404 or 410, or the
     * subscription was invalid), and delivery already deleted the server row. So there is nothing
     * to tell the server: end the browser subscription and forget the marker, and the member is
     * offered "Turn on" again instead of a device that says "on" and never gets anything.
     */
    forgetDead(): Promise<void> {
      return run(async () => {
        const subscription = await readSubscription();
        if (subscription) await dropInBrowser(subscription);
        port.marker.clear();
        port.announce();
      });
    },

    /**
     * The server has no row for a subscription this browser holds (a lost row, or a database
     * restore). Registers it again now, which is the daily refresh on demand. Resolves to whether
     * the server accepted it.
     */
    reRegister(): Promise<boolean> {
      return run(async () => {
        const userId = await quietly("session", () => bounded(port.signedInUserId()));
        const subscription = await readSubscription();
        const input = subscription ? subscriptionToInput(subscription.toJSON()) : null;
        if (!userId || !input) return false;
        const result = await quietly("re-register", () => bounded(actions.subscribe(input)));
        if (!result?.ok) return false;
        port.marker.write({ userId, syncedAt: port.now() });
        return true;
      });
    },

    /**
     * Sign-out cleanup, run while the session is still valid: delete the server row, end the
     * browser subscription, forget the marker. It never rejects and gives up after `timeoutMs`,
     * because signing out must not wait on a slow network.
     */
    async release(timeoutMs: number): Promise<void> {
      const cleanup = run(async () => {
        const subscription = await readSubscription();
        if (subscription) {
          await forgetOnServer(subscription.endpoint);
          await dropInBrowser(subscription);
        }
        port.marker.clear();
        port.announce();
      }).catch(() => undefined);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const giveUp = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([cleanup, giveUp]);
      clearTimeout(timer);
    },
  };
}

export type DeviceController = ReturnType<typeof createDeviceController>;
