/**
 * Test-only helpers: a device key pair and the receiving end of RFC 8291 (aes128gcm), so a test
 * can prove what a push service would hand a browser, not just that some bytes went out.
 */
import { createDecipheriv, createECDH, hkdfSync, randomBytes, type ECDH } from "node:crypto";
import * as webpush from "web-push";
import type { PushTarget } from "@/domain/push";
import type { VapidConfig } from "@/lib/env.server";

export const noSleep = async () => {};

/** A fresh, throwaway VAPID pair made in memory: never a real key, never written anywhere. */
export function testVapidConfig(subject = "https://www.cincysports.xyz"): VapidConfig {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  return { publicKey, privateKey, subject };
}

export type DeviceKeys = {
  ecdh: ECDH;
  /** Unpadded base64url of the 65-byte public point: what a browser sends as `p256dh`. */
  p256dh: string;
  /** Unpadded base64url of the 16-byte auth secret. */
  auth: string;
};

/** The keys a browser makes when it subscribes; the private half stays here to decrypt with. */
export function createDeviceKeys(): DeviceKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

export function targetFor(keys: DeviceKeys, endpoint: string): PushTarget {
  return {
    subscriptionId: "sub-1",
    recipientId: "user-1",
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) =>
  Buffer.from(hkdfSync("sha256", ikm, salt, info, length));

/**
 * Decrypts an `aes128gcm` body (RFC 8188 framing, RFC 8291 key schedule) for one device. The
 * header is salt(16) | record size(4) | key id length(1) | key id (the sender's public key), and
 * the plaintext ends with a 0x02 delimiter followed by optional zero padding. Handles the single
 * record a push message is (4096 bytes at most).
 */
export function decryptPushBody(body: Uint8Array, device: DeviceKeys): string {
  const data = Buffer.from(body);
  const salt = data.subarray(0, 16);
  const keyIdLength = data[20];
  const senderPublic = data.subarray(21, 21 + keyIdLength);
  const record = data.subarray(21 + keyIdLength);

  const sharedSecret = device.ecdh.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    device.ecdh.getPublicKey(),
    senderPublic,
  ]);
  const ikm = hkdf(Buffer.from(device.auth, "base64url"), sharedSecret, keyInfo, 32);
  const key = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([
    decipher.update(record.subarray(0, record.length - 16)),
    decipher.final(),
  ]);

  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end--;
  if (padded[end - 1] !== 2) throw new Error("not the final record");
  return padded.subarray(0, end - 1).toString("utf8");
}
