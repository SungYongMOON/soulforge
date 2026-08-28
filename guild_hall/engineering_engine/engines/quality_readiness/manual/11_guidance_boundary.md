# 11. Guidance boundary

Common chassis: [../11_guidance_layer.md](../11_guidance_layer.md).

E01 provides no recommendation, disposition, waiver, release, acceptance, or compliance
conclusion. `../guidance/quality_readiness_guidance.mjs` creates owner-review cards from the
deterministic state only: retain evidence, obtain/confirm evidence, resolve a missing binding or
observation, preserve a conflict, or retain an exact not-applicable basis. It does not choose
between conflict sides or translate source-native artifacts by resemblance.

The guidance signature is
`buildQualityReadinessGuidance({ effective_rule_set, typed_facts, assessment_run,
observation_projection })`. Guidance accepts an observation projection only when both its
assessment digest and Typed Facts digest match the fixed-point replay of that exact assessment
run. This is a pairing check, not a new approval or verdict.
Observation, guidance, RAG, and read-MCP boundaries each revalidate their complete upstream
receipt and recompute their emitted digest. MCP projects only the fixed read-only card fields and
the five allowlisted owner-review next actions; status calls carry the relevant predecessor
packet/envelope so the local dispatcher can replay the chain instead of trusting a standalone
digest. Payloads and unknown actions are refused.
Guidance carries that assessment's aggregate canon ceiling, which is clamped to the weakest
evaluated row and the verified Profile lane.
