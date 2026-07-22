import { config } from '../config.js';

/**
 * LLM helpers for session summarization + memory extraction. Calls LiteLLM
 * directly (internal, master key) with a cheap model; falls back to a
 * deterministic heuristic when no provider is reachable, so both features work
 * offline for local dev.
 */
export async function llmComplete(system: string, user: string, maxTokens = 400): Promise<string | undefined> {
  try {
    const res = await fetch(`${config.litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.litellmMasterKey}` },
      body: JSON.stringify({
        model: config.summaryModel,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface Turn { role: string; content: string }

/** Rolling session summary — LLM if available, else extractive heuristic. */
export async function summarizeSession(turns: Turn[]): Promise<string> {
  if (turns.length === 0) return '';
  const transcript = turns.map((t) => `${t.role}: ${t.content}`).join('\n');
  const llm = await llmComplete(
    'You maintain a concise rolling summary of a coding session. In <=120 words, capture the current task, key decisions, and important context an agent would need to continue. Plain prose, no preamble.',
    transcript,
    260,
  );
  if (llm) return llm;
  // Heuristic fallback: first sentence of the most recent turns.
  const recent = turns.slice(-6).map((t) => {
    const first = t.content.split(/(?<=[.!?])\s/)[0] ?? t.content;
    return `${t.role}: ${first.slice(0, 120)}`;
  });
  return recent.join(' ');
}

/**
 * LLM reranker (the guide's cross-encoder, without a Python/torch dep): scores
 * query↔snippet relevance and returns the snippet indices most-relevant first.
 * Returns [] when no LLM is reachable so the caller keeps its hybrid order.
 */
export async function rerankByLLM(query: string, snippets: string[]): Promise<number[]> {
  if (snippets.length < 2) return [];
  const list = snippets.map((s, i) => `[${i}] ${s.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const out = await llmComplete(
    'You are a code-search reranker. Given a query and numbered snippets, return ONLY a JSON array of the snippet indices ordered most-relevant first.',
    `Query: ${query}\n\nSnippets:\n${list}`,
    120,
  );
  if (!out) return [];
  const m = out.match(/\[[\d,\s]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown[];
    return Array.isArray(arr) ? arr.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export interface ExtractedMemory { kind: string; content: string }

/** Extract durable memories from a session — LLM JSON if available, else heuristic. */
export async function extractMemories(turns: Turn[]): Promise<ExtractedMemory[]> {
  if (turns.length === 0) return [];
  const transcript = turns.map((t) => `${t.role}: ${t.content}`).join('\n');
  const llm = await llmComplete(
    'Extract only durable, reusable knowledge from this coding session as a JSON array of {"kind","content"} where kind is one of fact|decision|preference. Skip transient chatter. Return ONLY the JSON array.',
    transcript,
    400,
  );
  if (llm) {
    const parsed = tryParseMemories(llm);
    if (parsed.length) return parsed;
  }
  // Heuristic fallback: lines that look like decisions/facts.
  const out: ExtractedMemory[] = [];
  const re = /\b(we use|we chose|decided|must|always|never|prefer|standard is|convention is)\b/i;
  for (const t of turns) {
    for (const line of t.content.split(/(?<=[.!?])\s|\n/)) {
      const s = line.trim();
      if (s.length > 15 && s.length < 240 && re.test(s)) {
        const kind = /decid|chose|must|prefer/i.test(s) ? 'decision' : 'fact';
        out.push({ kind, content: s });
      }
    }
  }
  // dedupe
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.content) ? false : (seen.add(m.content), true))).slice(0, 20);
}

function tryParseMemories(text: string): ExtractedMemory[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as Array<{ kind?: string; content?: string }>;
    return arr
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ kind: ['fact', 'decision', 'preference'].includes(m.kind ?? '') ? m.kind! : 'fact', content: m.content!.trim() }));
  } catch {
    return [];
  }
}
