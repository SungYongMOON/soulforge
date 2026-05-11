## skill_boundary_brief.md

**Purpose:** Define a public-safe Soulforge skill package for `api_contract_drift_check`.

**Runtime-Only Boundary:** Do not copy actual API specs, customer endpoint names, production logs, credentials, private incident details, or `_workspaces` runtime files into tracked skill canon.

**Tracked Canon Allowed:** `.registry/skills/api_contract_drift_check/skill.yaml`, `README.md`, optional `codex/SKILL.md`, and public-safe templates/checklists.

**Assumption:** All examples use synthetic or redacted API contract drift packets only.

---

## skill_package_draft.md

**Skill Name:** `api_contract_drift_check`

**Use Case:** Help an agent review a redacted API contract drift packet and produce a bounded remediation plan.

**Input Packet Fields:**
- `openapi_changed_endpoints`
- `generated_type_diff_summary`
- `route_handler_touchpoints`
- `test_failures`
- `owner_notes`

**Core Workflow:**
1. Identify claimed drift across OpenAPI, generated TypeScript types, route handlers, and tests.
2. Separate confirmed evidence from assumptions.
3. Flag missing or unsafe evidence.
4. Produce remediation order.
5. Prepare owner handoff with unresolved questions.

**Allowed Helper Script:** May validate synthetic/redacted packet shape only. Must not include project-specific endpoint names.

---

## skill_resource_bundle_review.md

**Proposed Tracked Resources:**
- `README.md`: skill overview, boundaries, input packet schema.
- `skill.yaml`: trigger metadata and package description.
- `codex/SKILL.md`: executor instructions.
- `templates/drift_packet_template.md`: public-safe packet shape.
- `checklists/evidence_review.md`: evidence and assumption checklist.
- `checklists/remediation_order.md`: bounded planning checklist.

**Rejected Resources:**
- Real OpenAPI files.
- Real route names.
- Production logs.
- Customer-specific examples.
- Private incident notes.
- `_workspaces` files.

---

## skill_boundary_review.md

**Confirmed Boundary Rules:**
- Keep tracked skill canon generic and reusable.
- Treat maintainer packets as runtime evidence.
- Never promote packet contents into canon unless fully synthetic.
- Use placeholder endpoint names such as `/example/items` only.
- Mark inferred drift explicitly as assumption.

**Risk Areas:**
- Copying endpoint names from owner notes.
- Treating generated type diffs as confirmed OpenAPI drift without source evidence.
- Turning one incident’s remediation into permanent canon.

---

## skill_install_sync_request.md

**Local Mirror Sync Handoff Prepared:** Yes.

**Requested Sync Scope:**
- `.registry/skills/api_contract_drift_check/skill.yaml`
- `.registry/skills/api_contract_drift_check/README.md`
- `.registry/skills/api_contract_drift_check/codex/SKILL.md`
- Public-safe templates and checklists only.

**Do Not Sync:**
- Runtime packets.
- `_workspaces` contents.
- Private project artifacts.
- Real API contract material.

**Status:** Handoff only. No sync performed.

---

## skill_smoke_check.md

**Synthetic Smoke Fixture:**
- Endpoints: `/example/accounts`, `/example/orders`
- Generated type mismatch: `OrderStatus` allows value missing from generated client type.
- Route handler note: `/example/orders` handler still accepts legacy payload field.
- Failing test: `orders_contract_generated_type_alignment.test.ts`
- Owner note: generated client may be stale.

**Expected Checks:**
- Evidence is separated from assumptions.
- Owner note is not treated as proof.
- Remediation order starts with contract/source confirmation.
- Type regeneration and route-handler alignment follow evidence review.
- Boundary warnings mention no real endpoint names or runtime files.

**Status:** Smoke path specified. No smoke run performed.

---

## skill_release_review.md

**Release Readiness:** Draft-ready with boundary constraints.

**Must-Have Before Release:**
- Public-safe examples only.
- Explicit runtime-only warning.
- Clear evidence vs assumption output format.
- Owner handoff template.
- Remediation ordering checklist.

**Release Blockers:**
- Any real endpoint/customer/project names.
- Any production logs or credentials.
- Any copied `_workspaces` files.
- Helper script using non-synthetic fixtures.

**Recommendation:** Release only after confirming all tracked files contain generic, reusable, redacted-safe content.