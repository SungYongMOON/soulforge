# Calibration and Measurement Validity Domain Engine

Status: implementation candidate (`source_supported`)
Execution: deterministic-only, public-synthetic, zero-write
Domain ID: `calibration_measurement_validity`

This package reports the validity state of supplied measurement evidence at a supplied test time. It is a Domain Engine Adapter for the existing Engineering Engine Core; it does not modify Core, profile schemas, release manifests, or any project workspace.

## What it reports

- instrument identity evidence;
- calibration status and due-time relationship to the test time;
- requested versus calibrated range, accuracy, and expanded-uncertainty suitability when like-unit numeric facts are supplied;
- separate traceability and environmental-condition evidence;
- exception-held evidence; and
- a derived result impact of `none`, `hold`, or `invalidate`.

Q1 deepening also classifies direct public sources versus RAG-only or controlled references, evaluates limited source-bound Core Profiles, binds all six fact families to immutable source provenance, emits observation candidates and deterministic guidance, and exposes an unregistered read-only MCP adapter plus a public-synthetic zero-write pilot.

Missing evidence remains `missing` or `unknown`. A supplied expired, out-of-range, out-of-service, unsuitable, or unapproved-exception fact cannot become valid through inference.

## What it never does

- set, extend, or recommend a calibration interval;
- issue calibration or traceability claims;
- calculate a measurement uncertainty or convert units;
- approve an exception or a product disposition;
- read project records, calibration certificates, RAG output, paths, secrets, or external services; or
- write files or mutate external state.

## Package map

| Area | Owner-local artifact |
| --- | --- |
| Descriptor | [engine.yaml](engine.yaml) |
| Source boundary | [source packet](contracts/calibration_measurement_validity_source_packet_v0.md), [source/RAG/Profile contract](contracts/source_rag_profile_v1.md), [classifier](source/calibration_measurement_validity_source_classification.mjs) |
| Schema / vocabulary | [base schema](schemas/calibration_measurement_validity_schema_v0.json), [source-bound schema](schemas/calibration_measurement_validity_source_bound_schema_v1.json), [rules](rules/calibration_measurement_validity_rules.mjs) |
| Core adapters | [compiler](compiler/calibration_measurement_validity_compiler_adapter.mjs), [evaluator adapter](evaluator/calibration_measurement_validity_evaluator_adapter.mjs) |
| Source-bound depth | [derivation](derivation/calibration_measurement_validity_source_derivation.mjs), [Profile](profile/calibration_measurement_validity_source_bound_profile.mjs), [Typed Facts](typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs) |
| Receipt lineage / ingress | [canonical digest](shared/calibration_measurement_validity_canonical_digest.mjs) plus the E11-only [safe snapshot](shared/calibration_measurement_validity_safe_snapshot.mjs) used before caller-owned graphs are read |
| Deterministic evaluator | [evaluator](evaluator/calibration_measurement_validity.mjs) |
| Observation / guidance / MCP | [observation](observation/calibration_measurement_validity_observation.mjs), [guidance](guidance/calibration_measurement_validity_guidance.mjs), [read-only MCP](mcp/calibration_measurement_validity_read_only_mcp.mjs) |
| Synthetic proof | [base test](tests/calibration_measurement_validity.test.mjs), [Q1 test](tests/calibration_measurement_validity_q1.test.mjs), [runner](tools/calibration_measurement_validity_runner.mjs), [Q1 pilot](tools/calibration_measurement_validity_zero_write_pilot_runner.mjs) |
| Local topology / manifest | [topology](topology/local_topology.md), [manifest factory](topology/calibration_measurement_validity_module_manifest.mjs) |
| Integration boundary | [integration request](integration_request.md) |

## Focused validation

```text
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/rules/calibration_measurement_validity_rules.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/compiler/calibration_measurement_validity_compiler_adapter.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/evaluator/calibration_measurement_validity.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/evaluator/calibration_measurement_validity_evaluator_adapter.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/tools/calibration_measurement_validity_runner.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/source/calibration_measurement_validity_source_classification.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/profile/calibration_measurement_validity_source_bound_profile.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/observation/calibration_measurement_validity_observation.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/guidance/calibration_measurement_validity_guidance.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/mcp/calibration_measurement_validity_read_only_mcp.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/shared/calibration_measurement_validity_safe_snapshot.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/tools/calibration_measurement_validity_zero_write_pilot_runner.mjs
node --test guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity.test.mjs
node --test guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity_q1.test.mjs
```

The root package script and whole-engine manifest are intentionally not changed by this worker. The factory integration lane owns the additions named in [integration_request.md](integration_request.md).
