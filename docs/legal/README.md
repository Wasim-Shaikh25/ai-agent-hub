# Legal document drafts

> ⚠️ **These are DRAFT SKELETONS, not legal advice and not ready to publish.**
> They exist so you have a concrete starting point. **A qualified lawyer must
> review and finalize them for your jurisdiction and business** before you show
> them to any customer. Fill every `[PLACEHOLDER]`.

Because AI Agent Hub stores customers' **code, context, and memory** and forwards
prompts to model providers, you need — at minimum — before selling:

| Doc | Purpose |
|---|---|
| [`TERMS.md`](TERMS.md) | Terms of Service — the contract for using the product |
| [`PRIVACY.md`](PRIVACY.md) | Privacy Policy — what personal data you collect and why |
| [`DPA.md`](DPA.md) | Data Processing Addendum — you as processor of customer data |

Related posture already implemented in the product (reference these in the docs):
`SECURITY.md`, redaction (`REDACTION_ENABLED`), retention policies,
`LOG_PROMPTS=false`, tenant isolation (RLS), and `STORAGE_MODE=central`.
