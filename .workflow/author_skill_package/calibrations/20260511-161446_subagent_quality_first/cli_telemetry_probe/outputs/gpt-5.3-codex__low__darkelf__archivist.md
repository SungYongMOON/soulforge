## skill_boundary_brief.md
- **Skill**: `api_contract_drift_check`
- **Purpose**: Review a public-safe API contract drift packet and separate confirmed drift evidence from assumptions, then produce a bounded remediation plan.
- **In scope**:
  - `openapi_changed_endpoints`
  - `generated_type_diff_summary`
  - `route_handler_touchpoints`
  - `test_failures`
  - `owner_notes`
  - Evidence/assumption split, remediation sequencing, owner handoff notes
- **Out of scope / runtime-only**:
  - Actual API specs
  - Customer endpoint names
  - Production logs
  - Credentials
  - Private incident details
  - `_workspaces` runtime files
- **Boundary rule**: Runtime-sensitive artifacts must not be copied into tracked skill canon.

## skill_package_draft.md
- **Package root**: `.registry/skills/api_contract_drift_check/`
- **Tracked files**:
  - `skill.yaml`
  - `README.md`
  - `codex/SKILL.md` (optional)
  - `templates/` (public-safe packet template, evidence ledger template, remediation checklist)
  - `checklists/` (boundary gate, handoff gate)
- **Helper script policy**:
  - Allowed only for synthetic/redacted packets
  - Must not contain project-specific endpoint names
- **Core outputs expected from skill run**:
  - Confirmed evidence table
  - Assumptions table
  - Ordered remediation plan
  - Owner handoff block
  - Boundary warnings

## skill_resource_bundle_review.md
- **Required public-safe resources**:
  - Synthetic packet schema example
  - Evidence vs assumption rubric
  - Remediation prioritization rubric (contract-first, typegen-next, handlers-next, tests-last validation)
  - Handoff template for maintainers
- **Optional resources**:
  - Minimal redaction guide
  - Drift triage checklist
- **Resource exclusions**:
  - Real endpoint inventories
  - Internal runbooks with sensitive topology
  - Incident timelines with private details
  - Any runtime `_workspaces` artifacts

## skill_boundary_review.md
- **Boundary assertions**:
  - Skill canon stores only reusable, public-safe methodology and templates.
  - Runtime packet contents are treated as ephemeral review input.
  - No private identifiers, credentials, logs, or customer-specific API details enter tracked files.
- **Risk points**:
  - Owner notes may include hidden sensitive identifiers.
  - Route handler touchpoints may reveal internal structure.
- **Mitigations**:
  - Explicit redaction gate before analysis.
  - “Assumption if unverified” default.
  - Mandatory boundary warning block in final skill output.

## skill_install_sync_request.md
- **Intent**: Prepare install/mirror sync handoff for `api_contract_drift_check`.
- **Requested handoff contents**:
  - Target path: `.registry/skills/api_contract_drift_check/`
  - File manifest and checksum list
  - Version tag proposal (e.g., `0.1.0-synthetic`)
  - Validation checklist: boundary compliance, template completeness, helper-script policy
- **Operational note**:
  - Sync/install execution is pending operator action.
  - This document is a request/handoff only, not an execution record.

## skill_smoke_check.md
- **Synthetic smoke fixture**:
  - Two endpoints in `openapi_changed_endpoints`
  - One generated type mismatch in `generated_type_diff_summary`
  - One route handler touchpoint note
  - One failing test name in `test_failures`
- **Expected verification points**:
  - Evidence entries are explicitly confirmed from packet fields
  - Assumptions are labeled and isolated
  - Owner handoff includes unresolved decisions
  - Remediation order is bounded and prioritized
  - Boundary warnings are emitted
- **Pass criteria**:
  - No sensitive/runtime-only data promoted to canon-style output
  - Clear separation of fact vs inference in final report shape

## skill_release_review.md
- **Release readiness**: Conditionally ready as synthetic/public-safe draft.
- **Must-have before release**:
  - `skill.yaml` scope and boundary text finalized
  - README includes runtime-only exclusions and redaction-first workflow
  - Templates/checklists validated against smoke fixture expectations
  - Helper script policy explicitly restricted to synthetic/redacted input
- **Known constraints**:
  - Designed for packet-based drift triage, not direct spec/log ingestion
  - Requires maintainer-provided redacted packet quality for reliable outcomes