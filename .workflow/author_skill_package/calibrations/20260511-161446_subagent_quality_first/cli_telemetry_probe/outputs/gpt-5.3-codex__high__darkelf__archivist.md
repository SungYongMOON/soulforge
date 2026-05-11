## skill_boundary_brief.md
```md
# skill_boundary_brief

Profile: `gpt-5.3-codex|high|darkelf|archivist`

## Purpose
Define a reusable Soulforge skill, `api_contract_drift_check`, for reviewing a **public-safe, redacted** API contract drift packet and producing a bounded remediation plan.

## In Scope
- Packet fields:
  - `openapi_changed_endpoints`
  - `generated_type_diff_summary`
  - `route_handler_touchpoints`
  - `test_failures`
  - `owner_notes`
- Separate:
  - Confirmed evidence
  - Assumptions / unknowns
- Output:
  - Prioritized remediation order
  - Owner handoff notes
  - Boundary warnings

## Out of Scope (Runtime-Only)
- Actual API specs
- Customer endpoint names
- Production logs
- Credentials/secrets
- Private incident details
- `_workspaces` runtime files

## Canon Boundary
Tracked skill canon may include only:
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- Optional `.registry/skills/api_contract_drift_check/codex/SKILL.md`
- Public-safe templates/checklists
```

## skill_package_draft.md
```md
# skill_package_draft

## Proposed Package Layout
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
- `.registry/skills/api_contract_drift_check/templates/drift_packet_template.md`
- `.registry/skills/api_contract_drift_check/templates/remediation_plan_template.md`
- `.registry/skills/api_contract_drift_check/checklists/boundary_checklist.md`
- `.registry/skills/api_contract_drift_check/scripts/synthetic_packet_helper.*` (optional, synthetic/redacted only)

## skill.yaml Draft Fields
- `name`: `api_contract_drift_check`
- `purpose`: Public-safe API drift triage
- `inputs`: Redacted packet fields only
- `outputs`: Evidence table, assumptions table, remediation order, owner handoff
- `constraints`: No private/runtime-only data in canon
- `safety`: Boundary warnings required
```

## skill_resource_bundle_review.md
```md
# skill_resource_bundle_review

## Required Public-Safe Assets
- Drift packet template with placeholder endpoint IDs (e.g., `endpoint_a`, `endpoint_b`)
- Evidence vs Assumption checklist
- Remediation ordering checklist:
  1. Contract correctness
  2. Generated type alignment
  3. Route handler updates
  4. Test stabilization
  5. Owner handoff

## Optional Helper Script Policy
- Allowed only for synthetic/redacted fixtures
- Must not encode project-specific endpoint names
- Must not read/write runtime-private artifacts
```

## skill_boundary_review.md
```md
# skill_boundary_review

## Boundary Verification Matrix
- Public-safe packet fields only: PASS (design intent)
- Runtime/private artifacts excluded from canon: PASS (design intent)
- Secret/log/customer data exclusion explicit: PASS (design intent)
- Canon file scope bounded: PASS (design intent)
- Risk: Owner notes may contain private detail -> Mitigation: redact checklist gate before use
- Risk: Endpoint labels may leak identity -> Mitigation: enforce generic aliases in templates
```

## skill_install_sync_request.md
```md
# skill_install_sync_request

## Local Mirror Sync Handoff (Request-Only)
Please perform local mirror sync for `api_contract_drift_check` package after review, including:
1. Validate canonical file set and public-safe templates.
2. Confirm optional helper script is synthetic-only and generic-labeled.
3. Sync to local skill mirror.
4. Return sync result with any boundary exceptions.

Status: Prepared for handoff. No sync claimed.
```

## skill_smoke_check.md
```md
# skill_smoke_check

## Synthetic Smoke Fixture (Tiny)
- Endpoints: `endpoint_a`, `endpoint_b`
- Generated type mismatch: 1 item
- Route handler touchpoint note: 1 item
- Failing test name: `test_contract_endpoint_a_returns_200`

## Expected Smoke Assertions
- Evidence list identifies only packet-backed facts
- Assumptions list captures unresolved claims
- Owner handoff includes explicit asks and blockers
- Remediation order is bounded and dependency-aware
- Boundary warnings appear when private/runtime data is referenced

Status: Smoke plan prepared. No smoke run claimed.
```

## skill_release_review.md
```md
# skill_release_review

## Release Readiness (Draft)
- Scope definition: Ready
- Canon boundary controls: Ready (design-level)
- Public-safe templates/checklists: Required before release
- Synthetic helper script guardrails: Required if script included
- Install/sync handoff: Prepared, pending execution
- Smoke validation: Defined, pending execution

## Release Decision
Conditional go after:
1. Template/checklist files are present.
2. Boundary checklist is attached to workflow.
3. Local mirror sync and smoke results are provided.
```