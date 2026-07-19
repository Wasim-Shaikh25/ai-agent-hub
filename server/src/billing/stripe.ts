import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const API = 'https://api.stripe.com';

/** True when a Stripe secret key is configured. */
export function billingEnabled(): boolean {
  return Boolean(config.stripeSecretKey);
}

/** Flattens a nested object into Stripe's form-encoding (`payload[value]=…`). */
function encodeForm(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) {
      parts.push(encodeForm(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function stripe<T = unknown>(path: string, method: 'GET' | 'POST', form?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? encodeForm(form) : undefined,
  });
  const json = (await res.json()) as T;
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export interface StripeCustomer { id: string }
export interface StripeCheckout { id: string; url: string }

export function createCustomer(email: string, name: string, orgId: string): Promise<StripeCustomer> {
  return stripe<StripeCustomer>('/v1/customers', 'POST', { email, name, metadata: { orgId } });
}

/** Reports a usage-based Billing Meter event (Stripe Meters API). */
export function reportMeterEvent(eventName: string, customerId: string, value: number): Promise<unknown> {
  return stripe('/v1/billing/meter_events', 'POST', {
    event_name: eventName,
    payload: { stripe_customer_id: customerId, value: String(Math.round(value)) },
  });
}

export function createCheckoutSession(customerId: string, priceId: string, successUrl: string, cancelUrl: string): Promise<StripeCheckout> {
  return stripe<StripeCheckout>('/v1/checkout/sessions', 'POST', {
    customer: customerId,
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price]': priceId,
  });
}

export function listSubscriptions(customerId: string): Promise<{ data: Array<{ id: string; status: string }> }> {
  return stripe(`/v1/subscriptions?customer=${encodeURIComponent(customerId)}&limit=1`, 'GET');
}

/**
 * Verifies a Stripe webhook signature (`t=…,v1=…`) against the raw request body
 * using the webhook signing secret. Constant-time; enforces a timestamp
 * tolerance to prevent replay.
 */
export function verifyWebhookSignature(rawBody: string, sigHeader: string, secret: string, toleranceSec = 300): boolean {
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(',')) {
    const idx = kv.indexOf('=');
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  return true;
}
