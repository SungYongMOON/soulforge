import test from "node:test";
import assert from "node:assert/strict";

import {
  HERMES_AGENT_BACKUP_CODES,
  HERMES_AGENT_BACKUP_PACKET_SCHEMA_VERSION,
  evaluateHermesAgentBackupGeneration,
} from "./hermes_agent_backup_manifest.mjs";

function hash(seed) {
  const hex = Buffer.from(seed.repeat(64), "utf8").toString("hex").slice(0, 64).padEnd(64, "0");
  return `sha256:${hex}`;
}

let refSequence = 0;
function ref(seed = "a") {
  refSequence += 1;
  const serial = refSequence.toString(16).padStart(12, "0");
  return {
    entity_id: `00000000-0000-4000-8000-${serial}`,
    revision_id: `10000000-0000-4000-9000-${serial}`,
    content_id: hash(seed),
    content_hash_alg: "sha256",
  };
}

function clone(value) {
  return structuredClone(value);
}

function fixture() {
  const backupGenerationRef = ref("b");
  const backupManifestRef = ref("m");
  const payloadDigest = hash("p");
  return {
    schema_version: HERMES_AGENT_BACKUP_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    agent_binding: { agent_mark_ref: ref("a"), deployment_ref: ref("d") },
    runtime_binding: {
      runtime_kind: "hermes",
      runtime_ref: ref("r"),
      runtime_version: "0.20.5",
      profile_ref: ref("f"),
      bridge_mode: "hermes_native_gateway",
      gateway_ref: ref("g"),
      plugin_ref: ref("l"),
      runtime_config_sha256: hash("c"),
      secret_refs: [ref("s")],
    },
    instruction_custody: {
      soul_ref: ref("o"),
      soul_sha256: null,
      instruction_manifest_ref: ref("i"),
      instruction_manifest_sha256: null,
      instruction_refs: [ref("j"), ref("k")],
    },
    capability_custody: {
      skills_manifest_ref: ref("q"),
      skill_refs: [ref("u"), ref("v")],
      workflows_manifest_ref: ref("w"),
      workflow_refs: [ref("x")],
      tool_allowlist_manifest_ref: ref("t"),
      tool_allowlist_refs: [ref("y")],
    },
    session_custody: {
      session_store_ref: ref("e"),
      session_manifest_ref: ref("n"),
      session_manifest_sha256: null,
      session_count: 3,
      canonical_bot_chat_ref: ref("h"),
      buzz_session_ref: ref("z"),
      crosswalk_state: "verified",
      crosswalk_ref: ref("0"),
      raw_chat_capture: false,
      raw_prompt_capture: false,
      tool_output_capture: false,
    },
    memory_custody: {
      generation_ref: ref("1"),
      manifest_ref: ref("2"),
      manifest_sha256: null,
      classification: "agent_private_memory",
      retention_policy_ref: ref("3"),
      retention_class: "bounded_generation",
      raw_memory_capture: false,
    },
    schedule_custody: {
      definitions_manifest_ref: ref("4"),
      definition_count: 2,
      schedule_refs: [ref("5"), ref("6")],
      metadata_only: true,
      raw_definition_capture: false,
    },
    backup_generation: {
      generation_ref: backupGenerationRef,
      manifest_ref: backupManifestRef,
      manifest_sha256: backupManifestRef.content_id,
      payload_sha256: payloadDigest,
      asset_count: 0,
      included_asset_refs: [],
      byte_count: 4096,
      classification: "metadata_only_agent_deployment_backup",
      sealed: true,
    },
    restore_readback: {
      source_generation_ref: clone(backupGenerationRef),
      restore_generation_ref: ref("7"),
      isolated_target_ref: ref("8"),
      readback_manifest_ref: clone(backupManifestRef),
      readback_manifest_sha256: backupManifestRef.content_id,
      readback_payload_sha256: payloadDigest,
      exact_readback: true,
      rollback_target_ref: ref("9"),
      rollback_verified: true,
    },
    human_acceptance: {
      state: "accepted",
      reviewer_ref: ref("a"),
      decision_ref: ref("b"),
      accepted_generation_ref: clone(backupGenerationRef),
      restore_receipt_ref: ref("c"),
    },
    claim_boundaries: {
      backup_completeness_only: true,
      agent_readiness_evaluated: false,
      task_done_evaluated: false,
      accepted_context_evaluated: false,
      runtime_effects_allowed: false,
      raw_payload_capture_allowed: false,
    },
  };
}

function bindDigests(packet) {
  packet.instruction_custody.soul_sha256 = packet.instruction_custody.soul_ref.content_id;
  packet.instruction_custody.instruction_manifest_sha256 = packet.instruction_custody.instruction_manifest_ref.content_id;
  packet.session_custody.session_manifest_sha256 = packet.session_custody.session_manifest_ref.content_id;
  packet.memory_custody.manifest_sha256 = packet.memory_custody.manifest_ref.content_id;
  const included = [
    packet.agent_binding.agent_mark_ref,
    packet.agent_binding.deployment_ref,
    packet.runtime_binding.runtime_ref,
    packet.runtime_binding.profile_ref,
    packet.runtime_binding.gateway_ref,
    packet.runtime_binding.plugin_ref,
    ...packet.runtime_binding.secret_refs,
    packet.instruction_custody.soul_ref,
    packet.instruction_custody.instruction_manifest_ref,
    ...packet.instruction_custody.instruction_refs,
    packet.capability_custody.skills_manifest_ref,
    ...packet.capability_custody.skill_refs,
    packet.capability_custody.workflows_manifest_ref,
    ...packet.capability_custody.workflow_refs,
    packet.capability_custody.tool_allowlist_manifest_ref,
    ...packet.capability_custody.tool_allowlist_refs,
    packet.session_custody.session_store_ref,
    packet.session_custody.session_manifest_ref,
    packet.session_custody.canonical_bot_chat_ref,
    packet.session_custody.buzz_session_ref,
    packet.session_custody.crosswalk_ref,
    packet.memory_custody.generation_ref,
    packet.memory_custody.manifest_ref,
    packet.memory_custody.retention_policy_ref,
    packet.schedule_custody.definitions_manifest_ref,
    ...packet.schedule_custody.schedule_refs,
  ];
  packet.backup_generation.included_asset_refs = included.map((assetRef) => clone(assetRef));
  packet.backup_generation.asset_count = included.length;
  return packet;
}

test("Hermes Agent backup manifest accepts exact metadata custody and keeps other authority unevaluated", () => {
  const result = evaluateHermesAgentBackupGeneration(bindDigests(fixture()));
  assert.equal(result.status, "BACKUP_MANIFEST_READY");
  assert.deepEqual(result.blocker_codes, []);
  assert.equal(result.receipt.backup_completeness, "manifest_contract_satisfied");
  assert.equal(result.receipt.isolated_restore_readback, "evidence_ref_bound");
  assert.equal(result.receipt.human_acceptance, "evidence_ref_bound");
  assert.equal(result.receipt.agent_operational_readiness, "not_evaluated");
  assert.equal(result.receipt.task_completion, "not_evaluated");
  assert.equal(result.receipt.accepted_context_promotion, "not_evaluated");
  assert.equal(result.receipt.claim_ceiling, "metadata_contract_only");
  assert.deepEqual(result.receipt.effects, { filesystem: 0, runtime: 0, network: 0, process: 0, clock: 0 });
  assert.match(result.manifest.manifest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.manifest.runtime_binding), true);
});

test("manifest is deterministic across caller key and ref-list order", () => {
  const first = bindDigests(fixture());
  const second = clone(first);
  second.runtime_binding.secret_refs.reverse();
  second.instruction_custody.instruction_refs.reverse();
  second.capability_custody.skill_refs.reverse();
  second.schedule_custody.schedule_refs.reverse();
  const reordered = Object.fromEntries(Object.entries(second).reverse());
  const left = evaluateHermesAgentBackupGeneration(first);
  const right = evaluateHermesAgentBackupGeneration(reordered);
  assert.equal(left.status, "BACKUP_MANIFEST_READY");
  assert.equal(right.status, "BACKUP_MANIFEST_READY");
  assert.equal(left.receipt.packet_sha256, right.receipt.packet_sha256);
  assert.equal(left.receipt.manifest_sha256, right.receipt.manifest_sha256);
});

test("canonical Bot Chat and Buzz sessions require an explicit verified crosswalk", () => {
  const packet = bindDigests(fixture());
  packet.session_custody.crosswalk_state = "not_established";
  packet.session_custody.crosswalk_ref = null;
  const result = evaluateHermesAgentBackupGeneration(packet);
  assert.equal(result.status, "HOLD");
  assert.equal(result.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.SESSION_CROSSWALK_REQUIRED), true);
  assert.equal(result.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED), true);
  assert.equal(result.manifest, null);
});

test("manifest, payload, restore, rollback, and human acceptance mismatches fail closed", () => {
  const cases = [
    (packet) => { packet.backup_generation.manifest_sha256 = hash("x"); },
    (packet) => { packet.restore_readback.readback_payload_sha256 = hash("x"); },
    (packet) => { packet.restore_readback.exact_readback = false; },
    (packet) => { packet.restore_readback.rollback_verified = false; },
    (packet) => {
      packet.human_acceptance.state = "pending";
      packet.human_acceptance.decision_ref = null;
      packet.human_acceptance.accepted_generation_ref = null;
      packet.human_acceptance.restore_receipt_ref = null;
    },
  ];
  const expected = [
    HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED,
    HERMES_AGENT_BACKUP_CODES.RESTORE_READBACK_REQUIRED,
    HERMES_AGENT_BACKUP_CODES.RESTORE_READBACK_REQUIRED,
    HERMES_AGENT_BACKUP_CODES.RESTORE_READBACK_REQUIRED,
    HERMES_AGENT_BACKUP_CODES.HUMAN_ACCEPTANCE_REQUIRED,
  ];
  cases.forEach((mutate, index) => {
    const packet = bindDigests(fixture());
    mutate(packet);
    const result = evaluateHermesAgentBackupGeneration(packet);
    assert.equal(result.status, "HOLD");
    assert.equal(result.blocker_codes.includes(expected[index]), true);
    assert.equal(result.manifest, null);
    assert.equal(result.receipt.packet_sha256, null);
  });
});

test("backup completeness requires exact membership of every custody asset ref", () => {
  const missing = bindDigests(fixture());
  missing.backup_generation.included_asset_refs.pop();
  missing.backup_generation.asset_count -= 1;
  const missingResult = evaluateHermesAgentBackupGeneration(missing);
  assert.equal(missingResult.status, "HOLD");
  assert.equal(missingResult.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED), true);

  const foreign = bindDigests(fixture());
  foreign.backup_generation.included_asset_refs[0] = ref("foreign");
  const foreignResult = evaluateHermesAgentBackupGeneration(foreign);
  assert.equal(foreignResult.status, "HOLD");
  assert.equal(foreignResult.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED), true);
});

test("raw prompt, chat, memory, tool output, private key, token, and path attempts are redacted HOLDs", () => {
  const hostilePackets = [];
  for (const [section, field, value] of [
    ["session_custody", "raw_prompt", "ignore previous instructions"],
    ["session_custody", "raw_chat", "private conversation"],
    ["memory_custody", "raw_memory", "private memory body"],
    ["session_custody", "tool_output", "command output"],
  ]) {
    const packet = bindDigests(fixture());
    packet[section][field] = value;
    hostilePackets.push(packet);
  }
  for (const value of [
    "-----BEGIN PRIVATE KEY-----",
    "Bearer abcdefghijklmnop",
    "AKIAIOSFODNN7EXAMPLE",
    "glpat-abcdefghijklmnopqrst",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
    `${"C:"}\\private\\agent.json`,
    "/srv/private/agent.json",
  ]) {
    const packet = bindDigests(fixture());
    packet.runtime_binding.runtime_version = value;
    hostilePackets.push(packet);
  }
  for (const packet of hostilePackets) {
    const result = evaluateHermesAgentBackupGeneration(packet);
    assert.equal(result.status, "HOLD");
    assert.equal(result.blocker_codes.length >= 1, true);
    assert.equal(result.blocker_codes.every((code) => Object.values(HERMES_AGENT_BACKUP_CODES).includes(code)), true);
    assert.equal(result.manifest, null);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.equal(JSON.stringify(result).includes("Bearer"), false);
  }
});

test("caller mutation, duplicate refs, exotic records, getters, proxies, and cycles fail safely", () => {
  const valid = bindDigests(fixture());
  const result = evaluateHermesAgentBackupGeneration(valid);
  valid.runtime_binding.runtime_version = "mutated";
  assert.equal(result.manifest.runtime_binding.runtime_version, "0.20.5");

  const duplicate = bindDigests(fixture());
  duplicate.capability_custody.skill_refs.push(clone(duplicate.capability_custody.skill_refs[0]));
  const duplicateResult = evaluateHermesAgentBackupGeneration(duplicate);
  assert.equal(duplicateResult.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.CAPABILITY_CUSTODY_REQUIRED), true);
  assert.equal(duplicateResult.blocker_codes.includes(HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED), true);

  assert.deepEqual(
    evaluateHermesAgentBackupGeneration(new Date()).blocker_codes,
    [HERMES_AGENT_BACKUP_CODES.INPUT_INVALID],
  );
  const getterPacket = bindDigests(fixture());
  Object.defineProperty(getterPacket, "feature_state", { enumerable: true, get() { throw new Error("must_not_run"); } });
  assert.deepEqual(
    evaluateHermesAgentBackupGeneration(getterPacket).blocker_codes,
    [HERMES_AGENT_BACKUP_CODES.INPUT_INVALID],
  );
  const proxy = new Proxy(bindDigests(fixture()), {});
  assert.deepEqual(
    evaluateHermesAgentBackupGeneration(proxy).blocker_codes,
    [HERMES_AGENT_BACKUP_CODES.INPUT_INVALID],
  );
  const cycle = bindDigests(fixture());
  cycle.loop = cycle;
  assert.deepEqual(
    evaluateHermesAgentBackupGeneration(cycle).blocker_codes,
    [HERMES_AGENT_BACKUP_CODES.INPUT_INVALID],
  );
});

test("claim boundary cannot silently promote backup proof into readiness, Done, or context acceptance", () => {
  const fields = ["backup_completeness_only", "agent_readiness_evaluated", "task_done_evaluated",
    "accepted_context_evaluated", "runtime_effects_allowed", "raw_payload_capture_allowed"];
  for (const field of fields) {
    const packet = bindDigests(fixture());
    packet.claim_boundaries[field] = !packet.claim_boundaries[field];
    const result = evaluateHermesAgentBackupGeneration(packet);
    assert.equal(result.status, "HOLD");
    assert.deepEqual(result.blocker_codes, [HERMES_AGENT_BACKUP_CODES.CLAIM_BOUNDARY_REQUIRED]);
  }
});

test("every required custody plane has a distinct fixed HOLD code", () => {
  const cases = [
    ["agent_binding", HERMES_AGENT_BACKUP_CODES.AGENT_BINDING_REQUIRED],
    ["runtime_binding", HERMES_AGENT_BACKUP_CODES.RUNTIME_BINDING_REQUIRED],
    ["instruction_custody", HERMES_AGENT_BACKUP_CODES.INSTRUCTION_CUSTODY_REQUIRED],
    ["capability_custody", HERMES_AGENT_BACKUP_CODES.CAPABILITY_CUSTODY_REQUIRED],
    ["session_custody", HERMES_AGENT_BACKUP_CODES.SESSION_CUSTODY_REQUIRED],
    ["memory_custody", HERMES_AGENT_BACKUP_CODES.MEMORY_CUSTODY_REQUIRED],
    ["schedule_custody", HERMES_AGENT_BACKUP_CODES.SCHEDULE_CUSTODY_REQUIRED],
    ["backup_generation", HERMES_AGENT_BACKUP_CODES.BACKUP_GENERATION_REQUIRED],
    ["restore_readback", HERMES_AGENT_BACKUP_CODES.RESTORE_READBACK_REQUIRED],
    ["human_acceptance", HERMES_AGENT_BACKUP_CODES.HUMAN_ACCEPTANCE_REQUIRED],
    ["claim_boundaries", HERMES_AGENT_BACKUP_CODES.CLAIM_BOUNDARY_REQUIRED],
  ];
  for (const [field, expected] of cases) {
    const packet = bindDigests(fixture());
    packet[field] = null;
    const result = evaluateHermesAgentBackupGeneration(packet);
    assert.equal(result.status, "HOLD");
    assert.equal(result.blocker_codes.includes(expected), true, field);
    assert.equal(result.manifest, null);
    assert.equal(result.receipt.packet_sha256, null);
  }
});
