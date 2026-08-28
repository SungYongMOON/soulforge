# 05. Evaluator

Common chassis: [../05_compiler_and_generator.md](../05_compiler_and_generator.md).

The deterministic evaluator validates the common manifest/binding, exact execution/source/rule-stage-Owner bindings, typed authority bindings, executable source-prerequisite context refs, and injected cutoff. It resolves all applicability components, retained conflict, typed authority, observation, confirmed absence, rule-specific sufficiency, and evaluated outcome in that order. It has no filesystem, network, model, ERP, task, or approval effect.

## Evaluation Boundary & Profile Ruleset Contract

The evaluator now accepts a derived E01 ruleset only through a Core-assembled effective-rule-set
wrapper and the domain-local Core Typed Facts envelope
(`../binding/quality_readiness_typed_facts.mjs`). It verifies the derived ruleset digest, exact
source packet/ruleset pins, Profile-source binding, and per-Profile Core compilation trace before
assessment. A direct convenience request remains compatible for the base ruleset only.

Before those semantics, the QR boundary copies descriptor-backed ordinary data only. It refuses
Proxies, accessors, symbols, prototype-sensitive keys, shared/cyclic graphs, sparse/custom
arrays, non-finite numbers, and hybrid base/Typed-Facts wrappers. The Typed Facts receipt binds
the admitted manifest, binding, cutoffs, project/time pins, fact rows, and full trace; it is not a
rows-only checksum.

`verifyQualityReadinessAssessmentResultShape(result)` remains structural and output-only. The
public fixed verifier is
`verifyQualityReadinessAssessmentResult(result, { effective_rule_set, typed_facts })` from the
evaluator adapter. It requires the complete six-key Core assembly and the exact four-key Typed
Facts envelope, then accepts exactly one complete deterministic replay: empty Core cutoffs or an
object-distinct exact clone of the envelope cutoffs. This binds every receipt digest and binding
field without adding an authentication artifact.

Every derived rule still needs an explicit sorted Owner acceptance binding and a separately pinned
direct source record. A missing/mixed/forged Profile source binding, stale Typed Facts digest, or
trace mismatch fails closed; no RAG locator may satisfy that requirement.

Self-declared official-public Profile bindings remain observed. Profile-level
`source_supported` promotion is unavailable/HOLD for this slice, even when a caller names one of
the three proof-subset IDs or supplies matching-looking refs. It requires a separately
Owner-accepted package-owned metadata/body/status/locator binding contract; this package does
not invent that authority.

The public-synthetic lane is structurally separate: every Profile source binding must declare
`source_lane: public_synthetic`, retain the `observed` claim ceiling, and run under a
public-synthetic-only manifest classification. It cannot mix with official-public bindings or
claim real source support/project authority.

The domain-result and assessment canon ceiling is the weakest evaluated row ceiling and is also
clamped by the verified Profile lane. Therefore a public-synthetic derived run remains
`observed` overall even when its selected rows are all packet-bound proof-subset rows; separate
official-only base evaluation remains `source_supported`.
