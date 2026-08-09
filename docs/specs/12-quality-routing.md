# Quality-Based Routing Spec

> Status: **draft v1**

## 1. Goal

Go beyond `task → model` (already shipped) to route on *intent and quality*:
cheap models for trivial edits, frontier models for architecture/refactor,
with automatic escalation when a cheap answer looks weak.

## 2. Routing signals

1. **Task label** — `x-hub-task` header (shipped).
2. **Heuristic classifier** — infer a task class from the request when no label
   is given: keywords + message length → `trivial | standard | complex`.
3. **Escalation** — if the primary (cheap) response is empty, too short, or the
   model returns low confidence, retry once on the next tier (reuses the
   fallback chain machinery).

## 3. Policy

`{ kind: "quality", spec: { tiers: { trivial: "gpt-4o-mini",
standard: "claude-sonnet", complex: "claude-opus" }, escalateOnShort: 40 } }`

The classifier picks a tier; the tier picks the model; the fallback chain and
budgets still apply on top.

## 4. Verification

Feed a trivial prompt ("fix typo") and a complex one ("design a multi-tenant
auth system") with no task header → assert the trivial one is served by the
cheap tier and the complex one by the frontier tier (`x-hub-model` header).
Force a too-short cheap response → assert escalation to the next tier.
