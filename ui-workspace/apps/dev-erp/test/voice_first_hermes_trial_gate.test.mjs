import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_HERMES_MCP_TOOLS,
  ALLOWED_ISOLATION_KINDS,
  HERMES_HOLD_CODES as C,
  HERMES_TRIAL_PACKET_SCHEMA,
  HERMES_TRIAL_POLICY_REVISION,
  evaluateHermesTrial,
} from "../src/voice_first_hermes_trial_gate.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function packet(overrides = {}) {
  return {
    schema_version: HERMES_TRIAL_PACKET_SCHEMA,
    trial_id: "trial_hermes_synth_001",
    policy_ref: HERMES_TRIAL_POLICY_REVISION,
    runtime_pin: {
      version_ref: "hermes-agent-v0.4.0", version_digest: digest("1"), host_ref: "host_isolated_01",
      host_attestation_ref: "attestation_host_01", host_attestation_digest: digest("2"), isolation_kind: "docker",
      isolation_binding_ref: "binding_isolation_01", isolation_binding_digest: digest("3"),
    },
    seat_mapping: { platform_user_ref: "usr_owner_01", seat_ref: "seat_hermes_01", erp_account_ref: "acc_erp_01", seat_mode: "one_seat_only" },
    project_mapping: { project_ref: "P01-001", allowed_projects: ["P01-001"] },
    mcp_tool_set: { allowed_tools: ["read_context", "query_task"], forbidden_tools_declared: ["write_task"], auto_install_enabled: false, mutation_tools_enabled: false, sampling_enabled: false },
    delivery_adapter: { adapter_ref: "adp_voice_01", idempotency_key: "idem_hermes_001", channel_ref: "channel_hermes_01" },
    retention_policy: { transcript_retention: "custody_only", memory_policy: "isolated_client_local_only", auto_promotion_enabled: false, delete_consent: true },
    attachment_policy: { custody_receipt_ref: "receipt_custody_01", direct_promotion_enabled: false, custody_mode: "ingress_receipt_only" },
    rollback_packet: { rollback_ref: "rollback_hermes_01", rollback_digest: digest("4"), rollback_mode: "clean_shutdown" },
    time_window: { valid_from: "2026-08-21T21:00:00.000Z", valid_to: "2026-08-21T22:00:00.000Z", observed_at: "2026-08-21T21:30:00.000Z" },
    proposal_payload: { candidate_id: "candidate_hermes_01", candidate_type: "task_proposal", summary: "Draft candidate proposal for review", evidence_refs: ["ev_hermes_01", "ev_hermes_02"] },
    runtime_flags: { orca_nesting_enabled: false, workbench_spawn_enabled: false, scheduler_enabled: false, cron_enabled: false, task_mutation_enabled: false, completion_authority_enabled: false },
    ...overrides,
  };
}

function assertHold(result, code) {
  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_codes.includes(code), true, `${code}: ${result.hold_codes.join(", ")}`);
}

test("valid exact Hermes runtime pin produces an immutable digest-bound proposal", () => {
  const result = evaluateHermesTrial(packet());
  assert.equal(result.status, "PROPOSAL_READY");
  assert.equal(result.proposal.runtime_evidence.version_digest, digest("1"));
  assert.equal(result.proposal.runtime_evidence.host_attestation_digest, digest("2"));
  assert.equal(result.proposal.runtime_evidence.isolation_binding_digest, digest("3"));
  assert.deepEqual(result.proposal.effect_counters, { linear_mutations: 0, erp_mutations: 0, gmail_sends: 0, slack_posts: 0, git_commits: 0, task_mutations: 0, external_calls: 0 });
  assert.equal(Object.isFrozen(result.proposal), true);
  assert.equal(Object.isFrozen(result.proposal.runtime_evidence), true);
});

test("exported allowlists are immutable arrays and cannot alter enforcement", () => {
  assert.equal(Object.isFrozen(ALLOWED_HERMES_MCP_TOOLS), true);
  assert.equal(Object.isFrozen(ALLOWED_ISOLATION_KINDS), true);
  assert.throws(() => ALLOWED_HERMES_MCP_TOOLS.push("write_task"));
  assert.throws(() => ALLOWED_ISOLATION_KINDS.push("bare_host"));
  const forbidden = packet({ mcp_tool_set: { ...packet().mcp_tool_set, allowed_tools: ["write_task"] } });
  assertHold(evaluateHermesTrial(forbidden), C.FORBIDDEN_MCP_TOOLS);
});

test("runtime pin rejects floating version synonyms, unpinned digests, and self-declared attestation strings", () => {
  for (const versionRef of ["latest", "LATEST", "main", "HEAD", "edge", "NIGHTLY", "dev", "hermes-v0.4.0-dev"]) {
    assertHold(evaluateHermesTrial(packet({ runtime_pin: { ...packet().runtime_pin, version_ref: versionRef } })), C.UNTRUSTED_RUNTIME_PIN);
  }
  assertHold(evaluateHermesTrial(packet({ runtime_pin: { ...packet().runtime_pin, version_digest: "sha256:bad" } })), C.UNTRUSTED_RUNTIME_PIN);
  assertHold(evaluateHermesTrial(packet({ runtime_pin: { ...packet().runtime_pin, host_attestation_ref: "host_isolated_01" } })), C.UNTRUSTED_RUNTIME_PIN);
  assertHold(evaluateHermesTrial(packet({ runtime_pin: { ...packet().runtime_pin, isolation_binding_digest: "sha256:bad" } })), C.UNTRUSTED_RUNTIME_PIN);
});

test("identity and project mappings are exact single-ref bindings", () => {
  assertHold(evaluateHermesTrial(packet({ seat_mapping: { ...packet().seat_mapping, seat_mode: "shared" } })), C.SHARED_OR_UNKNOWN_IDENTITY);
  assertHold(evaluateHermesTrial(packet({ seat_mapping: { ...packet().seat_mapping, seat_ref: "usr_owner_01" } })), C.SHARED_OR_UNKNOWN_IDENTITY);
  assertHold(evaluateHermesTrial(packet({ project_mapping: { project_ref: "P01-001", allowed_projects: ["P01-001", "P02-002"] } })), C.CROSS_PROJECT_OR_INVALID_MAPPING);
});

test("time windows use the canonical millisecond UTC form and numeric ordering", () => {
  assertHold(evaluateHermesTrial(packet({ time_window: { valid_from: "2026-08-21T21:00:00Z", valid_to: "2026-08-21T22:00:00.000Z", observed_at: "2026-08-21T21:30:00.000Z" } })), C.TIME_WINDOW_INVALID);
  assertHold(evaluateHermesTrial(packet({ time_window: { valid_from: "2026-08-21T21:00:00.900Z", valid_to: "2026-08-21T21:00:00.100Z", observed_at: "2026-08-21T21:00:00.500Z" } })), C.TIME_WINDOW_INVALID);
});

test("proposal IDs cover the full canonical proposal body", () => {
  const first = evaluateHermesTrial(packet());
  const second = evaluateHermesTrial(packet({ proposal_payload: { ...packet().proposal_payload, summary: "A changed bounded proposal" } }));
  assert.equal(first.status, "PROPOSAL_READY");
  assert.equal(second.status, "PROPOSAL_READY");
  assert.notEqual(first.proposal.proposal_id, second.proposal.proposal_id);
});

test("snapshot boundary rejects throwing accessors and cycles", () => {
  const accessor = packet();
  Object.defineProperty(accessor, "trial_id", { enumerable: true, get() { throw new Error("TOCTOU"); } });
  assertHold(evaluateHermesTrial(accessor), C.INVALID_PACKET_SHAPE);
  const cyclic = packet();
  cyclic.runtime_pin.self = cyclic;
  assertHold(evaluateHermesTrial(cyclic), C.INVALID_PACKET_SHAPE);
});

test("disallowed flags remain HOLD and hold codes remain unique and sorted", () => {
  const result = evaluateHermesTrial(packet({
    runtime_flags: { orca_nesting_enabled: true, workbench_spawn_enabled: false, scheduler_enabled: true, cron_enabled: false, task_mutation_enabled: true, completion_authority_enabled: true },
  }));
  assertHold(result, C.ORCA_NESTING_FORBIDDEN);
  assert.deepEqual(result.hold_codes, [...new Set(result.hold_codes)].sort());
});

test("forbidden MCP declarations are closed safe tokens, disjoint, and proposal-bound", () => {
  const valid = evaluateHermesTrial(packet());
  assert.equal(valid.status, "PROPOSAL_READY");
  assert.deepEqual(valid.proposal.runtime_evidence.forbidden_tools_declared, ["write_task"]);
  assert.match(valid.proposal.runtime_evidence.forbidden_tools_digest, /^sha256:[a-f0-9]{64}$/u);
  assertHold(evaluateHermesTrial(packet({ mcp_tool_set: { ...packet().mcp_tool_set, forbidden_tools_declared: ["read_context"] } })), C.FORBIDDEN_MCP_TOOLS);
  assertHold(evaluateHermesTrial(packet({ mcp_tool_set: { ...packet().mcp_tool_set, forbidden_tools_declared: ["unsafe tool"] } })), C.FORBIDDEN_MCP_TOOLS);
  assertHold(evaluateHermesTrial(packet({ mcp_tool_set: { ...packet().mcp_tool_set, forbidden_tools_declared: "write_task" } })), C.FORBIDDEN_MCP_TOOLS);
});

test("Hermes bounds duration and validates idempotency plus distinct runtime evidence digests", () => {
  assertHold(evaluateHermesTrial(packet({ time_window: { valid_from: "2026-08-21T21:00:00.000Z", valid_to: "2026-08-22T21:00:00.000Z", observed_at: "2026-08-21T21:30:00.000Z" } })), C.TIME_WINDOW_INVALID);
  assertHold(evaluateHermesTrial(packet({ delivery_adapter: { ...packet().delivery_adapter, idempotency_key: "not safe" } })), C.MISSING_IDEMPOTENCY_KEY);
  assertHold(evaluateHermesTrial(packet({ runtime_pin: { ...packet().runtime_pin, host_attestation_digest: digest("1") } })), C.UNTRUSTED_RUNTIME_PIN);
});
