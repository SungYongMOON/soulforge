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
| Source boundary | [source packet](contracts/calibration_measurement_validity_source_packet_v0.md) |
| Schema / vocabulary | [schema](schemas/calibration_measurement_validity_schema_v0.json), [rules](rules/calibration_measurement_validity_rules.mjs) |
| Core adapters | [compiler](compiler/calibration_measurement_validity_compiler_adapter.mjs), [evaluator adapter](evaluator/calibration_measurement_validity_evaluator_adapter.mjs) |
| Deterministic evaluator | [evaluator](evaluator/calibration_measurement_validity.mjs) |
| Synthetic proof | [fixture](fixtures/calibration_measurement_validity_public_synthetic.mjs), [test](tests/calibration_measurement_validity.test.mjs), [runner](tools/calibration_measurement_validity_runner.mjs) |
| Local topology / manifest | [topology](topology/local_topology.md), [manifest factory](topology/calibration_measurement_validity_module_manifest.mjs) |
| Integration boundary | [integration request](integration_request.md) |

## Focused validation

```text
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/rules/calibration_measurement_validity_rules.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/compiler/calibration_measurement_validity_compiler_adapter.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/evaluator/calibration_measurement_validity.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/evaluator/calibration_measurement_validity_evaluator_adapter.mjs
node --check guild_hall/engineering_engine/engines/calibration_measurement_validity/tools/calibration_measurement_validity_runner.mjs
node --test guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity.test.mjs
```

The root package script and whole-engine manifest are intentionally not changed by this worker. The factory integration lane owns the additions named in [integration_request.md](integration_request.md).
