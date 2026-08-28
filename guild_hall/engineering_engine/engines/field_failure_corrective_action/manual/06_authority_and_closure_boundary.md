# 06 — Authority and closure boundary

FFCA must never make quality disposition or technical change decisions. The evaluator refuses
`quality_disposition_ref`, `quality_disposition_approval_ref`,
`technical_change_approval_ref`, and closure-approval fields. It also never creates a writer,
task, ERP mutation, or external report.

The output always says that quality disposition, technical-change approval, and closure decision
are outside the engine. An action-owner reference is evidence of ownership assignment only; it
does not prove delegation or completion. A change reference is a linkage only; it does not prove
approval, implementation, or propagation sufficiency.

Closure readiness requires every base rule for the case to be `satisfied` or explicitly
`not_applicable`, including a closure-readiness row. The resulting
`ready_for_human_decision` still requires a qualified external human decision.
