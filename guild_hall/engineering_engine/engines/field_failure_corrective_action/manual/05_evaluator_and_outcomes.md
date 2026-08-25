# 05 — Evaluator and outcomes

The evaluator accepts a public-safe request directly, or under `typed_project_facts.request`
when invoked through the Core `evaluate` seam. It snapshots ordinary JSON-like data before
validation, rejects accessors/proxies, validates exact keys, and deep-freezes its result.

Outcome mapping is intentionally conservative:

| Input state | Result |
| --- | --- |
| Exact `not_applicable` basis | `not_applicable` |
| Unknown applicability or observation | `unknown` |
| Exactly two unresolved claims | `conflict` |
| Applicable confirmed absence | `missing` |
| Applicable present evidence with the rule's exact keys | `satisfied` |

`FFCA-CHANGE-01` adds `required`, `not_required`, and `unknown` branches. A required branch
keeps related-change and propagation-review references only. It does not inspect or approve the
underlying change.
