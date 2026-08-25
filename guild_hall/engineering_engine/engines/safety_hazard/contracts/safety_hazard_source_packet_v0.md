# Safety and Hazard Domain Engine — source packet v0

Status: implementation candidate; no source or rule is adopted for a live project.

Claim ceiling: `source_supported` at most. This packet does not create a compliance claim,
select an applicable standard, calculate an acceptable risk, close a hazard, or accept a
residual risk.

## Purpose and scope

The Safety and Hazard Domain Engine checks the presence and binding of public-safe evidence
for hazard identity, severity/probability/risk characterisation, mitigation, verification,
residual-risk review, human acceptance-authority evidence, life-cycle status, and closure
evidence. It is deterministic and read-only.

The engine must never accept a residual risk. A named human authority remains responsible for
any actual acceptance. An input acceptance record is only an evidence reference; its presence
does not make the engine a decision maker and does not prove that the human authority had the
right scope.

## Accepted implementation-source inventory

The public-safe inventory is machine-readable in
[safety_hazard_public_source_inventory_candidate_v1.json](safety_hazard_public_source_inventory_candidate_v1.json).
The direct derivation record is
[safety_hazard_derivation_v0.md](safety_hazard_derivation_v0.md).

Only `S1-MIL-STD-882E-CHANGE-1` is an executable candidate source family. Its use is
conditional on an exact project/organization binding that establishes applicability. No rule is
selected by default, and no DoD requirement is asserted for an unbound project.

`S2-NASA-NPR-8715-3D` is deliberately catalogued as obsolete. It is a source-status guard and
historical context only; it cannot execute a rule. `S3-NASA-SP-2010-580-V1` is public guidance
only and cannot establish a project obligation or risk-acceptance authority.

## Source-direct and RAG boundary

- The S1 official DLA public document image was directly inspected on 2026-08-26. Its raw
  bytes are retained only in the ignored common-knowledge workspace; public records retain its
  official locator, revision metadata, and SHA-256, not its body.
- No RAG result, LLM output, cached extraction, search snippet, or source inventory row may set
  source status, applicability, rule acceptance, human authority, closure, or a verdict.
- RAG may later locate a candidate official section only. A reader must re-open the official
  source, pin its revision and access state, and record a source-direct derivation before any
  candidate changes.
- If an official status, revision, access class, licence boundary, applicability component, or
  human-authority binding is unknown, the affected evaluation remains `gap_unknown` or the
  candidate rule remains `HOLD`.

## Rule execution gate

Every base or Profile-added candidate rule needs an explicit, exact
`human_rule_acceptance_ref` in `accepted_rule_bindings`. This is a binding prerequisite for the
candidate evaluator, not a substitute for a Human Owner decision. The evaluator refuses
floating revisions, source-body/private paths, non-human acceptance-authority roles, and
derived Profile rulesets whose evaluation semantics have not been separately accepted.

## Non-goals

- It does not read hazard logs, test records, project files, RAG stores, contracts, or private
  workspaces.
- It does not calculate a risk matrix result, prescribe a mitigation, determine applicability,
  judge legal/contractual authority, approve a waiver, close a hazard, or release a system.
- It does not import protected or paid standards, customer data, raw source bodies, secrets, or
  real acceptance records into public Git.
