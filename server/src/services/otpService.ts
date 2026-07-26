import { randomBytes, createHash } from 'node:crypto';
import { query, queryOne } from '../db/pool.js';
import { sendOtp as sendOtpEmail } from './emailService.js';

const OTP_TTL_MINUTES = 10;

export interface Otp {
  code: string;
  expiresAt: Date;
}

function generateCode(): string {
  // 6-digit numeric code, padded.
  return (randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
}

/** Stores an OTP and sends it to the email address. */
export async function createOtp(email: string, purpose: string): Promise<Otp> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO otp_code (email, purpose, code, expires_at) VALUES ($1, $2, $3, $4)`,
    [email.toLowerCase().trim(), purpose, code, expiresAt],
  );
  await sendOtpEmail(email, code);
  return { code, expiresAt };
}

/**
 * Verifies an OTP. Returns true on success and marks the code as used.
 * Failed verifications do not mark the code used, so a typo can be retried.
 */
export async function verifyOtp(email: string, code: string, purpose: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM otp_code
      WHERE email = $1 AND purpose = $2 AND code = $3 AND used = false AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase().trim(), purpose, code],
  );
  if (!row) return false;
  await query('UPDATE otp_code SET used = true WHERE id = $1', [row.id]);
  return true;
}

/** Dev/test helper: returns the latest unused OTP for an email + purpose. */
export async function peekOtp(email: string, purpose: string): Promise<string | undefined> {
  const row = await queryOne<{ code: string }>(
    `SELECT code FROM otp_code
      WHERE email = $1 AND purpose = $2 AND used = false AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase().trim(), purpose],
  );
  return row?.code;
}
