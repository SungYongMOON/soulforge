## skill_boundary_brief.md
# Skill Boundary Brief — `api_contract_drift_check`

Profile: `gpt-5.3-codex-spark|low|darkelf|archivist`  
Synthetic fixture focus only.

## Purpose
- Review redacted API-contract drift packets for evidence-backed changes.
- Compare `openapi_changed_endpoints`, `generated_type_diff_summary`, and `route_handler_touchpoints`.
- Separate confirmed evidence from assumptions and output bounded remediation plan.

## Allowed Inputs (redacted packet fields)
- `openapi_changed_endpoints`
- `generated_type_diff_summary`
- `route_handler_touchpoints`
- `test_failures`
- `owner_notes`

## Explicit Exclusions (runtime-only / no-tracking)
- Actual API specs
- Customer endpoint names
- Production logs
- Credentials
- Private incident details
- `_workspaces` runtime files

## Output Contract
- Produce: evidence items, assumptions list, risk flags, and ordered remediation tasks.
- Emit boundary warnings whenever missing or redacted-critical fields block conclusions.

---

## skill_package_draft.md
# Skill Package Draft — `.registry/skills/api_contract_drift_check`

## Tracked files
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
- `.registry/skills/api_contract_drift_check/templates/` (public-safe templates/checklists)

## README.md (scope)
- What the skill does
- Input schema contract
- Boundaries and prohibited fields
- Outputs and severity tiers
- Example run with synthetic packet format

## skill.yaml (minimal)
```yaml
name: api_contract_drift_check
version: 0.1.0
description: Review redacted API contract drift packets and produce evidence-scored remediation.
runtime: local
entrypoint: .codex/skills/api_contract_drift_check/SKILL.md
tags:
  - api
  - drift
  - contracts
  - synthesis
  - validation
permissions:
  read_only: true
  network: false
outputs:
  - evidence_log
  - assumptions_log
  - remediation_plan
  - boundary_warnings
```

## SKILL.md (optional)
- Persona/rules for claim classification
- Triage order and gating checks
- Redaction-safe wording policy

---

## skill_resource_bundle_review.md
# Resource Bundle Review

## Confirmed public-safe resources
- `README.md` usage instructions
- Template checklist for:
  - packet triage
  - evidence extraction
  - mismatch classification
  - remediation prioritization
- Example synthetic packet schema (no real names/values)

## Forbidden in bundle
- Any file containing real endpoint identifiers
- Real logs or credential references
- Internal project-specific scripts with environment coupling
- `_workspaces` artifacts or workspace runtime files

## Mapping check (required fields)
- `openapi_changed_endpoints` → interface drift evidence lane
- `generated_type_diff_summary` → type-safety mismatch lane
- `route_handler_touchpoints` → implementation mismatch lane
- `test_failures` → regression proof lane
- `owner_notes` → owner intent and constraints lane

---

## skill_boundary_review.md
# Boundary Review

## In-scope (tracked logic)
- Synthetic packet normalization
- Cross-field consistency checks
- Evidence/assumption separation
- Remediation sequencing with owners and rationale

## Out-of-scope (runtime-only must stay separate)
- Pulling live OpenAPI specs
- Inspecting private production logs
- Discovering credentials/tokens
- Handling private incident/forensics artifacts
- Reading/writing `_workspaces` files

## Boundary enforcement rules
- Any missing source field must be logged as `MISSING_INPUT`, not inferred.
- Any endpoint-like token that resembles non-redacted customer identifiers must be generalized before logging.
- If uncertain, output `ASSUMPTION` and classify confidence as low.

## Risk posture
- High risk: accidental logging of sensitive identifiers.
- Medium risk: inference drift from unverified owner notes.
- Low risk: stale synthetic examples.

---

## skill_install_sync_request.md
# Install Sync Handoff (not performed)

## What to sync
- Add `.registry/skills/api_contract_drift_check/skill.yaml`
- Add `.registry/skills/api_contract_drift_check/README.md`
- Add optional `.registry/skills/api_contract_drift_check/codex/SKILL.md`
- Add templates/checklists under `.registry/skills/api_contract_drift_check/templates/`

## Sync request payload
- Target: local mirror
- Scope: new skill registration only (no runtime workspace files)
- Validation expectation: install-time checks should confirm redaction-safe resources and boundary warnings

## User-visible note
- Not executed in this run; this is a prepared handoff only.

---

## skill_smoke_check.md
# Smoke Check — Synthetic Packet Scenario

## Inputs
- `openapi_changed_endpoints`: 2 endpoints
- `generated_type_diff_summary`: 1 mismatch
- `route_handler_touchpoints`: 1 note
- `test_failures`: 1 failing test name
- `owner_notes`: brief constraints and intended rollout window

## Expected outputs
- Evidence list:
  - 1 confirmed endpoint change from OpenAPI
  - 1 confirmed type mismatch from diff summary
  - 1 confirmed handler impact from route touchpoint
  - 1 confirmed failing test mapping to endpoint/mismatch
- Assumptions:
  - Any unprovided environment detail required for impact scope
  - Any rollout dependency not in packet
- Owner handoff:
  - Explicitly mention missing approvals, missing integration owner, and follow-up data needed
- Remediation order:
  1) reconcile OpenAPI contract assertions
  2) fix generated type generation/pinning gap
  3) patch handler behavior or routing expectation
  4) update/add regression tests
- Boundary warnings:
  - Any attempt to infer customer endpoint names blocked
  - Any non-redacted production/runtime artifact reference omitted

## Pass criteria
- Every non-evidence claim includes `[ASSUMPTION]`.
- No fabricated private identifiers.
- Plan contains bounded, actionable steps with owners and risks.

---

## skill_release_review.md
# Release Review

## Release gate checklist
- Boundary: all prohibited runtime/private fields excluded
- Artifact layout: canonical files only in `.registry/skills/api_contract_drift_check/`
- Functionality: packet triage, tri-modal drift correlation, evidence/assumption split, remediation ordering
- Safety: explicit warnings for redaction gaps and uncertain scope
- Reusability: no project-specific endpoint names or secrets embedded

## Go/No-go
- Go: when all smoke criteria pass with complete evidence/assumption separation
- No-go: if any sensitive field appears in tracked templates or if assumptions are not explicitly tagged

## ASSUMPTIONS
- Packet inputs are synthetic/redacted and structurally validated by caller.
- "Customer endpoint names" may still be abstractly represented if redaction preserves shape.
- No external systems are reachable in this environment, so runtime validation is deferred by design.