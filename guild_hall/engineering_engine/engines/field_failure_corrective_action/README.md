# Field Failure and Corrective Action Domain Engine

`field_failure_corrective_action` is a deterministic, public-safe candidate Domain Engine for
evidence-readiness checks around field failures, NCRs, and CARs. It does not replace the
Engineering Engine Core, establish project applicability, or make a compliance conclusion.

## Scope

- Intake, containment, root-cause, action-owner, effectiveness, recurrence, related-change,
  and closure-readiness evidence checks.
- Exact reference preservation for configuration, test, affected lot, affected asset, and
  evidence-receipt links.
- A Core compiler/evaluator adapter, public-synthetic fixture, hostile/replay tests, zero-write
  runner, module-manifest factory, and domain-local topology.

## Hard boundaries

- Quality disposition, technical-change approval, release, waiver, repair, and final case
  closure are outside this engine. The only closure result is
  `ready_for_human_decision` or `not_ready`.
- The engine reads no files, network resources, RAG output, model output, or project payload.
  Its public fixture contains opaque synthetic reference tokens only.
- Base rules are source-supported candidates. Every project must bind its own exact source
  revision, applicability, authority, and evidence before a human can use any result.

## Package map

| Area | Owner-local content |
| --- | --- |
| `contracts/` | Source boundary, executable domain contract, and shared integration request |
| `schemas/` | Public request-shape documentation |
| `rules/` | Vocabulary, source inventory, and candidate evidence rules |
| `compiler/` | Core-compatible compiler adapter |
| `evaluator/` | Pure assessment and Core-compatible evaluator adapter |
| `fixtures/` | One public-synthetic multi-state request |
| `tests/` | Deterministic, hostile, replay, Core-conformance, and runner tests |
| `tools/` | JSON-only zero-write demonstration runner |
| `topology/` | Module-manifest factory and domain-local topology |
| `manual/` | Operator and maintainer guide |

## Local verification

```text
node --test guild_hall/engineering_engine/engines/field_failure_corrective_action/tests/*.test.mjs
node guild_hall/engineering_engine/engines/field_failure_corrective_action/tools/field_failure_corrective_action_runner.mjs
```

The factory integration lane, not this package, owns global manifest, topology, release, and
root-script registration. See
[`contracts/field_failure_corrective_action_integration_request_v0.md`](contracts/field_failure_corrective_action_integration_request_v0.md).
