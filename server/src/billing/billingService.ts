import { query, queryOne } from '../db/pool.js';
import { billingEnabled, createCustomer, reportMeterEvent, createCheckoutSession, listSubscriptions } from './stripe.js';
import { invalidatePlan } from './entitlements.js';

const METER_EVENT = 'hub_tokens';

/**
 * Billing orchestration on top of the Stripe client. Everything is a no-op when
 * Stripe isn't configured, so the rest of the app runs unchanged locally.
 */
export class BillingService {
  enabled(): boolean {
    return billingEnabled();
  }

  private async customerId(orgId: string): Promise<string | undefined> {
    const row = await queryOne<{ stripe_customer_id: string | null }>('SELECT stripe_customer_id FROM org WHERE id = $1', [orgId]);
    return row?.stripe_customer_id ?? undefined;
  }

  /** Creates + links a Stripe customer for the org (idempotent). */
  async ensureCustomer(orgId: string, email: string, name: string): Promise<string> {
    if (!billingEnabled()) throw new Error('Billing is not configured (set STRIPE_SECRET_KEY)');
    const existing = await this.customerId(orgId);
    if (existing) return existing;
    const customer = await createCustomer(email, name, orgId);
    await query('UPDATE org SET stripe_customer_id = $2 WHERE id = $1', [orgId, customer.id]);
    return customer.id;
  }

  /** Best-effort usage report to Stripe Meters. Never throws into the caller. */
  async reportUsage(orgId: string, tokens: number): Promise<void> {
    if (!billingEnabled() || tokens <= 0) return;
    try {
      const cid = await this.customerId(orgId);
      if (!cid) return; // org not linked to Stripe yet
      await reportMeterEvent(METER_EVENT, cid, tokens);
    } catch (err) {
      console.error('[billing] meter report failed:', err instanceof Error ? err.message : err);
    }
  }

  async checkout(orgId: string, email: string, name: string, priceId: string, successUrl: string, cancelUrl: string): Promise<string> {
    const cid = await this.ensureCustomer(orgId, email, name);
    const session = await createCheckoutSession(cid, priceId, successUrl, cancelUrl);
    return session.url;
  }

  async status(orgId: string): Promise<{ enabled: boolean; customerId?: string; subscription?: string }> {
    if (!billingEnabled()) return { enabled: false };
    const cid = await this.customerId(orgId);
    if (!cid) return { enabled: true };
    let subscription: string | undefined;
    try {
      const subs = await listSubscriptions(cid);
      subscription = subs.data[0]?.status;
    } catch {
      /* ignore */
    }
    return { enabled: true, customerId: cid, subscription };
  }

  /** Applies a subscription-status change from a webhook, syncing the plan. */
  async applySubscriptionStatus(customerId: string, status: string): Promise<void> {
    // active/trialing → paid; otherwise free.
    const active = status === 'active' || status === 'trialing';
    const planExpr = active ? `'paid'` : `'free'`;
    await query(
      `UPDATE org SET subscription_status = $2, plan = ${planExpr} WHERE stripe_customer_id = $1`,
      [customerId, status],
    );
    const org = await queryOne<{ id: string }>('SELECT id FROM org WHERE stripe_customer_id = $1', [customerId]);
    if (org) invalidatePlan(org.id);
  }
}

export const billing = new BillingService();
