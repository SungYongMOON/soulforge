import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  createIngressMcpService,
  generateIngressToken,
  hashIngressToken,
  INGRESS_MCP_AUTH_SCHEMA,
  INGRESS_MCP_CONFIG_SCHEMA,
} from "../src/ingress_mcp_service.mjs";

const NOW = Date.parse("2026-07-17T10:00:00.000Z");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-mcp-"));
  const outboxRoot = resolve(root, "outbox");
  const stateRoot = resolve(root, "mcp-state");
  const submissionRoot = resolve(stateRoot, "submissions");
  const configPath = resolve(root, "ingress.binding.json");
  const registryPath = resolve(root, "auth.registry.json");
  const outboxBindingPath = resolve(root, "outbox.binding.json");
  const lanes = ["team_files", "structured_pc_work", "run_logs"];
  await mkdir(outboxRoot);
  for (const lane of lanes) {
    await mkdir(resolve(outboxRoot, lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "receipts", lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "acks", lane), { recursive: true });
  }
  for (const part of ["tickets", "uploads", "indexes", "event_sources", "submissions", "quota_locks"]) {
    await mkdir(resolve(stateRoot, part), { recursive: true });
  }
  await json(outboxBindingPath, {
    schema_version: "soulforge.ingress.local_outbox_binding.v1",
    node_id: "HPP_TEST",
    outbox_root: outboxRoot,
    lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      enabled: true,
      queue_root: resolve(outboxRoot, lane),
      source_owner_ref: "ingress_mcp_test",
    }])),
  });
  const primaryToken = generateIngressToken();
  const otherToken = generateIngressToken();
  const limitedToken = generateIngressToken();
  const revokedToken = generateIngressToken();
  const expiredToken = generateIngressToken();
  const token = (credentialId, accountId, value, capabilities, overrides = {}) => ({
    credential_id: credentialId,
    account_id: accountId,
    device_id: overrides.device_id || "device_01",
    agent_id: overrides.agent_id || "codex_01",
    token_hash: hashIngressToken(value),
    project_scopes: overrides.project_scopes || ["PRJ_A"],
    capabilities,
    created_at: "2026-07-01T00:00:00.000Z",
    expires_at: overrides.expires_at || "2027-07-01T00:00:00.000Z",
    revoked_at: overrides.revoked_at ?? null,
  });
  const tokens = [
    token("cred_primary", "person_primary", primaryToken, [
      "upload:team_files", "publish:structured_pc_work", "publish:run_logs", "receipt:read",
    ]),
    token("cred_other", "person_other", otherToken, ["receipt:read"]),
    token("cred_limited", "person_limited", limitedToken, ["receipt:read"]),
    token("cred_revoked", "person_revoked", revokedToken, ["receipt:read"], {
      revoked_at: "2026-07-16T00:00:00.000Z",
    }),
    token("cred_expired", "person_expired", expiredToken, ["receipt:read"], {
      expires_at: "2026-07-16T00:00:00.000Z",
    }),
  ];
  await json(registryPath, {
    schema_version: INGRESS_MCP_AUTH_SCHEMA,
    revision: "rev_1",
    tokens,
  });
  const config = {
    schema_version: INGRESS_MCP_CONFIG_SCHEMA,
    enabled: true,
    node_id: "HPP_TEST",
    listen_host: "127.0.0.1",
    listen_port: 4312,
    public_url: "http://127.0.0.1:4312",
    local_outbox_binding_path: outboxBindingPath,
    auth_registry_path: registryPath,
    state_root: stateRoot,
    submission_root: submissionRoot,
    max_file_bytes: 1024 * 1024,
    chunk_bytes: 64 * 1024,
    ticket_ttl_seconds: 600,
    max_open_uploads_per_credential: 8,
    max_pending_upload_bytes_per_credential: 8 * 1024 * 1024,
    max_retained_upload_bytes_per_credential: 64 * 1024 * 1024,
  };
  await json(configPath, config);
  return {
    root, outboxRoot, stateRoot, submissionRoot, configPath, registryPath, config, tokens,
    primaryToken, otherToken, limitedToken, revokedToken, expiredToken,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function uploadInput(bytes, overrides = {}) {
  return {
    project_hint: "PRJ_A",
    occurrence_id: "file_0001",
    idempotency_key: "upload:file:0001",
    filename: "evidence.xlsx",
    size: bytes.length,
    sha256: digest(bytes),
    media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ...overrides,
  };
}

function eventInput(overrides = {}) {
  return {
    project_hint: "PRJ_A",
    occurrence_id: "work_0001",
    idempotency_key: "work:event:0001",
    event_kind: "codex_work_checkpoint",
    occurred_at: "2026-07-17T09:30:00+09:00",
    task_ref: "TASK_001",
    summary: "Bounded work summary",
    outputs: ["report.xlsx"],
    verification: "synthetic verification passed",
    next_actions: ["owner review"],
    stop_conditions: ["no production activation"],
    official_completion: false,
    full_transcript_included: false,
    screen_capture_included: false,
    keystroke_capture_included: false,
    os_surveillance_included: false,
    ...overrides,
  };
}

test("chunked file upload resumes after restart and becomes verified only after matching HPP ack", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from("synthetic-xlsx-bytes-for-ingress");
    let service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    const principal = await service.authenticate(`Bearer ${f.primaryToken}`);
    assert.deepEqual(service.whoami(principal), {
      account_id: "person_primary",
      device_id: "device_01",
      agent_id: "codex_01",
      project_scopes: ["PRJ_A"],
      capabilities: ["publish:run_logs", "publish:structured_pc_work", "receipt:read", "upload:team_files"],
      expires_at: "2027-07-01T00:00:00.000Z",
    });

    const prepared = await service.prepareUpload(principal, uploadInput(bytes));
    assert.equal(prepared.status, "pending");
    assert.equal(prepared.received_size, 0);
    await service.appendChunk(principal, prepared.ticket_id, 0, bytes.subarray(0, 7));
    await assert.rejects(
      service.appendChunk(principal, prepared.ticket_id, 0, bytes.subarray(0, 7)),
      (error) => error.code === "upload_offset_conflict" && error.receivedSize === 7,
    );

    service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    const restartedPrincipal = await service.authenticate(f.primaryToken);
    assert.equal((await service.uploadStatus(restartedPrincipal, prepared.ticket_id)).received_size, 7);
    await service.appendChunk(restartedPrincipal, prepared.ticket_id, 7, bytes.subarray(7));
    const pending = await service.finalizeUpload(restartedPrincipal, prepared.ticket_id);
    assert.equal(pending.status, "pending_server_ack");
    assert.equal(pending.official_history_written, false);
    assert.equal(pending.source_deleted, false);

    const outboxOccurrenceId = "mcp_cred_primary_file_0001";
    assert.deepEqual(
      await readFile(resolve(f.outboxRoot, "team_files", `${outboxOccurrenceId}.payload`)),
      bytes,
    );
    const uploadSource = resolve(f.stateRoot, "uploads", `${prepared.ticket_id}.partial`);
    assert.equal((await stat(uploadSource)).size, bytes.length);
    await json(resolve(f.outboxRoot, "state", "acks", "team_files", `${outboxOccurrenceId}.json`), {
      source_key: outboxOccurrenceId,
      sha256: digest(bytes),
      size: bytes.length,
    });
    const verified = await service.submissionStatus(restartedPrincipal, pending.submission_id);
    assert.equal(verified.status, "verified_server_ack");
    assert.equal((await service.finalizeUpload(restartedPrincipal, prepared.ticket_id)).status, "verified_server_ack");

    const replay = await service.prepareUpload(restartedPrincipal, uploadInput(bytes));
    assert.equal(replay.replayed, true);
    assert.equal(replay.submission_id, pending.submission_id);
  } finally {
    await f.cleanup();
  }
});

test("authentication, project scopes, capabilities, account isolation, and revocation fail closed", async () => {
  const f = await fixture();
  try {
    const service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    await assert.rejects(service.authenticate("not-a-token"), /ingress_auth_required/);
    await assert.rejects(service.authenticate(f.revokedToken), /ingress_auth_invalid/);
    await assert.rejects(service.authenticate(f.expiredToken), /ingress_auth_invalid/);
    const limited = await service.authenticate(f.limitedToken);
    await assert.rejects(service.prepareUpload(limited, uploadInput(Buffer.from("x"))), /capability_forbidden/);

    const principal = await service.authenticate(f.primaryToken);
    await assert.rejects(
      service.prepareUpload(principal, uploadInput(Buffer.from("x"), { project_hint: "PRJ_B" })),
      /project_scope_forbidden/,
    );
    const submission = await service.publishEvent(principal, "structured_pc_work", eventInput());
    const other = await service.authenticate(f.otherToken);
    await assert.rejects(service.submissionStatus(other, submission.submission_id), /submission_not_found/);

    const registry = JSON.parse(await readFile(f.registryPath, "utf8"));
    registry.revision = "rev_2";
    registry.tokens[0].revoked_at = "2026-07-17T09:59:00.000Z";
    await json(f.registryPath, registry);
    await assert.rejects(service.publishEvent(principal, "run_logs", eventInput({
      occurrence_id: "run_0001",
      idempotency_key: "run:event:0001",
    })), /ingress_auth_invalid/);
  } finally {
    await f.cleanup();
  }
});

test("bounded events reject transcripts, surveillance, unknown fields, and idempotency conflicts", async () => {
  const f = await fixture();
  try {
    const service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    const principal = await service.authenticate(f.primaryToken);
    for (const field of [
      "official_completion", "full_transcript_included", "screen_capture_included",
      "keystroke_capture_included", "os_surveillance_included",
    ]) {
      await assert.rejects(
        service.publishEvent(principal, "structured_pc_work", eventInput({ [field]: true })),
        /event_capture_boundary_violation/,
      );
    }
    await assert.rejects(
      service.publishEvent(principal, "structured_pc_work", { ...eventInput(), transcript: "secret" }),
      /invalid_event_request/,
    );
    const first = await service.publishEvent(principal, "structured_pc_work", eventInput());
    const replay = await service.publishEvent(principal, "structured_pc_work", eventInput());
    assert.equal(replay.submission_id, first.submission_id);
    await assert.rejects(
      service.publishEvent(principal, "structured_pc_work", eventInput({ summary: "changed" })),
      /idempotency_conflict/,
    );
    const source = JSON.parse(await readFile(resolve(f.stateRoot, "event_sources", `${first.submission_id}.json`), "utf8"));
    assert.equal(source.accepted_history, false);
    assert.equal(source.full_transcript_included, false);
    assert.equal(Object.hasOwn(source, "transcript"), false);
  } finally {
    await f.cleanup();
  }
});

test("hash mismatch, unsafe filenames, state overlap, and corrupted acknowledgements are rejected", async () => {
  const f = await fixture();
  try {
    const service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    const principal = await service.authenticate(f.primaryToken);
    const bytes = Buffer.from("hash-me");
    for (const filename of ["../escape.xlsx", "payload.exe", "bad:name.pdf"]) {
      await assert.rejects(
        service.prepareUpload(principal, uploadInput(bytes, {
          occurrence_id: `unsafe_${digest(filename).slice(0, 8)}`,
          idempotency_key: `unsafe:file:${digest(filename).slice(0, 8)}`,
          filename,
        })),
        /invalid_filename/,
      );
    }
    const prepared = await service.prepareUpload(principal, uploadInput(bytes, {
      occurrence_id: "bad_hash_01",
      idempotency_key: "upload:bad-hash:01",
      sha256: "0".repeat(64),
    }));
    await service.appendChunk(principal, prepared.ticket_id, 0, bytes);
    await assert.rejects(service.finalizeUpload(principal, prepared.ticket_id), /upload_sha256_mismatch/);

    const event = await service.publishEvent(principal, "run_logs", eventInput({
      occurrence_id: "run_0002",
      idempotency_key: "run:event:0002",
    }));
    const outboxOccurrenceId = "mcp_cred_primary_run_0002";
    await json(resolve(f.outboxRoot, "state", "acks", "run_logs", `${outboxOccurrenceId}.json`), {
      source_key: outboxOccurrenceId,
      sha256: "f".repeat(64),
      size: 1,
    });
    await assert.rejects(service.submissionStatus(principal, event.submission_id), /submission_ack_invalid/);

    const overlapping = { ...f.config, state_root: f.outboxRoot, submission_root: resolve(f.outboxRoot, "state") };
    await json(f.configPath, overlapping);
    await assert.rejects(createIngressMcpService({ configPath: f.configPath }), /ingress_mcp_outbox_state_overlap/);
  } finally {
    await f.cleanup();
  }
});

test("per-credential open and retained byte quotas fail closed without blocking idempotent replay", async () => {
  const f = await fixture();
  try {
    const config = JSON.parse(await readFile(f.configPath, "utf8"));
    config.max_open_uploads_per_credential = 1;
    config.max_pending_upload_bytes_per_credential = 1024 * 1024;
    config.max_retained_upload_bytes_per_credential = 1024 * 1024;
    await json(f.configPath, config);
    const service = await createIngressMcpService({ configPath: f.configPath, now: () => NOW });
    const principal = await service.authenticate(f.primaryToken);
    const firstBytes = Buffer.alloc(600 * 1024, 0x31);
    const firstInput = uploadInput(firstBytes, {
      occurrence_id: "quota_file_01",
      idempotency_key: "quota:file:0001",
      filename: "quota-one.pdf",
      media_type: "application/pdf",
    });
    const first = await service.prepareUpload(principal, firstInput);
    await assert.rejects(service.prepareUpload(principal, uploadInput(Buffer.from("x"), {
      occurrence_id: "quota_file_02",
      idempotency_key: "quota:file:0002",
      filename: "quota-two.pdf",
      media_type: "application/pdf",
    })), /ingress_open_upload_quota_exceeded/);
    for (let offset = 0; offset < firstBytes.length;) {
      const chunk = firstBytes.subarray(offset, Math.min(firstBytes.length, offset + 64 * 1024));
      await service.appendChunk(principal, first.ticket_id, offset, chunk);
      offset += chunk.length;
    }
    await service.finalizeUpload(principal, first.ticket_id);
    assert.equal((await service.prepareUpload(principal, firstInput)).replayed, true);
    const secondBytes = Buffer.alloc(600 * 1024, 0x32);
    await assert.rejects(service.prepareUpload(principal, uploadInput(secondBytes, {
      occurrence_id: "quota_file_03",
      idempotency_key: "quota:file:0003",
      filename: "quota-three.pdf",
      media_type: "application/pdf",
    })), /ingress_retained_byte_quota_exceeded/);
  } finally {
    await f.cleanup();
  }
});
