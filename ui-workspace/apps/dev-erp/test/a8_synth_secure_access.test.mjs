import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  A8_SYNTH_CHECK_IDS,
  createA8SynthPacketFixture,
  digestA8SynthPacket,
  runA8SynthSecureAccessCli,
  verifyA8SynthSecureAccess,
} from "../tools/a8_synth_secure_access.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const TOOL = join(APP, "tools", "a8_synth_secure_access.mjs");
const PACKET_SCHEMA_PATH = join(APP, "docs", "contracts", "a8_synth_secure_access_packet.v1.schema.json");
const OUTPUT_SCHEMA_PATH = join(APP, "docs", "contracts", "a8_synth_secure_access_output.v1.schema.json");

const EXPECTED_IDS = [
  ...Array.from({ length: 10 }, (_, index) => `HP-STORAGE-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `HP-INGRESS-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 18 }, (_, index) => `HP-SESSION-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `HP-QUERY-${String(index + 1).padStart(2, "0")}`),
];
const EXPECTED_SOURCE_KINDS = [
  "erp_chat_attachment", "external_se_schedule", "mail_raw_attachment", "personal_mcp_artifact",
  "project_file_activity", "run_log", "voice_audio_transcript",
];

function clone(value) {
  return structuredClone(value);
}

function schemas() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const packetSchema = JSON.parse(readFileSync(PACKET_SCHEMA_PATH, "utf8"));
  const outputSchema = JSON.parse(readFileSync(OUTPUT_SCHEMA_PATH, "utf8"));
  return {
    packetSchema,
    outputSchema,
    validatePacket: ajv.compile(packetSchema),
    validateOutput: ajv.compile(outputSchema),
  };
}

function evaluate(mutator) {
  const packet = createA8SynthPacketFixture();
  mutator(packet);
  return { packet, output: verifyA8SynthSecureAccess(packet, digestA8SynthPacket(packet)) };
}

function writePacket(root, packet, name = "packet.json") {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(packet), "utf8");
  return path;
}

function runPacket(root, packet, { digest = digestA8SynthPacket(packet), name = "packet.json", argv } = {}) {
  writePacket(root, packet, name);
  const args = argv ?? [
    "--synthetic", "--feature-off", "--json", "--packet", name, "--approved-packet-digest", digest,
  ];
  const execution = runA8SynthSecureAccessCli(args, {}, root);
  return { ...execution, envelope: JSON.parse(execution.output) };
}

function assertEffectsZero(envelope) {
  for (const group of ["authority_effect", "live_effect", "write_effect"]) {
    for (const [key, value] of Object.entries(envelope[group])) {
      if (Array.isArray(value)) assert.deepEqual(value, [], `${group}.${key}`);
      else assert.equal(value, false, `${group}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(envelope.side_effect_counts)) {
    assert.equal(value, 0, `side_effect_counts.${key}`);
  }
}

function assertFailed(output, ...ids) {
  assert.equal(output.result, "FAIL");
  for (const id of ids) assert.equal(output.summary.failed_ids.includes(id), true, `${id} must fail`);
  assertEffectsZero(output);
}

function domainDigest(domain, canonicalValue) {
  const prefix = `soulforge\u0000a8-synth-secure-access\u0000${domain}\u0000`;
  return `sha256:${createHash("sha256").update(prefix).update(JSON.stringify(canonicalValue)).digest("hex")}`;
}

test("golden public/pathless/feature-OFF fixture is strict-schema valid and exactly 60/60 PASS", () => {
  const { validatePacket, validateOutput } = schemas();
  const packet = createA8SynthPacketFixture();
  assert.equal(validatePacket(packet), true, JSON.stringify(validatePacket.errors));

  const packetDigest = digestA8SynthPacket(packet);
  const output = verifyA8SynthSecureAccess(packet, packetDigest);
  assert.equal(validateOutput(output), true, JSON.stringify(validateOutput.errors));
  assert.equal(output.result, "PASS");
  assert.equal(output.packet_digest, packetDigest);
  assert.equal(output.summary.total, 60);
  assert.equal(output.summary.passed, 60);
  assert.equal(output.summary.failed, 0);
  assert.deepEqual(output.summary.failed_ids, []);
  assert.deepEqual(A8_SYNTH_CHECK_IDS, EXPECTED_IDS);
  assert.deepEqual(output.coverage.exact_check_ids, EXPECTED_IDS);
  assert.equal(output.coverage.complete, true);
  assert.deepEqual(output.category_summaries.map(({ category, total }) => [category, total]), [
    ["STORAGE", 10], ["INGRESS", 16], ["SESSION", 18], ["QUERY", 16],
  ]);
  assert.deepEqual([...packet.ingress.source_kinds].sort(), EXPECTED_SOURCE_KINDS);
  assert.deepEqual(packet.ingress.custody_matrix.map((row) => row.source_kind).sort(), EXPECTED_SOURCE_KINDS);
  assert.equal(output.effective_expires_at, "2027-01-01T00:00:00Z");
  assert.equal(output.external_approval_binding.owner_acceptance, false);
  assertEffectsZero(output);

  const receiptBody = clone(output);
  delete receiptBody.receipt_digest;
  assert.equal(output.receipt_digest, domainDigest("receipt-v1", receiptBody));
});

test("strict schemas reject unknown keys at root and nested surfaces", () => {
  const { validatePacket, validateOutput } = schemas();
  const packet = createA8SynthPacketFixture();
  packet.unexpected_authority = true;
  assert.equal(validatePacket(packet), false);
  assert.equal(validatePacket.errors?.some((error) => error.keyword === "additionalProperties"), true);

  const clean = createA8SynthPacketFixture();
  const output = verifyA8SynthSecureAccess(clean, digestA8SynthPacket(clean));
  output.authority_effect.unexpected_unlock = false;
  assert.equal(validateOutput(output), false);
  assert.equal(validateOutput.errors?.some((error) => error.keyword === "additionalProperties"), true);
});

test("packet, policy, suite, coverage, check, category and receipt digests are deterministic", () => {
  const first = createA8SynthPacketFixture();
  const second = clone(first);
  for (const key of ["baseline_refs", "prerequisite_refs"]) second[key].reverse();
  for (const key of ["source_kinds", "custody_matrix", "approved_operations", "policy_refs", "ticket_binding_fields"]) {
    second.ingress[key].reverse();
  }
  for (const key of ["consumers"]) second.storage[key].reverse();
  for (const key of ["human_grant_actions", "trusted_device_actions", "agent_policy_actions", "task_object_actions", "effective_actions", "parent_expiries"]) {
    second.access.delegation[key].reverse();
  }
  second.access.step_up_actions.reverse();
  for (const key of ["scopes", "knowledge_provenance_fields", "cache_key_fields", "derivative_policy_fields"]) second.query[key].reverse();

  assert.equal(digestA8SynthPacket(first), digestA8SynthPacket(second));
  const a = verifyA8SynthSecureAccess(first, digestA8SynthPacket(first));
  const b = verifyA8SynthSecureAccess(second, digestA8SynthPacket(second));
  assert.deepEqual(a, b);
  for (const key of ["packet_digest", "policy_digest", "suite_digest", "receipt_digest"]) {
    assert.match(a[key], /^sha256:[a-f0-9]{64}$/);
  }
  assert.match(a.coverage.coverage_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(a.summary.check_set_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(new Set(a.category_summaries.map((row) => row.category_digest)).size, 4);
});

test("CLI reads one contained relative regular packet and emits one deterministic stdout line", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-cli-"));
  try {
    const packet = createA8SynthPacketFixture();
    writePacket(root, packet);
    const args = [
      TOOL, "--synthetic", "--feature-off", "--json", "--packet", "packet.json",
      "--approved-packet-digest", digestA8SynthPacket(packet),
    ];
    const a = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true });
    const b = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(a.status, 0, a.stderr || a.stdout);
    assert.equal(a.stderr, "");
    assert.equal(a.stdout, b.stdout);
    assert.equal(a.stdout.split(/\r?\n/).filter(Boolean).length, 1);
    const output = JSON.parse(a.stdout);
    assert.equal(output.result, "PASS");
    assert.equal(statSync(join(root, "packet.json")).isFile(), true);
    assert.equal(readFileSync(join(root, "packet.json"), "utf8"), JSON.stringify(packet));
    assertEffectsZero(output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI rejects absolute, UNC, device, URL, traversal and non-regular locators without disclosure", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-path-"));
  try {
    const packet = createA8SynthPacketFixture();
    writePacket(root, packet);
    mkdirSync(join(root, "directory.json"));
    const digest = digestA8SynthPacket(packet);
    const locators = [
      resolve(root, "packet.json"), "../packet.json", "..\\packet.json", "\\\\server\\share\\packet.json",
      ["\\\\?\\", "C:", "\\packet.json"].join(""), "https://example.invalid/packet.json", "directory.json",
    ];
    for (const locator of locators) {
      const result = runA8SynthSecureAccessCli([
        "--synthetic", "--feature-off", "--json", "--packet", locator,
        "--approved-packet-digest", digest,
      ], {}, root);
      assert.equal(result.exitCode, 2, locator);
      const envelope = JSON.parse(result.output);
      assert.equal(envelope.result, "BLOCKED");
      assert.equal(result.output.includes(root), false);
      assertEffectsZero(envelope);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI size-checks before read and rejects missing input with safe zero-effect errors", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-read-"));
  try {
    writeFileSync(join(root, "oversize.json"), "x".repeat((1024 * 1024) + 1), "utf8");
    const digest = `sha256:${"a".repeat(64)}`;
    const tooLarge = runA8SynthSecureAccessCli([
      "--synthetic", "--feature-off", "--json", "--packet", "oversize.json",
      "--approved-packet-digest", digest,
    ], {}, root);
    assert.equal(tooLarge.exitCode, 2);
    assertEffectsZero(JSON.parse(tooLarge.output));

    const missing = runA8SynthSecureAccessCli([
      "--synthetic", "--feature-off", "--json", "--packet", "missing.json",
      "--approved-packet-digest", digest,
    ], {}, root);
    assert.equal(missing.exitCode, 6);
    assertEffectsZero(JSON.parse(missing.output));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema-aware sentinel permits the golden payload-policy key but rejects raw, path and secret data", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-sentinel-"));
  try {
    const golden = runPacket(root, createA8SynthPacketFixture());
    assert.equal(golden.exitCode, 0, golden.output);

    const cases = [
      (packet) => { packet.local_path = "synthetic"; },
      (packet) => { packet.secret_token = "redacted"; },
      (packet) => { packet.raw_payload = "redacted"; },
      (packet) => { packet.baseline_refs[0] = ["C:", "\\private", "\\packet.json"].join(""); },
      (packet) => { packet.baseline_refs[0] = "https://example.invalid/private"; },
      (packet) => { packet.baseline_refs[0] = "sk-not-a-real-secret-123456"; },
    ];
    for (const mutate of cases) {
      const packet = createA8SynthPacketFixture();
      mutate(packet);
      const result = runPacket(root, packet);
      assert.equal(result.exitCode, 5, result.output);
      assert.equal(result.envelope.reason_code, "raw_path_secret_sentinel");
      assert.deepEqual(result.envelope.raw_sentinel_violations, ["redacted_input_sentinel"]);
      assert.equal(/C:\\\\private|example\.invalid|sk-not-a-real-secret/.test(result.output), false);
      assertEffectsZero(result.envelope);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("digest mismatch is exit 3 and invariant or coverage failure is exit 4", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-exit-"));
  try {
    const packet = createA8SynthPacketFixture();
    const mismatch = runPacket(root, packet, { digest: `sha256:${"0".repeat(64)}` });
    assert.equal(mismatch.exitCode, 3);
    assert.equal(mismatch.envelope.reason_code, "approved_packet_digest_mismatch");
    assertEffectsZero(mismatch.envelope);

    packet.query.implicit_fallback_allowed = true;
    const invariant = runPacket(root, packet);
    assert.equal(invariant.exitCode, 4);
    assert.equal(invariant.envelope.result, "FAIL");
    assertFailed(invariant.envelope, "HP-QUERY-02");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI flags are exact, duplicate-free and environment-independent", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-flags-"));
  try {
    const packet = createA8SynthPacketFixture();
    writePacket(root, packet);
    const digest = digestA8SynthPacket(packet);
    const invalidArgv = [
      ["--synthetic", "--feature-off", "--packet", "packet.json", "--approved-packet-digest", digest],
      ["--synthetic", "--feature-off", "--json", "--json", "--packet", "packet.json", "--approved-packet-digest", digest],
      ["--synthetic", "--feature-off", "--json", "--packet", "packet.json", "--approved-packet-digest", digest, "--live"],
    ];
    for (const argv of invalidArgv) {
      const result = runA8SynthSecureAccessCli(argv, {}, root);
      assert.equal(result.exitCode, 2);
      assertEffectsZero(JSON.parse(result.output));
    }
    const environment = runA8SynthSecureAccessCli([
      "--synthetic", "--feature-off", "--json", "--packet", "packet.json",
      "--approved-packet-digest", digest,
    ], { A8_SYNTH_OVERRIDE: "1" }, root);
    assert.equal(environment.exitCode, 2);
    assertEffectsZero(JSON.parse(environment.output));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("feature/evaluation/baseline/prerequisite/custody contracts fail closed", () => {
  const { validatePacket } = schemas();
  const root = mkdtempSync(join(tmpdir(), "a8-synth-structural-"));
  try {
    for (const mutate of [
      (packet) => { packet.profile.feature_mode = "on"; },
      (packet) => { packet.baseline_refs = []; },
      (packet) => { packet.prerequisite_refs = []; },
    ]) {
      const packet = createA8SynthPacketFixture();
      mutate(packet);
      assert.equal(validatePacket(packet), false);
      const blocked = runPacket(root, packet);
      assert.equal(blocked.exitCode, 2);
      assertEffectsZero(blocked.envelope);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const result = evaluate((packet) => { packet.ingress.custody_matrix = []; });
  assertFailed(result.output, "HP-INGRESS-01");
  assert.equal(validatePacket(result.packet), false);

  const timeRoot = mkdtempSync(join(tmpdir(), "a8-synth-time-"));
  try {
    const packet = createA8SynthPacketFixture();
    packet.evaluation_time = "2026-02-30T00:00:00Z";
    const invalidTime = runPacket(timeRoot, packet);
    assert.equal(invalidTime.exitCode, 2);
    assertEffectsZero(invalidTime.envelope);
  } finally {
    rmSync(timeRoot, { recursive: true, force: true });
  }
});

test("approval issuance, expiry, revocation and delegation earliest-expiry are computed fail-closed", () => {
  let result = evaluate((packet) => { packet.external_approval_binding.expires_at = "2026-07-16T02:59:59Z"; });
  assertFailed(result.output, "HP-INGRESS-09", "HP-SESSION-14", "HP-SESSION-15");

  result = evaluate((packet) => { packet.external_approval_binding.issued_at = "2026-07-16T03:00:01Z"; });
  assertFailed(result.output, "HP-INGRESS-09", "HP-SESSION-14", "HP-SESSION-15");

  result = evaluate((packet) => { packet.external_approval_binding.revoked_at_or_none = "2026-07-16T02:00:00Z"; });
  assertFailed(result.output, "HP-INGRESS-09", "HP-SESSION-14", "HP-SESSION-15");

  result = evaluate((packet) => { packet.access.delegation.effective_expiry = "2028-01-01T00:00:00Z"; });
  assertFailed(result.output, "HP-SESSION-14");

  result = evaluate((packet) => { packet.actor_chain.expires_at = "2028-01-01T00:00:00Z"; });
  assertFailed(result.output, "HP-INGRESS-11", "HP-SESSION-13", "HP-SESSION-14");

  result = evaluate((packet) => {
    const expired = "2026-07-16T02:59:59Z";
    packet.access.delegation.parent_expiries = [expired];
    packet.access.delegation.effective_expiry = expired;
    packet.actor_chain.expires_at = expired;
    packet.transfer_fixture.ticket.expires_at = expired;
  });
  assertFailed(result.output, "HP-INGRESS-11", "HP-SESSION-13", "HP-SESSION-14", "HP-QUERY-16");
});

test("computed one-time enrollment, mTLS transport and broker verifier rejects attempt, trust, audience, replay and revoke mutations", () => {
  const { validatePacket } = schemas();
  let result = evaluate((packet) => { packet.access_fixture.enrollment_attempts.shift(); });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.enrollment_attempts[0].certificate_trusted = false; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.enrollment_attempts[0].audience = "hpp_transfer_service"; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.enrollment_attempts[1].token_id = "enrollment_token_replay_bypassed"; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.enrollment_attempts[4].parent_revoked = false; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.transport_cases[0].mtls_present = false; });
  assertFailed(result.output, "HP-INGRESS-13", "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.transport_cases[2].certificate_trusted = true; });
  assertFailed(result.output, "HP-INGRESS-13", "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.transport_cases[4].audience = "hpp_transfer_service"; });
  assertFailed(result.output, "HP-INGRESS-13", "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.transport_cases[5].parent_revoked = false; });
  assertFailed(result.output, "HP-INGRESS-13", "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.transport_cases[6].device_revoked = false; });
  assertFailed(result.output, "HP-INGRESS-13", "HP-SESSION-15", "HP-SESSION-16");
  assert.equal(validatePacket(result.packet), false);

  result = evaluate((packet) => { packet.access_fixture.broker_cases[0].human_prompt_requested = true; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16");

  result = evaluate((packet) => { packet.access_fixture.broker_cases[1].human_prompt_requested = false; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16", "HP-SESSION-17");

  result = evaluate((packet) => { packet.access_fixture.broker_cases[3].device_revoked = false; });
  assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16", "HP-SESSION-17");
  assert.equal(validatePacket(result.packet), false);

  for (const field of ["child_grant_requested", "ticket_requested", "pending_protected_mutation_requested"]) {
    result = evaluate((packet) => { packet.access_fixture.broker_cases[3][field] = false; });
    assertFailed(result.output, "HP-SESSION-15", "HP-SESSION-16", "HP-SESSION-17");
    assert.equal(validatePacket(result.packet), false);
  }
});

test("computed session lifecycle rejects atomicity, idempotency, race, crash, handoff, task and outage mutations", () => {
  let result = evaluate((packet) => {
    const first = packet.session_fixture.start_attempts[0];
    const third = packet.session_fixture.start_attempts[2];
    third.start_key = first.start_key;
    third.session_id = first.session_id;
    third.binding_id = first.binding_id;
    third.start_digest = first.start_digest;
  });
  assertFailed(result.output, "HP-SESSION-01", "HP-SESSION-02");

  result = evaluate((packet) => {
    packet.session_fixture.event_attempts[2].event_digest = packet.session_fixture.event_attempts[0].event_digest;
  });
  assertFailed(result.output, "HP-SESSION-03");

  result = evaluate((packet) => { packet.session_fixture.auth_race_states[0] = "active"; });
  assertFailed(result.output, "HP-SESSION-04");

  result = evaluate((packet) => { packet.session_fixture.crash_stages[0] = "unknown_crash_stage"; });
  assertFailed(result.output, "HP-SESSION-05", "HP-SESSION-18");

  result = evaluate((packet) => { packet.session_fixture.outbox_states.reverse(); });
  assertFailed(result.output, "HP-SESSION-06");

  result = evaluate((packet) => { packet.session_fixture.missing_case.states_treated_equal = true; });
  assertFailed(result.output, "HP-SESSION-07");

  result = evaluate((packet) => { packet.session_fixture.handoff_case.old_binding_overwrite_requested = true; });
  assertFailed(result.output, "HP-SESSION-08");

  result = evaluate((packet) => { packet.session_fixture.task_event_requests[0].requested_task_delta = 1; });
  assertFailed(result.output, "HP-SESSION-09");

  result = evaluate((packet) => { packet.session_fixture.official_completion.requested_event_count = 2; });
  assertFailed(result.output, "HP-SESSION-10");

  result = evaluate((packet) => { packet.session_fixture.proposal_kinds[0] = "unapproved_proposal"; });
  assertFailed(result.output, "HP-SESSION-11");

  result = evaluate((packet) => { packet.session_fixture.private_boundary.raw_fields_copied = true; });
  assertFailed(result.output, "HP-SESSION-12");

  result = evaluate((packet) => { packet.session_fixture.outage_case.remote_mount_attempted = true; });
  assertFailed(result.output, "HP-SESSION-18");
});

test("actual ticket actor/object/method/audience/hash/size/revision bindings reject swaps", () => {
  const cases = [
    ["user", (packet) => { packet.transfer_fixture.ticket.user_id = "user_synth_swapped"; }],
    ["actor", (packet) => { packet.actor_chain.project_id = "project_synth_swapped"; }],
    ["method", (packet) => { packet.transfer_fixture.ticket.method = "POST"; }],
    ["audience", (packet) => { packet.transfer_fixture.ticket.audience = "hpp_promoter"; }],
    ["hash", (packet) => { packet.transfer_fixture.ticket.content_hash = `sha256:${"c".repeat(64)}`; }],
    ["size", (packet) => { packet.transfer_fixture.ticket.size_bytes += 1; }],
    ["revision", (packet) => { packet.transfer_fixture.ticket.revision_id = "revision_synth_swapped"; }],
  ];
  for (const [label, mutate] of cases) {
    const { output } = evaluate(mutate);
    assertFailed(output, "HP-INGRESS-11");
    assert.equal(output.summary.failed > 0, true, label);
  }

  const bearer = evaluate((packet) => { packet.ingress.url_is_bearer_authority = true; });
  assertFailed(bearer.output, "HP-INGRESS-11");
});

test("pure finalize simulation proves same-receipt, conflict quarantine and revoke-before-commit", () => {
  let result = evaluate((packet) => { packet.transfer_fixture.finalize_attempts[1].idempotency_key = "finalize_key_swapped"; });
  assertFailed(result.output, "HP-INGRESS-05", "HP-INGRESS-12", "HP-SESSION-15");

  result = evaluate((packet) => {
    packet.transfer_fixture.finalize_attempts[2].content_hash = packet.transfer_fixture.finalize_attempts[0].content_hash;
  });
  assertFailed(result.output, "HP-INGRESS-05", "HP-INGRESS-12", "HP-SESSION-15");

  result = evaluate((packet) => { packet.transfer_fixture.finalize_attempts[3].revoked_before_commit = false; });
  assertFailed(result.output, "HP-INGRESS-05", "HP-INGRESS-12", "HP-SESSION-15");

  result = evaluate((packet) => {
    for (const attempt of packet.transfer_fixture.finalize_attempts) {
      attempt.ticket_id = "ticket_synth_unbound";
    }
  });
  assertFailed(result.output, "HP-INGRESS-05", "HP-INGRESS-12", "HP-SESSION-15");
});

test("bounded exact-revision range reassembly is bound to final accepted hash", () => {
  let result = evaluate((packet) => { packet.transfer_fixture.download.ranges[0].range_hash = `sha256:${"d".repeat(64)}`; });
  assertFailed(result.output, "HP-INGRESS-15", "HP-QUERY-16");

  result = evaluate((packet) => { packet.transfer_fixture.download.ranges[1].start += 1; });
  assertFailed(result.output, "HP-INGRESS-15", "HP-QUERY-16");

  result = evaluate((packet) => { packet.query.exact_download_manifest_digest = `sha256:${"e".repeat(64)}`; });
  assertFailed(result.output, "HP-INGRESS-15", "HP-QUERY-16");

  result = evaluate((packet) => { packet.transfer_fixture.download.revision_id = "revision_synth_swapped"; });
  assertFailed(result.output, "HP-INGRESS-15", "HP-QUERY-16");
});

test("ACL/existence/RAG/cache/redacted-derivative fixtures reject unauthorized disclosure and fallback", () => {
  const { validatePacket } = schemas();
  let result = evaluate((packet) => {
    for (const row of packet.query_fixture.existence_cases) row.case_id = "unauthorized_existing";
  });
  assertFailed(result.output, "HP-QUERY-01", "HP-QUERY-12");
  assert.equal(validatePacket(result.packet), false);

  result = evaluate((packet) => {
    for (const row of packet.query_fixture.rag_cases) row.case_id = "field_acl_denied";
  });
  assertFailed(result.output, "HP-QUERY-13");
  assert.equal(validatePacket(result.packet), false);

  result = evaluate((packet) => {
    for (const row of packet.query_fixture.cache_cases) row.case_id = "revoked_acl_revision";
  });
  assertFailed(result.output, "HP-QUERY-14");
  assert.equal(validatePacket(result.packet), false);

  result = evaluate((packet) => {
    const row = packet.query_fixture.existence_cases.find((entry) => entry.case_id === "unauthorized_existing");
    row.expected_existence_disclosed = true;
  });
  assertFailed(result.output, "HP-QUERY-01", "HP-QUERY-12");

  result = evaluate((packet) => {
    const row = packet.query_fixture.rag_cases.find((entry) => entry.case_id === "field_acl_denied");
    row.expected_hits = 1;
  });
  assertFailed(result.output, "HP-QUERY-13");

  result = evaluate((packet) => {
    const row = packet.query_fixture.cache_cases.find((entry) => entry.case_id === "revoked_acl_revision");
    row.expected_body_hits = 1;
  });
  assertFailed(result.output, "HP-QUERY-14");

  result = evaluate((packet) => { packet.query_fixture.redacted_derivative.raw_fallback = true; });
  assertFailed(result.output, "HP-QUERY-15");

  result = evaluate((packet) => { packet.query_fixture.redacted_derivative.hidden_sheets_slides_included = true; });
  assertFailed(result.output, "HP-QUERY-15");
});

test("HPP sole writers, topology and non-HPP direct access remain closed", () => {
  let result = evaluate((packet) => { packet.storage.transfer_writer = "foreign_transfer_writer"; });
  assertFailed(result.output, "HP-INGRESS-07", "HP-INGRESS-16");

  result = evaluate((packet) => { packet.storage.binding_writer = packet.storage.history_writer; });
  assertFailed(result.output, "HP-INGRESS-07", "HP-INGRESS-16");

  result = evaluate((packet) => { packet.storage.logical_topology_unchanged = false; });
  assertFailed(result.output, "HP-STORAGE-08");

  result = evaluate((packet) => { packet.storage.non_hpp_direct_storage_allowed = true; });
  assertFailed(result.output, "HP-STORAGE-10");

  result = evaluate((packet) => { packet.ingress.client_binary_write_allowed = true; });
  assertFailed(result.output, "HP-INGRESS-16");
});

test("duplicate canonical custody rows and unknown keys fail before any effect", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-shape-"));
  try {
    let packet = createA8SynthPacketFixture();
    packet.ingress.custody_matrix[1] = clone(packet.ingress.custody_matrix[0]);
    let result = runPacket(root, packet);
    assert.equal(result.exitCode, 2);
    assertEffectsZero(result.envelope);

    packet = createA8SynthPacketFixture();
    packet.unexpected = true;
    result = runPacket(root, packet);
    assert.equal(result.exitCode, 2);
    assertEffectsZero(result.envelope);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PASS, FAIL and every safe error shape validate against the strict output schema", () => {
  const root = mkdtempSync(join(tmpdir(), "a8-synth-output-schema-"));
  try {
    const { validateOutput } = schemas();
    const packet = createA8SynthPacketFixture();
    const pass = runPacket(root, packet);
    assert.equal(validateOutput(pass.envelope), true, JSON.stringify(validateOutput.errors));

    const failedPacket = createA8SynthPacketFixture();
    failedPacket.query.implicit_fallback_allowed = true;
    const fail = runPacket(root, failedPacket);
    assert.equal(fail.exitCode, 4);
    assert.equal(validateOutput(fail.envelope), true, JSON.stringify(validateOutput.errors));

    const mismatch = runPacket(root, packet, { digest: `sha256:${"f".repeat(64)}` });
    const invalid = runA8SynthSecureAccessCli([], {}, root);
    const sentinelPacket = createA8SynthPacketFixture();
    sentinelPacket.local_path = "blocked";
    const sentinel = runPacket(root, sentinelPacket);
    const missing = runA8SynthSecureAccessCli([
      "--synthetic", "--feature-off", "--json", "--packet", "missing.json",
      "--approved-packet-digest", digestA8SynthPacket(packet),
    ], {}, root);
    for (const candidate of [mismatch, invalid, sentinel, missing]) {
      const envelope = candidate.envelope ?? JSON.parse(candidate.output);
      assert.equal(validateOutput(envelope), true, JSON.stringify(validateOutput.errors));
      assertEffectsZero(envelope);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
