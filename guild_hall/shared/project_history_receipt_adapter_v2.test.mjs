import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "./project_history_envelope.mjs";
import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE,
} from "./project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  PROJECT_HISTORY_RECEIPT_ADAPTER_V2_EXPORT_CONTRACT,
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  STAGING_RECEIPT_SCHEMA_VERSION,
  VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION,
  buildProjectHistoryReceiptAdapterGenerationV2,
  openProjectHistoryShadowAdapterAuthorityV1,
  replayProjectHistoryReceiptAdapterGenerationsV2,
  validateProjectHistoryReceiptAdapterGenerationV2,
  validateProjectHistoryReceiptAdapterRequestV2,
} from "./project_history_receipt_adapter_v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REQUEST_SCHEMA = join(HERE, "project_history_receipt_adapter_request.v2.schema.json");

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function bareDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function clone(value) {
  return structuredClone(value);
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function assertCodeAsync(fn, code) {
  await assert.rejects(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

function stagingIdentity(lane, owner, key) {
  return createHash("sha256")
    .update("soulforge.ingress.source_identity.v1\0", "utf8")
    .update(lane, "utf8")
    .update("\0", "utf8")
    .update(owner, "utf8")
    .update("\0", "utf8")
    .update(key, "utf8")
    .digest("hex");
}

function voiceReceiptId(owner, key, digest) {
  return createHash("sha256").update(`${owner}\0${key}\0${digest}`, "utf8").digest("hex");
}

let authorityFixtureCounter = 0;

async function writeAuthorityEvidence(fixture, request, overrides = {}) {
  authorityFixtureCounter += 1;
  const record = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: request.writer_authority.epoch,
    node_id: request.writer_authority.node_id,
    not_before: request.writer_authority.issued_at,
    expires_at: request.writer_authority.expires_at,
    revoked: false,
    owner_approval_ref: ref("owner_approval", "private_project_history_authority", "approval:synthetic-shadow-adapter"),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
    ...overrides,
  };
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const authorityPath = join(fixture.root, `private-shadow-authority-${authorityFixtureCounter}.json`);
  await writeFile(authorityPath, bytes);
  const authorityDigest = byteDigest(bytes);
  request.writer_authority.digest = authorityDigest;
  return { authorityPath, authorityDigest, bytes, record };
}

async function openAuthoritySnapshot(fixture, request, overrides = {}) {
  const evidence = await writeAuthorityEvidence(fixture, request, overrides);
  return {
    ...evidence,
    snapshot: openProjectHistoryShadowAdapterAuthorityV1({
      authorityPath: evidence.authorityPath,
      authorityDigest: evidence.authorityDigest,
      request,
    }),
  };
}

async function buildWithAuthority(fixture, request, options = {}) {
  const evidence = await openAuthoritySnapshot(fixture, request);
  return buildProjectHistoryReceiptAdapterGenerationV2(request, {
    authoritySnapshot: evidence.snapshot,
    ...options,
  });
}

function coverageState(lane) {
  if (lane === "structured_pc_work") return { state: "complete_no_events", gap_codes: [] };
  if (lane === "file") return { state: "partial", gap_codes: ["bounded_source_gap"] };
  if (lane === "run_log") return { state: "not_collected", gap_codes: ["collector_not_run"] };
  return { state: "complete_with_events", gap_codes: [] };
}

async function makeFixture(t) {
  const root = resolve(await mkdtemp(join(tmpdir(), "sf-ph-receipt-v2-")));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const projectRef = ref("project", "private_project_registry", "project:p26-016");
  const ownerByLane = Object.fromEntries(PROJECT_HISTORY_LANES.map((lane) => [
    lane,
    ref("source_owner", "private_source_registry", `owner_${lane}`),
  ]));
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: "generation:p26-016:continuous:001",
    generated_at: "2026-07-20T12:00:00.000Z",
    receipt_root: root,
    project_ref: projectRef,
    window_start: "2026-07-20T00:00:00.000Z",
    window_end: "2026-07-21T00:00:00.000Z",
    classification_state: "shadow",
    required_writer_epoch: 7,
    writer_authority: {
      epoch: 7,
      digest: sha256Canonical({ authority: "hpp-project-history", epoch: 7 }),
      node_id: "hpp-node-01",
      issued_at: "2026-07-20T00:00:00.000Z",
      expires_at: "2100-07-21T00:00:00.000Z",
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: ownerByLane[lane],
      project_ref: projectRef,
      ...coverageState(lane),
    })),
    occurrences: [],
    raw_payload_copied: false,
    accepted_history: false,
  };
  const specs = [
    { lane: "mail", suffix: "01", schema: "staging" },
    { lane: "mail", suffix: "02", schema: "staging" },
    { lane: "voice", suffix: "03", schema: "voice" },
    { lane: "file", suffix: "04", schema: "staging" },
  ];
  const receiptFiles = [];
  for (const [index, spec] of specs.entries()) {
    const sourceOwnerRef = ownerByLane[spec.lane];
    const custodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[spec.lane];
    const sourceKey = `${spec.lane}_${spec.suffix}`;
    const sourceDigest = bareDigest(`source:${spec.lane}:${spec.suffix}`);
    let receipt;
    if (spec.schema === "voice") {
      receipt = {
        schema_version: VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION,
        receipt_id: voiceReceiptId(sourceOwnerRef.entity_id, `sessions/${sourceKey}.m4a`, sourceDigest),
        captured_at: `2026-07-20T00:01:${spec.suffix}.000Z`,
        source_owner_ref: sourceOwnerRef.entity_id,
        source_key: `sessions/${sourceKey}.m4a`,
        sha256: sourceDigest,
        size: index + 10,
        source_mtime_ms: 1_752_971_200_000 + index,
        custody_kind: "immutable_version",
        storage_ref: `versions/${sourceDigest}`,
        project_state: "unclassified",
        source_deleted: false,
        source_overwritten: false,
      };
    } else {
      receipt = {
        schema_version: STAGING_RECEIPT_SCHEMA_VERSION,
        lane: custodyLane,
        source_owner_ref: sourceOwnerRef.entity_id,
        source_key: sourceKey,
        source_identity_digest: stagingIdentity(custodyLane, sourceOwnerRef.entity_id, sourceKey),
        sha256: sourceDigest,
        size: index + 10,
        storage_ref: `ingress/${custodyLane}/${sourceDigest}`,
        checkpoint_ref: `state/checkpoints/${custodyLane}/${sourceDigest}.json`,
        project_state: "unclassified",
        source_deleted: false,
        source_overwritten: false,
      };
    }
    const relativePath = `receipts/${spec.lane}/${spec.suffix}.json`;
    const absolutePath = join(root, ...relativePath.split("/"));
    await mkdir(dirname(absolutePath), { recursive: true });
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await writeFile(absolutePath, bytes);
    receiptFiles.push({ relativePath, absolutePath, bytes, receipt });
    request.occurrences.push({
      lane: spec.lane,
      project_ref: projectRef,
      receipt_path: relativePath,
      expected_receipt_digest: byteDigest(bytes),
      custody_receipt_ref: ref("custody_receipt", "private_custody_registry", `receipt:${spec.lane}:${spec.suffix}`),
      source_owner_ref: sourceOwnerRef,
      native_occurrence_ref: ref(
        ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[spec.lane],
        `private_${spec.lane}_owner`,
        `native:${spec.lane}:${spec.suffix}`,
      ),
      event_ref: ref("event", "private_shadow_writer", `event:${spec.lane}:${spec.suffix}`),
      source_revision_ref: ref("source_revision", `private_${spec.lane}_owner`, `revision:${spec.lane}:${spec.suffix}`),
      content_ref: ref("content", "private_content_registry", `sha256:${sourceDigest}`),
      event_at: `2026-07-20T00:01:${spec.suffix}.000Z`,
      valid_at: `2026-07-20T00:01:${spec.suffix}.000Z`,
      observed_at: `2026-07-20T00:04:${spec.suffix}.000Z`,
      known_at: `2026-07-20T00:03:${spec.suffix}.000Z`,
      recorded_at: `2026-07-20T00:02:${spec.suffix}.000Z`,
      classification_evidence_ref: ref(
        "classification_evidence",
        "private_shadow_classifier",
        `classification:${spec.lane}:${spec.suffix}`,
      ),
    });
  }
  return { root, request, receiptFiles, projectRef, ownerByLane };
}

test("request schema compiles strictly and accepts the synthetic private metadata request", async (t) => {
  const { request } = await makeFixture(t);
  const schema = JSON.parse(await readFile(REQUEST_SCHEMA, "utf8"));
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
  assert.equal(validateProjectHistoryReceiptAdapterRequestV2(request), request);
});

test("live generation build requires externally opened owner-pinned authority evidence", async (t) => {
  const fixture = await makeFixture(t);
  await assertCodeAsync(
    () => buildProjectHistoryReceiptAdapterGenerationV2(fixture.request),
    "shadow_authority_evidence_required",
  );

  const evidence = await writeAuthorityEvidence(fixture, fixture.request);
  assertCode(
    () => openProjectHistoryShadowAdapterAuthorityV1({
      authorityPath: evidence.authorityPath,
      authorityDigest: sha256Canonical({ wrong: "external-authority-digest" }),
      request: fixture.request,
    }),
    "shadow_authority_digest_mismatch",
  );
});

test("external authority epoch, node, window, and revocation must match the request mirror", async (t) => {
  const fixture = await makeFixture(t);
  const cases = [
    [{ epoch: 8 }, "shadow_authority_tuple_mismatch"],
    [{ node_id: "other-shadow-node" }, "shadow_authority_tuple_mismatch"],
    [{ not_before: "2026-07-20T01:00:00.000Z" }, "shadow_authority_tuple_mismatch"],
    [{ revoked: true }, "shadow_authority_revoked"],
  ];
  for (const [overrides, expectedCode] of cases) {
    const request = clone(fixture.request);
    const evidence = await writeAuthorityEvidence(fixture, request, overrides);
    assertCode(
      () => openProjectHistoryShadowAdapterAuthorityV1({
        authorityPath: evidence.authorityPath,
        authorityDigest: evidence.authorityDigest,
        request,
      }),
      expectedCode,
    );
  }
});

test("caller generated_at cannot make an expired external authority live at initial open", async (t) => {
  const fixture = await makeFixture(t);
  const evidence = await writeAuthorityEvidence(fixture, fixture.request);
  t.mock.method(Date, "now", () => Date.parse(fixture.request.writer_authority.expires_at));
  assertCode(
    () => openProjectHistoryShadowAdapterAuthorityV1({
      authorityPath: evidence.authorityPath,
      authorityDigest: evidence.authorityDigest,
      request: fixture.request,
    }),
    "stale_writer_authority",
  );
});

test("trusted clock is re-read at generation finalization instead of trusting generated_at", async (t) => {
  const fixture = await makeFixture(t);
  let now = Date.parse(fixture.request.writer_authority.issued_at) + 1;
  t.mock.method(Date, "now", () => now);
  const evidence = await openAuthoritySnapshot(fixture, fixture.request);
  await assertCodeAsync(
    () => buildProjectHistoryReceiptAdapterGenerationV2(fixture.request, {
      authoritySnapshot: evidence.snapshot,
      beforeFinalAuthorityRecheck() {
        now = Date.parse(fixture.request.writer_authority.expires_at);
      },
    }),
    "stale_writer_authority",
  );
});

test("authority same-path replacement between receipt reads and generation finalization fails closed", async (t) => {
  const fixture = await makeFixture(t);
  const evidence = await openAuthoritySnapshot(fixture, fixture.request);
  await assertCodeAsync(
    () => buildProjectHistoryReceiptAdapterGenerationV2(fixture.request, {
      authoritySnapshot: evidence.snapshot,
      beforeFinalAuthorityRecheck: async () => {
        await rename(evidence.authorityPath, `${evidence.authorityPath}.old`);
        await writeFile(evidence.authorityPath, evidence.bytes);
      },
    }),
    "shadow_authority_identity_changed",
  );
});

test("variable 0..N lanes normalize staging and voice receipts into five honest Shadow coverage rows", async (t) => {
  const fixture = await makeFixture(t);
  const firstRequest = fixture.request;
  const secondRequest = clone(fixture.request);
  const first = await buildWithAuthority(fixture, firstRequest);
  const second = await buildWithAuthority(fixture, secondRequest);

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(validateProjectHistoryReceiptAdapterGenerationV2(first), first);
  assert.equal(first.envelopes.length, 4);
  assert.deepEqual(
    Object.fromEntries(first.coverage_receipts.map((entry) => [entry.lane, [entry.state, entry.event_count, entry.gap_codes]])),
    {
      mail: ["complete_with_events", 2, []],
      voice: ["complete_with_events", 1, []],
      structured_pc_work: ["complete_no_events", 0, []],
      file: ["partial", 1, ["bounded_source_gap"]],
      run_log: ["not_collected", null, ["collector_not_run"]],
    },
  );
  assert.deepEqual(first.coverage_receipts.map((entry) => entry.lane), PROJECT_HISTORY_LANES);
  assert.equal(first.source_attestations.filter((entry) => entry.receipt_schema_version === STAGING_RECEIPT_SCHEMA_VERSION).length, 3);
  assert.equal(first.source_attestations.filter((entry) => entry.receipt_schema_version === VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION).length, 1);
  assert.equal(first.source_attestations.find((entry) => entry.lane === "voice").receipt_normalization, "voice_copy_only_receipt_v1");
  assert.equal(first.authority_attestation.event_metadata.length, 4);
  assert.equal(first.authority_attestation.coverage_metadata.length, 5);
  assert.equal(first.authority_attestation.authority_scope, "project_history_shadow_adapter");
  assert.equal(first.authority_attestation.classification_epoch, null);
  assert.equal(first.authority_attestation.projector_epoch, null);
  assert.equal(first.authority_attestation.production_authority_granted, false);
  assert.equal(first.authority_attestation.raw_ingress_authority_reused, false);
  assert.equal(first.authority_attestation.event_metadata.every((row) => row.writer_epoch === 7), true);
  assert.equal(first.authority_attestation.coverage_metadata.every((row) => row.writer_node_id === "hpp-node-01"), true);
  assert.equal(first.raw_payload_copied, false);
  assert.equal(first.accepted_history, false);
  assert.equal(PROJECT_HISTORY_RECEIPT_ADAPTER_V2_EXPORT_CONTRACT.authority_binding, "separate_immutable_attestation");
  assert.equal(
    PROJECT_HISTORY_RECEIPT_ADAPTER_V2_EXPORT_CONTRACT.live_authority_claim,
    "none_for_pure_generation_validation",
  );
  assert.equal(
    PROJECT_HISTORY_RECEIPT_ADAPTER_V2_EXPORT_CONTRACT.pure_generation_validation_grants_live_authority,
    false,
  );
});

test("exact receipt-byte tamper fails before normalization", async (t) => {
  const fixture = await makeFixture(t);
  const { request, receiptFiles } = fixture;
  await writeFile(receiptFiles[0].absolutePath, Buffer.concat([receiptFiles[0].bytes, Buffer.from(" ")]));
  await assertCodeAsync(() => buildWithAuthority(fixture, request), "receipt_digest_mismatch");
});

test("duplicate identities, cross-lane reuse, mixed projects, noncanonical time, and private fields fail closed", async (t) => {
  const { request } = await makeFixture(t);

  let changed = clone(request);
  const duplicate = clone(changed.occurrences[0]);
  duplicate.native_occurrence_ref = ref("mail_occurrence", "private_mail_owner", "native:mail:unique");
  duplicate.receipt_path = "receipts/mail/missing-unique.json";
  duplicate.custody_receipt_ref.entity_id = "receipt:mail:unique";
  duplicate.classification_evidence_ref.entity_id = "classification:mail:unique";
  changed.occurrences.push(duplicate);
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "duplicate_event_ref");

  changed = clone(request);
  const crossed = clone(changed.occurrences[0]);
  crossed.lane = "voice";
  crossed.source_owner_ref = clone(changed.coverage.find((entry) => entry.lane === "voice").source_owner_ref);
  crossed.receipt_path = "receipts/voice/crossed.json";
  crossed.custody_receipt_ref.entity_id = "receipt:voice:crossed";
  crossed.event_ref.entity_id = "event:voice:crossed";
  crossed.classification_evidence_ref.entity_id = "classification:voice:crossed";
  changed.occurrences.push(crossed);
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "cross_lane_occurrence_conflict");

  changed = clone(request);
  changed.occurrences[0].project_ref = ref("project", "private_project_registry", "project:other");
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "mixed_project");

  changed = clone(request);
  changed.occurrences[0].known_at = "2026-07-20T00:03:01Z";
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "timestamp_not_canonical_utc");

  changed = clone(request);
  changed.secret_body = "forbidden";
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "forbidden_field");

  changed = clone(request);
  changed.occurrences[0].receipt_path = "../outside.json";
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "receipt_path_invalid");
});

test("stale, revoked, and malformed writer authority is rejected", async (t) => {
  const { request } = await makeFixture(t);

  let changed = clone(request);
  changed.required_writer_epoch = 8;
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "stale_writer_authority_epoch");

  changed = clone(request);
  changed.writer_authority.expires_at = changed.generated_at;
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "stale_writer_authority");

  changed = clone(request);
  changed.writer_authority.revoked = true;
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "writer_authority_revoked");

  changed = clone(request);
  changed.writer_authority.digest = "sha256:BAD";
  assertCode(() => validateProjectHistoryReceiptAdapterRequestV2(changed), "digest_invalid");
});

test("receipt path refuses a junction or symlink traversal when the platform permits creating one", async (t) => {
  const fixture = await makeFixture(t);
  const { root, request, receiptFiles } = fixture;
  const outside = resolve(await mkdtemp(join(tmpdir(), "sf-ph-receipt-v2-outside-")));
  t.after(async () => rm(outside, { recursive: true, force: true }));
  const outsideReceipt = join(outside, "linked.json");
  await writeFile(outsideReceipt, receiptFiles[0].bytes);
  const linkPath = join(root, "linked");
  try {
    await symlink(outside, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.skip(`link creation unavailable: ${error.code || error.message}`);
    return;
  }
  const changed = clone(request);
  changed.occurrences[0].receipt_path = "linked/linked.json";
  changed.occurrences[0].expected_receipt_digest = byteDigest(receiptFiles[0].bytes);
  await assertCodeAsync(() => buildWithAuthority(fixture, changed), "receipt_reparse_forbidden");
});

test("generation replay is immutable, conflicting replay is rejected, and older authority cannot follow a newer epoch", async (t) => {
  const fixture = await makeFixture(t);
  const { request } = fixture;
  const generation = await buildWithAuthority(fixture, request);
  let replay = replayProjectHistoryReceiptAdapterGenerationsV2([generation], clone(generation));
  assert.equal(replay.added_count, 0);
  assert.equal(replay.replayed_count, 1);
  assert.equal(replay.generations.length, 1);

  const conflictRequest = clone(request);
  conflictRequest.occurrences[0].event_at = "2026-07-20T00:01:55.000Z";
  const conflictGeneration = await buildWithAuthority(fixture, conflictRequest);
  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([generation], conflictGeneration),
    "generation_id_conflict",
  );

  const newerRequest = clone(request);
  newerRequest.generation_id = "generation:p26-016:continuous:002";
  newerRequest.required_writer_epoch = 8;
  newerRequest.writer_authority.epoch = 8;
  newerRequest.writer_authority.digest = sha256Canonical({ authority: "hpp-project-history", epoch: 8 });
  const newer = await buildWithAuthority(fixture, newerRequest);

  const olderRequest = clone(request);
  olderRequest.generation_id = "generation:p26-016:continuous:003";
  const older = await buildWithAuthority(fixture, olderRequest);
  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([newer], older),
    "stale_writer_authority_epoch",
  );
});

test("cross-generation event and native identities retain exact receipt and source evidence", async (t) => {
  const fixture = await makeFixture(t);
  const { request, receiptFiles } = fixture;
  request.occurrences[0].source_revision_ref = null;
  request.occurrences[0].content_ref = null;
  const first = await buildWithAuthority(fixture, request);

  const changedReceipt = clone(receiptFiles[0].receipt);
  changedReceipt.source_key = "mail_01_replaced";
  changedReceipt.source_identity_digest = stagingIdentity(
    changedReceipt.lane,
    changedReceipt.source_owner_ref,
    changedReceipt.source_key,
  );
  const changedBytes = Buffer.from(`${JSON.stringify(changedReceipt, null, 2)}\n`, "utf8");
  await writeFile(receiptFiles[0].absolutePath, changedBytes);

  const changedRequest = clone(request);
  changedRequest.generation_id = "generation:p26-016:continuous:evidence-conflict";
  changedRequest.generated_at = "2026-07-20T13:00:00.000Z";
  changedRequest.occurrences[0].expected_receipt_digest = byteDigest(changedBytes);
  const changed = await buildWithAuthority(fixture, changedRequest);

  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([first], changed),
    "occurrence_evidence_conflict",
  );
});

test("cross-generation receipt and source occurrence evidence cannot name a new event or native occurrence", async (t) => {
  const fixture = await makeFixture(t);
  const { request } = fixture;
  const first = await buildWithAuthority(fixture, request);
  const reusedRequest = clone(request);
  reusedRequest.generation_id = "generation:p26-016:continuous:evidence-reuse";
  reusedRequest.generated_at = "2026-07-20T13:00:00.000Z";
  reusedRequest.occurrences[0].native_occurrence_ref.entity_id = "native:mail:reused-evidence";
  reusedRequest.occurrences[0].event_ref.entity_id = "event:mail:reused-evidence";
  const reused = await buildWithAuthority(fixture, reusedRequest);

  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([first], reused),
    "occurrence_evidence_reuse",
  );
});

test("generation collections stay one-project, one-native-event, and input-order independent", async (t) => {
  const fixture = await makeFixture(t);
  const { request } = fixture;
  const first = await buildWithAuthority(fixture, request);

  const otherProjectRequest = clone(request);
  otherProjectRequest.generation_id = "generation:p99-999:continuous:001";
  otherProjectRequest.project_ref = ref("project", "private_project_registry", "project:p99-999");
  for (const row of otherProjectRequest.coverage) row.project_ref = clone(otherProjectRequest.project_ref);
  for (const row of otherProjectRequest.occurrences) row.project_ref = clone(otherProjectRequest.project_ref);
  const otherProject = await buildWithAuthority(fixture, otherProjectRequest);
  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([first], otherProject),
    "mixed_project",
  );

  const nativeConflictRequest = clone(request);
  nativeConflictRequest.generation_id = "generation:p26-016:continuous:native-conflict";
  nativeConflictRequest.occurrences[0].event_ref.entity_id = "event:mail:different-event";
  const nativeConflict = await buildWithAuthority(fixture, nativeConflictRequest);
  assertCode(
    () => replayProjectHistoryReceiptAdapterGenerationsV2([first], nativeConflict),
    "native_occurrence_conflict",
  );

  const secondRequest = clone(request);
  secondRequest.generation_id = "generation:p26-016:continuous:order-second";
  secondRequest.generated_at = "2026-07-20T13:00:00.000Z";
  const second = await buildWithAuthority(fixture, secondRequest);
  const added = replayProjectHistoryReceiptAdapterGenerationsV2([first], clone(second));
  assert.equal(added.added_count, 1);
  assert.equal(added.replayed_count, 0);
  const ordered = replayProjectHistoryReceiptAdapterGenerationsV2([first, second], clone(first));
  const reversed = replayProjectHistoryReceiptAdapterGenerationsV2([second, first], clone(first));
  assert.deepEqual(
    ordered.generations.map((entry) => entry.generation_id),
    reversed.generations.map((entry) => entry.generation_id),
  );
  assert.equal(ordered.collection_digest, reversed.collection_digest);
});
