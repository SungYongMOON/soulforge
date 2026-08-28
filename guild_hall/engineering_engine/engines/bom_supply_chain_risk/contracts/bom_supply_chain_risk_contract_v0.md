# BOM and Supply-Chain Risk domain contract v0

## Decision question

> Given an exact Core-typed public-safe BOM/supplier fact snapshot and bound
> thresholds, which item/risk-dimension pairs are evidenced, risky, unknown,
> conflicting, or explicitly not applicable?

The answer is a deterministic risk/readiness projection. It is never a
purchasing recommendation, a product-release decision, a supplier
qualification, a counterfeit-authentication conclusion, or a statement of
contractual compliance.

## Core seams

- The Compiler accepts only the existing Core `Profile Binding` seam and only
  `set_threshold` operations for `max_lead_time_days`,
  `minimum_supplier_count`, and `minimum_geography_count`.
- The Evaluator accepts only existing Core `Typed Project Facts` produced by
  `adaptProjectEvidence`. It reads one public-safe
  `bom_supply_chain_risk_snapshot_v0` observation; it does not read sources,
  files, ERP, RAG, or network services.
- Missing thresholds, missing evidence references, unknown statuses, and
  conflicting fact dimensions fail closed to `unknown` or `conflict`.
- A threshold is policy/Profile material, not a claim that a source prescribes
  its numeric value.
- The snapshot carries opaque `bom_identity_ref`, `bom_revision_ref`, and
  `source_system_revision_ref` values. They bind the assessment and receipt
  without exposing an ERP row, supplier payload, or local path.
- Every project/binding, BOM, source, evidence-basis, and Profile-provenance
  reference admitted by this package is public-safe. Credential-shaped tokens,
  local/UNC/file paths, and secret-shaped material fail before they can appear
  in an assessment, result, receipt, or derived provenance.
- Conditional DFARS source IDs require source-bound typed applicability. S2
  (`BOM-SCR-06`) requires independent affirmative exact-clause-incorporation and
  Cost Accounting Standards applicability gates; each affirmative opaque basis
  ref must resolve to a matching digest-bound `project_typed_fact` evidence
  member. Unknown, negative, missing, or mismatched S2 gates stay `unknown` and
  never become compliance or `not_applicable`. S3 preserves its closed explicit
  clause basis gate and is likewise not a compliance conclusion.
- The evaluator consumes all four existing Core arguments. Authority is the
  exact empty no-action shape; cutoffs are either exact empty or the canonical
  `valid_at`/`known_at` pair already carried by typed facts. It recomputes the
  exact existing Core facts digest and, for derived thresholds, verifies the
  complete Core assembly digest, empty compilation scope, profile traces, and
  Core operation-digest rooting before evaluating. A stale digest, stale Profile
  provenance, forged envelope, mismatched source packet, authority, or cutoff
  is a refusal, not a fallback.
- A derived ruleset retains each complete ordered Core Profile operation program
  alongside final threshold provenance. The evaluator proves every program's
  Core operation digest and trace count, then binds each final threshold to the
  last operation for its metric. Exact zero-operation organization/project
  traces are valid when their canonical empty program and all counts agree.

## Closed output states

| State | Meaning |
| --- | --- |
| `evidence_sufficient` | The bounded typed fact and required opaque evidence reference support the risk-dimension projection. |
| `risk_detected` | The bounded fact meets that risk dimension's deterministic condition. |
| `unknown` | Required observation, evidence, status, threshold, or source applicability is unresolved. |
| `conflict` | Typed facts declare the dimension contradictory; no preference is selected. |
| `not_applicable` | Only the alternate-qualification dimension, with an explicit opaque basis reference, can enter this state. |

## Stop conditions

Return a closed error or `unknown`/`conflict`; do not substitute an LLM, RAG
answer, inferred source, private data, a different Core interface, or a default
threshold when any typed-input, Profile, source-applicability, or authority
boundary is incomplete.

## Closed error contract

| Code family | Meaning |
| --- | --- |
| `BOM_SCR_PROFILE_BINDINGS_INVALID` | The compiler did not receive a valid existing Core Profile Binding or its canonical operation digest. |
| `BOM_SCR_PROFILE_OPERATION_INVALID` | A Profile attempted an operation other than the closed `set_threshold` vocabulary. |
| `BOM_SCR_THRESHOLD_INVALID` / `BOM_SCR_THRESHOLD_CONFLICT` | A threshold is out of range or duplicated within one Profile. |
| `BOM_SCR_PROJECT_FACTS_REQUIRED` / `BOM_SCR_INPUT_INVALID` | Core Typed Project Facts or the closed public-safe BOM snapshot is malformed, unsafe, absent, or incomplete. |
| `BOM_SCR_DOMAIN_MISMATCH` | A Profile, typed binding, or effective ruleset names another Domain Engine. |
| `BOM_SCR_EFFECTIVE_RULESET_INVALID` / `BOM_SCR_EFFECTIVE_RULESET_UNSUPPORTED` | The evaluator cannot prove that the ruleset/source-packet binding is this package's closed deterministic rule set. |
| `BOM_SCR_TYPED_FACTS_DIGEST_MISMATCH` | The Core Typed Facts `facts_digest` does not match the existing Core observations material. |
| `BOM_SCR_DERIVED_RULESET_INTEGRITY` | Thresholds, profile provenance, and the derived ruleset reference are not mutually coherent. |
| `BOM_SCR_AUTHORITY_INVALID` / `BOM_SCR_CUTOFFS_INVALID` / `BOM_SCR_APPLICABILITY_EVIDENCE_INVALID` / `BOM_SCR_ASSEMBLY_INTEGRITY` | The no-action authority, cutoff pair, source-bound gate evidence, or complete Core assembly cannot be admitted exactly. |

Errors are refusal outcomes; they never trigger a fallback source, default
threshold, write, or procurement/authority action.
