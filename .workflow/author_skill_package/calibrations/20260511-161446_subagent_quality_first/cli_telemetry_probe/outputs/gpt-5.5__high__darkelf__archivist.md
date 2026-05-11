## skill_boundary_brief.md

Purpose: define `api_contract_drift_check` as a public-safe Soulforge skill for reviewing redacted API contract drift packets.

Allowed inputs:
- `openapi_changed_endpoints`
- `generated_type_diff_summary`
- `route_handler_touchpoints`
- `test_failures`
- `owner_notes`

Runtime-only exclusions:
- Actual API specs
- Customer endpoint names
- Production logs
- Credentials
- Private incident details
- `_workspaces` runtime files

Tracked canon may contain only:
- Generic process guidance
- Redacted examples
- Synthetic fixtures
- Templates and checklists
- No project-specific endpoint names

## skill_package_draft.md

Proposed tracked package:

```text
.registry/skills/api_contract_drift_check/
  skill.yaml
  README.md
  codex/SKILL.md
  templates/
    drift_packet_template.md
    evidence_assumption_matrix.md
    remediation_plan_template.md
    smoke_packet_synthetic.md
```

`skill.yaml` draft:

```yaml
name: api_contract_drift_check
version: 0.1.0
description: Review public-safe API contract drift packets and produce bounded remediation plans.
triggers:
  - api contract drift
  - openapi drift
  - generated type mismatch
  - route handler drift
inputs:
  - openapi_changed_endpoints
  - generated_type_diff_summary
  - route_handler_touchpoints
  - test_failures
  - owner_notes
outputs:
  - confirmed_evidence
  - assumptions
  - owner_handoff_questions
  - remediation_order
  - boundary_warnings
boundaries:
  tracked_forbidden:
    - actual API specs
    - customer endpoint names
    - production logs
    - credentials
    - private incident details
    - _workspaces runtime files
```

Core workflow:
1. Confirm packet is redacted/public-safe.
2. Extract evidence by source field.
3. Separate confirmed drift from assumptions.
4. Map OpenAPI, generated types, route handlers, and tests.
5. Identify missing owner context.
6. Produce ordered remediation plan.
7. Emit boundary warnings.

## skill_resource_bundle_review.md

Recommended public-safe resources:
- `drift_packet_template.md`: empty redacted packet schema.
- `evidence_assumption_matrix.md`: table for evidence vs inference.
- `remediation_plan_template.md`: bounded plan with owner handoff.
- `smoke_packet_synthetic.md`: tiny fake packet using non-real endpoint names.

Do not include:
- Real OpenAPI fragments
- Real generated type diffs
- Real route paths
- Real failing test names from private repos
- Runtime workspace snapshots

Helper script policy:
- Allowed only for synthetic or redacted packets.
- Must reject obvious credentials and private-looking endpoint names.
- Must not encode project-specific routes or owners.

## skill_boundary_review.md

Boundary classification:

Confirmed safe:
- Synthetic endpoint labels like `/alpha-items` and `/beta-status`
- Generic generated type mismatch examples
- Fake route handler touchpoints
- Fake failing test names
- Public-safe checklist language

Runtime-only:
- Maintainer-provided packet contents
- Private endpoint names
- Production context
- Incident details
- Customer names
- Logs
- Credentials
- `_workspaces` files

Required skill behavior:
- Warn when packet appears unredacted.
- Do not copy runtime packet data into tracked skill files.
- Treat owner notes as claims unless independently supported by packet evidence.
- Keep remediation bounded to contract/type/handler/test alignment.

## skill_install_sync_request.md

Local mirror sync handoff prepared; sync not performed.

Requested tracked additions:
```text
.registry/skills/api_contract_drift_check/skill.yaml
.registry/skills/api_contract_drift_check/README.md
.registry/skills/api_contract_drift_check/codex/SKILL.md
.registry/skills/api_contract_drift_check/templates/drift_packet_template.md
.registry/skills/api_contract_drift_check/templates/evidence_assumption_matrix.md
.registry/skills/api_contract_drift_check/templates/remediation_plan_template.md
.registry/skills/api_contract_drift_check/templates/smoke_packet_synthetic.md
```

Reviewer handoff:
- Confirm package path matches registry convention.
- Confirm templates contain only synthetic/redacted data.
- Confirm no `_workspaces` material is mirrored.
- Confirm helper script, if added later, is synthetic/redacted-only.

## skill_smoke_check.md

Smoke status: not executed.

Synthetic smoke packet shape:
```yaml
openapi_changed_endpoints:
  - method: GET
    path: /alpha-items
    change: response field alphaCount changed from string to number
  - method: POST
    path: /beta-status
    change: request body now requires betaMode
generated_type_diff_summary:
  - AlphaItem.alphaCount string -> number
route_handler_touchpoints:
  - handler for /alpha-items still serializes alphaCount as string
test_failures:
  - contract.alpha-items.response-shape.test
owner_notes:
  - beta-status may be unrelated; needs owner confirmation
```

Expected smoke review:
- Evidence: OpenAPI change, type mismatch, route serialization note, failing test.
- Assumptions: `/beta-status` relation is unconfirmed.
- Owner handoff: ask whether `/beta-status` belongs in this drift packet.
- Remediation order: OpenAPI intent, generated types, route handler, tests.
- Boundary warnings: synthetic packet only; do not replace with real private routes in tracked canon.

## skill_release_review.md

Release readiness: draft-ready, pending human review.

Pass criteria:
- Public-safe package structure defined.
- Runtime-only boundaries explicit.
- Smoke fixture synthetic.
- Install sync framed as handoff only.
- No commands, file edits, sync, or smoke execution claimed.

Residual risks:
- Future contributors may paste real endpoint names into templates.
- Helper script scope could drift unless validation rules are strict.
- Owner notes need clear labeling as claims, not confirmed evidence.