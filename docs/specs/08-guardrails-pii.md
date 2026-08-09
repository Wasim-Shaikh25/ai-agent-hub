# Guardrails & PII Redaction Spec

> Status: **draft v1**

## 1. Goal

Strip secrets and PII **before** context is persisted and **before** prompts are
forwarded to a provider, so sensitive data never lands in the database or leaves
the network in plaintext.

## 2. What is detected

Pattern-based (fast, deterministic, offline):
- Secrets: API keys (`sk-…`, `hub_…`, AWS `AKIA…`), bearer tokens, private-key
  blocks, `password=`/`secret=` assignments.
- PII: emails, credit-card-shaped numbers (Luhn-checked), US SSN-shaped,
  phone numbers, IPv4.

Each match is replaced with a typed placeholder: `[REDACTED:email]`,
`[REDACTED:secret]`, etc. Extensible via a `redaction` policy with custom regex.

## 3. Where it runs

- **On store**: `memory_write`, `session_append`, `rag_index`, and any content
  write pass through `redact()` when `REDACTION_ENABLED=true`.
- **On forward**: gateway request bodies are scanned; policy chooses
  `redact` (replace) or `block` (reject with 422) on detection.

## 4. Config & policy

| Var | Default | Meaning |
|---|---|---|
| `REDACTION_ENABLED` | `true` | master switch |
| `REDACTION_MODE` | `redact` | `redact` or `block` on forward |

Policy `{ kind: "redaction", spec: { customPatterns: [...], mode } }` overrides
per org. Every redaction increments a metric and (optionally) an audit entry.

## 5. Verification

Unit-verifiable offline: feed strings containing an API key, email, and card
number → assert placeholders replace them and Luhn-invalid numbers are left
alone. Round-trip a `memory_write` and confirm the stored row is redacted.
