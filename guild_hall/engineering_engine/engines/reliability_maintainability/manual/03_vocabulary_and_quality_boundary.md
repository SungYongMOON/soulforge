# Vocabulary and Quality separation

The closed E06 evidence kinds are `reliability_allocation_model`, `fmeca_record`,
`failure_repair_metric_record`, `maintainability_demonstration_record`,
`logistics_support_analysis`, `availability_analysis`, and `failure_closure_trace`.

They are domain semantic roles, not a new shared artifact vocabulary. `null` remains a distinct
source-native evidence statement; it is not the same as an empty list or an unknown token.

E06 refuses near-synonyms and Quality labels. It does not decide Quality evidence sufficiency,
inspection/acceptance, nonconformance disposition, MRB approval, workmanship, quality-system
effectiveness, or release. A fact may be referenced by both R&M and Quality only when its exact
Project Binding proves each domain’s independent role.
