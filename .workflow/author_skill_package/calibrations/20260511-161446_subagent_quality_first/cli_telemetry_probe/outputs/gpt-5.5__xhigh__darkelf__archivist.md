## skill_boundary_brief.md

**Skill:** `api_contract_drift_check`

**Purpose:** Review public-safe API contract drift packets and separate confirmed drift evidence from assumptions before proposing bounded remediation.

**Runtime-only data:** actual API specs, customer endpoint names, production logs, credentials, private incident details, `_workspaces` runtime files.

**Tracked canon:** `.registry/skills/api_contract_drift_check/skill.yaml`, `README.md`, optional `codex/SKILL.md`, public-safe templates, checklists, and synthetic examples only.

**ASSUMPTIONS:** The skill consumes redacted maintainer packets with `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, and `owner_notes`.

## skill_package_draft.md

Package draft:

```text
.registry/skills/api_contract_drift_check/
  skill.yaml
  README.md
  codex/SKILL.md
  templates/
    drift_packet_template.md
    evidence_matrix.md
    remediation_plan.md
  checklists/
    boundary_checklist.md
    smoke_checklist.md
```

`skill.yaml` should define:

```yaml
name: api_contract_drift_check
version: 0.1.0
description: Review redacted API contract drift packets and produce evidence-bounded remediation plans.
inputs:
  - openapi_changed_endpoints
  - generated_type_diff_summary
  - route_handler_touchpoints
  - test_failures
  - owner_notes
outputs:
  - confirmed_evidence
  - assumptions
  - boundary_warnings
  - remediation_order
  - owner_handoff
```

`codex/SKILL.md` should instruct agents to preserve runtime-only boundaries, avoid copying private endpoint names, and produce a concise review with evidence, assumptions, remediation order, and handoff.

## skill_resource_bundle_review.md

Approved resources:

- Redacted drift packet template.
- Evidence matrix template mapping claims to source fields.
- Remediation plan template ordered by contract, generated types, route handlers, tests, owners.
- Boundary checklist for private data exclusion.
- Smoke checklist using synthetic endpoint names only.

Helper script allowance:

- May validate only synthetic or redacted packets.
- Must not embed project-specific endpoint names.
- Must not read `_workspaces`, logs, credentials, or production artifacts.
- Should fail closed if required packet sections are missing.

## skill_boundary_review.md

Boundary risks:

- Real endpoint names may leak through `openapi_changed_endpoints`.
- Generated type diffs may reveal customer or internal domain terms.
- Route handler notes may expose private implementation paths.
- Test names may encode incident or customer context.
- Owner notes may contain private operational details.

Required handling:

- Treat all packet content as runtime evidence.
- Copy only generalized patterns into skill canon.
- Replace concrete identifiers with synthetic examples.
- Flag any unredacted production data as a boundary warning.
- Keep remediation bounded to evidence present in the packet.

## skill_install_sync_request.md

Local mirror sync handoff request:

- Prepare `.registry/skills/api_contract_drift_check/` with the drafted package structure.
- Include only public-safe templates, checklists, and synthetic fixtures.
- Exclude actual specs, logs, credentials, customer names, runtime packets, and `_workspaces` files.
- Review tracked files before sync for accidental private identifiers.
- After local review, perform mirror sync through the normal Soulforge registry process.

No sync is claimed as performed.

## skill_smoke_check.md

Synthetic smoke packet:

```yaml
openapi_changed_endpoints:
  - GET /synthetic/widgets
  - POST /synthetic/widgets
generated_type_diff_summary:
  - WidgetCreateRequest.required.name differs from generated TypeScript optionality.
route_handler_touchpoints:
  - createSyntheticWidget handler still accepts missing name.
test_failures:
  - test_widget_create_requires_name
owner_notes:
  - Contract owner should confirm whether name is required.
```

Expected smoke verification:

- Evidence identifies two changed endpoints.
- Evidence identifies one generated type mismatch.
- Evidence identifies one route handler note.
- Evidence identifies one failing test.
- Assumption is limited to owner confirmation need.
- Remediation orders contract confirmation before type, handler, and test updates.
- Boundary warnings confirm synthetic-only fixture and no private runtime data.

No smoke run is claimed as performed.

## skill_release_review.md

Release readiness:

- Package scope is narrow and reusable.
- Boundary between tracked canon and runtime evidence is explicit.
- Templates are public-safe.
- Helper script constraint is acceptable if limited to synthetic or redacted packets.
- Smoke path covers evidence, assumptions, owner handoff, remediation order, and boundary warnings.

Release condition:

- Ready after tracked files are created from the draft, reviewed for private identifiers, and locally synced through the registry process.