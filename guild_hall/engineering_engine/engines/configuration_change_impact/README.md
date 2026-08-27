# Configuration Change Impact Domain Engine

This candidate Domain Engine deterministically propagates one Core-bound controlled change through
an explicit typed dependency graph and evaluates complete impact coverage across requirements,
BOM/parts-list records, drawings, software, interfaces, tests, documents, baselines, and
change-bound closure evidence.

It is a public-safe, source-supported candidate only. It does not access project material,
infer an impact, decide project applicability, approve a change, modify a baseline, release a
document, or close work.

## Package map

- `contracts/` — source inventory, direct derivation, input/output/error contract
- `schemas/` and `rules/` — closed vocabulary and deterministic rule references
- `compiler/` and `evaluator/` — existing Core Adapter implementations, including the actual
  Project Binding → Typed Facts admission seam
- `fixtures/`, `tests/`, and `tools/` — public-synthetic fixture, hostile/replay coverage, and
  stdout-only runner
- `manual/` — operating boundary and integration guidance
- `topology/` and `integration/` — local package topology, candidate manifest factory, and the
  request for the sequential shared integration lane

Run the focused deterministic suite from the repository root:

```text
node --test guild_hall/engineering_engine/engines/configuration_change_impact/tests/configuration_change_impact.test.mjs guild_hall/engineering_engine/engines/configuration_change_impact/tests/configuration_change_impact_hostile_replay.test.mjs guild_hall/engineering_engine/engines/configuration_change_impact/tests/propagation_graph.test.mjs
```

The runner is deliberately read-free and write-free except for deterministic JSON emitted to
stdout. It exercises `createProjectBindingAdapter(...).adaptEvidence(...)` before evaluation,
then verifies project/Profile/change identity pins against the Effective Rule Set:

```text
node guild_hall/engineering_engine/engines/configuration_change_impact/tools/configuration_change_impact_runner.mjs
```

See [the manual](manual/README.md) and [the source packet](contracts/configuration_change_impact_source_packet_v0.md) for the exact limits.
