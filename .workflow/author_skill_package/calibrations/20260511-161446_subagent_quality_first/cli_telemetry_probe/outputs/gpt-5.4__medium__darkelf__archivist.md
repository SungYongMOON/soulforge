## `skill_boundary_brief.md`
Purpose: define a reusable, public-safe Soulforge skill package named `api_contract_drift_check` for reviewing redacted API contract drift packets and producing bounded remediation guidance.

Scope:
- Input packet fields: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`
- Output: confirmed evidence, explicit assumptions, boundary warnings, and a prioritized remediation plan

Hard boundaries:
- Do not copy real API specs, customer endpoint names, production logs, credentials, private incident details, or `_workspaces` runtime files into tracked skill canon
- Tracked assets stay limited to `skill.yaml`, `README`, optional `codex/SKILL.md`, and public-safe templates/checklists
- Any helper script is limited to synthetic or fully redacted packets with generic endpoint labels only

## `skill_package_draft.md`
Package draft:
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
- `.registry/skills/api_contract_drift_check/templates/redacted_drift_packet_template.md`
- `.registry/skills/api_contract_drift_check/templates/remediation_plan_template.md`
- `.registry/skills/api_contract_drift_check/checklists/boundary_checklist.md`
- `.registry/skills/api_contract_drift_check/checklists/evidence_separation_checklist.md`
- `.registry/skills/api_contract_drift_check/examples/synthetic_packet_minimal.md`
- `.registry/skills/api_contract_drift_check/scripts/` optional, synthetic-only

Core behavior:
- Compare claims across OpenAPI summary, generated type diff summary, and route-handler touchpoints
- Separate confirmed evidence from assumptions
- Produce owner handoff and remediation order
- Emit boundary warnings when packet content appears non-public-safe

## `skill_resource_bundle_review.md`
Recommended tracked resource bundle:
- Redacted packet template with generic placeholders such as `GET /entity/A` and `POST /entity/B`
- Evidence matrix template:
  - claim
  - source field
  - confirmation status
  - missing proof
- Assumptions ledger template
- Remediation ordering checklist
- Owner handoff template
- Boundary warning checklist
- Tiny synthetic smoke fixture

Excluded from bundle:
- Real specs
- Real endpoint inventories
- Customer identifiers
- Production traces
- Private incident narratives
- Runtime workspace artifacts

## `skill_boundary_review.md`
Boundary review:
- Safe to track:
  - generic packet schemas
  - redacted examples
  - neutral checklists
  - synthetic helper logic
- Runtime-only:
  - actual OpenAPI documents
  - customer endpoint names
  - proprietary route details
  - failing logs or incident context
  - credentials and secrets
  - `_workspaces` contents

Enforcement rules:
- Require explicit “confirmed” vs “assumed” labeling
- Reject or warn on unredacted endpoint names
- Keep remediation plans bounded to packet evidence and maintainer handoff, not root-cause claims without proof

## `skill_install_sync_request.md`
Install handoff request:
- Prepare a local mirror sync handoff for `api_contract_drift_check`
- Include package path, intended tracked files, and boundary constraints
- Mark sync status as pending
- Do not represent install or mirror sync as completed

Handoff payload should state:
- package name: `api_contract_drift_check`
- profile reference: `gpt-5.4|medium|darkelf|archivist`
- tracked artifacts only
- synthetic-only helper script policy
- smoke fixture requirement before release consideration

## `skill_smoke_check.md`
Smoke path definition:
- Use a tiny synthetic packet with:
  - two generic endpoints
  - one generated type mismatch
  - one route handler touchpoint note
  - one failing test name
- Verify outputs include:
  - confirmed evidence list
  - assumptions list
  - owner handoff section
  - remediation order
  - boundary warnings

Pass criteria:
- No real identifiers required
- Evidence and assumptions are clearly separated
- Remediation order is justified by packet contents
- Boundary warning appears if any field would imply runtime-only detail

## `skill_release_review.md`
Release review:
- Fit: good candidate for a public-safe Soulforge skill because the workflow is structured and boundary-sensitive
- Main risk: drift into storing real endpoint or incident data inside canon
- Release gate:
  - templates and checklists only
  - optional helper remains synthetic-only
  - smoke fixture defined and documented
  - install/sync handoff marked pending, not done

## ASSUMPTIONS
- `skill.yaml` is the primary registry manifest for this skill package
- `codex/SKILL.md` is optional and only needed if executor-specific instructions are desired
- “Local mirror sync handoff” means preparing metadata for a later sync step, not performing sync