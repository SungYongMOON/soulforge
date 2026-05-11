# skill_boundary_brief.md

## ASSUMPTIONS

- `api_contract_drift_check` is a new reusable skill package.
- Only redacted, public-safe drift packets are valid runtime inputs.
- Actual specs, endpoint names, logs, credentials, incident details, `_workspaces`, `_workmeta`, and `private-state` stay out of tracked skill canon.

## Request Summary

- Requested skill/package: `api_contract_drift_check`
- Request mode: `create`
- Why reusable: API contract drift review is a repeated maintenance pattern with stable evidence sorting, owner handoff, and remediation planning needs.

## Repeated Behavior

- Preserve: compare claimed OpenAPI, generated TypeScript, route-handler, test, and owner-note drift.
- Separate: confirmed evidence, likely assumptions, missing proof, and blocked checks.
- Output: evidence summary, assumptions, likely affected owners, blocker list, ordered remediation plan, boundary warnings.

## Inputs In Scope

- `skill_request`: create reusable Soulforge skill package.
- `supporting_examples`: redacted packet shape, boundary rules, desired files, smoke path, install handoff.
- `existing_skill_package`: none.
- Resource bundle scope: `mixed`, limited to public-safe README, Codex bridge, reference mapping, templates/checklists.

## Out Of Scope

- Actual API specs, customer endpoint names, production logs, credentials, private incidents.
- Runtime packet archives and local project files.
- Installed mirror sync execution.

## Decision

- Proceed to tracked package draft: yes.
- Class binding required now: no.
- Binding follow-up if deferred: can later bind to a reviewer/checker class that handles API contract evidence review.

# skill_package_draft.md

## Package Target

- `skill_id`: `api_contract_drift_check`
- Title: API Contract Drift Check
- Summary: Review redacted API contract drift packets and produce bounded evidence, assumption, owner, and remediation outputs.
- Request mode: `create`

## Tracked Files To Create

- `.registry/skills/api_contract_drift_check/skill.yaml`: canonical behavior, inputs, outputs, safety boundaries, execution hints.
- `.registry/skills/api_contract_drift_check/README.md`: usage, packet shape, boundary notes, smoke example.
- `.registry/skills/api_contract_drift_check/codex/SKILL.md`: lean Codex executor bridge.
- `.registry/skills/api_contract_drift_check/codex/references/mapping.md`: output mapping and evidence classification rules.
- `.registry/skills/api_contract_drift_check/codex/templates/redacted_packet.template.json`: tiny synthetic packet shape.
- `.registry/skills/api_contract_drift_check/codex/templates/review_output.template.md`: expected response skeleton.
- `codex/scripts/`: none for v1.
- `codex/agents/openai.yaml`: optional UI metadata/dependency hints only.

## Ownership Split

- Canon in `skill.yaml`: trigger terms, allowed inputs, review steps, output contract, boundary prohibitions.
- Optional executor bridge in `codex/`: Codex-facing checklist and templates.
- Runtime concerns left local: actual packets, source files, private specs, runtime bindings, installed mirror state.

## Draft Notes

- Required behavior: classify packet claims as confirmed, assumption, missing evidence, or blocked.
- Required execution hints: avoid reading secrets/private paths; operate only on user-provided redacted packet contents.
- Recommended output order: evidence, assumptions, owner handoff, remediation order, blockers, boundary warnings.
- Open questions: whether to add a schema-only helper script later.
- Follow-up edits needed: materialize tracked package files, then run synthetic smoke.

# skill_resource_bundle_review.md

## Bundle Target

- `skill_id`: `api_contract_drift_check`
- Request mode: `create`
- Supporting examples reviewed: redacted packet use case, boundary concern, desired package, smoke path, install handoff.

## Runtime Input vs Tracked Bundle

- Runtime inputs that stay local: real OpenAPI specs, generated diffs, route handlers, test logs, owner notes, incident context.
- Tracked `codex/references/` additions: `mapping.md` for evidence categories and output contract.
- Tracked `codex/scripts/` additions: none initially.
- Tracked `codex/templates/` additions: redacted synthetic packet and review output template.

## Decision Notes

- Local inputs stay local because they may contain customer endpoints, production details, credentials, or private project state.
- Templates belong in tracked canon only if synthetic and placeholder-based.
- Placeholder strategy: use `/synthetic/...`, `ExampleType`, `ExampleOwner`, and generic test names.
- Runtime prerequisites surfaced: a maintainer must provide a redacted packet.

## Follow-Up

- Bundle split accepted: yes.
- Smallest correction if not: remove any real endpoint, owner, log, or local path from templates.

# skill_boundary_review.md

## Review Target

- Reviewed package: proposed `.registry/skills/api_contract_drift_check/`
- Reviewed draft revision: initial conceptual draft

## Pass / Fix Summary

- Overall status: pass for the proposed draft.
- Smallest safe next step: create only the scoped tracked package files, using synthetic placeholders.

## Boundary Checks

- `skill.yaml` stays canon-only: pass.
- `codex/` stays optional bridge-only: pass.
- `agents/openai.yaml` stays UI/dependency hint-only: pass if included.
- Runtime input vs tracked bundle split stays valid: pass.
- Runtime model/MCP/tool choice stays outside tracked package: pass.

## Findings

- Finding 1: no blocker if templates remain synthetic and schema-shaped.
- Finding 2: helper script should be omitted unless it validates shape only and contains no endpoint-specific logic.

## Required Corrections Before Install Handoff

- Correction 1: none for the proposed v1 draft.
- Correction 2: before sync, verify no runtime packet contents were copied into tracked files.

# skill_install_sync_request.md

## Target

- `skill_id`: `api_contract_drift_check`
- Installed mirror name: `api_contract_drift_check`
- Source bridge path: `.registry/skills/api_contract_drift_check/codex/SKILL.md`

## Pre-Sync Checklist

- Boundary review passed: yes, for proposed draft.
- Resource bundle review passed: yes.
- `codex/SKILL.md` present: required before sync.
- `codex/references/` present if needed: required for mapping.
- `codex/agents/openai.yaml` present: optional.

## Sync Command

```bash
ruby .registry/docs/operations/scripts/sync_codex_skill.rb api_contract_drift_check
```

## Notes

- This prepares local installed mirror sync only.
- Actual sync was not performed.
- Runtime inputs that must stay local: redacted packets, real specs, generated diffs, route handlers, test logs, owner notes.
- Post-sync smoke check: run the tiny synthetic packet and verify required output sections.
- Resource bundle expected in installed mirror: `SKILL.md`, `references/mapping.md`, and public-safe templates.

# skill_smoke_check.md

## Smoke Target

- `skill_id`: `api_contract_drift_check`
- Installed mirror expected: yes after local sync.
- Supporting runtime input used: tiny synthetic redacted packet.

## Smallest Smoke Path

- Local command or script path: invoke the installed skill with `codex/templates/redacted_packet.template.json`.
- Validation step: confirm the response includes evidence, assumptions, owner handoff, remediation order, blockers, and boundary warnings.
- Synthetic packet shape:
  - `openapi_changed_endpoints`: `GET /synthetic/widgets/{id}`, `PATCH /synthetic/widgets/{id}`
  - `generated_type_diff_summary`: one generated type mismatch.
  - `route_handler_touchpoints`: one generic handler note.
  - `test_failures`: one generic failing contract test.
  - `owner_notes`: one redacted maintainer note.

## Outcome

- Smoke status: not-run in this no-edit conceptual pass.
- Validation evidence: expected markers are defined above.
- Runtime prerequisites confirmed: requires only a redacted/synthetic packet.
- Remaining manual checks: run after package creation and local sync.

## Notes

- Runtime input remained local: yes.
- Boundary-sensitive behavior observed: the smoke must warn against copying real specs, endpoint names, logs, credentials, or private runtime files into tracked canon.

# skill_release_review.md

## Release Candidate

- `skill_id`: `api_contract_drift_check`
- Tracked package revision: proposed initial draft.
- Install handoff note: prepared, sync not performed.

## Final Boundary Check

- Tracked package still clean after handoff prep: pass for proposed draft.
- Resource bundle split still matches owner boundaries: pass.
- Smoke path and validation evidence are explicit: pass.
- No host-local path or runtime truth leaked back into tracked files: pass.
- Install request remains procedural, not canonical: pass.

## Release Decision

- Ready for local sync: conditional yes after tracked files are materialized from this draft.
- Blocking issue: actual package files and smoke run do not exist in this no-edit pass.
- Smallest correction if blocked: create the scoped tracked package, sync the Codex bridge, then run the synthetic smoke.

## Follow-Up

- Sync operator: local maintainer or agent with write approval.
- Smoke check expected: synthetic packet review only.
- Promotion note: suitable as a reusable public-safe API contract drift review skill once materialized and smoke-verified.
