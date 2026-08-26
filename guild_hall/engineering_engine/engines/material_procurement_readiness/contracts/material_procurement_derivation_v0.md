# Material Procurement Deterministic Derivation v0

The evaluator derives a candidate readiness state from admitted facts only:

1. compare required and available quantities;
2. count only qualifying net open supply;
3. select confirmed, promised, then planned inbound date without recalculation;
4. expose a calendar-day lead-time checkpoint when its supplied fields exist; and
5. report receipt progress without turning it into inventory coverage.

Each row emits a deterministic `decision_basis` with stable candidate rule IDs, fact-field names,
unknown/missing names, unioned source IDs, source packet pin, and the explicit marker
`soulforge_candidate_interpretation_not_source_authored_rule`.

This trace explains Soulforge's candidate interpretation; Microsoft, OASIS, and Oracle do not
define Soulforge readiness states.
