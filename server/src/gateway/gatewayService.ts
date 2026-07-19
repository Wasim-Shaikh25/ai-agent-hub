import { query, queryOne } from '../db/pool.js';
import { config } from '../config.js';
import { PolicyService } from '../services/policyService.js';

/** HTTP status codes worth retrying against the next model in the chain. */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface ChatBody {
  model?: string;
  stream?: boolean;
  [k: string]: unknown;
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
 * The Gateway Plane. Resolves a model chain from policy, forwards chat
 * completions to LiteLLM with automatic fallback, enforces budgets, and
 * meters token usage.
 */
export class GatewayService {
  constructor(private readonly policies = new PolicyService()) {}

  /**
   * Builds the ordered model chain to try:
   *   [ routing(task) || requested || first(default_chain) , ...fallbacks || default_chain ]
   */
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

  /** Current-month token usage for an org. */
  async monthTokens(orgId: string): Promise<number> {
    const row = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(qty),0) AS total FROM usage_event
        WHERE org_id = $1 AND kind = 'tokens' AND created_at >= date_trunc('month', now())`,
      [orgId],
    );
    return Number(row?.total ?? 0);
  }

  /** Throws {@link BudgetExceededError} if the org is over its token budget. */
  async assertWithinBudget(orgId: string): Promise<void> {
    const budget = await this.policies.budget(orgId);
    if (budget?.maxTokens != null) {
      const used = await this.monthTokens(orgId);
      if (used >= budget.maxTokens) {
        throw new BudgetExceededError(`Monthly token budget exceeded (${used}/${budget.maxTokens})`);
      }
    }
  }

  /**
   * Forwards the request to LiteLLM, walking the model chain on retryable
   * failures. Returns the first successful (or last) upstream response.
   */
  async forward(orgId: string, body: ChatBody, task: string | undefined): Promise<ForwardResult> {
    const chain = await this.buildChain(orgId, body.model, task);
    const tried: string[] = [];
    let last: Response | undefined;

    for (const model of chain) {
      tried.push(model);
      const upstreamBody: ChatBody = { ...body, model };
      // Ask upstream to include usage in the final stream chunk for metering.
      if (body.stream) upstreamBody['stream_options'] = { include_usage: true };

      let resp: Response;
      try {
        resp = await fetch(`${config.litellmUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.litellmMasterKey}`,
          },
          body: JSON.stringify(upstreamBody),
        });
      } catch (err) {
        last = new Response(JSON.stringify({ error: { message: String(err) } }), { status: 502 });
        continue; // network error → try next model
      }

      if (resp.ok || !RETRYABLE.has(resp.status)) {
        return { resp, model, triedModels: tried };
      }
      last = resp; // retryable failure → try next model
    }

    return { resp: last ?? new Response('no models', { status: 502 }), model: tried[tried.length - 1] ?? '', triedModels: tried };
  }

  /** Records a token-usage event for metering/billing. */
  async recordUsage(orgId: string, userId: string | null, model: string, totalTokens: number, meta: Record<string, unknown> = {}): Promise<void> {
    await query(
      `INSERT INTO usage_event (org_id, user_id, kind, qty, meta) VALUES ($1,$2,'tokens',$3,$4)`,
      [orgId, userId, totalTokens, JSON.stringify({ model, ...meta })],
    );
  }

  /** Extracts total_tokens from the tail of an SSE stream, if present. */
  parseUsageFromSse(tail: string): number {
    const matches = tail.match(/"total_tokens"\s*:\s*(\d+)/g);
    if (!matches || matches.length === 0) return 0;
    const lastMatch = matches[matches.length - 1]!;
    const n = /(\d+)/.exec(lastMatch);
    return n ? Number(n[1]) : 0;
  }
}
