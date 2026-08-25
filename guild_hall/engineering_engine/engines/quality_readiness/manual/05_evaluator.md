# 05. Evaluator

Common chassis: [../05_compiler_and_generator.md](../05_compiler_and_generator.md).

The deterministic evaluator validates the common manifest/binding, exact execution/source/rule-stage-Owner bindings, typed authority bindings, executable source-prerequisite context refs, and injected cutoff. It resolves all applicability components, retained conflict, typed authority, observation, confirmed absence, rule-specific sufficiency, and evaluated outcome in that order. It has no filesystem, network, model, ERP, task, or approval effect.

## Evaluation Boundary & Profile Ruleset Contract

The evaluator now accepts a derived E01 ruleset only through a Core-assembled effective-rule-set
wrapper and the domain-local Core Typed Facts envelope
(`../binding/quality_readiness_typed_facts.mjs`). It verifies the derived ruleset digest, exact
source packet/ruleset pins, Profile-source binding, and per-Profile Core compilation trace before
assessment. A direct convenience request remains compatible for the base ruleset only.

Every derived rule still needs an explicit sorted Owner acceptance binding and a separately pinned
direct source record. A missing/mixed/forged Profile source binding, stale Typed Facts digest, or
trace mismatch fails closed; no RAG locator may satisfy that requirement.

The public-synthetic lane is structurally separate: every Profile source binding must declare
`source_lane: public_synthetic`, retain the `observed` claim ceiling, and run under a
public-synthetic-only manifest classification. It cannot mix with official-public bindings or
claim real source support/project authority.

The domain-result and assessment canon ceiling is the weakest evaluated row ceiling and is also
clamped by the verified Profile lane. Therefore a public-synthetic derived run remains
`observed` overall even when its selected rows are all packet-bound proof-subset rows; separate
official-only base evaluation remains `source_supported`.
