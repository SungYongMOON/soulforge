## skill_boundary_brief.md

ASSUMPTIONS:
- This is a synthetic telemetry probe only.
- No repository files, runtime files, private specs, logs, credentials, or endpoint names are available or copied.

Boundary:
- Tracked canon may include only public-safe instructions, redacted templates, checklists, and synthetic examples.
- Runtime-only materials include actual OpenAPI specs, customer endpoint names, production logs, credentials, incident details, and `_workspaces` files.
- The skill must distinguish confirmed evidence from owner notes, assumptions, inferred risk, and proposed remediation.

Purpose:
- `api_contract_drift_check` reviews redacted API contract drift packets and produces a bounded remediation plan without absorbing private operational data into the skill package.

## skill_package_draft.md

Package name:
- `api_contract_drift_check`

Desired tracked paths:
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md`
- `.registry/skills/api_contract_drift_check/templates/drift_packet_template.md`
- `.registry/skills/api_contract_drift_check/checklists/review_checklist.md`
- `.registry/skills/api_contract_drift_check/examples/synthetic_packet.md`

Core workflow:
1. Confirm packet is redacted and public-safe.
2. Inventory fields: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`.
3. Classify each item as confirmed evidence, assumption, owner claim, or missing evidence.
4. Compare OpenAPI, generated types, route handlers, and tests for drift alignment.
5. Produce remediation order based on contract source of truth, generated artifacts, implementation touchpoints, and failing tests.
6. Include explicit boundary warnings and owner handoff.

Helper script:
- Allowed only for synthetic or redacted packets.
- Must reject project-specific endpoint names, credentials, logs, and private incident content.

## skill_resource_bundle_review.md

Recommended public-safe resources:
- Redacted packet template.
- Evidence classification checklist.
- Drift comparison matrix.
- Remediation ordering guide.
- Owner handoff template.
- Synthetic smoke fixture.

Do not include:
- Real API specs.
- Real endpoint names.
- Production logs.
- Credentials or tokens.
- Private incident narratives.
- `_workspaces` runtime artifacts.

Resource risk:
- The highest risk is accidental canonization of private API details through examples or helper-script fixtures.

## skill_boundary_review.md

Confirmed safe:
- Generic OpenAPI/TypeScript/route-handler terminology.
- Synthetic endpoint labels such as `/example/users` and `/example/orders`.
- Generic failing test names such as `contract_drift_detects_type_mismatch`.

Requires runtime-only handling:
- Actual endpoint names.
- Customer identifiers.
- Production payloads.
- Private test output.
- Owner notes containing incident-specific details.

Required output discipline:
- Separate `Evidence`, `Assumptions`, `Gaps`, `Remediation Order`, `Owner Handoff`, and `Boundary Warnings`.
- Never rewrite owner claims as verified facts unless supported by packet evidence.

## skill_install_sync_request.md

Install handoff:
- Prepare local mirror sync for `.registry/skills/api_contract_drift_check/`.
- Include only tracked package files and public-safe resources.
- Exclude runtime packets, private fixtures, logs, credentials, and `_workspaces`.

Requested reviewer checks before sync:
- Confirm examples are synthetic.
- Confirm helper script rejects private identifiers.
- Confirm README states runtime-only boundaries.
- Confirm `codex/SKILL.md` tells agents not to copy packet contents into canon.

Status:
- Sync was not performed.
- No files were edited.

## skill_smoke_check.md

Synthetic smoke packet:
- `openapi_changed_endpoints`: `/example/users`, `/example/orders`
- `generated_type_diff_summary`: `User.status changed from string to enum`
- `route_handler_touchpoints`: `users handler validates status as string`
- `test_failures`: `contract_drift_detects_user_status_enum`
- `owner_notes`: `Owner suspects generated types were not refreshed`

Expected smoke verification:
- Evidence identifies changed endpoints, type mismatch, route-handler mismatch, and failing test.
- Assumptions include unverified owner suspicion about type generation.
- Remediation order starts with contract source confirmation, then type regeneration, handler update, test rerun, and owner review.
- Owner handoff names unresolved questions without exposing private details.
- Boundary warnings state that real endpoint names and production logs must remain runtime-only.

Status:
- Smoke run was not performed.

## skill_release_review.md

Release readiness criteria:
- Package contains only public-safe canon.
- Runtime/private boundary is explicit in README and Codex skill instructions.
- Templates prevent private packet copy-paste into tracked examples.
- Helper script, if included, is limited to synthetic/redacted packet validation.
- Smoke fixture covers evidence, assumptions, owner handoff, remediation order, and boundary warnings.

Release risks:
- Private endpoint leakage through examples.
- Treating owner notes as evidence.
- Over-broad remediation plans that exceed the packet.
- Helper script accepting production-like names or logs.

Recommendation:
- Ready for local mirror handoff after reviewer confirms resource contents are synthetic and boundary language is present.