## skill_boundary_brief.md
# api_contract_drift_check

Purpose: review a public-safe API contract drift packet, compare claimed `OpenAPI` / generated `TypeScript` / route-handler drift, separate confirmed evidence from assumptions, and produce a bounded remediation plan.

In scope:
- Redacted packet fields: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`
- Evidence tagging
- Assumption tagging
- Ordered remediation planning
- Owner handoff notes
- Boundary warnings for runtime-only material

Out of scope:
- Actual API specs
- Customer endpoint names
- Production logs
- Credentials
- Private incident details
- `_workspaces` runtime files
- Any tracked canon containing runtime-only details

Primary rule: tracked skill assets stay public-safe, synthetic, and reusable.

## skill_package_draft.md
# api_contract_drift_check package draft

Tracked package:
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` optional
- `templates/packet_intake_checklist.md`
- `templates/evidence_vs_assumptions.md`
- `templates/remediation_plan.md`
- `templates/owner_handoff.md`
- Optional helper script only for synthetic or fully redacted packets

Behavior:
- Parse packet claims by source area
- Mark each item as `confirmed_evidence`, `claimed_unverified`, or `assumption`
- Produce bounded remediation order
- Emit explicit boundary warnings when runtime-only material appears

ASSUMPTIONS:
- `skill.yaml` declares the skill as review-only, not execution-capable
- Templates are markdown, public-safe, and generic

## skill_resource_bundle_review.md
# Resource bundle review

Include:
- Public-safe checklist templates
- Synthetic sample packet
- Rubric for evidence classification
- Remediation ordering rubric
- Boundary warning text
- Owner handoff template

Do not include:
- Real specs
- Real endpoint inventories
- Internal stack traces
- Customer identifiers
- Runtime exports from `_workspaces`

Helper script constraint:
- Allowed only if inputs and outputs remain synthetic/redacted
- Must avoid project-specific endpoint names

## skill_boundary_review.md
# Boundary review

Hard boundaries:
- No canonized copies of runtime-only artifacts
- No transformation of private packet details into tracked examples
- No inclusion of credentials, incidents, or production telemetry
- No project-specific endpoint naming in helper tooling or examples

Required review checks:
- Confirm packet is redacted before use in examples
- Replace endpoint names with neutral placeholders
- Separate evidence from owner interpretation
- Preserve uncertainty where proof is absent
- Warn when remediation depends on non-public runtime context

## skill_install_sync_request.md
# Install sync request

Requested handoff:
- Prepare local mirror sync instructions for `api_contract_drift_check`
- Scope includes tracked skill files and public-safe templates only
- Exclude runtime-only packet data and `_workspaces` contents
- Include note that helper script, if present, is synthetic-only

Suggested handoff fields:
- Package path
- Files intended for mirror
- Files intentionally excluded
- Boundary statement
- Validation checklist for recipient

## skill_smoke_check.md
# Smoke check

Synthetic packet shape:
- Two endpoints in `openapi_changed_endpoints`
- One generated type mismatch in `generated_type_diff_summary`
- One route handler note in `route_handler_touchpoints`
- One failing test name in `test_failures`

Expected review output:
- Confirmed evidence list from packet contents only
- Assumptions list where causality is implied but unproven
- Ordered remediation plan:
  1. Spec drift confirmation
  2. Generated type reconciliation
  3. Route handler adjustment review
  4. Test fix validation
- Owner handoff note with open questions
- Boundary warning if any real identifiers or runtime-only details appear

## skill_release_review.md
# Release review

Release readiness criteria:
- Scope is narrow and reusable
- Canon stays public-safe
- Templates are generic and actionable
- Boundary language is explicit
- Smoke expectations are defined without claiming execution
- Install handoff is prepared as a request, not as a completed sync

Residual risk:
- Maintainers may overstate certainty from redacted packets; the skill should force evidence/assumption separation on every run.