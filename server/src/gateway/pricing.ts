/**
 * Per-model pricing (USD per 1,000,000 tokens), used to convert token usage
 * into cost for metering and USD budgets.
 *
 * These are editable defaults — adjust to your negotiated rates. Matching is by
 * exact key first, then a substring heuristic so provider-prefixed names
 * (e.g. "anthropic/claude-sonnet-4-5") still resolve.
 */
export interface Price {
  inPerM: number;
  outPerM: number;
}

const TABLE: Record<string, Price> = {
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-4o': { inPerM: 2.5, outPerM: 10 },
  'claude-haiku': { inPerM: 0.8, outPerM: 4 },
  'claude-sonnet': { inPerM: 3, outPerM: 15 },
  'claude-opus': { inPerM: 15, outPerM: 75 },
};

const ZERO: Price = { inPerM: 0, outPerM: 0 };

/** Resolves a price for a model name (exact, then substring heuristic). */
export function priceFor(model: string): Price {
  const key = model.toLowerCase();
  if (TABLE[key]) return TABLE[key];
  if (key.includes('opus')) return TABLE['claude-opus']!;
  if (key.includes('haiku')) return TABLE['claude-haiku']!;
  if (key.includes('sonnet')) return TABLE['claude-sonnet']!;
  if (key.includes('gpt-4o-mini') || key.includes('mini')) return TABLE['gpt-4o-mini']!;
  if (key.includes('gpt-4o') || key.includes('gpt-4')) return TABLE['gpt-4o']!;
  return ZERO;
}

/** Computes USD cost for a request given its input/output token counts. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
}
