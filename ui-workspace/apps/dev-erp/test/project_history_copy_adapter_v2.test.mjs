import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION,
  PROJECT_HISTORY_RECEIPT_SOURCE_ATTESTATION_SCHEMA_VERSION,
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  PROJECT_HISTORY_WRITER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
  STAGING_RECEIPT_SCHEMA_VERSION,
  computeProjectHistoryReceiptAdapterGenerationBindingDigest,
  computeProjectHistoryReceiptAdapterGenerationDigest,
  computeProjectHistoryReceiptSourceAttestationDigest,
  computeProjectHistoryWriterAuthorityAttestationDigest,
  openProjectHistoryShadowAdapterAuthorityV1,
  validateProjectHistoryReceiptAdapterGenerationV2,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
} from "../../../../guild_hall/shared/project_history_readiness.mjs";
import {
  adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection,
  projectCopiedErpHistory,
} from "../tools/project_history_copy_projector.mjs";
import {
  verifyCopiedProjectHistoryProjection,
} from "../tools/project_history_copy_verifier.mjs";
import {
  createProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
  writeProjectHistoryCopyBinding,
} from "../tools/project_history_copy_binding.mjs";

const windowsPathLockTest = process.platform === "win32"
  ? test
  : (name, fn) => test(name, { skip: "requires the Windows identity-bound path lock" }, fn);

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function createProjectionAuthority(root, projectRef) {
  const now = Date.now();
  const issuedAt = new Date(now - 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: "generation:copy-adapter-authority:test",
    generated_at: new Date(now).toISOString(),
    receipt_root: path.resolve(root),
    project_ref: projectRef,
    window_start: new Date(now - 1000).toISOString(),
    window_end: new Date(now + 1000).toISOString(),
    classification_state: "shadow",
    required_writer_epoch: 19,
    writer_authority: {
      epoch: 19,
      digest: sha256Canonical({ pending: true }),
      node_id: "copy-adapter-test-node",
      issued_at: issuedAt,
      expires_at: expiresAt,
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: ref("source_owner", "private_copy_adapter_test", `owner-${lane}`),
      project_ref: projectRef,
      state: "complete_no_events",
      gap_codes: [],
    })),
    occurrences: [],
    raw_payload_copied: false,
    accepted_history: false,
  };
  const record = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: 19,
    node_id: "copy-adapter-test-node",
    not_before: issuedAt,
    expires_at: expiresAt,
    revoked: false,
    owner_approval_ref: ref(
      "owner_approval",
      "private_copy_adapter_authority",
      "approval:copy-adapter-test",
    ),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  const authorityPath = path.join(root, "private-copy-adapter-authority.json");
  writeFileSync(authorityPath, bytes);
  const authorityDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  request.writer_authority.digest = authorityDigest;
  return openProjectHistoryShadowAdapterAuthorityV1({
    authorityPath,
    authorityDigest,
    request,
  });
}

function makeBoundedV2Generation() {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes).receipts;
  const generationId = "generation:p26-016:bounded:001";
  const tuple = {
    writer_epoch: 7,
    writer_authority_digest: sha256Canonical({ writer: "synthetic-hpp", epoch: 7 }),
    writer_node_id: "synthetic-hpp-node",
  };
  const sourceAttestations = shadow.envelopes.map((envelope, index) => {
    const entry = {
      schema_version: PROJECT_HISTORY_RECEIPT_SOURCE_ATTESTATION_SCHEMA_VERSION,
      generation_id: generationId,
      lane: envelope.lane,
      custody_lane: ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[envelope.lane],
      project_ref: shadow.project_ref,
      source_owner_ref: envelope.source_owner_ref,
      native_occurrence_ref: envelope.native_occurrence_ref,
      event_ref: envelope.event_ref,
      classification_evidence_ref: ref(
        "classification_evidence",
        "synthetic_shadow_classifier",
        `classification:${envelope.lane}:${index}`,
      ),
      custody_receipt_ref: ref(
        "custody_receipt",
        "synthetic_custody_registry",
        `receipt:${envelope.lane}:${index}`,
      ),
      receipt_schema_version: STAGING_RECEIPT_SCHEMA_VERSION,
      receipt_normalization: "staging_receipt_v1",
      receipt_digest: sha256Canonical({ receipt: envelope.lane, index }),
      receipt_locator_digest: sha256Canonical({ locator: envelope.lane, index }),
      source_identity_digest: sha256Canonical({ identity: envelope.lane, index }),
      source_digest: envelope.content_ref.entity_id,
      source_size: index + 1,
      project_state: "unclassified",
      source_deleted: false,
      source_overwritten: false,
      ...tuple,
      raw_payload_copied: false,
      attestation_digest: "",
    };
    entry.attestation_digest = computeProjectHistoryReceiptSourceAttestationDigest(entry);
    return entry;
  });
  const generation = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION,
    generation_id: generationId,
    generated_at: "2026-07-20T12:00:00.000Z",
    project_ref: shadow.project_ref,
    classification_state: "shadow",
    envelopes: shadow.envelopes,
    coverage_receipts: coverage,
    source_attestations: sourceAttestations,
    source_attestation_digest: sha256Canonical(sourceAttestations.map((entry) => entry.attestation_digest)),
    authority_attestation: null,
    ordered_event_digest: sha256Canonical(shadow.envelopes.map((entry) => entry.metadata_digest)),
    request_digest: sha256Canonical({ request: "synthetic-bounded-v2" }),
    generation_digest: "",
    raw_payload_copied: false,
    accepted_history: false,
  };
  const authority = {
    schema_version: PROJECT_HISTORY_WRITER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
    generation_id: generationId,
    project_ref: shadow.project_ref,
    generation_binding_digest: computeProjectHistoryReceiptAdapterGenerationBindingDigest(generation),
    authority_scope: "project_history_shadow_adapter",
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    ...tuple,
    issued_at: "2026-07-20T00:00:00.000Z",
    expires_at: "2026-07-21T00:00:00.000Z",
    event_metadata: shadow.envelopes.map((envelope, index) => ({
      lane: envelope.lane,
      event_ref: envelope.event_ref,
      event_metadata_digest: envelope.metadata_digest,
      source_attestation_digest: sourceAttestations[index].attestation_digest,
      ...tuple,
    })),
    coverage_metadata: coverage.map((entry) => ({
      lane: entry.lane,
      coverage_metadata_digest: entry.metadata_digest,
      ...tuple,
    })),
    raw_payload_copied: false,
    accepted_history: false,
    attestation_digest: "",
  };
  authority.attestation_digest = computeProjectHistoryWriterAuthorityAttestationDigest(authority);
  generation.authority_attestation = authority;
  generation.generation_digest = computeProjectHistoryReceiptAdapterGenerationDigest(generation);
  return validateProjectHistoryReceiptAdapterGenerationV2(generation);
}

windowsPathLockTest("strict bounded receipt-adapter v2 generation adapts into the existing feature-OFF copy projection", (t) => {
  const sourceGeneration = makeBoundedV2Generation();
  const projectionGeneration = adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection(sourceGeneration);
  assert.equal(projectionGeneration.schema_version, ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION);
  assert.equal(projectionGeneration.generation_id, sourceGeneration.generation_id);
  assert.equal(projectionGeneration.classification_state, "shadow");
  assert.equal(projectionGeneration.raw_payload_copied, false);
  assert.equal(projectionGeneration.accepted_history, false);
  assert.notEqual(projectionGeneration.source_attestation_digest, sourceGeneration.source_attestation_digest);

  const root = mkdtempSync(path.join(os.tmpdir(), "sf-ph-copy-v2-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dbPath = path.join(root, "copied-erp.sqlite");
  const projectionRoot = path.join(root, "artifacts");
  const bindingPath = path.join(root, "private-binding.json");
  mkdirSync(projectionRoot);
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE sentinel (value TEXT NOT NULL) STRICT");
  db.close();
  const binding = createProjectHistoryCopyBinding({
    dbPath,
    projectionRoot,
    allowedProjectIds: [projectionGeneration.project_ref.entity_id],
  });
  writeProjectHistoryCopyBinding(bindingPath, binding);
  const paths = resolveProjectHistoryCopyArtifactPaths(binding, {
    projectId: projectionGeneration.project_ref.entity_id,
    generationId: projectionGeneration.generation_id,
  });
  assert(!path.relative(projectionRoot, paths.directory).includes(":"), "Windows-unsafe v2 generation IDs must be digest-mapped");
  const attestation = sha256Canonical(projectionGeneration);
  const authoritySnapshot = createProjectionAuthority(root, projectionGeneration.project_ref);
  const projected = projectCopiedErpHistory({
    ...paths,
    dbPath,
    bindingPath,
    bindingDigest: binding.binding_digest,
    generation: projectionGeneration,
    authoritySnapshot,
    attestation,
  });
  const verified = verifyCopiedProjectHistoryProjection({
    ...paths,
    dbPath,
    bindingPath,
    bindingDigest: binding.binding_digest,
    generationId: projectionGeneration.generation_id,
    attestation,
    artifactManifestDigest: projected.artifact_manifest_digest,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.db_xlsx_parity, true);
  assert.equal(verified.accepted_history, false);
});

test("v2 adapter runs the strict source validator and rejects authority-boundary tampering", () => {
  const sourceGeneration = structuredClone(makeBoundedV2Generation());
  sourceGeneration.authority_attestation.accepted_history = true;
  assert.throws(
    () => adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection(sourceGeneration),
    (error) => error.code === "authority_boundary_invalid",
  );

  for (const [field, value] of [
    ["authority_scope", "raw_ingress_writer"],
    ["classification_epoch", 1],
    ["projector_epoch", 1],
    ["production_authority_granted", true],
    ["raw_ingress_authority_reused", true],
  ]) {
    const tampered = structuredClone(makeBoundedV2Generation());
    tampered.authority_attestation[field] = value;
    assert.throws(
      () => adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection(tampered),
      (error) => error.code === "authority_scope_invalid",
    );
  }
});
