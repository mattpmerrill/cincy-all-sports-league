import { createPublicKey, verify } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodePushPayload, pushMessage } from "@/domain/push";
import { createPushSender } from "./send";
import { createDeviceKeys, decryptPushBody, targetFor, testVapidConfig } from "./test-utils";

/**
 * A real `web-push` request over real HTTP to a local stand-in for a push service. The unit
 * tests fake `fetch`; this one proves the bytes and headers are what RFC 8291 and RFC 8292 say,
 * by decrypting the body with the device's own private key. (The sender applies no endpoint
 * allow-list, so a 127.0.0.1 endpoint is fine here; `isAllowedPushEndpoint` guards registration.)
 */

type Seen = { method?: string; url?: string; headers: IncomingHttpHeaders; body: Buffer };

let server: Server;
let origin: string;
let seen: Seen[] = [];
let nextStatus = 201;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.statusCode = nextStatus;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const message = pushMessage({
  title: "Coop made you an offer \u{1F3C8}",
  body: "Chicago Bears for Utah Utes",
  url: "/trades/abc",
  tag: "trade-abc",
  renotify: true,
});

const decodeJwt = (jwt: string) => {
  const [header, payload, signature] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(header ?? "", "base64url").toString()) as unknown,
    payload: JSON.parse(Buffer.from(payload ?? "", "base64url").toString()) as {
      aud: string;
      sub: string;
      exp: number;
    },
    signedText: `${header}.${payload}`,
    signature: Buffer.from(signature ?? "", "base64url"),
  };
};

describe("a real push request", () => {
  it("is signed with VAPID and carries a payload only the device can read", async () => {
    seen = [];
    nextStatus = 201;
    const vapid = testVapidConfig("https://www.cincysports.xyz");
    const device = createDeviceKeys();
    const sender = createPushSender({ config: vapid });

    const result = await sender.sendPush(
      targetFor(device, `${origin}/push/device-1`),
      encodePushPayload(message),
      { ttlSeconds: 3600, urgency: "high" },
    );

    expect(result).toEqual({ ok: true, value: null });
    expect(seen).toHaveLength(1);
    const request = seen[0];
    if (!request) throw new Error("the mock push service saw no request");

    expect(request.method).toBe("POST");
    expect(request.url).toBe("/push/device-1");
    expect(request.headers.ttl).toBe("3600");
    expect(request.headers.urgency).toBe("high");
    expect(request.headers["content-encoding"]).toBe("aes128gcm");
    expect(request.headers["content-type"]).toBe("application/octet-stream");
    expect(request.headers["content-length"]).toBe(String(request.body.length));

    // Authorization: vapid t=<jwt>, k=<public key>
    const match = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(
      request.headers.authorization ?? "",
    );
    if (!match) throw new Error("no VAPID Authorization header");
    const [, jwt = "", key = ""] = match;
    expect(key).toBe(vapid.publicKey);
    const { header, payload, signedText, signature } = decodeJwt(jwt);
    expect(header).toEqual({ typ: "JWT", alg: "ES256" });
    expect(payload.aud).toBe(origin);
    expect(payload.sub).toBe("https://www.cincysports.xyz");
    const now = Date.now() / 1000;
    expect(payload.exp).toBeGreaterThan(now);
    expect(payload.exp).toBeLessThanOrEqual(now + 24 * 60 * 60);

    // The JWT was signed by the private key that belongs to the advertised public key.
    const publicKey = Buffer.from(vapid.publicKey, "base64url");
    const verifier = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: publicKey.subarray(1, 33).toString("base64url"),
        y: publicKey.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(signedText),
        { key: verifier, dsaEncoding: "ieee-p1363" },
        signature,
      ),
    ).toBe(true);

    expect(decryptPushBody(request.body, device)).toBe(encodePushPayload(message));
  });

  it("reports the push service's 410 as push_gone", async () => {
    seen = [];
    nextStatus = 410;
    const sender = createPushSender({ config: testVapidConfig() });
    const result = await sender.sendPush(
      targetFor(createDeviceKeys(), `${origin}/push/device-2`),
      encodePushPayload(message),
      { ttlSeconds: 60, urgency: "normal" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "push_gone" } });
    expect(seen).toHaveLength(1);
  });
});
