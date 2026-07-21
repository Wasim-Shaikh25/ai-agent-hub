import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Hashes a password with scrypt: returns "salt:hash". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Constant-time password verification against a stored "salt:hash". */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = scryptSync(password, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === calc.length && timingSafeEqual(known, calc);
}
