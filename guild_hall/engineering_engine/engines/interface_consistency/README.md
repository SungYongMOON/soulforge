# E02 Interface Consistency Domain Engine

Status: implementation candidate. This package deterministically compares
public-safe, typed interface facts. It does not certify a project, establish
standard compliance, read a drawing/ICD/ERP record, or activate a live binding.

## Scope

The engine owns a scalable interface register and pairwise checks for:

- electrical;
- signal;
- data/protocol;
- mechanical;
- timing;
- revision alignment; and
- bilateral agreement.

An interface can have 2-16 named ends; every assessment carries a stable pair-keyed
outcome entry for every end pair, without copying actual compared values into findings. A Project Binding or
Typed Facts producer, not this package, supplies actual project rows and decides
which categories/attributes are applicable.

Every deterministic assessment includes a bounded receipt with input, domain-ruleset,
and assessment SHA-256 digests. The receipt exposes only safe envelope provenance and
the digest of an admitted cutoff pair when it is already part of a Typed Facts envelope;
it never echoes compared values, cutoff timestamps, or project payload.

The assessment JSON Schema is a closed structural contract. Dynamic equality between
admitted input identities and its assessment/pair map is enforced by the package-local
`verifyInterfaceConsistencyAssessment(typedFacts, result, effectiveRuleSet)` verifier
before the evaluator returns a result; the effective ruleset argument is mandatory.

## Package surface

| surface | owner |
| --- | --- |
| `engine.yaml` | domain descriptor |
| `contracts/` | source boundary and integration request |
| `schemas/` | public-safe input, effective-ruleset, and assessment shapes |
| `rules/` | bounded source-linked structural checks |
| `compiler/` | Profile applicability adapter |
| `evaluator/` | pure pairwise evaluator and Core adapter |
| `fixtures/`, `tests/`, `tools/` | synthetic proof and zero-write runner |
| `manual/`, `topology/` | operational description and local manifest |

## Local validation

```text
node --test guild_hall/engineering_engine/engines/interface_consistency/tests/interface_consistency.test.mjs guild_hall/engineering_engine/engines/interface_consistency/tests/interface_consistency_compiler.test.mjs
node guild_hall/engineering_engine/engines/interface_consistency/tools/interface_consistency_runner.mjs
```

No root script, shared Core registration, whole-engine manifest, or release file is
changed in this domain lane. See the local [integration request](contracts/interface_consistency_integration_request_v0.md).

Read the [manual](manual/README.md) before applying the adapter.
