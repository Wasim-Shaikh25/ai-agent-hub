export type Tier = 'trivial' | 'standard' | 'complex';

export const TIER_ORDER: Tier[] = ['trivial', 'standard', 'complex'];

const COMPLEX = /\b(design|architect|refactor|migrat\w*|debug|optimi\w*|security|secure|concurren\w*|distributed|scalab\w*|algorithm|multi-tenant|threat)\b/;
const TRIVIAL = /\b(typo|rename|reformat|format|indent|comment|import|semicolon|lint|spacing)\b/;

/**
 * Heuristic task classifier used when no explicit `x-hub-task` is supplied.
 * Cheap models for trivial edits, frontier models for architecture/security.
 */
export function classifyTask(text: string): Tier {
  const t = text.toLowerCase();
  const len = text.length;
  if (COMPLEX.test(t) || len > 400) return 'complex';
  if (TRIVIAL.test(t) || len < 60) return 'trivial';
  return 'standard';
}

/** The tier one step above `tier`, or undefined if already highest. */
export function nextTier(tier: Tier): Tier | undefined {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : undefined;
}
