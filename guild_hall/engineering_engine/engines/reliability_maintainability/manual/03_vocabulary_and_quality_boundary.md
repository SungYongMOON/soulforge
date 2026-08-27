# Vocabulary and Quality separation

The closed E06 evidence kinds are `reliability_allocation_model`, `fmeca_record`,
`failure_repair_metric_record`, `maintainability_demonstration_record`,
`logistics_support_analysis`, `availability_analysis`, and `failure_closure_trace`.

They are domain semantic roles, not a new shared artifact vocabulary. `null` remains a distinct
source-native evidence statement; it is not the same as an empty list or an unknown token.
Because Core `adaptProjectEvidence` strips literal nulls, source-native null is transported in
`TypedProjectFacts` rows as `evidence_kind_projection: 'source_native'` with `evidence_kind` absent.
The transport marker `evidence_kind_projection` is adapter transport only, never a direct domain row
or evaluator output, and does not grant authority. Direct domain request rows must continue to require
literal `evidence_kind` (including literal `null`) and reject `evidence_kind_projection`.

E06 refuses near-synonyms and Quality labels. It does not decide Quality evidence sufficiency,
inspection/acceptance, nonconformance disposition, MRB approval, workmanship, quality-system
effectiveness, or release. A fact may be referenced by both R&M and Quality only when its exact
Project Binding proves each domain’s independent role.
