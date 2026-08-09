import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { queryOne, query, setOrgContext, clearOrgContext } from './db/pool.js';
import { verifySession } from './auth/jwt.js';
import { isSuspended } from './billing/entitlements.js';
import { events } from './services/eventService.js';

/** Resolved caller identity. */
export interface AuthContext {
  orgId: string;
  userId: string;
  role: string;
}

/** Role hierarchy, lowest to highest privilege. */
export const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

/** True if `role` meets or exceeds `min`. */
export function hasRole(role: string, min: string): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 0);
}

/** Resolves a raw bearer key to an {@link AuthContext}, or undefined. */
export async function resolveApiKey(rawKey: string | undefined): Promise<AuthContext | undefined> {
  if (!rawKey) return undefined;
  const hash = createHash('sha256').update(rawKey).digest('hex');
  const row = await queryOne<{ org_id: string; user_id: string; role: string }>(
    `SELECT k.org_id, k.user_id, COALESCE(k.role, m.role, 'member') AS role
       FROM api_key k
       LEFT JOIN membership m ON m.org_id = k.org_id AND m.user_id = k.user_id
      WHERE k.hash = $1 AND k.revoked = false`,
    [hash],
  );
  if (!row) return undefined;
  // best-effort last-used stamp; don't block the request on it
  void query('UPDATE api_key SET last_used_at = now() WHERE hash = $1', [hash]);
  return { orgId: row.org_id, userId: row.user_id, role: row.role };
}

/**
 * Resolves a bearer credential to an {@link AuthContext}. Accepts either a
 * JWT session token (from SSO login) or an API key.
 */
export async function resolveAuth(rawBearer: string | undefined): Promise<AuthContext | undefined> {
  if (!rawBearer) return undefined;
  // A JWT has three dot-separated segments; try it first.
  if (rawBearer.split('.').length === 3) {
    const claims = verifySession(rawBearer);
    if (claims) return { orgId: claims.orgId, userId: claims.userId, role: claims.role };
  }
  return resolveApiKey(rawBearer);
}

function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1]?.trim();
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Fastify preHandler that requires a valid API key or session token. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveAuth(bearer(req.headers.authorization));
  if (!ctx) {
    await reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid or missing credentials' } });
    return;
  }
  // Platform admins are exempt — a suspended org must never lock its own
  // operator out of the controls that un-suspend it.
  if (await isSuspended(ctx.orgId) && !(await isPlatformAdmin(ctx.userId))) {
    void events.record('warn', 'auth', 'org_suspended', 'Blocked request from suspended workspace', ctx.orgId, {});
    await reply.code(403).send({ error: { code: 'org_suspended', message: 'This workspace is suspended. Contact support.' } });
    return;
  }
  req.auth = ctx;
  // Bind this request's org for DB-layer RLS enforcement (no-op unless RLS_ENABLED).
  setOrgContext(ctx.orgId);
}

/** True if the user is a platform super-admin. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const row = await queryOne<{ is_platform_admin: boolean }>('SELECT is_platform_admin FROM app_user WHERE id = $1', [userId]);
  return Boolean(row?.is_platform_admin);
}

/** Fastify preHandler requiring the caller to be a platform super-admin. */
export async function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) {
    await reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } });
    return;
  }
  if (!(await isPlatformAdmin(req.auth.userId))) {
    await reply.code(403).send({ error: { code: 'forbidden', message: 'Platform admin only' } });
    return;
  }
  // Platform admins read across every org — drop the RLS org binding.
  clearOrgContext();
}

/**
 * Fastify preHandler factory requiring at least `min` role. Runs after
 * {@link requireAuth} (which populates `req.auth`).
 */
export function requireRole(min: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.auth) {
      await reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } });
      return;
    }
    if (!hasRole(req.auth.role, min)) {
      await reply.code(403).send({ error: { code: 'forbidden', message: `Requires ${min} role` } });
    }
  };
}

/** Extracts the bearer key from a raw header (for the MCP transport). */
export { bearer };
