import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeviceController,
  type DevicePort,
  type DeviceSubscription,
} from "./device-controller";
import { DEVICE_COPY } from "./device-state";
import { DEVICE_REFRESH_MS, type DeviceMarker } from "./device-sync";
import type { PushActions } from "./push-actions";
import { createSerialQueue } from "./serial-queue";
import type { PushSupport } from "./support";

const NOW = Date.UTC(2026, 8, 29, 12);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const KEYS = { p256dh: "p".repeat(87), auth: "a".repeat(22) };

type World = {
  log: string[];
  support: PushSupport;
  permission: NotificationPermission | undefined;
  /** What `Notification.requestPermission()` resolves to. */
  answer: NotificationPermission | undefined;
  subscription: DeviceSubscription | null;
  userId: string | null;
  marker: DeviceMarker | null;
  subscribeError: Error | null;
  /** Whether a subscription the browser just made reports the current key. */
  freshUsesCurrentKey: boolean;
  /** Calls that never answer, for the hung-call cases. */
  hang: { permission: boolean; subscribeAction: boolean };
  actionResults: { subscribe: "ok" | "refused" | "throws"; unsubscribe: "ok" | "throws" };
};

function subscription(world: World, usesCurrentKey = true): DeviceSubscription {
  return {
    endpoint: ENDPOINT,
    usesCurrentKey,
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: KEYS }),
    unsubscribe: async () => {
      world.log.push("browser:unsubscribe");
      world.subscription = null;
      return true;
    },
  };
}

function setup(over: Partial<World> = {}) {
  const world: World = {
    log: [],
    support: { status: "ready", permission: "granted" },
    permission: "granted",
    answer: "granted",
    subscription: null,
    userId: "u1",
    marker: null,
    subscribeError: null,
    freshUsesCurrentKey: true,
    hang: { permission: false, subscribeAction: false },
    actionResults: { subscribe: "ok", unsubscribe: "ok" },
    ...over,
  };
  const port: DevicePort = {
    support: () => world.support,
    permission: () => world.permission,
    requestPermission: async () => {
      world.log.push("permission:ask");
      if (world.hang.permission) return new Promise<never>(() => undefined);
      return world.answer;
    },
    getSubscription: async () => world.subscription,
    subscribe: async () => {
      world.log.push("browser:subscribe");
      if (world.subscribeError) throw world.subscribeError;
      world.subscription = subscription(world, world.freshUsesCurrentKey);
      return world.subscription;
    },
    signedInUserId: async () => world.userId,
    marker: {
      read: () => world.marker,
      write: (marker) => {
        world.log.push("marker:write");
        world.marker = marker;
      },
      clear: () => {
        world.log.push("marker:clear");
        world.marker = null;
      },
    },
    now: () => NOW,
    announce: () => world.log.push("announce"),
    warn: () => undefined,
  };
  const actions: Pick<PushActions, "subscribe" | "unsubscribe"> = {
    subscribe: async () => {
      world.log.push("action:subscribe");
      if (world.hang.subscribeAction) return new Promise<never>(() => undefined);
      const mode = world.actionResults.subscribe;
      if (mode === "throws") throw new Error("network");
      return mode === "ok"
        ? { ok: true, value: { deviceCount: 2 } }
        : { ok: false, error: { code: "unsupported_push_service", message: "Not supported yet." } };
    },
    unsubscribe: async () => {
      world.log.push("action:unsubscribe");
      if (world.actionResults.unsubscribe === "throws") throw new Error("network");
      return { ok: true, value: { deviceCount: 1 } };
    },
  };
  const controller = createDeviceController({ port, actions, run: createSerialQueue() });
  return { world, controller };
}

const signedIn = (userId: string) => ({ status: "signed_in", userId }) as const;

describe("enable", () => {
  it("asks for permission before anything else, then subscribes, registers and writes the marker", async () => {
    const { world, controller } = setup();

    const outcome = await controller.enable();

    expect(outcome).toEqual({ status: "on", endpoint: ENDPOINT, deviceCount: 2 });
    expect(world.log).toEqual([
      "permission:ask",
      "browser:subscribe",
      "action:subscribe",
      "marker:write",
      "announce",
    ]);
    expect(world.marker).toEqual({ userId: "u1", syncedAt: NOW });
  });

  it("asks synchronously, even when other work is queued ahead of it", async () => {
    const { world, controller } = setup({ subscription: null });
    // A check is already in flight, so the enable task itself has to wait its turn.
    const pending = controller.read();
    const enabling = controller.enable();
    expect(world.log).toEqual(["permission:ask"]);
    await Promise.all([pending, enabling]);
  });

  it("stops at denied without subscribing", async () => {
    const { world, controller } = setup({ answer: "denied" });
    expect(await controller.enable()).toEqual({ status: "denied" });
    expect(world.log).toEqual(["permission:ask"]);
  });

  it("explains a closed permission prompt instead of failing silently", async () => {
    const { controller } = setup({ answer: "default" });
    expect(await controller.enable()).toEqual({
      status: "error",
      message: DEVICE_COPY.closedPrompt,
    });
  });

  it("reports a browser with no Notification API", async () => {
    const { controller } = setup({ answer: undefined });
    expect(await controller.enable()).toEqual({
      status: "error",
      message: DEVICE_COPY.noPermissionApi,
    });
  });

  it("tells a signed-out browser to sign in, without subscribing", async () => {
    const { world, controller } = setup({ userId: null });
    expect(await controller.enable()).toEqual({ status: "error", message: DEVICE_COPY.signedOut });
    expect(world.log).not.toContain("browser:subscribe");
  });

  it("gives Brave's AbortError the setting that fixes it", async () => {
    const abort = Object.assign(new Error("push service error"), { name: "AbortError" });
    const { controller } = setup({ subscribeError: abort });
    expect(await controller.enable()).toEqual({ status: "error", message: DEVICE_COPY.brave });
  });

  it("unsubscribes the browser again when the server refuses, and shows the server's message", async () => {
    const { world, controller } = setup();
    world.actionResults.subscribe = "refused";

    expect(await controller.enable()).toEqual({ status: "error", message: "Not supported yet." });
    expect(world.log).toEqual([
      "permission:ask",
      "browser:subscribe",
      "action:subscribe",
      "browser:unsubscribe",
    ]);
    expect(world.marker).toBeNull();
  });

  it("unsubscribes the browser when the request itself fails", async () => {
    const { world, controller } = setup();
    world.actionResults.subscribe = "throws";
    expect(await controller.enable()).toEqual({ status: "error", message: DEVICE_COPY.network });
    expect(world.log).toContain("browser:unsubscribe");
  });

  it("removes a subscription made with a rotated key, and its server row, before subscribing again", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world, false);

    await controller.enable();

    expect(world.log).toEqual([
      "permission:ask",
      "action:unsubscribe",
      "browser:unsubscribe",
      "browser:subscribe",
      "action:subscribe",
      "marker:write",
      "announce",
    ]);
  });
});

describe("disable", () => {
  it("tells the server first, then the browser, then forgets the marker", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = { userId: "u1", syncedAt: NOW };

    expect(await controller.disable()).toEqual({ deviceCount: 1 });
    expect(world.log).toEqual([
      "action:unsubscribe",
      "browser:unsubscribe",
      "marker:clear",
      "announce",
    ]);
  });

  it("still ends the browser subscription when the server call fails", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.actionResults.unsubscribe = "throws";

    expect(await controller.disable()).toEqual({ deviceCount: null });
    expect(world.log).toContain("browser:unsubscribe");
    expect(world.subscription).toBeNull();
  });
});

describe("sync", () => {
  const owner = (over: Partial<DeviceMarker> = {}): DeviceMarker => ({
    userId: "u1",
    syncedAt: NOW - 1000,
    ...over,
  });

  it("does nothing at all while the session is loading", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);

    expect(await controller.sync({ status: "loading" })).toBe(false);
    expect(world.log).toEqual([]);
  });

  it("does nothing where no subscription can exist", async () => {
    const { world, controller } = setup({ support: { status: "not_configured" } });
    world.subscription = subscription(world);
    expect(await controller.sync({ status: "signed_out" })).toBe(false);
    expect(world.log).toEqual([]);
  });

  it("drops the browser subscription when signed out", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = owner();

    expect(await controller.sync({ status: "signed_out" })).toBe(true);
    expect(world.log).toEqual(["browser:unsubscribe", "marker:clear", "announce"]);
  });

  it("drops another member's subscription on a shared phone, without touching the server", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = owner();

    expect(await controller.sync(signedIn("u2"))).toBe(true);
    expect(world.log).not.toContain("action:unsubscribe");
    expect(world.log).toContain("browser:unsubscribe");
  });

  it("forgets the server row and the subscription once permission is denied", async () => {
    const { world, controller } = setup({ permission: "denied" });
    world.subscription = subscription(world);
    world.marker = owner();

    expect(await controller.sync(signedIn("u1"))).toBe(true);
    expect(world.log).toEqual([
      "action:unsubscribe",
      "browser:unsubscribe",
      "marker:clear",
      "announce",
    ]);
  });

  it("resubscribes silently after a key rotation when permission is already granted", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world, false);
    world.marker = owner();

    expect(await controller.sync(signedIn("u1"))).toBe(true);
    expect(world.log).toEqual([
      "action:unsubscribe",
      "browser:unsubscribe",
      "browser:subscribe",
      "action:subscribe",
      "marker:write",
      "announce",
    ]);
    // No permission prompt: it needs no tap.
    expect(world.log).not.toContain("permission:ask");
  });

  it("refreshes the server row once a day and restamps the marker", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = owner({ syncedAt: NOW - DEVICE_REFRESH_MS - 1 });

    expect(await controller.sync(signedIn("u1"))).toBe(false);
    expect(world.log).toEqual(["action:subscribe", "marker:write"]);
    expect(world.marker?.syncedAt).toBe(NOW);
  });

  it("restamps even when the refresh fails, so a refusing server is not asked on every route change", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = owner({ syncedAt: NOW - DEVICE_REFRESH_MS - 1 });
    world.actionResults.subscribe = "throws";

    await controller.sync(signedIn("u1"));
    expect(world.marker?.syncedAt).toBe(NOW);
  });

  it("leaves a healthy device alone", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = owner();
    expect(await controller.sync(signedIn("u1"))).toBe(false);
    expect(world.log).toEqual([]);
  });
});

describe("serialization", () => {
  it("runs a check queued during enable only after the marker is written", async () => {
    const { world, controller } = setup();
    // Without the queue this sync would see "a subscription with no marker" and drop it.
    const enabling = controller.enable();
    const syncing = controller.sync(signedIn("u1"));

    await Promise.all([enabling, syncing]);

    expect(world.log).not.toContain("browser:unsubscribe");
    expect(world.subscription).not.toBeNull();
    expect(world.marker?.userId).toBe("u1");
  });

  it("never lets a subscribe overlap an unsubscribe", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    const releasing = controller.release(1000);
    const enabling = controller.enable();
    await Promise.all([releasing, enabling]);

    const unsub = world.log.indexOf("browser:unsubscribe");
    const sub = world.log.indexOf("browser:subscribe");
    expect(unsub).toBeGreaterThanOrEqual(0);
    expect(sub).toBeGreaterThan(unsub);
  });
});

describe("release (sign-out)", () => {
  it("deletes the server row, ends the browser subscription, then forgets the marker", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = { userId: "u1", syncedAt: NOW };

    await controller.release(1000);

    expect(world.log).toEqual([
      "action:unsubscribe",
      "browser:unsubscribe",
      "marker:clear",
      "announce",
    ]);
  });

  it("never blocks or throws when the server call fails", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.actionResults.unsubscribe = "throws";

    await expect(controller.release(1000)).resolves.toBeUndefined();
    expect(world.subscription).toBeNull();
  });

  it("gives up after the timeout when the server hangs", async () => {
    const { world } = setup();
    world.subscription = subscription(world);
    const never = new Promise<never>(() => undefined);
    const hung = createDeviceController({
      port: {
        support: () => world.support,
        permission: () => world.permission,
        requestPermission: async () => world.answer,
        getSubscription: async () => world.subscription,
        subscribe: async () => {
          throw new Error("unused");
        },
        signedInUserId: async () => "u1",
        marker: { read: () => null, write: () => undefined, clear: () => undefined },
        now: () => NOW,
        announce: () => undefined,
        warn: () => undefined,
      },
      actions: { subscribe: () => never, unsubscribe: () => never },
      run: createSerialQueue(),
    });

    const started = Date.now();
    await hung.release(30);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("a call that never answers", () => {
  afterEach(() => vi.useRealTimers());

  it("an ignored permission prompt does not hold the queue: later work still runs", async () => {
    const { world, controller } = setup({ hang: { permission: true, subscribeAction: false } });
    world.subscription = subscription(world);

    void controller.enable(); // the member never answers the prompt
    const read = await controller.read();

    expect(read.endpoint).toBe(ENDPOINT);
  });

  it("a hung register call ends the turn-on with an error and undoes the subscription", async () => {
    vi.useFakeTimers();
    const { world, controller } = setup({ hang: { permission: false, subscribeAction: true } });

    const outcome = controller.enable();
    await vi.advanceTimersByTimeAsync(16_000);

    expect(await outcome).toEqual({ status: "error", message: DEVICE_COPY.network });
    expect(world.log).toContain("browser:unsubscribe");
  });

  it("a hung register call does not keep a later sign-out cleanup from running", async () => {
    vi.useFakeTimers();
    const { world, controller } = setup({ hang: { permission: false, subscribeAction: true } });
    void controller.enable();
    await vi.advanceTimersByTimeAsync(0);
    world.subscription = subscription(world);

    const released = controller.release(4_000);
    await vi.advanceTimersByTimeAsync(20_000);
    await released;

    expect(world.log).toContain("marker:clear");
  });
});

describe("a key mismatch the browser keeps reporting", () => {
  it("is not resubscribed again in the same session", async () => {
    const { world, controller } = setup({ freshUsesCurrentKey: false });
    world.subscription = subscription(world, false);
    world.marker = { userId: "u1", syncedAt: NOW - 1000 };

    await controller.sync(signedIn("u1")); // a rotation: one silent resubscribe
    expect(world.log.filter((entry) => entry === "browser:subscribe")).toHaveLength(1);

    // The fresh subscription still reports a mismatch, but this page made it.
    world.log.length = 0;
    await controller.sync(signedIn("u1"));
    await controller.sync(signedIn("u1"));
    expect(world.log).toEqual([]);
  });
});

describe("forgetDead", () => {
  it("ends the browser subscription and forgets the marker, without asking the server", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);
    world.marker = { userId: "u1", syncedAt: NOW };

    await controller.forgetDead();

    expect(world.log).toEqual(["browser:unsubscribe", "marker:clear", "announce"]);
    expect(world.log).not.toContain("action:unsubscribe");
  });
});

describe("reRegister", () => {
  it("registers the held subscription again and restamps the marker", async () => {
    const { world, controller } = setup();
    world.subscription = subscription(world);

    expect(await controller.reRegister()).toBe(true);
    expect(world.log).toEqual(["action:subscribe", "marker:write"]);
    expect(world.marker).toEqual({ userId: "u1", syncedAt: NOW });
  });

  it("reports false, and writes nothing, when the server refuses, or nothing is held, or nobody is signed in", async () => {
    const refused = setup();
    refused.world.subscription = subscription(refused.world);
    refused.world.actionResults.subscribe = "refused";
    expect(await refused.controller.reRegister()).toBe(false);
    expect(refused.world.marker).toBeNull();

    const none = setup();
    expect(await none.controller.reRegister()).toBe(false);

    const signedOut = setup({ userId: null });
    signedOut.world.subscription = subscription(signedOut.world);
    expect(await signedOut.controller.reRegister()).toBe(false);
  });
});
