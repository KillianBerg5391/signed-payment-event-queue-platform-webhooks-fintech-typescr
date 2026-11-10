import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 300;

export function verifySignature(
  rawBody: Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  if (!timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(nowSeconds - sentAt) > MAX_AGE_SECONDS) return false;

  const suppliedHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
