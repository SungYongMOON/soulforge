import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

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
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  STAGING_RECEIPT_SCHEMA_VERSION,
  VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION,
} from "./project_history_receipt_adapter_v2.mjs";
import {
  PROJECT_HISTORY_CONTINUOUS_SHADOW_INPUT_SCHEMA_VERSION,
  buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun,
  runProjectHistoryContinuousShadowOrchestratorV1,
} from "./project_history_continuous_shadow_orchestrator_v1.mjs";

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function bareDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

async function makeFixture(t) {
  const root = resolve(await mkdtemp(join(tmpdir(), "sf-ph-cont-shadow-")));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const projectRef = ref("project", "private_project_registry", "project:p26-016");
  const otherProjectRef = ref("project", "private_project_registry", "project:p26-999");
  const ownerByLane = Object.fromEntries(PROJECT_HISTORY_LANES.map((lane) => [
    lane,
    ref("source_owner", "private_source_registry", `owner_${lane}`),
  ]));
  const occurrences = [];

  for (const [index, lane] of PROJECT_HISTORY_LANES.entries()) {
    const suffix = String(index + 1).padStart(2, "0");
    const sourceOwnerRef = ownerByLane[lane];
    const sourceKey = `${lane}_${suffix}`;
    const sourceDigest = bareDigest(`source:${lane}:${suffix}`);
    let receipt;
    if (lane === "voice") {
      receipt = {
        schema_version: VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION,
        receipt_id: voiceReceiptId(sourceOwnerRef.entity_id, `sessions/${sourceKey}.m4a`, sourceDigest),
        captured_at: `2026-07-20T00:10:${suffix}.000Z`,
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
      const custodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[lane];
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
    const relativePath = `receipts/${lane}/${suffix}.json`;
    const absolutePath = join(root, ...relativePath.split("/"));
    await mkdir(dirname(absolutePath), { recursive: true });
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await writeFile(absolutePath, bytes);
    occurrences.push({
      lane,
      project_ref: projectRef,
      receipt_path: relativePath,
      expected_receipt_digest: byteDigest(bytes),
      custody_receipt_ref: ref("custody_receipt", "private_custody_registry", `receipt:${lane}:${suffix}`),
      source_owner_ref: sourceOwnerRef,
      native_occurrence_ref: ref(
        ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[lane],
        `private_${lane}_owner`,
        `native:${lane}:${suffix}`,
      ),
      event_ref: ref("event", "private_shadow_writer", `event:${lane}:${suffix}`),
      source_revision_ref: ref("source_revision", `private_${lane}_owner`, `revision:${lane}:${suffix}`),
      content_ref: ref("content", "private_content_registry", `sha256:${sourceDigest}`),
      event_at: `2026-07-20T00:10:${suffix}.000Z`,
      valid_at: `2026-07-20T00:10:${suffix}.000Z`,
      observed_at: `2026-07-20T00:13:${suffix}.000Z`,
      known_at: `2026-07-20T00:12:${suffix}.000Z`,
      recorded_at: `2026-07-20T00:11:${suffix}.000Z`,
      classification_evidence_ref: ref(
        "classification_evidence",
        "private_shadow_classifier",
        `classification:${lane}:${suffix}`,
      ),
    });
  }

  const continuousRunReceipt = {
    schema_version: "soulforge.ingress.continuous_run_receipt.v2",
    run_id: "20260720T000000Z_hpp-node-01_00000023",
    status: "ok",
    node_id: "hpp-node-01",
    lease_epoch: 23,
    writer_authority_epoch: 31,
    writer_authority_digest: sha256Canonical({ authority: "raw-ingress", epoch: 31 }),
    writer_authority_node_id: "hpp-node-01",
    writer_authority_mode: "primary",
    started_at: "2026-07-20T00:00:00.000Z",
    completed_at: "2026-07-20T01:00:00.000Z",
    mail: { status: "ok", total_new_events: 1, credential_files_checked: 1 },
    voice: { copied_new: 1, receipts_written: 1 },
    queues: PROJECT_HISTORY_LANES.filter((lane) => !["mail", "voice"].includes(lane)).map((lane) => ({
      lane,
      coverage_complete: true,
      staged_files: 1,
      gap_reasons: [],
    })),
    source_deleted: false,
    source_overwritten: false,
    erp_written: false,
    mcp_written: false,
    project_promoted: false,
  };

  const notBefore = "2026-07-19T00:00:00.000Z";
  const expiresAt = "2099-01-01T00:00:00.000Z";
  const authorityRecord = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: 41,
    node_id: "hpp-shadow-node-01",
    not_before: notBefore,
    expires_at: expiresAt,
    revoked: false,
    owner_approval_ref: ref("owner_approval", "private_project_history_authority", "approval:continuous-shadow"),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
  };
  const authorityBytes = Buffer.from(`${canonicalJson(authorityRecord)}\n`, "utf8");
  const authorityPath = join(root, "shadow-authority.json");
  await writeFile(authorityPath, authorityBytes);
  const authorityDigest = byteDigest(authorityBytes);
  const input = {
    schema_version: PROJECT_HISTORY_CONTINUOUS_SHADOW_INPUT_SCHEMA_VERSION,
    feature_state: "off",
    continuous_run_receipt: continuousRunReceipt,
    continuous_run_receipt_digest: sha256Canonical(continuousRunReceipt),
    receipt_root: root,
    explicit_project_refs: [projectRef],
    shadow_authority: {
      epoch: authorityRecord.epoch,
      digest: authorityDigest,
      node_id: authorityRecord.node_id,
      issued_at: authorityRecord.not_before,
      expires_at: authorityRecord.expires_at,
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: ownerByLane[lane],
      project_ref: projectRef,
      state: "complete_with_events",
      gap_codes: [],
    })),
    occurrences,
    raw_payload_copied: false,
    accepted_history: false,
  };
  return { input, authorityPath, authorityDigest, projectRef, otherProjectRef };
}

test("actual-style five-lane metadata becomes one feature-OFF project Shadow with H01-H06 coverage", async (t) => {
  const fixture = await makeFixture(t);
  const result = await runProjectHistoryContinuousShadowOrchestratorV1(fixture.input, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
  });

  assert.equal(result.generation.envelopes.length, 5);
  assert.equal(result.generation.coverage_receipts.length, 5);
  assert.deepEqual(result.generation.project_ref, fixture.projectRef);
  assert.equal(result.generation.envelopes.every((row) => row.classification_before.state === "unclassified"), true);
  assert.equal(result.generation.envelopes.every((row) => row.classification_after.state === "classified"), true);
  assert.deepEqual(result.coverage.phases.map((row) => row.phase_id), ["H01", "H02", "H03", "H04", "H05", "H06"]);
  assert.equal(result.coverage.phases.at(-1).state, "shadow_coverage_complete");
  assert.equal(result.output_written, false);
  assert.equal(result.scheduler_enabled, false);
  assert.equal(result.live_database_written, false);
  assert.equal(result.accepted_history, false);
  assert.equal(result.production_readiness_granted, false);
  assert.equal(result.generation.authority_attestation.raw_ingress_authority_reused, false);
});

test("live continuous receipts may use a bare writer digest without weakening RAW-authority separation", async (t) => {
  const fixture = await makeFixture(t);
  const canonicalRawAuthorityDigest = fixture.input.continuous_run_receipt.writer_authority_digest;
  fixture.input.continuous_run_receipt.writer_authority_digest = canonicalRawAuthorityDigest.slice("sha256:".length);
  fixture.input.continuous_run_receipt_digest = sha256Canonical(fixture.input.continuous_run_receipt);

  const result = await runProjectHistoryContinuousShadowOrchestratorV1(fixture.input, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
  });
  assert.equal(result.generation.envelopes.length, 5);
  assert.equal(result.generation.authority_attestation.raw_ingress_authority_reused, false);

  const reusedAuthority = structuredClone(fixture.input);
  reusedAuthority.shadow_authority.digest = canonicalRawAuthorityDigest;
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(reusedAuthority),
    "raw_ingress_authority_reuse_forbidden",
  );
});

test("input order is deterministic, identical replay is idempotent, and same-run conflicts fail closed", async (t) => {
  const fixture = await makeFixture(t);
  const first = await runProjectHistoryContinuousShadowOrchestratorV1(fixture.input, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
  });
  const reordered = structuredClone(fixture.input);
  reordered.coverage.reverse();
  reordered.occurrences.reverse();
  const replay = await runProjectHistoryContinuousShadowOrchestratorV1(reordered, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
    currentGenerations: [first.generation],
  });
  assert.deepEqual(replay.generation, first.generation);
  assert.equal(replay.replay.added_count, 0);
  assert.equal(replay.replay.replayed_count, 1);

  const conflict = structuredClone(fixture.input);
  conflict.occurrences[0].event_ref.entity_id = "event:mail:conflict";
  await assertCodeAsync(
    () => runProjectHistoryContinuousShadowOrchestratorV1(conflict, {
      authorityPath: fixture.authorityPath,
      authorityDigest: fixture.authorityDigest,
      currentGenerations: [first.generation],
    }),
    "generation_id_conflict",
  );
});

test("missing, ambiguous, mixed, and RAW-authority project classification inputs fail closed", async (t) => {
  const fixture = await makeFixture(t);
  const missing = structuredClone(fixture.input);
  missing.explicit_project_refs = [];
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(missing),
    "explicit_project_classification_missing",
  );

  const ambiguous = structuredClone(fixture.input);
  ambiguous.explicit_project_refs.push(fixture.otherProjectRef);
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(ambiguous),
    "explicit_project_classification_ambiguous",
  );

  const mixed = structuredClone(fixture.input);
  mixed.occurrences[0].project_ref = fixture.otherProjectRef;
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(mixed),
    "mixed_project_classification",
  );

  const reusedAuthority = structuredClone(fixture.input);
  reusedAuthority.shadow_authority.digest = reusedAuthority.continuous_run_receipt.writer_authority_digest;
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(reusedAuthority),
    "raw_ingress_authority_reuse_forbidden",
  );

  const dishonestDegraded = structuredClone(fixture.input);
  dishonestDegraded.continuous_run_receipt.status = "degraded";
  dishonestDegraded.continuous_run_receipt_digest = sha256Canonical(
    dishonestDegraded.continuous_run_receipt,
  );
  assertCode(
    () => buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(dishonestDegraded),
    "degraded_continuous_receipt_requires_coverage_gap",
  );
});

test("an explicit zero-event lane remains honest coverage and still closes Shadow-only H06", async (t) => {
  const fixture = await makeFixture(t);
  const input = structuredClone(fixture.input);
  input.occurrences = input.occurrences.filter((row) => row.lane !== "run_log");
  const runCoverage = input.coverage.find((row) => row.lane === "run_log");
  runCoverage.state = "complete_no_events";

  const result = await runProjectHistoryContinuousShadowOrchestratorV1(input, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
  });
  const h05 = result.coverage.phases.find((row) => row.phase_id === "H05");
  assert.equal(h05.state, "complete_no_events");
  assert.equal(h05.event_count, 0);
  assert.equal(result.coverage.phases.at(-1).state, "shadow_coverage_complete");
  assert.equal(result.coverage.production_readiness_granted, false);

  input.continuous_run_receipt.status = "degraded";
  input.continuous_run_receipt_digest = sha256Canonical(input.continuous_run_receipt);
  runCoverage.state = "partial";
  runCoverage.gap_codes = ["bounded_run_gap"];
  const incomplete = await runProjectHistoryContinuousShadowOrchestratorV1(input, {
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
  });
  assert.equal(incomplete.coverage.phases.at(-1).state, "shadow_coverage_incomplete");
  assert.deepEqual(incomplete.coverage.phases.at(-1).gap_codes, ["h05_coverage_gap"]);
});
