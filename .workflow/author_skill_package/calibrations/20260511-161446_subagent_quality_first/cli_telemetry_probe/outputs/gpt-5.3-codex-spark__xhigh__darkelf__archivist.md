## skill_boundary_brief.md

**Profile metadata:** `gpt-5.3-codex-spark|xhigh|darkelf|archivist`  
**Skill target:** `.registry/skills/api_contract_drift_check`

1. Purpose is to review a redacted API contract drift packet and produce a bounded, evidence-first remediation summary for maintainers.
2. Inputs are limited to: `openapi_changed_endpoints`, `generated_type_diff_summary`, `route_handler_touchpoints`, `test_failures`, `owner_notes`.
3. The skill must separate each finding into two buckets: confirmed evidence (explicit in packet) and assumptions (inferred).
4. The output must include: an evidence ledger, assumption ledger, immediate remediation plan with sequencing, and explicit boundary warnings.
5. Prohibited from canonizing or storing: actual API specs, customer endpoint names, production logs, credentials, private incident details, and any runtime `_workspaces` file content.
6. No project-specific names in helper logic, only generic labels.
7. Helper script usage is allowed only when packet is synthetic/redacted and packet processing stays within allowed fields.

ASSUMPTIONS:
1. Maintainer-provided packet is already redacted before skill input.
2. Canon format accepts markdown checklist templates plus plain manifest metadata.
3. No external API calls are required for one-pass packet triage.

---

## skill_package_draft.md

1. Tracked skill artifacts:
2. `.registry/skills/api_contract_drift_check/skill.yaml`
3. `.registry/skills/api_contract_drift_check/README.md`
4. `.registry/skills/api_contract_drift_check/codex/SKILL.md` (optional)
5. `.registry/skills/api_contract_drift_check/templates/checklists/` (public-safe templates only)

1. `skill.yaml` draft intent:
2. `name: api_contract_drift_check`
3. `description: Reviews redacted API contract drift packets and emits evidence/assumption split and remediation plan`
4. `version: 0.1.0`
5. `inputs:` include the five required packet fields.
6. `outputs:` evidence_table, assumption_table, remediation_plan, boundary_warnings, owner_handoff.
7. `constraints:` enforce no raw endpoint/prod-spec/log/credential content in canonical artifacts.
8. `smoke_profile: synthetic_redacted_packet_v1`.

1. `README.md` draft intent:
2. Define what packet fields mean, review cadence (triage-only), and output contract.
3. Show reusable example packet schema and expected outputs.
4. Specify boundary behavior and non-goals clearly.
5. Provide one-line onboarding for maintainers.

1. `codex/SKILL.md` draft intent:
2. Execution playbook: validate packet, classify signals, emit evidence and assumptions, rank fixes, add boundary warnings.
3. Explicitly note where synthetic helper preprocessing is allowed and where it is blocked.

---

## skill_resource_bundle_review.md

1. Public-safe templates/checklists to include:
2. `templates/checklists/evidence_checklist.md`
3. `templates/checklists/assumption_checklist.md`
4. `templates/checklists/remediation_plan_template.md`
5. `templates/checklists/boundary_warning_template.md`
6. `templates/checklists/owner_handoff_template.md`

1. Resource policy:
2. No endpoint strings from real customer environments.
3. No credentials, logs, incident narratives, or `_workspaces` snippets in template text.
4. No script code or runtime file dumps in tracked templates.
5. Language must remain abstract, reusable, and redaction-safe.

1. Acceptance:
2. Templates should force explicit marking of confidence level for every assumption.
3. Remediation section must be ordered by dependency/risk (validation, contract alignment, handler alignment, test stabilization).

---

## skill_boundary_review.md

1. Boundary-in = redacted packet fields listed above, helper metadata, and remediation trace.
2. Boundary-out = direct API specification URLs, concrete customer endpoint names, prod logs, secrets, incident artifacts, raw workspace runtime files.
3. Runtime-only items:
4. `_workspaces` directory remains out-of-pack and out-of-canon.
5. Any generated packet normalization helper output must be used only in workspace and never committed to registry canon.
6. If any out-of-bound item appears, the skill must emit a hard warning and halt with "boundary_violation".
7. Evidence-only policy:
8. Mentioning that something happened is allowed only when supported by explicit packet fields.
9. Inference without source must be labeled as assumption.

ASSUMPTIONS:
1. Input packet already includes minimal redaction markers (if sensitive values exist).
2. Maintainers accept boundary warnings as actionable remediation blockers, not cosmetic notes.

---

## skill_install_sync_request.md

1. Scope: prepare local mirror sync handoff for `.registry/skills/api_contract_drift_check`.
2. Build packet:
3. Manifest manifest file list:
4. `.registry/skills/api_contract_drift_check/skill.yaml`
5. `.registry/skills/api_contract_drift_check/README.md`
6. `.registry/skills/api_contract_drift_check/codex/SKILL.md` (if included)
7. `.registry/skills/api_contract_drift_check/templates/checklists/*.md`
8. Include change summary: reusable synthetic-safe drift review skill with evidence/assumption split and boundary gates.
9. Include risk notes: no canonical sensitive data, no runtime files.

1. Sync status:
2. Sync is requested as a local mirror handoff only.
3. Do not perform sync in this step.

---

## skill_smoke_check.md

1. Synthetic packet fixture (redacted/synthetic):
2. `openapi_changed_endpoints`: `[{"path":"/api/v1/resource-a","method":"GET","change":"response adds `quota_remaining` as optional integer"}]`
3. `generated_type_diff_summary`: `[{"file":"types/resource-a.ts","field":"quotaRemaining","openapi_type":"integer","generated_type":"string","note":"generated mismatch"}]`
4. `route_handler_touchpoints`: `[{"path":"/api/v1/resource-b","method":"POST","note":"handler returns 202 with no payload while contract expects 200 with `id`"}]`
5. `test_failures`: `["contract_test::post_resource_b_returns_id"]`
6. `owner_notes`: `["Type pipeline generated from old schema cache"]`

1. Expected verify outputs:
2. Evidence must include three explicit findings: one openapi change, one type mismatch, one handler route mismatch, one failing test link.
3. Assumptions must include at least one explicit inference line, e.g., "failure likely tied to route contract mismatch" (must be tagged assumption).
4. Owner handoff must include: packet owner, decision owner, and blocker if boundary warning exists.
5. Remediation order:
6. First block: fix data type contract source of truth for `resource-a`.
7. Second block: fix route handler behavior for `resource-b` response shape/status.
8. Third block: rerun targeted contract tests.
9. Boundary warnings must explicitly note: synthetic packet only, no endpoint or log provenance claims beyond provided fields.

1. Hard success criteria:
2. No private data references.
3. Evidence/assumption sections present and separated.
4. One ranked plan and one explicit boundary warning emitted.
5. No claim of live run is made.

---

## skill_release_review.md

1. Release readiness gates:
2. Boundaries enforced with redaction-safe policy in manifest and templates.
3. Evidence/assumption split implemented and visible in sample outputs.
4. Remediation plan is bounded and ordered.
5. Owner handoff block always required.
6. `_workspaces` remains runtime-only and uncopied.

1. Release risks:
2. Over-broad route handler inference from sparse packet data.
3. Misclassification of synthetic names as real endpoint names.
4. Missing boundary warning when packet contains unsupported sensitive field.

1. Acceptance:
2. Keep payloads public-safe by construction.
3. Keep helper logic non-tracked and only for synthetic packet preparation.
4. No live sync/test/file edits performed during package-authoring handoff.
