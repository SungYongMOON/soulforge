## skill_boundary_brief.md
- Skill name: `api_contract_drift_check`
- Purpose: review a public-safe API contract drift packet and separate confirmed evidence from assumptions.
- Allowed inputs: redacted drift packets with `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, and `owner_notes`.
- Forbidden canon: actual API specs, customer endpoint names, production logs, credentials, private incident details, and `_workspaces` runtime files.
- Output scope: bounded remediation plan, evidence ledger, assumptions list, owner handoff notes, and boundary warnings.

## skill_package_draft.md
- Package root: `.registry/skills/api_contract_drift_check/`
- Tracked files: `skill.yaml`, `README`, optional `codex/SKILL.md`.
- Canon content: public-safe templates, checklists, and review prompts only.
- Helper script rule: synthetic or redacted packets only, with no project-specific endpoint names.
- Primary use case: reusable drift triage that compares claimed OpenAPI, TypeScript, and route-handler changes without importing runtime-only details into tracked skill canon.

## skill_resource_bundle_review.md
- Public-safe bundle looks appropriate if it contains:
- A minimal skill manifest that declares the review workflow and safety boundary.
- A README that explains input expectations, evidence classification, and remediation ordering.
- Optional executor guidance in `codex/SKILL.md` that stays generic and policy-safe.
- Templates/checklists for evidence extraction, assumption tracking, owner handoff, and boundary warnings.
- No runtime packet artifacts, no private endpoint inventories, and no copied logs or workspace files.

## skill_boundary_review.md
- Boundary is clear if the skill only reasons over redacted summaries and reviewer notes.
- Confirmed evidence must be separated from inferred drift, likely root cause, and remediation priority.
- Any endpoint names, spec fragments, or failure details that are not already public-safe stay out of tracked files.
- The skill should warn when input is incomplete, when ownership is unclear, or when remediation depends on runtime-only context.
- Main residual risk: template drift that accidentally normalizes private packet details into canon.

## skill_install_sync_request.md
- Request: prepare a local mirror sync handoff for `.registry/skills/api_contract_drift_check/`.
- Include the package path, public-safe scope, and the boundary rule against syncing runtime-only packet contents.
- Mark the handoff as pending local sync review rather than completed.
- Do not treat this as an executed sync step.

## skill_smoke_check.md
- Proposed synthetic packet:
- Two endpoints.
- One generated type mismatch.
- One route handler note.
- One failing test name.
- Expected checks:
- Confirm what is evidenced versus assumed.
- Identify owner handoff targets.
- Order remediation from contract mismatch to type generation to route handler to test repair.
- Emit a boundary warning if the packet includes private or runtime-only material.
- This is a smoke plan only, not an executed run.

## skill_release_review.md
- Release readiness criteria:
- Package stays public-safe and reusable.
- Canon files remain free of private specs, logs, credentials, and runtime workspace data.
- Smoke checklist covers evidence, assumptions, owner handoff, remediation order, and boundary warnings.
- Release recommendation: ready for local mirror preparation after final content validation.
- No claim of sync, install, or smoke execution is made here.