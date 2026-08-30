import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { seedRows } from "../data/registry_seed_v0.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";
import { adaptAcceptedPlaudVoiceCaptureToLaneRecord } from "../src/voice_source_lane_adapter.mjs";

const VOICE_ROOT = "_workspaces/system/voice_capture/";
const SESSION_ID = "plaud_20260831_fixture_001";
const RECORDING_ID = "recording_001";
const SESSION_ROOT = `${VOICE_ROOT}sessions/2026-08-31/${SESSION_ID}`;

function hash(seed) {
  return createHash("sha256").update(seed).digest("hex");
}

const FILES = Object.freeze([
  ["provider_original_transcript", `${SESSION_ROOT}/provider_export/transcript.txt`],
  ["provider_transcript", `${SESSION_ROOT}/transcript.txt`],
  ["provider_transcript_segments", `${SESSION_ROOT}/transcript.jsonl`],
  ["recording_manifest", `${VOICE_ROOT}library/recordings/2026-08-31/${RECORDING_ID}/recording_manifest.json`],
  ["session_manifest", `${SESSION_ROOT}/session_manifest.json`],
  ["source_audio", `${SESSION_ROOT}/audio/source.m4a`],
  ["source_event_draft", `${SESSION_ROOT}/source_event_draft.yaml`],
].map(([role, ref], index) => Object.freeze({
  role,
  ref,
  size_bytes: 100 + index,
  sha256: hash(`file-${index}`),
  required: true,
})).sort((left, right) => left.role.localeCompare(right.role, "en")));

function voiceDeliveryId(files) {
  return `voice-delivery-${createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex")
    .slice(0, 24)}`;
}

const IMPORT = Object.freeze({
  schema_version: "soulforge.voice_delivery_receipt.v0",
  receipt_id: voiceDeliveryId(FILES),
  status: "ready",
  session_id: SESSION_ID,
  recording_id: RECORDING_ID,
  stage: "plaud_import_ready",
  producer_node: "hpp_voice_writer",
  created_at: "2026-08-31T01:00:00.000Z",
  files: FILES,
});

function custodyReceipt(file, index, overrides = {}) {
  const sourceOwnerRef = overrides.source_owner_ref ?? "voice_capture_onedrive";
  const sourceKey = overrides.source_key ?? file.ref.slice(VOICE_ROOT.length);
  const digest = overrides.sha256 ?? file.sha256;
  const custodyKind = overrides.custody_kind ?? "live_copy";
  const receiptId = createHash("sha256")
    .update(`${sourceOwnerRef}\0${sourceKey}\0${digest}`)
    .digest("hex");
  return {
    schema_version: "soulforge.voice.copy_only_receipt.v1",
    receipt_id: overrides.receipt_id ?? receiptId,
    captured_at: overrides.captured_at ?? `2026-08-31T01:01:0${index}.000Z`,
    source_owner_ref: sourceOwnerRef,
    source_key: sourceKey,
    sha256: digest,
    size: overrides.size ?? file.size_bytes,
    source_mtime_ms: overrides.source_mtime_ms ?? 1788138000000 + index,
    custody_kind: custodyKind,
    storage_ref: overrides.storage_ref ?? (custodyKind === "immutable_version"
      ? `versions/${sourceKey}.${digest}`
      : custodyKind === "legacy_verified"
        ? `legacy_workspace_capture/${sourceKey}`
        : `live_workspace_capture/${sourceKey}`),
    project_state: overrides.project_state ?? "unclassified",
    source_deleted: overrides.source_deleted ?? false,
    source_overwritten: overrides.source_overwritten ?? false,
  };
}

const CUSTODY = Object.freeze(FILES
  .map((file, index) => Object.freeze(custodyReceipt(file, index)))
  .sort((left, right) => left.source_key.localeCompare(right.source_key, "en")));

const ARGS = Object.freeze({
  source_ref: "source.voice_plaud",
  source_owner_ref: "voice_capture_onedrive",
  expected_source_owner_ref: "voice_capture_onedrive",
  project_scope_ref: "scope.p00_voice_inbox",
  expected_project_scope_ref: "scope.p00_voice_inbox",
  expected_session_id: SESSION_ID,
  expected_recording_id: RECORDING_ID,
  generation_seq: 31,
  import_receipt: IMPORT,
  import_receipt_digest: sha256Canonical(IMPORT),
  custody_receipts: CUSTODY,
  custody_receipts_digest: sha256Canonical(CUSTODY),
  evaluation_time: "2026-08-31T01:10:00.000Z",
  max_receipt_age_seconds: 3600,
});

function adapt(overrides = {}) {
  const args = { ...ARGS, ...overrides };
  if (overrides.import_receipt !== undefined
      && overrides.import_receipt_digest === undefined) {
    args.import_receipt_digest = sha256Canonical(overrides.import_receipt);
  }
  if (overrides.custody_receipts !== undefined
      && overrides.custody_receipts_digest === undefined) {
    const normalized = [...overrides.custody_receipts]
      .sort((left, right) => left.source_key.localeCompare(right.source_key, "en"));
    args.custody_receipts_digest = sha256Canonical(normalized);
  }
  return adaptAcceptedPlaudVoiceCaptureToLaneRecord(args);
}

function operationalVoiceSnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.voice_plaud")
    .map((row) => ({
      ...row,
      current_state: "current",
      module_owner_ref: "guild_hall.path_registry",
      owner_refs: {
        logical: "owner.logical",
        byte: "owner.byte",
        revision: "owner.revision",
        acceptance: "owner.acceptance",
        backup_restore: "owner.backup_restore",
      },
      acl_policy_ref: "policy.acl.v0",
      retention_policy_ref: "policy.retention.v0",
    }));
  return registrySnapshot(createPathRegistry({
    authority: {
      registry_schema_owner: "owner.registry_schema",
      private_binding_writer: "writer.binding_svc",
      resolver_runtime_owner: "owner.resolver_runtime",
      write_policy_owner: "owner.write_policy",
    },
    rows,
  }));
}

test("accepted PLAUD import and exact copy-only custody adapt to one refs-only generation", () => {
  const beforeImport = structuredClone(IMPORT);
  const beforeCustody = structuredClone(CUSTODY);
  const record = adapt();
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.voice_plaud",
    generation_seq: 31,
    capture_ref: `receipt.voice.plaud-import.${ARGS.import_receipt_digest.slice(7)}`,
    manifest_ref: `receipt.voice.custody-set.${ARGS.custody_receipts_digest.slice(7)}`,
    item_count: 7,
    content_digest: sha256Canonical(FILES.map((file) => ({
      role: file.role,
      sha256: file.sha256,
      size_bytes: file.size_bytes,
    }))),
    captured_at: "2026-08-31T01:01:06.000Z",
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  assert.deepEqual(IMPORT, beforeImport);
  assert.deepEqual(CUSTODY, beforeCustody);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
    "session_id", "recording_id", "project_scope_ref", "source_owner_ref",
  ]) assert.equal(invented in record, false, invented);
});

test("custody input order is normalized and output remains deterministic", () => {
  const reversed = [...CUSTODY].reverse();
  const record = adapt({ custody_receipts: reversed });
  assert.deepEqual(record, adapt());
});

test("capture-only voice evidence is degraded and never healthy", () => {
  const record = adapt();
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.voice_plaud",
    records: [record],
    binding_state: "bound",
    evaluation_time: "2026-08-31T01:10:00Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  assert.equal(assembled.evidence.human_acceptance_state, undefined);

  const map = buildStorageMap({
    registry_snapshot: operationalVoiceSnapshot(),
    evidence: { "source.voice_plaud": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("source owner, project scope, session, and recording are exact", () => {
  for (const overrides of [
    { source_ref: "source.mail" },
    { source_owner_ref: "voice_capture_other" },
    { project_scope_ref: "scope.other_project" },
    { expected_session_id: "plaud_other_session" },
    { expected_recording_id: "recording_other" },
  ]) assert.throws(() => adapt(overrides));
});

test("import receipt requires exact accepted stage, normalized role set, occurrence refs, and digest", () => {
  assert.throws(
    () => adapt({ import_receipt: { ...IMPORT, status: "missing" } }),
    /voice_import_receipt_not_accepted/,
  );
  assert.throws(
    () => adapt({ import_receipt: { ...IMPORT, stage: "local_asr_ready" } }),
    /voice_import_receipt_not_accepted/,
  );
  assert.throws(
    () => adapt({ import_receipt_digest: `sha256:${"f".repeat(64)}` }),
    /voice_import_receipt_digest_invalid/,
  );
  const missingRole = FILES.filter((file) => file.role !== "source_event_draft");
  assert.throws(
    () => adapt({ import_receipt: { ...IMPORT, files: missingRole, receipt_id: voiceDeliveryId(missingRole) } }),
    /voice_import_file_set_invalid/,
  );
  const wrongRefFiles = FILES.map((file) => file.role === "source_event_draft"
    ? { ...file, ref: `${VOICE_ROOT}sessions/2026-08-31/another_session/source_event_draft.yaml` }
    : file).sort((left, right) => left.role.localeCompare(right.role, "en"));
  assert.throws(
    () => adapt({ import_receipt: { ...IMPORT, files: wrongRefFiles, receipt_id: voiceDeliveryId(wrongRefFiles) } }),
    /voice_import_occurrence_scope_invalid/,
  );
  const emptyAudioFiles = FILES.map((file) => file.role === "source_audio"
    ? { ...file, ref: `${SESSION_ROOT}/audio/` }
    : file).sort((left, right) => left.role.localeCompare(right.role, "en"));
  assert.throws(
    () => adapt({ import_receipt: {
      ...IMPORT,
      files: emptyAudioFiles,
      receipt_id: voiceDeliveryId(emptyAudioFiles),
    } }),
    /voice_import_occurrence_scope_invalid|voice_import_file_set_invalid/,
  );
  assert.throws(
    () => adapt({ import_receipt: { ...IMPORT, files: [...FILES].reverse() } }),
    /voice_import_files_not_normalized|voice_import_receipt_id_mismatch/,
  );
});

test("custody must exactly cover the import files and preserve byte identity", () => {
  assert.throws(
    () => adapt({ custody_receipts: CUSTODY.slice(1) }),
    /voice_custody_coverage_invalid/,
  );
  const duplicate = [CUSTODY[0], ...CUSTODY.slice(0, -1)];
  assert.throws(
    () => adapt({ custody_receipts: duplicate }),
    /voice_custody_receipt_not_accepted|voice_import_custody_unbound/,
  );
  const wrongHash = CUSTODY.map((receipt, index) => index === 0
    ? custodyReceipt(FILES.find((file) => file.ref.endsWith(receipt.source_key)), 0, {
      sha256: "f".repeat(64),
      captured_at: receipt.captured_at,
    })
    : receipt);
  assert.throws(() => adapt({ custody_receipts: wrongHash }), /voice_import_custody_unbound/);
  const deleted = CUSTODY.map((receipt, index) => index === 0
    ? { ...receipt, source_deleted: true }
    : receipt);
  assert.throws(() => adapt({ custody_receipts: deleted }), /voice_custody_receipt_not_accepted/);
  const forgedStorage = CUSTODY.map((receipt, index) => index === 0
    ? { ...receipt, storage_ref: `versions/${receipt.source_key}.${receipt.sha256}` }
    : receipt);
  assert.throws(() => adapt({ custody_receipts: forgedStorage }), /voice_custody_receipt_not_accepted/);
  const legacyWithoutPathAuthority = CUSTODY.map((receipt, index) => index === 0
    ? custodyReceipt(FILES.find((file) => file.ref.endsWith(receipt.source_key)), 0, {
      custody_kind: "legacy_verified",
      captured_at: receipt.captured_at,
    })
    : receipt);
  assert.throws(
    () => adapt({ custody_receipts: legacyWithoutPathAuthority }),
    /voice_custody_receipt_not_accepted/,
  );
  assert.throws(
    () => adapt({ custody_receipts_digest: `sha256:${"f".repeat(64)}` }),
    /voice_custody_receipts_digest_invalid/,
  );
});

test("receipt clocks reject pre-import, future, and stale custody", () => {
  const changedClock = (clock) => CUSTODY.map((receipt, index) => index === 0
    ? { ...receipt, captured_at: clock }
    : receipt);
  assert.throws(
    () => adapt({ custody_receipts: changedClock("2026-08-31T00:59:59.000Z") }),
    /voice_custody_predates_import/,
  );
  assert.throws(
    () => adapt({ custody_receipts: changedClock("2026-08-31T01:11:00.000Z") }),
    /voice_custody_clock_in_future/,
  );
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T03:00:00.000Z" }),
    /voice_capture_receipts_stale/,
  );
});

test("raw, secret, path, custom object, and caller-owned source values fail with fixed errors", () => {
  const secretKey = ["access", "token"].join("_");
  const privatePath = ["C:", "private", "voice"].join("\\");
  for (const candidate of [
    { import_receipt: { ...IMPORT, [secretKey]: "withheld" } },
    { import_receipt: { ...IMPORT, body: "raw transcript" } },
    { custody_receipts: [{ ...CUSTODY[0], local_path: privatePath }, ...CUSTODY.slice(1)] },
    { custody_receipts: [{ ...CUSTODY[0], source_key: privatePath }, ...CUSTODY.slice(1)] },
  ]) {
    assert.throws(
      () => adapt(candidate),
      (error) => typeof error?.code === "string"
        && error.message === error.code
        && !error.message.includes(secretKey)
        && !error.message.includes(privatePath)
        && !error.message.includes("raw transcript"),
    );
  }
  const custom = Object.assign(Object.create({ inherited: true }), IMPORT);
  assert.throws(
    () => adapt({
      import_receipt: custom,
      import_receipt_digest: ARGS.import_receipt_digest,
    }),
    (error) => error?.code === "voice_import_receipt_invalid"
      && error.message === "voice_import_receipt_invalid",
  );
  for (const hostileSource of ["source.mail", privatePath, "secret:voice-private"]) {
    assert.throws(
      () => adapt({ source_ref: hostileSource }),
      (error) => error?.code === "foreign_voice_source"
        && error.message === "foreign_voice_source"
        && !error.message.includes(hostileSource),
    );
  }
});
