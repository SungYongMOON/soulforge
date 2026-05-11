## skill_boundary_brief.md
### Purpose
Define strict canon/runtime boundaries for `api_contract_drift_check` under profile `gpt-5.3-codex|medium|darkelf|archivist`.

### In Scope (Tracked Canon)
- Public-safe workflow instructions for reviewing API drift packets.
- Templates/checklists for:
  - evidence vs assumption separation
  - bounded remediation planning
  - owner handoff notes
- Package files:
  - `.registry/skills/api_contract_drift_check/skill.yaml`
  - `.registry/skills/api_contract_drift_check/README.md`
  - optional `.registry/skills/api_contract_drift_check/codex/SKILL.md`

### Out of Scope (Runtime-Only)
- Real API specs and customer endpoint names.
- Production logs, credentials, private incident details.
- Any `_workspaces` runtime files.
- Any unredacted packet details.

### Boundary Rule
Only synthetic/redacted examples may appear in tracked skill canon.

---

## skill_package_draft.md
### Package Skeleton
- `skill.yaml`
  - name: `api_contract_drift_check`
  - intent: review public-safe API contract drift packets
  - outputs: evidence table, assumption table, remediation plan, owner handoff
  - safety: explicit runtime-only exclusions
- `README.md`
  - when to use
  - required packet fields:
    - `openapi_changed_endpoints`
    - `generated_type_diff_summary`
    - `route_handler_touchpoints`
    - `test_failures`
    - `owner_notes`
  - expected deliverable format
- `codex/SKILL.md` (optional)
  - step-by-step execution protocol
  - boundary warning block
  - smoke checklist reference
- `templates/`
  - `evidence_matrix.md`
  - `assumption_register.md`
  - `remediation_plan.md`
  - `owner_handoff.md`

### ASSUMPTIONS
- Template files are allowed as “public-safe templates/checklists.”
- Optional helper logic is documented but not executed here.

---

## skill_resource_bundle_review.md
### Candidate Public-Safe Bundle
- `templates/evidence_matrix.md`
- `templates/assumption_register.md`
- `templates/remediation_plan.md`
- `templates/owner_handoff.md`
- `checklists/boundary_guardrails.md`
- `checklists/smoke_packet_minimum.md`

### Review Notes
- Keep all examples synthetic and endpoint-generic (`/resource/:id` style).
- No project, tenant, or incident identifiers.
- No copied runtime artifacts.

---

## skill_boundary_review.md
### Boundary Controls
- Input gate: reject or redact packets containing private identifiers.
- Processing rule: classify each claim as:
  - confirmed evidence
  - unresolved assumption
  - out-of-bound data
- Output rule: remediation steps must be bounded to packet evidence only.
- Handoff rule: include explicit “needs runtime verification” markers.

### Risk Flags
- Hidden endpoint naming leakage in “type diff summary.”
- Incident context leakage in `owner_notes`.
- Test names containing private service topology hints.

---

## skill_install_sync_request.md
### Local Mirror Sync Handoff (Prepared, Not Executed)
- Target package path:
  - `.registry/skills/api_contract_drift_check/`
- Sync intent:
  - mirror `skill.yaml`, `README.md`, optional `codex/SKILL.md`, and public-safe templates/checklists
- Validation intent before sync:
  - boundary scan for sensitive strings
  - synthetic-example-only confirmation
  - package completeness check

### ASSUMPTIONS
- “Local mirror sync handoff” means providing a ready-to-sync checklist, not performing sync.

---

## skill_smoke_check.md
### Synthetic Smoke Fixture (Design)
- Endpoints (2, synthetic):
  - `GET /v1/items/{id}`
  - `POST /v1/items`
- Generated type mismatch (1):
  - response field `status` expected `string`, generated as `number`
- Route handler note (1):
  - `createItem` handler touched validation branch
- Failing test (1):
  - `items.create.returns_201_with_status_string`

### Expected Smoke Assertions
- Evidence extracted and cited by packet field.
- Assumptions separated from evidence.
- Owner handoff includes unresolved runtime checks.
- Remediation ordered by dependency:
  1. contract alignment
  2. type regeneration
  3. handler update
  4. test update/re-run
- Boundary warnings emitted for any non-redacted content.

---

## skill_release_review.md
### Release Readiness (Draft)
- Fit-for-purpose: yes, for redacted drift packet triage.
- Boundary compliance: defined, with runtime-only exclusions.
- Reusability: high, if templates stay endpoint-generic.
- Operational caveat: helper scripts must accept synthetic/redacted packets only.

### Gate Criteria Before Release
1. `skill.yaml` clearly encodes boundary policy.
2. README includes explicit “do not include runtime/private artifacts.”
3. All templates pass synthetic-content review.
4. Smoke checklist present and references tiny fixture format.
5. Install handoff checklist included without claiming execution.