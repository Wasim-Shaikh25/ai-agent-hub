import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, requireRole } from '../auth.js';
import { queryOne } from '../db/pool.js';
import { config } from '../config.js';
import { billing } from '../billing/billingService.js';
import { verifyWebhookSignature } from '../billing/stripe.js';
import { AuditService } from '../services/auditService.js';

const audit = new AuditService();

/** Billing endpoints (admin) + the Stripe webhook (signature-verified). */
export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/billing/status', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    return billing.status(req.auth!.orgId);
  });

  app.post('/api/billing/customer', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const b = req.body as { email?: string; name?: string };
    if (!billing.enabled()) return reply.code(400).send({ error: { code: 'billing_disabled', message: 'Set STRIPE_SECRET_KEY to enable billing' } });
    const org = await queryOne<{ name: string }>('SELECT name FROM org WHERE id = $1', [req.auth!.orgId]);
    const id = await billing.ensureCustomer(req.auth!.orgId, b.email ?? 'billing@localhost', b.name ?? org?.name ?? 'Org');
    await audit.log(req.auth!.orgId, req.auth!.userId, 'billing.customer_linked', id);
    return { customerId: id };
  });

  app.post('/api/billing/checkout', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const b = req.body as { priceId?: string; email?: string; successUrl?: string; cancelUrl?: string };
    if (!billing.enabled()) return reply.code(400).send({ error: { code: 'billing_disabled', message: 'Set STRIPE_SECRET_KEY to enable billing' } });
    if (!b.priceId) return reply.code(400).send({ error: { code: 'bad_request', message: 'priceId required' } });
    const org = await queryOne<{ name: string }>('SELECT name FROM org WHERE id = $1', [req.auth!.orgId]);
    const url = await billing.checkout(
      req.auth!.orgId,
      b.email ?? 'billing@localhost',
      org?.name ?? 'Org',
      b.priceId,
      b.successUrl ?? `${config.appBaseUrl}/billing/success`,
      b.cancelUrl ?? `${config.appBaseUrl}/billing/cancel`,
    );
    return { url };
  });

  // Stripe webhook — no auth; authenticity comes from the signature.
  app.post('/webhooks/stripe', async (req: FastifyRequest, reply) => {
    const sig = req.headers['stripe-signature'];
    const raw = (req as FastifyRequest & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? '';
    if (!config.stripeWebhookSecret) return reply.code(400).send({ error: { code: 'billing_disabled', message: 'STRIPE_WEBHOOK_SECRET not set' } });
    if (typeof sig !== 'string' || !verifyWebhookSignature(raw, sig, config.stripeWebhookSecret)) {
      return reply.code(400).send({ error: { code: 'bad_signature', message: 'invalid Stripe signature' } });
    }

    const event = req.body as { type?: string; data?: { object?: { customer?: string; status?: string } } };
    if (event.type?.startsWith('customer.subscription.') && event.data?.object?.customer) {
      await billing.applySubscriptionStatus(event.data.object.customer, event.data.object.status ?? 'unknown');
    }
    return reply.send({ received: true });
  });
}
