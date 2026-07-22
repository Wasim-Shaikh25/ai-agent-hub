# Data Processing Addendum — DRAFT

> ⚠️ **DRAFT SKELETON — not legal advice.** Have a lawyer review before use.
> Fill every `[PLACEHOLDER]`. Last updated: `[DATE]`.

This DPA forms part of the [Terms of Service](TERMS.md) between `[LEGAL ENTITY]`
("Processor", "we") and the Customer ("Controller"). It applies where we process
personal data contained in Customer Data on the Controller's behalf.

## 1. Roles
The Controller determines the purposes and means of processing; the Processor
processes personal data only on the Controller's documented instructions
(including via product configuration).

## 2. Scope & nature of processing
- **Subject matter:** provision of the Service.
- **Duration:** the term of the Agreement plus the deletion period.
- **Nature & purpose:** storing context/memory, retrieval, routing prompts to
  model providers, metering, and governance.
- **Data subjects:** the Controller's personnel and any individuals referenced in
  submitted code/prompts.
- **Data types:** `[as submitted by the Controller]`; the Controller is
  responsible for not submitting special-category data unless agreed.

## 3. Processor obligations
We will: (a) process only on documented instructions; (b) ensure personnel are
bound by confidentiality; (c) implement the security measures in Annex II;
(d) assist with data-subject requests and DPIAs as reasonable; (e) notify the
Controller without undue delay after becoming aware of a personal-data breach;
(f) delete or return personal data at the end of the Agreement.

## 4. Sub-processors
The Controller authorizes the sub-processors listed in Annex III (e.g.
`[HOSTING]`, `[DATABASE]`, `[PROVIDERS]`). We will inform the Controller of
changes with `[NOTICE]` and remain responsible for sub-processors' performance.

## 5. International transfers
`[Transfer mechanism, e.g. SCCs, where applicable.]`

## 6. Audits
We will make available information reasonably necessary to demonstrate compliance
and allow audits `[terms/limits]`.

## 7. Liability
Liability under this DPA is subject to the limitations in the Agreement.

---

### Annex I — Details of processing
`[Summarize §2 specifics.]`

### Annex II — Technical & organizational measures
Encryption in transit; role-based access control; tenant isolation via Row-Level
Security; audit logging; PII/secret redaction; configurable retention;
`LOG_PROMPTS=false` by default. `[Expand per SECURITY.md and actual deployment.]`

### Annex III — Approved sub-processors
| Sub-processor | Purpose | Location |
|---|---|---|
| `[HOSTING]` | compute/hosting | `[REGION]` |
| `[DATABASE]` | data storage | `[REGION]` |
| `[MODEL PROVIDERS]` | inference (at Controller's direction) | `[REGION]` |
