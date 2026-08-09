# Privacy Policy — DRAFT

> ⚠️ **DRAFT SKELETON — not legal advice.** Have a lawyer review before use.
> Fill every `[PLACEHOLDER]`. Last updated: `[DATE]`.

`[LEGAL ENTITY]` ("we") operates `[PRODUCT NAME]`. This policy explains what
personal data we collect and how we handle it.

## 1. Data we collect
- **Account data:** name, email, organization, authentication identifiers.
- **Billing data:** processed by `[PAYMENT PROCESSOR]`; we store limited billing
  metadata, not full card numbers.
- **Usage data:** API usage, model/token counts, cost, request metadata, and
  operational events (errors, latency) for running and securing the Service.
- **Customer Data you submit:** code, prompts, context, and memory. We treat this
  as confidential and process it to provide the Service. See the [DPA](DPA.md).

## 2. How we use data
To provide, secure, meter, bill for, and improve the Service, and to communicate
with you. We `[do / do not]` train models on your Customer Data. Prompt bodies are
not stored when `LOG_PROMPTS` is disabled (the default).

## 3. Redaction & minimization
We apply PII/secret redaction (`REDACTION_ENABLED`) before storage and before
forwarding to model providers, and retain data per your configured retention
policy.

## 4. Sharing & sub-processors
We share data with sub-processors only as needed to run the Service, e.g.:
`[HOSTING]`, `[DATABASE]`, `[PAYMENT PROCESSOR]`, and the model providers you
direct us to call (`[PROVIDERS]`). A current list lives at `[URL]`.

## 5. International transfers
`[If applicable: transfer mechanisms such as SCCs.]`

## 6. Retention & deletion
We retain data per your settings and legal requirements, and delete it on request
or account closure within `[PERIOD]`.

## 7. Security
See `SECURITY.md`. Measures include encryption in transit, RBAC, tenant isolation
(RLS), audit logging, and redaction. No system is perfectly secure.

## 8. Your rights
Depending on your jurisdiction you may have rights to access, correct, delete, or
port your personal data. Contact `[PRIVACY EMAIL]`. For Customer Data, the
Customer (your employer) is the controller.

## 9. Children
The Service is not directed to children under `[AGE]`.

## 10. Changes
We will post updates here and notify you of material changes.

## 11. Contact
`[PRIVACY EMAIL]`, `[LEGAL ENTITY]`, `[ADDRESS]`.
