import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProjectBootstrapPreview } from "./project_bootstrap_preflight.mjs";

const register = {
  schema_version: "development_team1_project_bootstrap_v0.register_snapshot",
  number_policy: { format: "D1-YY-NNN", sequence_scope: "calendar_year", append_only: true },
  projects: [
    { code: "D1-26-001", title: "Example Existing Internal Project" },
    { code: "P26-001", title: "Example Existing Formal Project" },
  ],
};

function request(overrides = {}) {
  const base = {
    schema_version: "development_team1_project_bootstrap_v0.request",
    mode: "preview",
    project_kind: "internal",
    project_year: 2026,
    identity: { title: "Example New Internal Project", alias: "EXAMPLE_NEW", requested_code: null, objective: "Bounded result" },
    authority: { owner_project_creation_approved: true, owner_decision_ref: "owner-decision:synthetic" },
    people: { development_responsible: "Example Lead", practical_owner: "Example Owner", team_members: ["Example Lead", "Example Owner"] },
    storage: { project_payload_owner_ref: "worksite:<project_code>", metadata_owner_ref: "_workmeta/<project_code>", bot_workspace_policy_ref: "no-runtime" },
    source_boundary: { approved_source_owner_ref: "source:synthetic", raw_payload_in_workmeta: false },
    runtime: { requested: false, profiles: [] },
    integrations: {},
    compatibility: { daily_ledger_supported: false, mail_routing_supported: false },
  };
  return { ...base, ...overrides };
}

test("internal preview proposes the next append-only D1 code without mutation authority", () => {
  const input = request();
  const before = JSON.stringify(input);
  const preview = evaluateProjectBootstrapPreview(input, register);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "ready");
  assert.equal(preview.proposed_project_code, "D1-26-002");
  assert.equal(preview.mutation_allowed, false);
  assert.deepEqual(JSON.stringify(input), before);
});

test("duplicate project code and title fail closed", () => {
  const preview = evaluateProjectBootstrapPreview(request({
    identity: { title: " Example   Existing Internal Project ", alias: "DUP", requested_code: "D1-26-001", objective: "Duplicate" },
  }), register);
  assert.equal(preview.ok, false);
  assert.equal(preview.status, "hold");
  assert.ok(preview.blockers.includes("DUPLICATE_PROJECT_CODE"));
  assert.ok(preview.blockers.includes("DUPLICATE_PROJECT_TITLE"));
});

test("missing Owner authority fails closed", () => {
  const preview = evaluateProjectBootstrapPreview(request({
    authority: { owner_project_creation_approved: false, owner_decision_ref: null },
  }), register);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.includes("OWNER_PROJECT_CREATION_AUTHORITY_MISSING"));
});

test("missing storage and source boundaries fail closed", () => {
  const preview = evaluateProjectBootstrapPreview(request({ storage: {}, source_boundary: {} }), register);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.includes("STORAGE_BOUNDARY_INCOMPLETE"));
  assert.ok(preview.blockers.includes("SOURCE_BOUNDARY_INCOMPLETE"));
  assert.ok(preview.blockers.includes("RAW_PAYLOAD_WORKMETA_BOUNDARY_INVALID"));
});

test("approved integration without authority fails closed", () => {
  const preview = evaluateProjectBootstrapPreview(request({
    integrations: { slack: { state: "approved", authority_ref: null } },
  }), register);
  assert.equal(preview.ok, false);
  assert.ok(preview.blockers.includes("INTEGRATION_AUTHORITY_MISSING:slack"));
});

test("formal onboarding requires an exact authority-bound code", () => {
  const preview = evaluateProjectBootstrapPreview(request({
    project_kind: "formal",
    identity: { title: "Example New Formal Project", alias: "FORMAL", requested_code: "P26-002", objective: "Formal result" },
    authority: { owner_project_creation_approved: true, owner_decision_ref: "owner-decision:synthetic", project_code_authority_ref: "company-ledger:synthetic" },
  }), register);
  assert.equal(preview.ok, true);
  assert.equal(preview.proposed_project_code, "P26-002");
});

test("preview digest is deterministic", () => {
  const first = evaluateProjectBootstrapPreview(request(), register);
  const second = evaluateProjectBootstrapPreview(request(), register);
  assert.equal(first.preview_digest, second.preview_digest);
});
