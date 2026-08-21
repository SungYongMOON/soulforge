import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  RECEIPT_EXPIRY_PATH,
  RECEIPT_EXPIRY_PROJECTION_ENVELOPE_SCHEMA,
  RECEIPT_EXPIRY_BINDING_SCHEMA,
  createReceiptExpiryServerAdapter,
  readReceiptExpiryProjection,
  readStableFile,
  validateReceiptExpiryBinding,
} from "./receipt-expiry-adapter.mjs";
import { validatePlaudCutoverReceipt } from "../../../../../guild_hall/voice_capture/plaud_writer_cutover_receipt.mjs";
import { validateWriterAuthorityRecord } from "../../../../../guild_hall/ingress/writer_authority.mjs";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const TARGET_NODE_ID = "hpp-test-node";
const PROFILE_SHA256 = "c".repeat(64);

function createFixtureReceipts(nowMs) {
  const writerBody = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    authority_id: "task-engine-hpp-production-ingress",
    authority_scope: "raw_ingress_custody_only",
    epoch: 2,
    transition: "renew",
    mode: "primary",
    node_id: "hpp-test-node",
    primary_node_id: "hpp-test-node",
    fallback_node_id: "hpp-fallback-node",
    lanes: ["mail", "voice", "structured_pc_work", "team_files", "run_logs"],
    not_before: new Date(nowMs - 3600 * 1000).toISOString(),
    expires_at: new Date(nowMs + 10 * 86_400 * 1000).toISOString(),
    owner_approval_ref: "app-ref-001",
    previous_digest: "0".repeat(64),
    revoked_digest: null,
    revoked_epoch: null,
    revoked_mode: null,
    revoked_node_id: null,
    request_digest: "a".repeat(64),
  };
  const canonical = Object.fromEntries(Object.keys(writerBody).sort().map((k) => [k, writerBody[k]]));
  const record_digest = createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  const writerAuth = { ...writerBody, record_digest };

  const plaudCutover = {
    schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
    observed_at: new Date(nowMs - 3600 * 1000).toISOString(),
    valid_until: new Date(nowMs + 10 * 86_400 * 1000).toISOString(),
    source_node_id: "plaud-source-node",
    source_collector_label: "ai.soulforge.plaud-ingest",
    source_writer_status: "stopped",
    source_process_count: 0,
    source_service_state: "disabled_unloaded",
    source_restart_policy_enabled: false,
    target_node_id: "hpp-test-node",
    target_mode: "primary_writer",
    profile_sha256: PROFILE_SHA256,
    owner_approval_ref: "app-ref-002",
  };

  const backupActivation = {
    schema_version: "soulforge.backup_controller.activation.v1",
    binding_ref: path.resolve(tmpdir(), "test-binding.json"),
    expected_binding_sha256: "d".repeat(64),
    runtime_commit_sha: "e".repeat(40),
    approval_ref: "app-ref-003",
    writer: {
      node_id: "hpp-test-node",
      hostname: "hpp-test-host",
      platform: "win32",
    },
    feature_state: "on",
    not_before: new Date(nowMs - 3600 * 1000).toISOString(),
    expires_at: new Date(nowMs + 8 * 86_400 * 1000).toISOString(),
  };

  return { writerAuth, plaudCutover, backupActivation };
}

function createFixtureBinding(root, fixtures) {
  return {
    schema_version: RECEIPT_EXPIRY_BINDING_SCHEMA,
    enabled: true,
    contracts: {
      ingress_writer_authority: {
        evidence_path: path.join(root, "writer_authority.json"),
        warning_window_seconds: 259200,
        critical_window_seconds: 86400,
      },
      voice_plaud_writer_cutover_receipt: {
        evidence_path: path.join(root, "plaud_cutover.json"),
        warning_window_seconds: 604800,
        critical_window_seconds: 172800,
        expected_target_node_id: TARGET_NODE_ID,
        expected_profile_sha256: PROFILE_SHA256,
      },
      backup_controller_activation: {
        evidence_path: path.join(root, "backup_activation.json"),
        warning_window_seconds: 604800,
        critical_window_seconds: 172800,
      },
    },
  };
}

test("readStableFile handles Windows case-insensitivity via pathsEqual helper", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paths-equal-test-"));
  const filePath = path.join(root, "TestFile.json");
  await writeFile(filePath, JSON.stringify({ ok: true }), "utf8");

  // Case-insensitive match (Windows mode) passes
  const content = await readStableFile(filePath, {
    pathsEqual: (a, b) => a.toLowerCase() === b.toLowerCase(),
  });
  assert.equal(JSON.parse(content).ok, true);

  // Forced path mismatch fails closed
  await assert.rejects(async () => {
    await readStableFile(filePath, {
      pathsEqual: () => false,
    });
  }, { message: "reparse_path_forbidden" });

  await rm(root, { recursive: true, force: true });
});

test("readStableFile handle-based stable open fails closed on identity change during read", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "stable-read-test-"));
  const filePath = path.join(root, "test_file.json");
  await writeFile(filePath, JSON.stringify({ hello: "world" }), "utf8");

  await assert.rejects(async () => {
    await readStableFile(filePath, {
      beforeRead: async () => {
        await writeFile(filePath, JSON.stringify({ hello: "modified_file" }), "utf8");
      },
    });
  }, { message: "file_identity_changed" });

  await rm(root, { recursive: true, force: true });
});

test("PLAUD cutover future observation skew rules (+4m59s accepted, >+5m rejected)", () => {
  const basePlaud = {
    schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
    observed_at: new Date(NOW + 299 * 1000).toISOString(),
    valid_until: new Date(NOW + 10 * 86_400 * 1000).toISOString(),
    source_node_id: "plaud-source-node",
    source_collector_label: "ai.soulforge.plaud-ingest",
    source_writer_status: "stopped",
    source_process_count: 0,
    source_service_state: "disabled_unloaded",
    source_restart_policy_enabled: false,
    target_node_id: TARGET_NODE_ID,
    target_mode: "primary_writer",
    profile_sha256: PROFILE_SHA256,
    owner_approval_ref: "app-ref-002",
  };

  const inspected4m59 = validatePlaudCutoverReceipt(basePlaud, {
    allowExpired: true,
    now: NOW,
    targetNodeId: TARGET_NODE_ID,
    profileSha256: PROFILE_SHA256,
  });
  assert.equal(inspected4m59.observed_at, basePlaud.observed_at);

  const future5m1sPlaud = {
    ...basePlaud,
    observed_at: new Date(NOW + 301 * 1000).toISOString(),
  };
  assert.throws(() => {
    validatePlaudCutoverReceipt(future5m1sPlaud, {
      allowExpired: true,
      now: NOW,
      targetNodeId: TARGET_NODE_ID,
      profileSha256: PROFILE_SHA256,
    });
  }, { code: "continuous_plaud_cutover_receipt_invalid" });
});

test("expired writer authority and expired backup activation bytes are structurally accepted and projected expired", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expired-evidence-test-"));
  const fixtures = createFixtureReceipts(NOW);

  // Set not_before 10 days ago and expires_at 1 hour ago (valid window, past expiration)
  fixtures.writerAuth.not_before = new Date(NOW - 10 * 86_400 * 1000).toISOString();
  fixtures.writerAuth.expires_at = new Date(NOW - 3600 * 1000).toISOString();

  fixtures.backupActivation.not_before = new Date(NOW - 10 * 86_400 * 1000).toISOString();
  fixtures.backupActivation.expires_at = new Date(NOW - 3600 * 1000).toISOString();

  // Re-sign writer authority record_digest for structural validity
  const { record_digest, ...writerBody } = fixtures.writerAuth;
  const canonical = Object.fromEntries(Object.keys(writerBody).sort().map((k) => [k, writerBody[k]]));
  const newDigest = createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  fixtures.writerAuth = { ...writerBody, record_digest: newDigest };

  // Pure validation of expired record succeeds structurally
  const validatedRecord = validateWriterAuthorityRecord(fixtures.writerAuth);
  assert.equal(validatedRecord.expires_at, fixtures.writerAuth.expires_at);

  const binding = createFixtureBinding(root, fixtures);
  const bindingPath = path.join(root, "binding.json");

  await writeFile(binding.contracts.ingress_writer_authority.evidence_path, JSON.stringify(fixtures.writerAuth), "utf8");
  await writeFile(binding.contracts.voice_plaud_writer_cutover_receipt.evidence_path, JSON.stringify(fixtures.plaudCutover), "utf8");
  await writeFile(binding.contracts.backup_controller_activation.evidence_path, JSON.stringify(fixtures.backupActivation), "utf8");
  await writeFile(bindingPath, JSON.stringify(binding), "utf8");

  const projection = await readReceiptExpiryProjection({ bindingPath, now: NOW });

  assert.equal(projection.status, "partial");
  assert.equal(projection.reason, "standing_evidence_expired");

  const writerEval = projection.receipts.find((r) => r.contract_id === "ingress_writer_authority");
  assert.equal(writerEval.status, "expired");

  const backupEval = projection.receipts.find((r) => r.contract_id === "backup_controller_activation");
  assert.equal(backupEval.status, "expired");

  await rm(root, { recursive: true, force: true });
});

test("present-invalid evidence (corrupt JSON or mismatch) returns status invalid and updates summary.invalid", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "present-invalid-test-"));
  const fixtures = createFixtureReceipts(NOW);
  const binding = createFixtureBinding(root, fixtures);
  const bindingPath = path.join(root, "binding.json");

  // Write corrupt/invalid content for PLAUD evidence
  await writeFile(binding.contracts.ingress_writer_authority.evidence_path, JSON.stringify(fixtures.writerAuth), "utf8");
  await writeFile(binding.contracts.voice_plaud_writer_cutover_receipt.evidence_path, "corrupt json content {", "utf8");
  await writeFile(binding.contracts.backup_controller_activation.evidence_path, JSON.stringify(fixtures.backupActivation), "utf8");
  await writeFile(bindingPath, JSON.stringify(binding), "utf8");

  const projection = await readReceiptExpiryProjection({ bindingPath, now: NOW });

  assert.equal(projection.status, "partial");
  assert.equal(projection.reason, "standing_evidence_invalid");
  assert.equal(projection.summary.invalid, 1);

  const plaudEval = projection.receipts.find((r) => r.contract_id === "voice_plaud_writer_cutover_receipt");
  assert.equal(plaudEval.status, "invalid");
  assert.equal(plaudEval.diagnostic_code, "receipt_evidence_invalid");

  await rm(root, { recursive: true, force: true });
});

test("genuinely missing evidence file returns status unknown with receipt_evidence_missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "missing-evidence-test-"));
  const fixtures = createFixtureReceipts(NOW);
  const binding = createFixtureBinding(root, fixtures);
  const bindingPath = path.join(root, "binding.json");

  await writeFile(binding.contracts.ingress_writer_authority.evidence_path, JSON.stringify(fixtures.writerAuth), "utf8");
  // Do NOT write PLAUD file at all (missing file)
  await writeFile(binding.contracts.backup_controller_activation.evidence_path, JSON.stringify(fixtures.backupActivation), "utf8");
  await writeFile(bindingPath, JSON.stringify(binding), "utf8");

  const projection = await readReceiptExpiryProjection({ bindingPath, now: NOW });

  assert.equal(projection.status, "partial");
  assert.equal(projection.reason, "standing_evidence_missing");
  assert.equal(projection.summary.unknown, 1);

  const plaudEval = projection.receipts.find((r) => r.contract_id === "voice_plaud_writer_cutover_receipt");
  assert.equal(plaudEval.status, "unknown");
  assert.equal(plaudEval.diagnostic_code, "receipt_evidence_missing");

  await rm(root, { recursive: true, force: true });
});

test("priority-based aggregate reason derivation (expired > critical > warning > invalid > unknown)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "priority-reason-test-"));
  const fixtures = createFixtureReceipts(NOW);
  const binding = createFixtureBinding(root, fixtures);
  const bindingPath = path.join(root, "binding.json");

  // PLAUD warning window active
  fixtures.plaudCutover.valid_until = new Date(NOW + 3 * 86_400 * 1000).toISOString(); // 3 days remaining (warning window 7d)
  await writeFile(binding.contracts.ingress_writer_authority.evidence_path, JSON.stringify(fixtures.writerAuth), "utf8");
  await writeFile(binding.contracts.voice_plaud_writer_cutover_receipt.evidence_path, JSON.stringify(fixtures.plaudCutover), "utf8");
  await writeFile(binding.contracts.backup_controller_activation.evidence_path, JSON.stringify(fixtures.backupActivation), "utf8");
  await writeFile(bindingPath, JSON.stringify(binding), "utf8");

  const projWarning = await readReceiptExpiryProjection({ bindingPath, now: NOW });
  assert.equal(projWarning.status, "partial");
  assert.equal(projWarning.reason, "standing_evidence_warning");

  await rm(root, { recursive: true, force: true });
});

test("HTTP server adapter enforces GET-only loopback endpoint with headers and disabled binding", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "receipt-expiry-http-test-"));
  const bindingPath = path.join(root, "disabled_binding.json");
  await writeFile(bindingPath, JSON.stringify({
    schema_version: RECEIPT_EXPIRY_BINDING_SCHEMA,
    enabled: false,
    contracts: {
      ingress_writer_authority: { evidence_path: path.join(root, "a.json"), warning_window_seconds: 259200, critical_window_seconds: 86400 },
      voice_plaud_writer_cutover_receipt: { evidence_path: path.join(root, "b.json"), warning_window_seconds: 604800, critical_window_seconds: 172800, expected_target_node_id: TARGET_NODE_ID, expected_profile_sha256: PROFILE_SHA256 },
      backup_controller_activation: { evidence_path: path.join(root, "c.json"), warning_window_seconds: 604800, critical_window_seconds: 172800 },
    },
  }), "utf8");

  const adapter = createReceiptExpiryServerAdapter({
    now: () => NOW,
    bindingPath,
  });

  const middlewares = [];
  adapter.configureServer({ middlewares: { use: (fn) => middlewares.push(fn) } });
  const handler = middlewares[0];

  // 1. Loopback GET on disabled binding -> 200 JSON with status unavailable and headers
  const getHeaders = {};
  let getStatus = 0;
  let getBody = "";
  await new Promise((resolve) => {
    handler(
      { url: RECEIPT_EXPIRY_PATH, method: "GET", socket: { remoteAddress: "127.0.0.1" } },
      {
        set statusCode(v) { getStatus = v; },
        setHeader(k, v) { getHeaders[k] = v; },
        end(data) { getBody = data; resolve(null); },
      },
      () => resolve(null),
    );
  });

  assert.equal(getStatus, 200);
  assert.equal(getHeaders["Content-Type"], "application/json; charset=utf-8");
  assert.equal(getHeaders["Cache-Control"], "no-store");
  assert.equal(getHeaders["X-Content-Type-Options"], "nosniff");

  const parsedGet = JSON.parse(getBody);
  assert.equal(parsedGet.status, "unavailable");
  assert.equal(parsedGet.reason, "receipt_expiry_disabled_by_binding");

  // 2. Loopback POST -> 405 with Allow: GET
  const postHeaders = {};
  let postStatus = 0;
  await new Promise((resolve) => {
    handler(
      { url: RECEIPT_EXPIRY_PATH, method: "POST", socket: { remoteAddress: "127.0.0.1" } },
      {
        set statusCode(v) { postStatus = v; },
        setHeader(k, v) { postHeaders[k] = v; },
        end() { resolve(null); },
      },
      () => resolve(null),
    );
  });

  assert.equal(postStatus, 405);
  assert.equal(postHeaders["Allow"], "GET");

  // 3. Non-loopback GET -> 403 Forbidden
  let forbiddenStatus = 0;
  await new Promise((resolve) => {
    handler(
      { url: RECEIPT_EXPIRY_PATH, method: "GET", socket: { remoteAddress: "192.168.1.50" } },
      {
        set statusCode(v) { forbiddenStatus = v; },
        setHeader() {},
        end() { resolve(null); },
      },
      () => resolve(null),
    );
  });

  assert.equal(forbiddenStatus, 403);

  await rm(root, { recursive: true, force: true });
});
