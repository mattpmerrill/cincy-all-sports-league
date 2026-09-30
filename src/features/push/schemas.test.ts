import { describe, expect, it } from "vitest";
import { endpointSchema, refusedEndpointHost, subscriptionSchema, topicSchema } from "./schemas";

const P256DH = "B".repeat(86) + "A";
const AUTH = "k".repeat(22);
const FCM = "https://fcm.googleapis.com/fcm/send/abc:def";

const sub = (over: Record<string, unknown> = {}) => ({
  endpoint: FCM,
  expirationTime: null,
  keys: { p256dh: P256DH, auth: AUTH },
  ...over,
});

describe("subscriptionSchema", () => {
  it("accepts what PushSubscription.toJSON() gives, with or without expirationTime", () => {
    expect(subscriptionSchema.safeParse(sub()).success).toBe(true);
    expect(subscriptionSchema.safeParse(sub({ expirationTime: undefined })).success).toBe(true);
    expect(subscriptionSchema.safeParse(sub({ expirationTime: 1_800_000_000_000 })).success).toBe(
      true,
    );
  });

  it("strips = padding from the keys, because Firefox and Safari may send it", () => {
    const parsed = subscriptionSchema.parse(
      sub({ keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` } }),
    );
    expect(parsed.keys).toEqual({ p256dh: P256DH, auth: AUTH });
  });

  it.each([
    ["a key that is too short", { p256dh: P256DH.slice(1), auth: AUTH }],
    ["a key that is too long", { p256dh: `${P256DH}A`, auth: AUTH }],
    ["an auth secret that is too short", { p256dh: P256DH, auth: AUTH.slice(1) }],
    ["standard base64 characters", { p256dh: `+${P256DH.slice(1)}`, auth: AUTH }],
    ["padding in the middle", { p256dh: P256DH, auth: `${AUTH.slice(0, 10)}=${AUTH.slice(11)}` }],
    ["a huge key", { p256dh: "A".repeat(100_000), auth: AUTH }],
  ])("rejects %s", (_name, keys) => {
    expect(subscriptionSchema.safeParse(sub({ keys })).success).toBe(false);
  });

  it.each([
    ["http", "http://fcm.googleapis.com/fcm/send/x"],
    ["an unknown host", "https://push.example.com/x"],
    ["a look-alike host", "https://fcm.googleapis.com.evil.com/x"],
    ["a private address", "https://127.0.0.1/x"],
    ["not a URL", "fcm.googleapis.com"],
    ["an address over 1024 characters", `${FCM}${"a".repeat(1024)}`],
  ])("rejects an endpoint that is %s", (_name, endpoint) => {
    expect(subscriptionSchema.safeParse(sub({ endpoint })).success).toBe(false);
  });

  it("rejects a non-numeric expirationTime and missing keys", () => {
    expect(subscriptionSchema.safeParse(sub({ expirationTime: "soon" })).success).toBe(false);
    expect(subscriptionSchema.safeParse({ endpoint: FCM }).success).toBe(false);
  });
});

describe("endpointSchema and topicSchema", () => {
  it("apply the same allow-list to a lone endpoint", () => {
    expect(endpointSchema.safeParse({ endpoint: FCM }).success).toBe(true);
    expect(endpointSchema.safeParse({ endpoint: "https://evil.example/x" }).success).toBe(false);
  });

  it("takes only a known topic and a real boolean", () => {
    expect(topicSchema.safeParse({ topic: "feed", on: false }).success).toBe(true);
    expect(topicSchema.safeParse({ topic: "email", on: true }).success).toBe(false);
    expect(topicSchema.safeParse({ topic: "feed", on: "false" }).success).toBe(false);
  });
});

describe("refusedEndpointHost", () => {
  it("returns the host alone of a refused endpoint, never the path or query", () => {
    const host = refusedEndpointHost({ endpoint: "https://push.example.com/secret/device?k=1" });
    expect(host).toBe("push.example.com");
  });

  it("returns null for an allowed endpoint, and for input with no usable endpoint", () => {
    expect(refusedEndpointHost({ endpoint: FCM })).toBeNull();
    expect(refusedEndpointHost({ endpoint: 42 })).toBeNull();
    expect(refusedEndpointHost({ endpoint: "not a url" })).toBeNull();
    expect(refusedEndpointHost("https://push.example.com")).toBeNull();
    expect(refusedEndpointHost(null)).toBeNull();
  });
});
