## `skill_boundary_brief.md`
**Purpose:** `api_contract_drift_check` is a public-safe Soulforge skill package for reviewing a redacted API contract drift packet and producing a bounded remediation plan.

**In scope**
- Review `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, and `owner_notes`
- Separate confirmed evidence from assumptions
- Compare claimed OpenAPI, generated TypeScript, and route-handler drift
- Produce remediation order and owner handoff notes
- Use only synthetic or redacted examples in tracked canon

**Out of scope**
- Actual API specs
- Customer endpoint names
- Production logs
- Credentials or secrets
- Private incident details
- `_workspaces` runtime files
- Any tracked canon containing project-specific endpoint data

## `skill_package_draft.md`
**Package name:** `api_contract_drift_check`

**Tracked package draft**
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` optional
- `templates/redacted_drift_packet.md`
- `templates/remediation_plan_checklist.md`
- `templates/boundary_warning_block.md`

**Draft package intent**
- Input: public-safe drift packet only
- Output: evidence table, assumptions table, boundary warnings, remediation order, owner handoff
- Rule: helper script is allowed only for synthetic or redacted packets and must not include project-specific endpoint names

## `skill_resource_bundle_review.md`
**Recommended tracked resources**
- Redacted packet template covering the five expected fields
- Checklist for evidence vs. assumption classification
- Remediation planning template with severity, dependency, and owner columns
- Boundary warning snippet for runtime-only/private materials
- Tiny synthetic smoke fixture description

**Excluded from tracked bundle**
- Real OpenAPI files
- Generated client artifacts from live systems
- Real route handlers
- Failing CI logs with private details
- Any `_workspaces` extracts

## `skill_boundary_review.md`
**Boundary controls**
- Canon must stay example-only and public-safe
- Runtime evidence may be inspected during a live task but must not be copied into tracked skill files
- Endpoint identifiers in examples should be generic, such as `GET /entity/{id}` and `POST /entity`
- Incident context must be summarized abstractly, not preserved verbatim
- Helper automation must reject or warn on non-redacted inputs

**Assumptions**
- “Public-safe packet” means identifiers and details are already redacted before skill use
- The skill’s job is review and planning, not direct code modification

## `skill_install_sync_request.md`
**Requested handoff**
- Prepare a local mirror sync handoff for `api_contract_drift_check`
- Include package path, intended tracked files, boundary summary, and synthetic smoke fixture description
- Mark sync as pending operator action

**Do not state**
- That install occurred
- That sync occurred
- That mirrors were updated

## `skill_smoke_check.md`
**Synthetic smoke path**
- Packet contains two generic endpoints
- One generated type mismatch
- One route-handler touchpoint note
- One failing test name
- One short owner note

**Expected review outcome**
- Confirmed evidence is listed separately from assumptions
- Owner handoff is explicit
- Remediation order is bounded and dependency-aware
- Boundary warnings are present when packet details appear too specific

**Example synthetic tokens**
- Endpoint A: `GET /entity/{id}`
- Endpoint B: `POST /entity`
- Type mismatch: nullable field differs between spec and generated type
- Route note: handler still expects removed query field
- Failing test: `api_contract_entity_post_shape_mismatch`

## `skill_release_review.md`
**Release readiness**
- Viable if the tracked package contains only public-safe instructions, templates, and checklists
- Block release if any real endpoint names, private logs, credentials, incident details, or `_workspaces` artifacts appear in canon
- Optional `codex/SKILL.md` should restate the boundary and require evidence/assumption separation
- First release should be labeled synthetic-fixture-only until a maintainer validates the boundary language and smoke expectations