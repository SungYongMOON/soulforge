## skill_boundary_brief.md
- Skill name: `api_contract_drift_check`
- Purpose: review a public-safe API contract drift packet, compare claimed OpenAPI, TypeScript, and route-handler drift, separate confirmed evidence from assumptions, and produce a bounded remediation plan.
- Runtime-only boundary: actual API specs, customer endpoint names, production logs, credentials, private incident details, and `_workspaces` runtime files must not be copied into tracked skill canon.
- Tracked scope: `.registry/skills/api_contract_drift_check/skill.yaml`, `README`, optional `codex/SKILL.md`, and public-safe templates/checklists only.
- Helper script constraint: synthetic/redacted packets only; no project-specific endpoint names.

## skill_package_draft.md
- Package layout:
  - `.registry/skills/api_contract_drift_check/skill.yaml`
  - `.registry/skills/api_contract_drift_check/README.md`
  - `.registry/skills/api_contract_drift_check/codex/SKILL.md` optional
  - `.registry/skills/api_contract_drift_check/templates/` public-safe checklists and packet templates
  - `.registry/skills/api_contract_drift_check/scripts/` optional helper for synthetic/redacted packet validation
- Core behavior:
  - ingest redacted packet fields like `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`
  - classify evidence vs assumptions
  - output remediation order and owner handoff
  - emit boundary warnings when private or runtime-only material appears
- Reusable synthetic fixture:
  - two endpoints
  - one generated type mismatch
  - one route handler note
  - one failing test name

## skill_resource_bundle_review.md
- Required public-safe resources:
  - packet intake checklist
  - evidence-versus-assumption rubric
  - remediation ordering rubric
  - owner handoff template
  - boundary warning checklist
- Optional helper assets:
  - synthetic packet fixture
  - redaction validator
  - example output format
- Exclusions:
  - live specs
  - production traces
  - private incident artifacts
  - endpoint names tied to real projects
- Review result: bundle should be sufficient if every example is synthetic and redacted.

## skill_boundary_review.md
- Confirmed safe:
  - abstract contract-drift workflow
  - synthetic endpoint examples
  - generic failure/test labels
- Not safe for tracked canon:
  - concrete customer endpoint names
  - exact OpenAPI fragments from real services
  - production logs or credentials
  - private incident timelines or workspace runtime files
- Main risk: examples accidentally normalizing real API identifiers into templates or docs.
- Control: enforce redaction-first wording and synthetic-only fixtures.

## skill_install_sync_request.md
- Local mirror sync handoff requested, not performed.
- Intended install target: `api_contract_drift_check`
- Suggested sync payload:
  - package manifest
  - README
  - public-safe templates
  - optional `codex/SKILL.md`
  - synthetic smoke fixture
- Handoff note: sync should preserve runtime-only exclusions and reject unredacted packet content.

## skill_smoke_check.md
- Smoke scenario:
  - synthetic packet with two endpoints
  - one generated type mismatch
  - one route handler note
  - one failing test name
- Expected checks:
  - separate confirmed evidence from assumptions
  - identify owner handoff
  - order remediation steps
  - surface boundary warnings
- Pass condition: output stays public-safe and does not infer private runtime details.

## skill_release_review.md
- Release readiness: conditional pass for a public-safe, reusable skill package.
- Required before release:
  - package files limited to tracked canon and templates
  - no real endpoint names or private incident content
  - smoke example remains synthetic
  - boundary warnings documented
- Residual risk: example drift could reintroduce private API identifiers if templates are not tightly constrained.