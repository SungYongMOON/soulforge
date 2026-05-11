Prompt-only pass: I’m drafting the seven requested package/review artifacts directly from the provided fixture and not reading skill files, runtime files, or repo state.
## skill_boundary_brief.md
- `api_contract_drift_check` reviews a public-safe, redacted API contract drift packet and compares claimed OpenAPI, generated TypeScript, and route-handler drift without pulling runtime-only context into canon.
- Accepted packet fields: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, and `owner_notes`.
- Required outputs: confirmed evidence, explicit assumptions, bounded remediation order, owner handoff notes, and boundary warnings.
- Runtime-only and excluded from tracked canon: actual API specs, customer endpoint names, production logs, credentials, private incident details, and `_workspaces` runtime files.
- Any helper script must accept only synthetic or redacted packets and must reject project-specific endpoint names.

## skill_package_draft.md
- Package name: `api_contract_drift_check`.
- Tracked package target: `.registry/skills/api_contract_drift_check/skill.yaml`, `README.md`, optional `codex/SKILL.md`, plus public-safe templates, checklists, and synthetic fixtures.
- `skill.yaml` should declare scope, accepted packet fields, output contract, boundary exclusions, and synthetic-only helper constraints.
- `README.md` should define the operator flow: intake, claim comparison, evidence separation, remediation ordering, and owner handoff.
- `codex/SKILL.md` should enforce prompt-time rules: never elevate assumptions to evidence, never copy runtime-only artifacts into canon, and warn when owner notes or test names appear insufficiently redacted.

## skill_resource_bundle_review.md
- Safe to track: intake template, evidence-vs-assumption worksheet, remediation prioritization checklist, owner handoff checklist, redaction checklist, and a tiny synthetic smoke packet.
- Safe to track: an optional helper validator for synthetic or redacted packets using generic labels such as `GET /alpha` and `POST /beta`.
- Not safe to track: real OpenAPI excerpts, generated product types, route source snippets, live failing test output, customer identifiers, or incident narratives.
- Bundle quality improves if every template carries a visible `Public-safe only` and `Runtime artifacts stay out of canon` notice.

## skill_boundary_review.md
- Boundary definition is strong because the skill is limited to redacted packet review and tracked canon is limited to public-safe guidance assets.
- Main leak risks are `owner_notes`, `route_handler_touchpoints`, and `test_failures`, because each can preserve private endpoint names or incident context after partial redaction.
- Required controls: normalize endpoint labels, strip stack traces and repo-specific paths, label uncorroborated claims as assumptions, and reject helper-script input containing project-specific identifiers.
- Review outcome: acceptable for tracked canon if redaction is mandatory at intake and synthetic-only resources remain clearly separated from runtime evidence.
- **ASSUMPTIONS:** Mirror consumers understand `_workspaces` and live drift packets as runtime-only and keep them outside tracked skill paths.

## skill_install_sync_request.md
- Request: mirror the public-safe `api_contract_drift_check` package into the local skill registry without copying `_workspaces`, live packets, or any runtime-derived evidence.
- Sync scope: `skill.yaml`, `README.md`, optional `codex/SKILL.md`, templates, checklists, synthetic fixture, and any helper script limited to synthetic or redacted inputs.
- Pre-handoff checks: confirm all examples use generic endpoint labels, confirm no secrets or incident details remain, and confirm helper constraints are documented in both metadata and README.
- Post-handoff expectation: the local mirror exposes the same public-safe package contents for install-time discovery and bounded review use.
- **ASSUMPTIONS:** Target mirror path, installer mechanism, and registry refresh steps are environment-specific and must be supplied by the receiving operator.

## skill_smoke_check.md
- Synthetic packet shape: two endpoints (`GET /alpha`, `POST /beta`), one generated type mismatch (`status: string -> number`), one route-handler note (`beta handler still returns legacy field`), and one failing test name (`contract_beta_response_shape`).
- Expected evidence result: the type mismatch and failing test are confirmed by packet contents; the route-handler note is evidence only if it is explicitly listed in `route_handler_touchpoints`; owner notes stay non-evidentiary unless corroborated.
- Expected assumptions result: contract intent, backward-compatibility policy, and external client impact remain assumptions unless directly supported by the packet.
- Expected remediation order: confirm contract source of truth, align handler behavior, regenerate or update types, repair the targeted test, then hand off any policy or rollout decisions to the owner.
- Expected boundary warnings: do not infer real endpoint names, do not import live specs or logs, and do not move `_workspaces` artifacts into tracked canon.

## skill_release_review.md
- Release posture: suitable as a public-safe review skill package, not as a substitute for live runtime diagnosis.
- Must-have release conditions: explicit redaction banner, explicit runtime-only exclusions, synthetic smoke fixture, and helper-script rules that reject project-specific identifiers.
- Recommended metadata tags: `public-safe`, `runtime-boundary`, `evidence-first`, `synthetic-fixture`, and profile note `gpt-5.4|xhigh|darkelf|archivist`.
- Residual risk: maintainers may still provide semi-redacted notes or test names that expose private context unless intake guidance is followed strictly.
- Release decision: conditionally ready for packaging and mirror handoff once the boundary labels and synthetic-only enforcement language are present.