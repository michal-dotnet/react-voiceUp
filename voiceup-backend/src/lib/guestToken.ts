import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Anonymous guest identity for "this affects me too" confirmations.
 *
 * A guest token is `g1.<randomId>.<signature>`, signed with the server secret, so clients
 * cannot forge one for another guest. Only HMAC digests of the guest id and the client IP
 * are stored in the database; the raw token and IP are never persisted.
 */

const PREFIX = 'g1';
const TOKEN_PATTERN = /^g1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

function hmac(secret: string, purpose: string, value: string): Buffer {
  return createHmac('sha256', secret).update(`${purpose}:${value}`).digest();
}

export function issueGuestToken(secret: string): { token: string; guestId: string } {
  const guestId = randomBytes(16).toString('base64url');
  const signature = hmac(secret, 'guest-token', guestId).toString('base64url');
  return { token: `${PREFIX}.${guestId}.${signature}`, guestId };
}

/** Returns the guest id from a valid token, or null for anything malformed or forged. */
export function verifyGuestToken(token: string, secret: string): string | null {
  const match = TOKEN_PATTERN.exec(token);
  const id = match?.[1];
  const signature = match?.[2];
  if (!id || !signature) return null;
  const expected = hmac(secret, 'guest-token', id);
  const given = Buffer.from(signature, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** Stored per confirmation; identifies the same guest across requests without storing the token. */
export function guestKeyHash(guestId: string, secret: string): string {
  return hmac(secret, 'guest-key', guestId).toString('hex');
}

/** Stored per confirmation for per-IP caps; the raw IP address is never stored. */
export function ipHash(ip: string, secret: string): string {
  return hmac(secret, 'guest-ip', ip).toString('hex');
}
