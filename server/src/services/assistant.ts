import { llmComplete } from './summarizer.js';

/**
 * Operator copilot. Answers the platform admin's questions grounded in a
 * snapshot of live platform stats. Uses the internal LLM helper when a model
 * is reachable; otherwise returns a deterministic, still-useful summary so the
 * console never dead-ends offline.
 */
export interface PlatformSnapshot {
  orgs: number;
  suspended: number;
  byPlan: Record<string, number>;
  monthTokens: number;
  monthUsd: number;
  issues: {
    windowHours: number;
    total: number;
    byLevel: Record<string, number>;
    byCode: Array<{ code: string; level: string; n: number }>;
    topOrgs: Array<{ name: string | null; n: number }>;
  };
}

const SYSTEM = [
  'You are the operator copilot for "AI Agent Hub", a SaaS control plane.',
  'You help the platform super-admin run and debug the service: reading the',
  'metrics and recent issue log below, explaining what is failing and why,',
  'spotting trends, and advising on plans and operations.',
  'Be concise and concrete. Ground every claim in the provided snapshot; when a',
  'question is about problems, reason from the issue codes and affected orgs.',
  'If the snapshot lacks the answer, say so and suggest what to check. Never invent numbers.',
].join(' ');

function snapshotText(s: PlatformSnapshot): string {
  const plans = Object.entries(s.byPlan).map(([p, n]) => `${p}=${n}`).join(', ') || 'none';
  const codes = s.issues.byCode.map((c) => `${c.code}(${c.level})=${c.n}`).join(', ') || 'none';
  const levels = Object.entries(s.issues.byLevel).map(([l, n]) => `${l}=${n}`).join(', ') || 'none';
  const worst = s.issues.topOrgs.map((o) => `${o.name ?? 'unknown'}=${o.n}`).join(', ') || 'none';
  return [
    `Orgs: ${s.orgs} (suspended ${s.suspended})`,
    `Plans: ${plans}`,
    `This month: ${s.monthTokens} tokens, $${s.monthUsd.toFixed(4)}`,
    `Issues (last ${s.issues.windowHours}h): ${s.issues.total} total — ${levels}`,
    `Issue codes: ${codes}`,
    `Orgs with most errors: ${worst}`,
  ].join('\n');
}

export async function assistantReply(message: string, snap: PlatformSnapshot): Promise<{ reply: string; grounded: boolean; llm: boolean }> {
  const context = snapshotText(snap);
  const out = await llmComplete(SYSTEM, `Platform snapshot:\n${context}\n\nOperator: ${message}`, 500);
  if (out) return { reply: out, grounded: true, llm: true };

  // Deterministic fallback: answer from the snapshot directly.
  const lines = [
    "I can't reach a language model right now, so here's the raw platform snapshot:",
    '',
    context,
    '',
    'Set SUMMARY_MODEL + LITELLM_URL/master key to enable conversational answers.',
  ];
  return { reply: lines.join('\n'), grounded: true, llm: false };
}
