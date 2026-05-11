## skill_boundary_brief.md

```markdown
# skill_boundary_brief.md

## Profile
- profile_metadata: `gpt-5.3-codex-spark|medium|darkelf|archivist`
- skill_name: `api_contract_drift_check`
- purpose: Review redacted API drift packets and produce a bounded, evidence-first remediation package.

## Scope (In-Scope)
- Ingest redacted packets containing:
  - `openapi_changed_endpoints`
  - `generated_type_diff_summary`
  - `route_handler_touchpoints`
  - `test_failures`
  - `owner_notes`
- Compare drift signals across OpenAPI, TypeScript/typed interfaces, and route handler touchpoints.
- Emit:
  - confirmed evidence list
  - explicit assumptions list
  - owner handoff summary
  - prioritized remediation plan
  - boundary warnings for unsupported artifacts

## Out-of-Scope (Must Reject or Flag)
- actual API specs (authoritative sources, private references, or production copies)
- customer-specific endpoint names or sensitive endpoint identifiers that are not redacted
- production logs
- credentials/tokens/secrets
- private incident notes/files
- `_workspaces` runtime files, local machine artifacts, stack traces, or runtime logs

## Handling Rule
- All output must be redacted-safe and package-safe by construction.
- Never reconstruct or copy runtime-only files into tracked canon.
- Mark every unsupported area as `assumption` or `blocked_by_boundary`.
```

## skill_package_draft.md

```markdown
# skill_package_draft.md

## Package Goal
- Create a reusable, tracker-friendly Soulforge skill package:
  - `.registry/skills/api_contract_drift_check/skill.yaml`
  - `.registry/skills/api_contract_drift_check/README.md`
  - `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
  - `.registry/skills/api_contract_drift_check/templates/checklists/*.md` (public-safe only)

## File Draft (Minimal)
### `.registry/skills/api_contract_drift_check/skill.yaml`
- name: `api_contract_drift_check`
- description: review redacted API drift packet and output bounded evidence/assumption remediation report
- profile: `gpt-5.3-codex-spark|medium|darkelf|archivist`
- permissions: read only; no network side effects
- inputs:
  - required: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`
- outputs:
  - `evidence_report`
  - `assumptions_report`
  - `remediation_plan`
  - `boundary_warnings`

### `.registry/skills/api_contract_drift_check/README.md`
- usage contract
- expected packet schema
- expected output schema (Evidence / Assumptions / Handoff / Remediation order)
- hard boundary examples
- smoke fixture template reference

### `.registry/skills/api_contract_drift_check/codex/SKILL.md`
- operator instructions for invoking in soulforge
- output strictness rules:
  - never infer endpoint ownership from missing fields
  - do not mention unknown production details
  - do not propose credentialed fixes

### Templates
- `.registry/skills/api_contract_drift_check/templates/checklists/packet-ingest-checklist.md`
- `.registry/skills/api_contract_drift_check/templates/checklists/evidence-vs-assumption-matrix.md`
- `.registry/skills/api_contract_drift_check/templates/checklists/remediation-priority-checklist.md`
```

## skill_resource_bundle_review.md

```markdown
# skill_resource_bundle_review.md

## Resource Bundle Policy
- Allowed: public-safe templates, checklists, role-agnostic process guidance.
- Allowed: synthetic examples with generic endpoint names only.
- Disallowed: customer endpoint names, production URLs, private IDs, org names, incident links, credentials, or logs.

## Required Checklist Set (Review Outcome)
- `packet-ingest-checklist.md`: validates presence and redaction status of required fields.
- `evidence-vs-assumption-matrix.md`: enforces explicit evidence tags.
- `remediation-priority-checklist.md`: enforces order and ownership handoff constraints.

## Sanity Review Criteria
- Every checklist file must avoid runtime-only or private references.
- No links to `_workspaces` files or local machine paths.
- No secrets placeholders that imply exfiltration or replayability.
- Every remediation step must be bounded to provided packet data and generic platform actions.
```

## skill_boundary_review.md

```markdown
# skill_boundary_review.md

## Boundary Enforcement Rules
- Hard ban: no actual API spec content ingestion.
- Hard ban: no private/customer endpoint identifiers.
- Hard ban: no production logs or secrets.
- Hard ban: no private incident artifacts.
- Hard ban: no `_workspaces` runtime file copying into canon.

## Risk Controls
- Unknown fields in packet are treated as assumptions, not evidence.
- If a required cross-artifact correlation is missing, emit:
  - `blocked_by_boundary=true`
  - `assumption_requires_runtime_review`
- If owner_notes include sensitive references, redact and escalate boundary warning before analysis continues.

## Output Safety Gates
- Evidence item must include `source_field` (`openapi_changed_endpoints`, etc.).
- Assumption item must include `justification` and `required_input_to_confirm`.
- Remediation must include:
  - owner
  - first 1-3 bounded steps
  - test expectation (non-sensitive, generic)
```

## skill_install_sync_request.md

```markdown
# skill_install_sync_request.md

## Install Handoff (Local Mirror Sync Preparation)
- Scope: mirror-sync prepared for local distribution and no claims of execution.
- Target package: `api_contract_drift_check`.

## Requested Sync Artifacts
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
- `.registry/skills/api_contract_drift_check/templates/checklists/*.md`

## Action Plan (Do Not Execute Here)
- Stage files for mirror import.
- Verify redaction and boundary compliance checklist.
- Push sync package to local mirror path configured for your Soulforge environment.
- Run local registration/import validation only after sync by the operator.

## Handoff Note
- This document is for operator handoff only. Actual sync is pending and not performed in this response.
```

## skill_smoke_check.md

```markdown
# skill_smoke_check.md

## Synthetic Fixture
- Packet:
  - `openapi_changed_endpoints`: [`GET /orders`, `POST /users/{id}/status`]
  - `generated_type_diff_summary`: one mismatch at `GET /orders` (`response.total` type changed number -> string)
  - `route_handler_touchpoints`: one note for `POST /users/{id}/status` handler changed return path
  - `test_failures`: one failing test `api-contract-contract-validation::ordersResponseType`
  - `owner_notes`: mentions pending schema migration window

## Expected Smoke Assertions
- Evidence capture
  - record evidence ID for each matched artifact (OpenAPI change, TS diff, handler touchpoint, failing test)
  - map failing test to likely drift root when correlation is present
- Assumptions
  - assumptions include unavailable raw OpenAPI schema snippets and missing route-level auth context
- Owner handoff
  - include owner actions only where packet indicates responsibility
  - include no-guessing rule for missing customer/production context
- Remediation order
  - 1) Validate contract alignment for `/orders` response type mismatch
  - 2) Confirm route handler behavior for `/users/{id}/status` note
  - 3) Update generated types or mapping tests to restore passing contract tests
- Boundary warnings
  - runtime file review required for deeper proof
  - cannot access production logs, secrets, or `_workspaces` artifacts
  - no private endpoint/customer details should be embedded
```

## skill_release_review.md

```markdown
# skill_release_review.md

## Release Readiness
- Evidence/assumption bifurcation implemented and enforced.
- Smoke packet paths validated conceptually with bounded assertions.
- Boundary rules explicitly documented and machine-checkable.
- Canon files listed only under `.registry/skills/api_contract_drift_check/*`.
- No runtime file copy behavior included.
- Owner handoff output format defined and stable.

## Deferred / Follow-up
- Add optional examples for non-`GET`/`POST` route drift.
- Add explicit schema for severity scoring in remediation matrix.
- Add localization-safe phrasing for boundary warnings.

## Release Decision
- Candidate status: **Ready for staging mirror import, subject to operator sync execution.**
- Required gate before production use: local mirror sync + non-prod validation smoke run by operator.
```

