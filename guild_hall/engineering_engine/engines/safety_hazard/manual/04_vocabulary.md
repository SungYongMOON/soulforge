# 04. Vocabulary

`vocabulary/safety_hazard_vocabulary.mjs` owns closed severity, probability, risk, lifecycle,
presence, result-state, and evidence-field tokens. The engine validates a caller-provided risk
characterisation but deliberately does not derive a risk from a matrix: tailoring and
applicability remain outside this package.

The only result states are `satisfied`, `gap_missing`, `gap_unknown`, `gap_conflict`, and
`not_applicable`. The evaluator names canon and evidence claim ceilings separately and never
converts one into the other.
