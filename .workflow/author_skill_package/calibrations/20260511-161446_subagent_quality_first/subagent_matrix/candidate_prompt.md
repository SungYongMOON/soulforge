# Candidate Task: author_skill_package Public Fixture

You are one isolated candidate run in the Soulforge `author_skill_package` workflow profile calibration.

Rules:

- Do not edit files outside the assigned output JSON path.
- Do not read secret files, `.env`, credentials, `private-state`, `_workspaces`, or `_workmeta`.
- Do not read or use this calibration's `golden/`, `quality_gate/`, `evaluation/`, `cli_telemetry_probe/`, `recommendation.yaml`, `profile_policy.yaml`, or history files.
- Do not use any golden output or evaluator criteria.
- Use only the public-safe synthetic fixture in this task.
- Do not claim commands, sync, smoke runs, or file edits were performed unless you actually performed them.

Task:

Run the `.workflow/author_skill_package` workflow conceptually for the public-safe synthetic input below. Save one JSON object to your assigned output path. The JSON must include:

- `label`
- `model`
- `effort`
- `species`
- `class`
- `status`
- `output_md`

`output_md` must contain concise Markdown sections for exactly these seven outputs:

- `skill_boundary_brief.md`
- `skill_package_draft.md`
- `skill_resource_bundle_review.md`
- `skill_boundary_review.md`
- `skill_install_sync_request.md`
- `skill_smoke_check.md`
- `skill_release_review.md`

Keep `output_md` concise but complete enough for quality evaluation.

Synthetic fixture:

- `workflow_id`: `author_skill_package`
- `fixture_id`: `PUBLIC_SKILL_AUTHORING_API_CONTRACT_DRIFT`
- `request_type`: `skill_authoring_request`
- `skill_request`: Create a reusable Soulforge skill package named `api_contract_drift_check`.
- `target_behavior`: The skill should help an agent review a public-safe API contract drift packet, compare the packet's claimed OpenAPI/TypeScript/route-handler drift, separate confirmed evidence from assumptions, and produce a bounded remediation plan.
- `supporting_examples`:
  - Repeated use case: a maintainer provides a redacted packet with `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, and `owner_notes`. The skill should identify confirmed drift, likely affected owners, blockers, and next checks.
  - Boundary concern: actual API specs, customer endpoint names, production logs, credentials, private incident details, and `_workspaces` runtime files must remain runtime inputs and must not be copied into tracked skill canon.
  - Desired tracked package: `.registry/skills/api_contract_drift_check/skill.yaml`, README, optional `codex/SKILL.md`, and at most public-safe templates or checklists. A helper script is allowed only if it works on synthetic/redacted packet files and does not encode project-specific endpoint names.
  - Smoke path: use a tiny synthetic packet with two endpoints, one generated type mismatch, one route handler note, and one failing test name. Smoke should verify that the skill returns evidence, assumptions, owner handoff, remediation order, and boundary warnings.
  - Install handoff: actual installed mirror sync is local operating procedure. The tracked package should prepare the handoff note but not claim it performed sync.
- `existing_skill_package`: none
- `required_outputs`: `skill_boundary_brief.md`, `skill_package_draft.md`, `skill_resource_bundle_review.md`, `skill_boundary_review.md`, `skill_install_sync_request.md`, `skill_smoke_check.md`, `skill_release_review.md`
