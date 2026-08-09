/**
 * Deterministic, offline PII/secret redaction. Replaces detected secrets and
 * personal data with typed placeholders before context is stored or forwarded.
 */

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
  total: number;
}

interface Rule {
  type: string;
  re: RegExp;
  /** Optional guard — return false to skip a match (e.g. Luhn for cards). */
  accept?: (match: string) => boolean;
}

// Order matters: most specific / highest-risk first.
const RULES: Rule[] = [
  { type: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { type: 'secret', re: /\b(?:sk|rk)-[A-Za-z0-9]{20,}\b/g },
  { type: 'secret', re: /\bhub_[A-Za-z0-9]{16,}\b/g },
  { type: 'secret', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'secret', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  // key/secret/password assignments: redact the value only
  { type: 'secret', re: /((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?)([^\s"']{6,})/gi },
  { type: 'credit_card', re: /\b(?:\d[ -]?){13,19}\b/g, accept: luhnValid },
  { type: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'ipv4', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
];

/** Redacts secrets/PII in `input`, returning the cleaned text + match counts. */
export function redact(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = input;

  for (const rule of RULES) {
    text = text.replace(rule.re, (m, ...groups) => {
      // Assignment rule: keep the key/prefix (group 1), redact the value (group 2).
      const isAssignment = typeof groups[0] === 'string' && typeof groups[1] === 'string' && rule.re.source.includes('password');
      const candidate = isAssignment ? (groups[1] as string) : m;
      if (rule.accept && !rule.accept(candidate)) return m;
      counts[rule.type] = (counts[rule.type] ?? 0) + 1;
      const placeholder = `[REDACTED:${rule.type}]`;
      return isAssignment ? `${groups[0] as string}${placeholder}` : placeholder;
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total };
}

/** Luhn checksum — filters credit-card-shaped numbers that aren't valid cards. */
function luhnValid(candidate: string): boolean {
  const digits = candidate.replace(/[^\d]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
