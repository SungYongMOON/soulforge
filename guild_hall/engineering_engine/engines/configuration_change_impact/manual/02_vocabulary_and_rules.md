# 02. Vocabulary and rules

The v0 vocabulary has nine ordered categories:

1. `requirements`
2. `bom` — generic parts-list/part-selection category, not a claim that every source calls it a BOM
3. `drawings`
4. `software`
5. `interfaces`
6. `tests`
7. `documents`
8. `baselines`
9. `closure_evidence`

Every request carries exactly one row per category. A category can be explicitly unaffected,
verified as propagated, still pending, unknown, or in conflict. Missing/duplicate/reordered
categories refuse the input rather than relying on an implicit default.

The caller supplies sorted seed-item references and a finite directed graph of typed dependency
facts. The graph module traverses those relationships deterministically, emits a shortest path
with both item and relationship refs for every reached item, and compares the computed
reachability with each category record. Every propagation, verification, and closure evidence
record must bind the exact full change-identity digest (including pre/post revision pins) and
path. A complete graph makes an absent path eligible for `not_affected`; an incomplete graph does
not.

For each accepted row, the evaluator emits a read-only propagation action: record no impact,
complete the graph, obtain analysis, complete propagation and verification, resolve a conflict,
or record verified propagation. It never executes that action.

The five fixed rules separately check change identity/baseline, coverage, decision evidence,
closure consistency, and deterministic graph traversal. Rule IDs and source locators are in
`rules/configuration_change_impact_rules.mjs`; source interpretation is owned by the source
packet, not by the evaluator.
