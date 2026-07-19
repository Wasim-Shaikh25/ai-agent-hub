import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { queryOne, query } from './db/pool.js';

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

/** Fastify preHandler that requires a valid API key. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveApiKey(bearer(req.headers.authorization));
  if (!ctx) {
    await reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid or missing API key' } });
    return;
  }
  req.auth = ctx;
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
