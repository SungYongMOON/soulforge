# Safety and Hazard Domain Engine (E07)

Status: `candidate`. Claim ceiling: `source_supported` at most.

This package evaluates only whether caller-supplied, exact evidence references are present and
coherently bound for the following review topics:

- hazard identity;
- severity, probability, and risk characterisation;
- mitigation and risk-reduction verification;
- residual-risk review evidence;
- named human acceptance-authority and written-record evidence;
- life-cycle status and closure-evidence traceability.

It never accepts a residual risk, decides whether a human has authority, validates a signature,
closes a hazard, calculates an applicable risk matrix, or declares compliance/release. It rejects
AI/engine authority roles and emits zero external effects.

## Package entry points

- [Source packet](contracts/safety_hazard_source_packet_v0.md) — direct-source inventory,
  applicability, and RAG boundary.
- [Rules](rules/safety_hazard_rules.mjs) and [vocabulary](vocabulary/safety_hazard_vocabulary.mjs)
  — public-safe candidate metadata and closed tokens.
- [Compiler adapter](compiler/safety_hazard_compiler_adapter.mjs) — Core Profile-aware base and
  bounded derived-ruleset compiler.
- [Evaluator](evaluator/safety_hazard.mjs) — `assessSafetyHazard({ manifest, binding,
  domain_input, cutoffs })`.
- [Synthetic fixture](fixtures/safety_hazard_public_synthetic.mjs) and
  [tests](tests/) — replay, hostile-input, Core-conformance, and zero-write proof.
- [Manual](manual/README.md) and [integration request](topology/safety_hazard_integration_request_v0.md).

Run the package-focused checks with:

```text
node --test guild_hall/engineering_engine/engines/safety_hazard/tests/safety_hazard.test.mjs guild_hall/engineering_engine/engines/safety_hazard/tests/safety_hazard_compiler.test.mjs
node guild_hall/engineering_engine/engines/safety_hazard/tools/safety_hazard_runner.mjs
```

The runner imports public literals only and writes deterministic JSON to stdout. It does not read
the official source PDF or any project workspace at runtime.
