# 05 — Evaluator and outcomes

The Core `evaluate` adapter admits the strict `soulforge.typed_project_facts.v0` envelope
(`schema_version`, `project_binding_ref`, `facts`, `facts_digest`, `valid_at`, `known_at`),
where the public request is the single exact `facts[0]` observation. Bare requests and
request-wrapper hybrids (such as `typed_project_facts.request`) are refused by the Core adapter.
The package-local `assessFieldFailureCorrectiveAction` function directly assesses a validated
public request. Both paths snapshot ordinary JSON-like data before validation, reject
accessors/proxies, validate exact keys, and deep-freeze results.

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
