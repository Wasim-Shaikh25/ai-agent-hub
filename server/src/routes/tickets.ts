import type { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperadmin } from '../auth.js';
import { query, queryOne } from '../db/pool.js';
import { AuditService } from '../services/auditService.js';
import { events } from '../services/eventService.js';

const audit = new AuditService();

const VALID_CATEGORIES = ['General', 'Login issue', 'Billing', 'Agent not syncing', 'Bug report'];

export async function registerTicketRoutes(app: FastifyInstance): Promise<void> {
  // -- User: submit a ticket --------------------------------------------------
  app.post('/api/tickets', { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body as { subject?: string; body?: string; category?: string };
    const subject = (b.subject ?? '').trim();
    const body = (b.body ?? '').trim();
    const category = VALID_CATEGORIES.includes(b.category ?? '') ? b.category! : 'General';

    if (!subject || subject.length < 3) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Subject must be at least 3 characters' } });
    }
    if (!body || body.length < 10) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Description must be at least 10 characters' } });
    }

    const ticket = await queryOne<{ id: string }>(
      `INSERT INTO support_ticket (org_id, user_id, category, subject, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.auth!.orgId, req.auth!.userId, category, subject, body],
    );

    await audit.log(req.auth!.orgId, req.auth!.userId, 'ticket.created', ticket!.id, { category, subject });
    void events.record('info', 'user', 'ticket_created', `Ticket created: ${subject}`, req.auth!.orgId, { ticketId: ticket!.id });

    return { id: ticket!.id, status: 'open' };
  });

  // -- User: list their org's tickets --------------------------------------
  app.get('/api/tickets', { preHandler: requireAuth }, async (req) => {
    const limit = Math.min(Math.max(Number((req.query as { limit?: string }).limit ?? '50'), 1), 500);
    return query(
      `SELECT id, category, subject, body, status, created_at, updated_at
         FROM support_ticket
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.auth!.orgId, limit],
    );
  });

  // -- Operator: list all tickets --------------------------------------------
  app.get('/api/platform/tickets', { preHandler: [requireAuth, requireSuperadmin] }, async (req) => {
    const qry = req.query as { status?: string; orgId?: string; limit?: string };
    const limit = Math.min(Math.max(Number(qry.limit ?? '100'), 1), 500);
    const where: string[] = [];
    const vals: unknown[] = [];
    if (qry.status) { vals.push(qry.status); where.push(`t.status = $${vals.length}`); }
    if (qry.orgId) { vals.push(qry.orgId); where.push(`t.org_id = $${vals.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    vals.push(limit);
    return query(
      `SELECT t.*, u.email as user_email, o.name as org_name
         FROM support_ticket t
         LEFT JOIN app_user u ON u.id = t.user_id
         LEFT JOIN org o ON o.id = t.org_id
         ${clause}
         ORDER BY t.created_at DESC
         LIMIT $${vals.length}`,
      vals,
    );
  });

  // -- Operator: update ticket status ---------------------------------------
  app.put('/api/platform/tickets/:id', { preHandler: [requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { status?: string };
    const status = (b.status ?? '').toLowerCase();
    if (!['open', 'in_progress', 'closed'].includes(status)) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Status must be open, in_progress, or closed' } });
    }
    const row = await queryOne(
      `UPDATE support_ticket SET status = $1, updated_at = now() WHERE id = $2 RETURNING id`,
      [status, id],
    );
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'Ticket not found' } });
    await audit.log(req.auth!.orgId, req.auth!.userId, 'ticket.status_changed', id, { status });
    return { id, status };
  });

  // -- Operator: add comment --------------------------------------------------
  app.post('/api/platform/tickets/:id/comments', { preHandler: [requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { body?: string };
    const body = (b.body ?? '').trim();
    if (!body) return reply.code(400).send({ error: { code: 'bad_request', message: 'Comment body is required' } });
    const ticket = await queryOne('SELECT id FROM support_ticket WHERE id = $1', [id]);
    if (!ticket) return reply.code(404).send({ error: { code: 'not_found', message: 'Ticket not found' } });
    const comment = await queryOne<{ id: string }>(
      `INSERT INTO support_ticket_comment (support_ticket_id, author_user_id, body) VALUES ($1, $2, $3) RETURNING id`,
      [id, req.auth!.userId, body],
    );
    return { id: comment!.id };
  });
}
