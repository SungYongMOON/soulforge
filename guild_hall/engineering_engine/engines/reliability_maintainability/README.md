# Reliability and Maintainability Domain Engine (E06)

Status: `candidate`. Claim ceiling: `source_supported` at most. This package is a
deterministic, read-only R&M evidence-readiness engine. It is not a reliability
calculation service, quality evaluator, source-adoption action, project acceptance gate,
repair/release authority, or spares procurement tool.

## What it evaluates

Against an exact Project Binding, the base candidate rules report only whether evidence
for seven R&M topics is sufficient, missing, unknown, conflicting, or not applicable:

1. reliability allocation/prediction/model evidence;
2. FMECA configuration/change linkage;
3. failure and repair metric definition/basis;
4. maintainability demonstration evidence;
5. maintenance support, spares, and support-equipment analysis;
6. availability classification/model/result evidence; and
7. failure-to-FMECA/action/verification/closure trace gaps.

The output does not calculate a metric, infer a target, choose `Ai` versus `Ao`, decide a
criticality, close a risk, approve a repair, buy a spare, or say a product is acceptable.
Those are separate project/authority decisions.

## Package shape

- [Source packet](contracts/reliability_maintainability_source_packet_v0.md) — two direct,
  public NASA sources; source modality and applicability gates.
- [Rules and domain vocabulary](rules/reliability_maintainability_rules.mjs) — seven base
  candidates plus closed R&M evidence kinds. These are not Quality artifact aliases.
- [Compiler Adapter](compiler/reliability_maintainability_compiler_adapter.mjs) — Core
  Profile Binding conformance; only additive, source-bound Profile rules.
- [Evaluator Adapter](evaluator/reliability_maintainability_evaluator_adapter.mjs) and
  [evaluator](evaluator/reliability_maintainability.mjs) — accepts one exact Core Typed Facts
  envelope, revalidates Core facts digest/project/binding/time/cutoff links, and binds the
  admitted effective-ruleset identity into result/receipt digests. Derived Profile rules remain
  `HOLD` until separately reviewed.
- [Public synthetic fixture](fixtures/reliability_maintainability_public_synthetic.mjs),
  [tests](tests/), and [zero-write runner](tools/reliability_maintainability_runner.mjs).
- [Manual](manual/README.md), [local topology](topology/reliability_maintainability_topology.json),
  and [integration request](contracts/reliability_maintainability_integration_request_v0.md).

## Source and applicability boundary

The candidate cites [NASA-STD-8729.1A](https://standards.nasa.gov/standard/nasa/nasa-std-87291)
and [GSFC-HDBK-8004](https://standards.nasa.gov/standard/GSFC/GSFC-HDBK-8004) only through
public-safe locators and paraphrases. Their public availability is not evidence that they
apply to an arbitrary project. Any source invocation, tailoring, threshold, metric time basis,
authority route, or project fact missing from the exact Project Binding produces
`UNKNOWN/HOLD` rather than an invented conclusion.

## Local validation surface

Run the package-local deterministic checks from the repository root:

```text
node --check guild_hall/engineering_engine/engines/reliability_maintainability/rules/reliability_maintainability_rules.mjs
node --check guild_hall/engineering_engine/engines/reliability_maintainability/compiler/reliability_maintainability_compiler_adapter.mjs
node --check guild_hall/engineering_engine/engines/reliability_maintainability/evaluator/reliability_maintainability.mjs
node --check guild_hall/engineering_engine/engines/reliability_maintainability/evaluator/reliability_maintainability_admission.mjs
node --check guild_hall/engineering_engine/engines/reliability_maintainability/evaluator/reliability_maintainability_evaluator_adapter.mjs
node --test guild_hall/engineering_engine/engines/reliability_maintainability/tests/*.test.mjs
```

The runner prints one public-synthetic result to stdout and writes no caller-directory files:

```text
node guild_hall/engineering_engine/engines/reliability_maintainability/tools/reliability_maintainability_runner.mjs
```

Shared `package.json`, whole-engine manifests/topology/release surfaces, Core, and Profile
schemas are intentionally not changed here. See the integration request for the sequential
factory-manager handoff.
