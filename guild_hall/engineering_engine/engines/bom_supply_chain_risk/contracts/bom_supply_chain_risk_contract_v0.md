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
- Conditional DFARS source IDs require a typed `bound_applicable` applicability
  status plus an opaque basis reference before the alternate/counterfeit rules
  can reach a normal conclusion. An omitted or `unknown` binding stays
  `unknown`; a bound-not-applicable conditional source is also not treated as a
  compliance or alternate-approval conclusion.
- The evaluator recomputes the exact existing Core facts digest and the
  package-local derived-ruleset identity before evaluating. A stale digest,
  ref, threshold, or provenance row is refused.

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

Errors are refusal outcomes; they never trigger a fallback source, default
threshold, write, or procurement/authority action.
