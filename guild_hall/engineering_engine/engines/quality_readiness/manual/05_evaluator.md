# 05. Evaluator

Common chassis: [../05_compiler_and_generator.md](../05_compiler_and_generator.md).

The deterministic evaluator validates the common manifest/binding, exact execution/source/rule-stage-Owner bindings, typed authority bindings, executable source-prerequisite context refs, and injected cutoff. It resolves all applicability components, retained conflict, typed authority, observation, confirmed absence, rule-specific sufficiency, and evaluated outcome in that order. It has no filesystem, network, model, ERP, task, or approval effect.

## Evaluation Boundary & Profile Ruleset Contract
Current E01 evaluator is bound exclusively to the accepted base ruleset (`soulforge.quality_readiness.ruleset.v0`). While the Quality Readiness Profile compiler compiles and validates bounded `{ op: "add", rule: ... }` Profile operations into derived rulesets with full provenance, the E01 evaluator adapter enforces an explicit compile-now/evaluate-after-binding boundary: evaluating derived Profile rulesets fails closed with `QR_PROFILE_EVALUATION_UNSUPPORTED` until downstream evaluation bindings are expanded.
