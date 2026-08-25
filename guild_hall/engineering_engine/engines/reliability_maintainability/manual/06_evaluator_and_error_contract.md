# Evaluator and error contract

The evaluator’s root input is exactly `manifest`, `binding`, `domain_input`, and `cutoffs`.
It accepts public-safe exact refs and metadata only. The module/source/ruleset/adapter/source
metadata/body/rule-stage-owner bindings must be exact and non-floating.

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
