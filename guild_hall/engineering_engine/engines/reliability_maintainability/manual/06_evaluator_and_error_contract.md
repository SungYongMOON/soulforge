# Evaluator and error contract

The direct evaluator subject receives exactly `manifest`, `binding`, `domain_input`, and
`cutoffs`. Its Core Adapter refuses a legacy raw `{ request }` wrapper. Instead it admits one
actual `soulforge.typed_project_facts.v0` envelope containing one closed R&M request fact,
recomputes the Core facts digest, binds project identity and binding revision, and requires
outer/fact cutoff times to match. Because Core `adaptProjectEvidence` strips literal nulls,
source-native null is transported in `TypedProjectFacts` rows using
`evidence_kind_projection: 'source_native'` (with `evidence_kind` absent). Adapter admission
restores this transport marker to `evidence_kind: null` for evaluator processing. The marker
`evidence_kind_projection` is adapter transport only, never a direct domain row or evaluator
output, and does not grant authority. Direct domain-input rows require explicit `evidence_kind`
(including literal `null`) and reject `evidence_kind_projection`. Typed Facts and the effective
ruleset are deeply snapshotted before any property read, so Proxy/getter/symbol/alias/cycle/custom-prototype
inputs return closed R&M errors with zero trap execution.

The module/source/ruleset/adapter/source metadata/body/rule-stage-owner bindings must be exact
and non-floating. The admitted effective-ruleset ref/digest is carried into assessment, domain
result, and receipt; a forged effective argument cannot share a legitimate receipt.

For each accepted rule, evaluation precedence is:

1. false applicability → `not_applicable` with basis;
2. unknown applicability → `gap_unknown`;
3. missing prerequisite context → `gap_unknown`;
4. missing typed authority → `gap_unknown` plus `authority_hold`;
5. retained source conflict → `gap_conflict`;
6. unavailable observation → `gap_unknown`;
7. confirmed absence → `gap_missing`; and
8. present, evaluated criteria-met evidence → `satisfied`.

Malformed input is rejected with a closed error code rather than reinterpreted as an evidence
gap. This prevents broken source/binding data from masquerading as `UNKNOWN`.
