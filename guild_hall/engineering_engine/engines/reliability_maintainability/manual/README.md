# E06 Reliability and Maintainability manual

Status: implementation candidate only. This manual describes a public-safe, deterministic
R&M evidence-readiness package. It does not adopt source candidates, decide applicability,
or authorize a project action.

1. [Purpose and shape](01_purpose_and_shape.md)
2. [Source derivation and RAG boundary](02_source_derivation.md)
3. [Vocabulary and Quality separation](03_vocabulary_and_quality_boundary.md)
4. [Rule layers and applicability](04_rule_layers.md)
5. [Compiler and Profile bindings](05_compiler_and_profile_bindings.md)
6. [Evaluator and error contract](06_evaluator_and_error_contract.md)
7. [Failure/repair metrics and availability](07_metrics_and_availability.md)
8. [FMECA linkage and closure gaps](08_fmeca_and_closure_gaps.md)
9. [Maintainability, spares, and support](09_maintainability_spares_support.md)
10. [Synthetic runs, replay, and zero-write](10_runs_replay_zero_write.md)
11. [Owner decisions and holds](11_decisions_and_holds.md)
12. [Integration door](12_integration_door.md)

Read the package [README](../README.md) and the exact
[source packet](../contracts/reliability_maintainability_source_packet_v0.md) before using a
rule or interpreting a result.
