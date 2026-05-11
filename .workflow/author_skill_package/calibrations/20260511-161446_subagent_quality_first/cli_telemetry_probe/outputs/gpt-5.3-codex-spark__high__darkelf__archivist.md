## skill_boundary_brief.md

```md
# api_contract_drift_check — Boundary Brief

## Purpose
Reusable Soulforge skill package for reviewing redacted API drift packets and producing:
- confirmed evidence-only findings,
- assumption-labeled gaps,
- and a bounded, owner-ready remediation plan.

## Scope Inputs
- `openapi_changed_endpoints`
- `generated_type_diff_summary`
- `route_handler_touchpoints`
- `test_failures`
- `owner_notes`

## In-Bound
- Public-safe contract-drift analysis using only redacted packet fields.
- Evidence traceability matrix across OpenAPI/type/script/route/test dimensions.
- Remediation sequencing and owner handoff notes.

## Out-of-Bound
- Actual API specs.
- Customer endpoint names.
- Production logs/telemetry.
- Credentials, tokens, secrets.
- Private incident narratives.
- `_workspaces` runtime files and other runtime-only artifacts.

## Runtime-only (must not be tracked)
- Raw fixture corpora with private details.
- Helper script artifacts that process private/project-specific packets.
- Any copied endpoint names or incident-specific identifiers.

## ASSUMPTIONS
- Redacted packets follow the five field schema above.
- The helper script, if used, only operates on synthetic or redacted packets.
- The reviewed output is intended for public-safe handoff, not incident-grade root-cause disclosure.
```

## skill_package_draft.md

```md
# api_contract_drift_check — Package Draft

## Tracked Package Layout
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
- `.registry/skills/api_contract_drift_check/templates/` (public-safe templates/checklists only)

## skill.yaml (draft)
```yaml
name: api_contract_drift_check
version: 0.1.0
title: API Contract Drift Check
profile:
  model: gpt-5.3-codex-spark
  reasoning: high
  species: darkelf
  class: archivist
owner: soulforge
description: >
  Review redacted API drift packets by comparing OpenAPI, generated types,
  route-handler notes, and failing tests; separate evidence from assumptions;
  produce a bounded remediation plan and boundary warning pack.
inputs:
  schema:
    required:
      - openapi_changed_endpoints
      - generated_type_diff_summary
      - route_handler_touchpoints
      - test_failures
      - owner_notes
outputs:
  - evidence_matrix
  - assumption_register
  - remediation_plan
  - boundary_warnings
  - owner_handoff
safety:
  public_safe: true
  allowed_redacted_scope: true
  no_private_artifacts: true
```

## README.md (draft)
- State: "synthetic/redacted input only"
- Workflow:
  1) Normalize packet sections
  2) Build evidence rows per endpoint
  3) Flag assumption rows when proof is partial or missing
  4) Merge into remediation sequence: verify → patch types → patch handlers → align tests
  5) Emit boundary warnings and owner handoff
- Mandatory outputs:
  - evidence register
  - assumptions register
  - remediation order
  - boundary warning list

## codex/SKILL.md (optional draft)
- Define skill intent, one-line command contract, and output templates.
- Clarify: no private data and no runtime-file ingestion.
- Include fallback language for incomplete redaction.

## Templates/Checklists (public-safe only)
- `templates/evidence-register-template.md`
- `templates/assumptions-vs-proof-checklist.md`
- `templates/remediation-plan-template.md`
- `templates/boundary-warning-template.md`
- `templates/owner-handoff-template.md`
```

## skill_resource_bundle_review.md

```md
# api_contract_drift_check — Resource Bundle Review

## Bundle Review Result
- Tracked files are limited to `.yaml`, `README`, optional `SKILL.md`, and templates/checklists.
- No code, scripts, credentials, logs, or private incident artifacts included.
- Templates avoid project-specific endpoint names and keep examples generic.

## Public-safe Coverage
- Evidence and remediation formats do not include concrete production data.
- Boundary warnings are structural and generic.
- Templates include redaction placeholders rather than raw values.

## Acceptance
- PASS: package intent, safety constraints, and outputs are reusable in other projects without endpoint leakage.
- PASS: no copy of runtime files into tracked canon.
- PASS: helper-script mention remains runtime-only by policy, not package-canon.
```

## skill_boundary_review.md

```md
# api_contract_drift_check — Boundary Review

## Boundary Compliance
- Input policy enforces redacted/synthetic packet boundaries.
- Any packet containing raw API spec text, secrets, customer endpoint identities, or log-derived identifiers is marked as boundary-unsafe.
- `_workspaces/runtime` data is explicitly excluded from canonical tracked files.

## Boundary Warnings
- Missing redaction marker on endpoint names -> warning and block of final evidence publication.
- Production log snippets present -> warning + downgrade evidence confidence.
- Private incident details present -> stop and request de-identified replacement packet.
- Helper-script outputs include private names -> runtime-only confinement required.

## Enforcement
- Evidence rows must cite only packet-internal IDs, not external private identifiers.
- Assumptions block must be explicit whenever any required confirmation is unavailable.
- Remediation plan must include a boundary-safe follow-up request for missing data when needed.
```

## skill_install_sync_request.md

```md
# api_contract_drift_check — Local Mirror Sync Handoff

## Handoff Summary
- Prepared for local mirror sync; sync operation not performed.
- Track this package path only:
  `.registry/skills/api_contract_drift_check/`

## Sync Request Payload
- Destination: local mirror registry root
- Package version: `0.1.0`
- Contents:
  - skill.yaml
  - README.md
  - codex/SKILL.md (optional)
  - templates/*
- Validation before sync:
  - No private identifiers in tracked files
  - No runtime artifacts (no `_workspaces`, no logs, no creds)
  - Public-safe templates only

## Operator Notes
- Require reviewer confirmation before executing mirror ingest.
- Capture mirror artifact hash and package version at handoff.
- Return sync token only after successful canonical verification.
```

## skill_smoke_check.md

```md
# api_contract_drift_check — Smoke Check (Synthetic Fixture)

## Smoke Fixture
```json
{
  "openapi_changed_endpoints": [
    {"endpoint":"/api/v2/inventory/{id}","method":"GET","change":"response_schema","risk":"medium"},
    {"endpoint":"/api/v2/payments","method":"POST","change":"request_schema","risk":"high"}
  ],
  "generated_type_diff_summary": [
    {"endpoint":"/api/v2/payments","expected":"currency: \"USD\" string","actual":"currency: enum-like object","mismatch":"type"}
  ],
  "route_handler_touchpoints": [
    {"endpoint":"/api/v2/inventory/{id}","handler":"handler_inventory_get","note":"adds fallback cast for null fields"}
  ],
  "test_failures": [
    {"name":"tests/api/test_payments_validation.py::test_reject_bad_currency","status":"failed","error":"expected 400, got 200"}
  ],
  "owner_notes": "Redacted packet for calibration run; no production context included."
}
```

## Expected Smoke Assertions
- Evidence row produced for type mismatch at `/api/v2/payments`.
- Route-handler fallback note captured as context, not treated as proof by itself.
- Failed test linked to schema gap in one failing assertion.
- At least one assumption recorded for test environment specifics.
- Remediation order includes: confirm OpenAPI contract, patch generated type model, patch handler fallback, add test for bad currency.
- Boundary warning emitted for endpoint names if not replaced with synthetic-safe naming in real packets.
- Owner handoff references packet completeness gaps and required follow-ups.
```

## skill_release_review.md

```md
# api_contract_drift_check — Release Review

## Go/No-Go Criteria
- PASS: packet review flow produces evidence-first output with explicit assumptions.
- PASS: no private or runtime-only artifacts are introduced into tracked canon.
- PASS: templates/checklists are generic and reusable.
- PASS: remediation plan is bounded, ordered, and owner-actionable.

## Risk Gates
- Redaction failure or missing fields -> No-Go until packet is corrected.
- Any direct customer/prod identifiers detected -> No-Go.
- Undefined evidence for claims -> allowed only as assumptions, not as confirmed findings.

## Versioning & Ownership
- Initial release version: `0.1.0`
- Owner handoff format required for all releases.
- Re-run smoke fixture before minor/patch updates.
```

