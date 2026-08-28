# Field Failure and Corrective Action Domain Contract v0

## Decision question

> Given an exact project binding, which FFCA evidence rows are satisfied, missing, unknown,
> conflicting, or explicitly not applicable, and is a case ready for a **human** closure decision?

This is a deterministic evidence-readiness question. It is not a quality disposition,
compliance, technical-change approval, release, waiver, repair, report submission, or final
closure decision.

## Core interface conformance

The package supplies the existing Core `Domain Engine Adapter` contract:

```text
compile(profile_bindings, compilation_scope)
evaluate(effective_rule_set, typed_project_facts, authority, cutoffs)
```

- The compiler preserves Core-validated identity-only Organization/Project Profile provenance.
  FFCA v0 rejects non-empty profile operations rather than silently applying unreviewed tailoring.
- The evaluator verifies the exact base ruleset/source-packet reference and admits the
  strict Core `typed_project_facts` envelope (`schema_version`, `project_binding_ref`, `facts`,
  `facts_digest`, `valid_at`, `known_at`), where the public request is the single exact
  `facts[0]` observation. Bare requests and request-wrapper hybrids are refused by the Core
  adapter. Direct `assessFieldFailureCorrectiveAction` evaluation remains available for
  package-local public request evaluation.
- No Core file, profile schema, registry, writer, or source adapter is changed by this package.

## Input and evidence contract

The executable request schema is `soulforge.field_failure_corrective_action.request.v0`.

| Input layer | Required content | Rule |
| --- | --- | --- |
| `binding` | Project binding reference; exact FFCA source packet/ruleset references; three source bindings with non-floating revision and applicability references | A public source ID alone is not applicability. |
| `cutoffs` | Canonical `valid_at` and `known_at` UTC instants | No implied current time. |
| row identity | `row_id`, `case_id`, `case_kind` (`field_failure`, `ncr`, `car`), rule ID | One row per case/rule pair. |
| row links | Sorted configuration, test, affected-lot, affected-asset, and evidence-receipt references | At least one affected lot or asset and one evidence receipt are required. |
| applicability | `applicable`, `not_applicable`, or `unknown` | `not_applicable` needs an exact basis reference; `unknown` remains unknown. |
| observation | `present`, `absent`, `unknown`, or `conflict` | Conflict preserves exactly two claim references; present evidence must match the rule's exact keys. |
| related change | `required`, `not_required`, or `unknown` for `FFCA-CHANGE-01` | Required retains change and propagation review references; no approval field exists. |

The allowed evidence keys are owned by the static rule rows. Unknown keys, raw source text,
paths, secrets, accessors, proxies, duplicate references, unpinned revisions, and malformed
objects fail closed.

## Result contract

The evaluator returns `soulforge.field_failure_corrective_action.assessment.v0` with:

- one sorted result per input row with `satisfied`, `missing`, `unknown`, `conflict`, or
  `not_applicable`;
- exact copied reference links and source locators;
- per-case `closure_readiness` of `ready_for_human_decision` or `not_ready`;
- deterministic input/result digests and a deep-frozen receipt; and
- zero counters for filesystem, network, model, ERP, task, approval, and external writes.

`ready_for_human_decision` is intentionally not a closure. It only means every base candidate
row for that case has a satisfiable public-safe evidence state. A qualified external human owner
must still make any actual disposition or closure decision.

## Closed error contract

| Code | Meaning |
| --- | --- |
| `FFCA_INPUT_REFUSED` | Input shape, reference, array order, linkage, accessor/proxy, or row-state contract is invalid. |
| `FFCA_BINDING_REFUSED` | A source/ruleset/static reference is mismatched or a source revision is floating. |
| `FFCA_FORBIDDEN_AUTHORITY_FIELD` | A caller attempted to pass a quality-disposition, technical-change approval, or closure approval field. |
| `FFCA_EFFECTIVE_RULESET_INVALID` | The Core evaluator was not handed the exact FFCA base candidate. |
| `FFCA_RULESET_UNSUPPORTED` | A substituted or derived FFCA ruleset was offered for evaluation. |
| `FFCA_PROFILE_BINDING_INVALID` | The compiler received an invalid profile binding. |
| `FFCA_PROFILE_OPERATION_UNSUPPORTED` | The compiler received non-empty profile operations. |
| `FFCA_PROFILE_DOMAIN_MISMATCH` | A profile binding names a different domain engine. |
| `MODULE_MANIFEST_FIELD_MISSING` | The local pre-release manifest factory was not given its complete exact caller input. |
| `MODULE_VERSION_NOT_EXACT` | The manifest factory caller supplied a non-exact module version or build revision. |
| `MODULE_ARTIFACT_HASH_INVALID` | The manifest factory caller supplied an invalid artifact or configuration hash. |
| `MODULE_ABI_RANGE_INVALID` | The manifest factory caller supplied an invalid Core ABI range. |
| `MODULE_FLOATING_DEPENDENCY` | The manifest factory caller supplied a non-exact dependency version. |

Malformed cutoff instants are translated to `FFCA_INPUT_REFUSED`; Core instant codes do not
escape this Domain Engine boundary. The local manifest factory propagates only the listed
bounded Core module-validation codes. No error handler falls back to another engine, source,
model, source body, or user role.

## Zero-write and replay contract

`tools/field_failure_corrective_action_runner.mjs` creates one public-synthetic request in memory
and writes only JSON to stdout. It reads no project source or filesystem input and reports zero
external effects. The same request has the same input digest, result digest, sorted outcomes,
and byte-equivalent runner output on replay.
