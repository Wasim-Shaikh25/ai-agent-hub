import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Minimal dependency-free HS256 JWT sign/verify. Sessions issued after SSO
 * login carry `{ orgId, userId, role, email }` and an expiry.
 */
export interface SessionClaims {
  orgId: string;
  userId: string;
  role: string;
  email: string;
  exp: number; // unix seconds
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Signs a session token valid for `ttlSeconds` (default 7 days). */
export function signSession(claims: Omit<SessionClaims, 'exp'>, ttlSeconds = 7 * 24 * 3600): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body, config.jwtSecret)}`;
}

/** Verifies a token and returns its claims, or undefined if invalid/expired. */
export function verifySession(token: string): SessionClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [header, payload, sig] = parts;
  const expected = sign(`${header}.${payload}`, config.jwtSecret);
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf-8')) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return undefined;
    return claims;
  } catch {
    return undefined;
  }
}
