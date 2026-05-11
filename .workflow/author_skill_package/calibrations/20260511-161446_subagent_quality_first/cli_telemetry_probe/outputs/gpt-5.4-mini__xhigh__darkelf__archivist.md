## skill_boundary_brief.md
- Scope: review public-safe API contract drift packets only.
- Inputs: redacted `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`.
- Outputs: confirmed evidence, explicit assumptions, bounded remediation plan, and owner handoff.
- Exclusions: actual API specs, customer endpoint names, production logs, credentials, private incident details, and `_workspaces` runtime files.
- Rule: never copy runtime-only material into tracked skill canon.

## skill_package_draft.md
- Package name: `api_contract_drift_check`.
- Tracked surface: `.registry/skills/api_contract_drift_check/skill.yaml`, `README`, optional `codex/SKILL.md`.
- Purpose: compare claimed OpenAPI, TypeScript, and route-handler drift against the packet and separate evidence from inference.
- Deliverables: public-safe templates, checklists, and remediation guidance only.
- Helper script: synthetic/redacted packets only; no project-specific endpoint names.

## skill_resource_bundle_review.md
- Include a redaction-safe packet template.
- Include an evidence-vs-assumption worksheet.
- Include a remediation ordering checklist.
- Include an owner handoff template.
- Reject raw specs, endpoint names, logs, secrets, incident details, and workspace paths.

## skill_boundary_review.md
- Confirm the canon stays summary-only and public-safe.
- Verify every claim is labeled as evidence or assumption.
- Verify no private endpoint strings or runtime artifacts are embedded.
- Verify examples remain synthetic and reusable across projects.

## skill_install_sync_request.md
- Request: prepare a local mirror sync handoff for `.registry/skills/api_contract_drift_check`.
- Include package name, file inventory, and public-safe boundary notes.
- Do not treat this as a completed sync.
- Do not include runtime-only content in the handoff payload.

## skill_smoke_check.md
- Synthetic packet shape: 2 endpoints, 1 generated type mismatch, 1 route-handler note, 1 failing test name.
- Expected checks: extract evidence, separate assumptions, assign owner handoff, order remediation, emit boundary warnings.
- Pass condition: drift claims are bounded and nothing private is copied into canon.
- Not executed here.

## skill_release_review.md
- Release-ready when scope, exclusions, and redaction rules are explicit.
- Release-ready when README and `skill.yaml` stay public-safe and template-driven.
- Release-ready when helper logic remains synthetic/redacted only.
- Main residual risk: leakage via examples, fixtures, or endpoint naming.