# E01 Quality Readiness manual delta

Status: local implementation candidate only. This manual records the E01 domain delta; it does not
adopt source candidates, approve product quality, register a global MCP server, or activate a
production module.

Read the shared chassis first: [../README.md](../README.md).

1. [Purpose and shape](01_purpose_and_shape.md)
2. [Rule layers](02_rule_layers.md)
3. [Source derivation](03_source_derivation.md)
4. [Vocabulary](04_vocabulary.md)
5. [Evaluator](05_evaluator.md)
6. [Evidence trace](06_evidence_trace.md)
7. [Runs and receipts](07_runs_and_receipts.md)
8. [Decisions](08_decisions.md)
9. [Next work and handoff](09_next_work_and_handoff.md)
10. [Observation boundary](10_observation_boundary.md)
11. [Guidance boundary](11_guidance_boundary.md)
12. [Integration door](12_integration_door.md)
Appendix A. [Source/RAG/derivation strengthening contract v0](appendix_a_source_rag_derivation_strengthening_v0.md)

The current deepening topology is local to this package:
`../topology/quality_readiness_deepening_topology.mjs`. Its cross-package dependencies remain
explicitly deferred in
[the integration request](../contracts/quality_readiness_integration_request_v0.md).
