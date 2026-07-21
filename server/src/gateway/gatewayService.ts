import { query, queryOne } from '../db/pool.js';
import { config } from '../config.js';
import { PolicyService } from '../services/policyService.js';
import { costUsd } from './pricing.js';
import { billing } from '../billing/billingService.js';

/** HTTP status codes worth retrying against the next model in the chain. */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface ChatBody {
  model?: string;
  stream?: boolean;
  [k: string]: unknown;
}

/** Normalised token usage across OpenAI and Anthropic response shapes. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ForwardResult {
  resp: Response;
  model: string;
  triedModels: string[];
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * The Gateway Plane. Resolves a model chain from policy, forwards requests to
 * LiteLLM (OpenAI `/v1/chat/completions` or Anthropic `/v1/messages`) with
 * automatic fallback, enforces token/USD budgets, and meters usage + cost.
 */
export class GatewayService {
  constructor(private readonly policies = new PolicyService()) {}

  async buildChain(orgId: string, requestedModel: string | undefined, task: string | undefined): Promise<string[]> {
    const routed = await this.policies.modelForTask(orgId, task);
    const { fallbacks, defaultChain } = await this.policies.fallbacksFor(orgId, routed ?? requestedModel ?? '');

    const primary = routed ?? requestedModel ?? defaultChain[0];
    if (!primary) throw new Error('No model specified and no routing/default policy configured');

    const tail = fallbacks.length ? fallbacks : defaultChain;
    const chain: string[] = [];
    for (const m of [primary, ...tail]) {
      if (m && !chain.includes(m)) chain.push(m);
    }
    return chain;
  }

  async monthTokens(orgId: string): Promise<number> {
    const row = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(qty),0) AS total FROM usage_event
        WHERE org_id = $1 AND kind = 'tokens' AND created_at >= date_trunc('month', now())`,
      [orgId],
    );
    return Number(row?.total ?? 0);
  }

  /** Count of gateway requests this month (for plan limits). */
  async monthRequests(orgId: string): Promise<number> {
    const row = await queryOne<{ n: string }>(
      `SELECT COUNT(*) AS n FROM usage_event
        WHERE org_id = $1 AND kind = 'tokens' AND created_at >= date_trunc('month', now())`,
      [orgId],
    );
    return Number(row?.n ?? 0);
  }

  async monthUsd(orgId: string): Promise<number> {
    const row = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM((meta->>'usd')::numeric),0) AS total FROM usage_event
        WHERE org_id = $1 AND kind = 'tokens' AND created_at >= date_trunc('month', now())`,
      [orgId],
    );
    return Number(row?.total ?? 0);
  }

  /** Throws {@link BudgetExceededError} if the org is over its token or USD budget. */
  async assertWithinBudget(orgId: string): Promise<void> {
    const budget = await this.policies.budget(orgId);
    if (!budget) return;
    if (budget.maxTokens != null) {
      const used = await this.monthTokens(orgId);
      if (used >= budget.maxTokens) {
        throw new BudgetExceededError(`Monthly token budget exceeded (${used}/${budget.maxTokens})`);
      }
    }
    if (budget.maxUsd != null) {
      const used = await this.monthUsd(orgId);
      if (used >= budget.maxUsd) {
        throw new BudgetExceededError(`Monthly USD budget exceeded ($${used.toFixed(4)}/$${budget.maxUsd})`);
      }
    }
  }

  /**
   * Forwards to a LiteLLM endpoint, walking the model chain on retryable
   * failures. `injectStreamUsage` adds OpenAI's stream_options so the final
   * SSE chunk carries usage (Anthropic streams usage natively).
   */
  async forwardTo(
    orgId: string,
    path: string,
    body: ChatBody,
    task: string | undefined,
    opts: { injectStreamUsage: boolean },
  ): Promise<ForwardResult> {
    const chain = await this.buildChain(orgId, body.model, task);
    const tried: string[] = [];
    let last: Response | undefined;

    for (const model of chain) {
      tried.push(model);
      const upstreamBody: ChatBody = { ...body, model };
      if (opts.injectStreamUsage && body.stream) upstreamBody['stream_options'] = { include_usage: true };

      let resp: Response;
      try {
        resp = await fetch(`${config.litellmUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.litellmMasterKey}` },
          body: JSON.stringify(upstreamBody),
        });
      } catch (err) {
        last = new Response(JSON.stringify({ error: { message: String(err) } }), { status: 502 });
        continue;
      }

      if (resp.ok || !RETRYABLE.has(resp.status)) {
        return { resp, model, triedModels: tried };
      }
      last = resp;
    }

    return { resp: last ?? new Response('no models', { status: 502 }), model: tried[tried.length - 1] ?? '', triedModels: tried };
  }

  /** Records a usage event with token counts and computed USD cost. */
  async recordUsage(orgId: string, userId: string | null, model: string, usage: Usage, meta: Record<string, unknown> = {}): Promise<void> {
    const total = usage.inputTokens + usage.outputTokens;
    const usd = costUsd(model, usage.inputTokens, usage.outputTokens);
    await query(
      `INSERT INTO usage_event (org_id, user_id, kind, qty, meta) VALUES ($1,$2,'tokens',$3,$4)`,
      [orgId, userId, total, JSON.stringify({ model, input: usage.inputTokens, output: usage.outputTokens, usd, ...meta })],
    );
    // Best-effort meter report to Stripe (no-op unless billing is configured).
    void billing.reportUsage(orgId, total);
  }

  // -- usage extraction -----------------------------------------------------

  /** USD cost for a given usage on a model (exposed for savings accounting). */
  costOf(model: string, usage: Usage): number {
    return costUsd(model, usage.inputTokens, usage.outputTokens);
  }

  extractOpenAIUsage(json: unknown): Usage {
    const u = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    return { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };
  }

  extractAnthropicUsage(json: unknown): Usage {
    const u = (json as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    return { inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0 };
  }

  /** Parses OpenAI usage from the tail of an SSE stream. */
  parseOpenAIUsageFromSse(tail: string): Usage {
    return { inputTokens: lastNumber(tail, 'prompt_tokens'), outputTokens: lastNumber(tail, 'completion_tokens') };
  }

  /** Parses Anthropic usage from the tail of an SSE stream. */
  parseAnthropicUsageFromSse(tail: string): Usage {
    return { inputTokens: lastNumber(tail, 'input_tokens'), outputTokens: lastNumber(tail, 'output_tokens') };
  }
}

function lastNumber(text: string, field: string): number {
  const re = new RegExp(`"${field}"\\s*:\\s*(\\d+)`, 'g');
  let m: RegExpExecArray | null;
  let val = 0;
  while ((m = re.exec(text)) !== null) val = Number(m[1]);
  return val;
}
