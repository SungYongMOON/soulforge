# Evaluator states

For an applicable facet, `present + criteria_met` becomes `satisfied`.
Confirmed absence becomes `gap_missing`; unavailable evidence or evaluation
becomes `gap_unknown`; and `criteria_not_met` becomes `gap_conflict`. An
explicitly not-applicable facet needs an opaque basis reference.

Any gap returns overall `hold`. Only a non-empty set of satisfied applicable
facets with no gaps produces `build_start_evidence_ready_for_owner_review`.
The output contains an explicit `human_owner_review_required` boundary and no
build-start authorization field.
