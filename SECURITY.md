# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public
issue). We aim to acknowledge within 3 business days.

## Security posture

- **Auth**: API keys (sha256-hashed at rest) or SSO session JWTs (HS256). Keys
  carry an optional role override; roles are enforced on every route and MCP tool.
- **Tenant isolation**: every row is scoped by `org_id` in the query layer;
  Row-Level Security (migration 005) adds DB-enforced isolation as defense-in-depth.
- **Secrets & PII**: pattern-based redaction strips secrets/PII before storage
  and before forwarding to any provider. Prompt bodies are not logged
  (`LOG_PROMPTS=false`).
- **Transport**: security headers via helmet (HSTS, X-Frame-Options, nosniff);
  run behind TLS in production.
- **Rate limiting**: per-key limits to prevent abuse.
- **Data residency**: self-host in your VPC so context never leaves your network;
  right-to-be-forgotten (`/api/privacy/purge`) and retention sweeps supported.
- **Audit**: governance-relevant actions are recorded in an append-only audit log.

## Dependencies

Provider keys and signing secrets are supplied via environment variables, never
committed. `@xenova/transformers` (MiniLM) is an optional dependency.
