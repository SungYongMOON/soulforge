import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "./project_history_envelope.mjs";
import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION,
  CUSTODY_RECEIPT_PROOF_SCHEMA_VERSION,
  SHADOW_CLASSIFICATION_EVIDENCE_SCHEMA_VERSION,
  buildActualFiveLaneShadowGeneration,
  computeCustodyReceiptProofDigest,
  computeShadowClassificationEvidenceDigest,
} from "./project_history_actual_shadow.mjs";
import {
  ProjectHistoryKnowledgeProjectionError,
  buildProjectHistoryKnowledgeProjection,
  rebuildProjectHistoryKnowledgeRagIndex,
  validateProjectHistoryKnowledgeRagManifest,
  validateProjectHistoryKnowledgeProjection,
} from "./project_history_knowledge_projection.mjs";
import { validateRagManifest, validateRagMetadataIndex } from "../rag/rag.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "project_history_knowledge_projection_cli.mjs");
const ORIGIN_PROJECT_CODE = "P26-016";
const SECOND_PROJECT_CODE = "P27-042";

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function clone(value) {
  return structuredClone(value);
}

function makeGeneration(projectCode = "P26-016", timeOverrides = {}, projectEntityId = projectCode) {
  const generationId = `generation:${projectCode.toLowerCase()}:001`;
  const projectRef = ref("project", "pilot_project_registry", projectEntityId);
  const lanes = PROJECT_HISTORY_LANES.map((lane, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const custodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[lane];
    const sourceOwnerRef = ref("source_owner", "pilot_custody_registry", `source:${lane}`);
    const nativeOccurrenceRef = ref(
      ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[lane],
      `pilot_${lane}_semantic_owner`,
      `native:${lane}:${suffix}`,
    );
    const eventRef = ref("event", "pilot_shadow_writer", `event:${lane}:${suffix}`);
    const receiptRef = ref("custody_receipt", "pilot_custody_registry", `receipt:${custodyLane}:${suffix}`);
    const sourceDigest = sha256Canonical({ lane, source: suffix });
    const receiptProof = {
      schema_version: CUSTODY_RECEIPT_PROOF_SCHEMA_VERSION,
      receipt_schema_version: "soulforge.ingress.staging_receipt.v1",
      receipt_ref: receiptRef,
      custody_lane: custodyLane,
      source_owner_ref: sourceOwnerRef,
      source_identity_digest: sha256Canonical({ lane, identity: suffix }),
      source_digest: sourceDigest,
      source_size: index + 1,
      project_state: "unclassified",
      source_deleted: false,
      source_overwritten: false,
      receipt_digest: sha256Canonical({ lane, receipt: suffix }),
      proof_digest: "",
    };
    receiptProof.proof_digest = computeCustodyReceiptProofDigest(receiptProof);
    const classificationEvidence = {
      schema_version: SHADOW_CLASSIFICATION_EVIDENCE_SCHEMA_VERSION,
      evidence_ref: ref("classification_evidence", "pilot_shadow_classifier", `classification:${lane}:${suffix}`),
      generation_id: generationId,
      lane,
      native_occurrence_ref: nativeOccurrenceRef,
      event_ref: eventRef,
      custody_receipt_ref: receiptRef,
      custody_receipt_digest: receiptProof.receipt_digest,
      source_digest: sourceDigest,
      project_ref: projectRef,
      classification_before: { state: "unclassified", project_ref: null },
      classification_after: { state: "classified", project_ref: projectRef },
      shadow_only: true,
      evidence_digest: "",
    };
    classificationEvidence.evidence_digest = computeShadowClassificationEvidenceDigest(classificationEvidence);
    return {
      lane,
      custody_lane: custodyLane,
      semantic_occurrence: {
        source_owner_ref: sourceOwnerRef,
        native_occurrence_ref: nativeOccurrenceRef,
        event_ref: eventRef,
        source_revision_ref: ref("source_revision", `pilot_${lane}_semantic_owner`, `revision:${lane}:${suffix}`),
        content_ref: ref("content", "pilot_content_registry", sha256Canonical({ lane, value: suffix })),
        event_at: `2026-07-19T00:00:${suffix}.000Z`,
        valid_at: `2026-07-19T00:00:${suffix}.000Z`,
        observed_at: `2026-07-19T00:03:${suffix}.000Z`,
        known_at: timeOverrides[lane]?.knownAt ?? `2026-07-19T00:02:${suffix}.000Z`,
        recorded_at: timeOverrides[lane]?.recordedAt ?? `2026-07-19T00:01:${suffix}.000Z`,
        source_digest: sourceDigest,
        custody_receipt_ref: receiptRef,
        custody_receipt_digest: receiptProof.receipt_digest,
        classification_evidence: classificationEvidence,
      },
      custody_receipt_proof: receiptProof,
    };
  });
  return buildActualFiveLaneShadowGeneration({
    schema_version: ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: generationId,
    project_ref: projectRef,
    window_start: "2026-07-19T00:00:00.000Z",
    window_end: "2026-07-20T00:00:00.000Z",
    lanes,
  });
}

function assertAuthorityOff(value) {
  assert.ok(Object.keys(value).length > 0);
  assert.ok(Object.values(value).every((flag) => flag === false));
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function refreshProjectionDigest(projection) {
  projection.projection_digest = sha256Canonical(
    Object.fromEntries(Object.entries(projection).filter(([key]) => key !== "projection_digest")),
  );
  return projection;
}

test("project scope produces deterministic held P26-016 candidate, graph, manifest, and index previews", async () => {
  const generation = makeGeneration();
  const first = await buildProjectHistoryKnowledgeProjection(generation, {
    knowledgeScope: "project",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const second = await buildProjectHistoryKnowledgeProjection(clone(generation), {
    knowledge_scope: "project",
    origin_project_code: ORIGIN_PROJECT_CODE,
  });

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(validateProjectHistoryKnowledgeProjection(first), first);
  assert.equal(first.feature_state, "off");
  assert.equal(first.route, "owner_decision_needed");
  assert.equal(first.knowledge_scope, "project");
  assert.equal(first.owner_project_code, "P26-016");
  assert.equal(first.origin_project_code, ORIGIN_PROJECT_CODE);
  assert.equal(first.input_binding.accepted_history, false);
  assert.equal(first.candidate_previews.length, 5);
  assert.deepEqual(first.candidate_previews.map((item) => item.lane), PROJECT_HISTORY_LANES);

  for (const preview of first.candidate_previews) {
    assert.equal(preview.owner_project_code, "P26-016");
    assert.equal(preview.origin_project_code, "P26-016");
    assert.equal(preview.candidate.project_code, "P26-016");
    assert.equal(preview.feature_state, "off");
    assert.equal(preview.route, "owner_decision_needed");
    assert.equal(preview.candidate.suggested_route, "owner_decision_needed");
    assert.equal(preview.candidate.claim_ceiling, "observed");
    assert.equal(preview.candidate.status, "held");
    assertAuthorityOff(preview.authority);
  }
  assertAuthorityOff(first.authority);
  assertAuthorityOff(first.graph_view.authority);
  assertAuthorityOff(first.rag_manifest.authority);
  assertAuthorityOff(first.rag_metadata_index.authority);
  assert.equal(validateRagManifest(first.rag_manifest).status, "pass");
  assert.equal(validateRagMetadataIndex(first.rag_metadata_index).status, "pass");
  assert.equal(first.rag_manifest.sources.length, 0);
  assert.equal(first.rag_manifest.retrieval_units.length, 5);
  assert.equal(first.rag_metadata_index.documents.length, 5);
  assert.equal(first.rag_metadata_index.counts.private_source_count, 0);

  const keys = collectKeys(first);
  for (const forbidden of [
    "storage_locator",
    "source_locator",
    "source_text",
    "chunk_text",
    "raw_payload",
    "accepted_pointer",
  ]) {
    assert.equal(keys.has(forbidden), false);
  }
});

test("knowledge candidates preserve canonical history chronology when it differs from lane order", async () => {
  const generation = makeGeneration(ORIGIN_PROJECT_CODE, {
    mail: {
      knownAt: "2026-07-19T00:04:59.000Z",
      recordedAt: "2026-07-19T00:01:01.000Z",
    },
  });
  assert.notDeepEqual(generation.envelopes.map((envelope) => envelope.lane), PROJECT_HISTORY_LANES);

  const projection = await buildProjectHistoryKnowledgeProjection(generation, {
    knowledgeScope: "project",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  assert.deepEqual(
    projection.candidate_previews.map((preview) => preview.lane),
    generation.envelopes.map((envelope) => envelope.lane),
  );
  assert.equal(validateProjectHistoryKnowledgeProjection(projection), projection);
});

test("common scope is system-owned while every candidate retains P26-016 origin", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  assert.equal(projection.knowledge_scope, "common");
  assert.equal(projection.owner_project_code, "system");
  assert.equal(projection.origin_project_code, "P26-016");
  for (const preview of projection.candidate_previews) {
    assert.equal(preview.owner_project_code, "system");
    assert.equal(preview.origin_project_code, "P26-016");
    assert.equal(preview.candidate.project_code, "system");
    assert.equal(preview.candidate.suggested_route, "owner_decision_needed");
  }
  assert.equal(projection.rag_manifest.scope.project_code, "system");
  assert.equal(projection.rag_manifest.scope.origin_project_code, "P26-016");
});

test("knowledge scope is mandatory, conflict-checked, and closed to project or common", async () => {
  const generation = makeGeneration();
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, { originProjectCode: ORIGIN_PROJECT_CODE }),
    (error) => error instanceof ProjectHistoryKnowledgeProjectionError && error.code === "knowledge_scope_required",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, {
      knowledgeScope: "automatic",
      originProjectCode: ORIGIN_PROJECT_CODE,
    }),
    (error) => error instanceof ProjectHistoryKnowledgeProjectionError && error.code === "knowledge_scope_invalid",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, {
      knowledgeScope: "project",
      knowledge_scope: "common",
      originProjectCode: ORIGIN_PROJECT_CODE,
    }),
    (error) => error instanceof ProjectHistoryKnowledgeProjectionError && error.code === "knowledge_scope_conflict",
  );
});

test("origin is mandatory, canonical, conflict-checked, and exact-matched to the generation", async () => {
  const generation = makeGeneration();
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, { knowledgeScope: "project" }),
    (error) => error.code === "origin_project_code_required",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, {
      knowledgeScope: "project",
      originProjectCode: "p26-016",
    }),
    (error) => error.code === "origin_project_code_invalid",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(generation, {
      knowledgeScope: "project",
      originProjectCode: ORIGIN_PROJECT_CODE,
      origin_project_code: SECOND_PROJECT_CODE,
    }),
    (error) => error.code === "origin_project_code_conflict",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(makeGeneration(SECOND_PROJECT_CODE), {
      knowledgeScope: "project",
      originProjectCode: ORIGIN_PROJECT_CODE,
    }),
    (error) => error.code === "origin_project_mismatch",
  );
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(
      makeGeneration(ORIGIN_PROJECT_CODE, {}, `archive-${ORIGIN_PROJECT_CODE}-copy`),
      {
        knowledgeScope: "project",
        originProjectCode: ORIGIN_PROJECT_CODE,
      },
    ),
    (error) => error.code === "origin_project_code_invalid",
  );
});

test("a second valid project uses origin ownership for project scope and system ownership for common scope", async () => {
  const generation = makeGeneration(SECOND_PROJECT_CODE);
  const projectProjection = await buildProjectHistoryKnowledgeProjection(generation, {
    knowledgeScope: "project",
    originProjectCode: SECOND_PROJECT_CODE,
  });
  const commonProjection = await buildProjectHistoryKnowledgeProjection(generation, {
    knowledgeScope: "common",
    originProjectCode: SECOND_PROJECT_CODE,
  });

  assert.equal(projectProjection.origin_project_code, SECOND_PROJECT_CODE);
  assert.equal(projectProjection.owner_project_code, SECOND_PROJECT_CODE);
  assert.ok(projectProjection.candidate_previews.every(
    (preview) => preview.origin_project_code === SECOND_PROJECT_CODE
      && preview.owner_project_code === SECOND_PROJECT_CODE,
  ));
  assert.equal(commonProjection.origin_project_code, SECOND_PROJECT_CODE);
  assert.equal(commonProjection.owner_project_code, "system");
  assert.ok(commonProjection.candidate_previews.every(
    (preview) => preview.origin_project_code === SECOND_PROJECT_CODE
      && preview.owner_project_code === "system",
  ));
  assert.notEqual(
    projectProjection.projection_id,
    (await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
      knowledgeScope: "project",
      originProjectCode: ORIGIN_PROJECT_CODE,
    })).projection_id,
  );
});

test("accepted-history inputs fail before projection", async () => {

  const accepted = makeGeneration();
  accepted.accepted_history = true;
  await assert.rejects(
    buildProjectHistoryKnowledgeProjection(accepted, {
      knowledgeScope: "project",
      originProjectCode: ORIGIN_PROJECT_CODE,
    }),
    (error) => error.code === "generation_boundary_invalid",
  );
});

test("metadata index rebuild is byte-stable and remains feature-OFF", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const rebuilt = await rebuildProjectHistoryKnowledgeRagIndex(projection.rag_manifest);
  assert.equal(canonicalJson(rebuilt), canonicalJson(projection.rag_metadata_index));
  assert.equal(rebuilt.feature_state, "off");
  assert.equal(rebuilt.route, "owner_decision_needed");
  assertAuthorityOff(rebuilt.authority);
});

test("validator rejects authority escalation without applying mutation", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "project",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const escalated = clone(projection);
  escalated.authority.owner_approval = true;
  refreshProjectionDigest(escalated);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(escalated),
    (error) => error.code === "authority_must_be_false",
  );
});

test("persisted validator binds generation, occurrence, five-lane set, chronology, and exact graph derivation", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "project",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });

  const changedGeneration = clone(projection);
  changedGeneration.input_binding.generation_id = "invented-generation";
  refreshProjectionDigest(changedGeneration);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(changedGeneration),
    (error) => error.code === "projection_id_mismatch",
  );

  const changedOccurrence = clone(projection);
  changedOccurrence.candidate_previews[0].occurrence_id = `ph-occ:${"0".repeat(64)}`;
  refreshProjectionDigest(changedOccurrence);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(changedOccurrence),
    (error) => error.code === "candidate_derivation_mismatch",
  );

  const changedLane = clone(projection);
  changedLane.candidate_previews[0].lane = "arbitrary_lane";
  refreshProjectionDigest(changedLane);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(changedLane),
    (error) => error.code === "candidate_lane_set_invalid",
  );

  const duplicateLane = clone(projection);
  duplicateLane.candidate_previews[0].lane = duplicateLane.candidate_previews[1].lane;
  refreshProjectionDigest(duplicateLane);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(duplicateLane),
    (error) => error.code === "candidate_lane_set_invalid",
  );

  const inventedEdge = clone(projection);
  inventedEdge.graph_view.edges.push({
    ...inventedEdge.graph_view.edges[0],
    edge_ref: "project_history_edge:0000000000000000",
    relation_type: "invented_relation",
  });
  inventedEdge.graph_view.graph_digest = sha256Canonical(
    Object.fromEntries(Object.entries(inventedEdge.graph_view).filter(([key]) => key !== "graph_digest")),
  );
  refreshProjectionDigest(inventedEdge);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(inventedEdge),
    (error) => error.code === "graph_view_derivation_mismatch",
  );
});

test("persisted validator rejects generic-valid index title and owner laundering", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const laundered = clone(projection);
  const document = laundered.rag_metadata_index.documents.find(
    (item) => item.title_label === `${ORIGIN_PROJECT_CODE} file history candidate`,
  );
  document.title_label = "P99-999 file history candidate";
  document.owner_surface = "P99-999";
  document.summary =
    "common scope metadata candidate; owner P99-999; route owner_decision_needed; feature off.";
  assert.equal(validateRagMetadataIndex(laundered.rag_metadata_index).status, "pass");
  refreshProjectionDigest(laundered);

  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(laundered),
    (error) => error.code === "rag_metadata_index_document_derivation_mismatch",
  );
});

test("persisted validator rejects generic-valid index fingerprint, token, and order laundering", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const mutations = [
    (index) => { index.documents[0].metadata_fingerprint = "0".repeat(64); },
    (index) => {
      const document = index.documents[0];
      const [fingerprint] = Object.keys(document.token_fingerprint_counts);
      document.token_fingerprint_count += 1;
      document.token_fingerprint_counts[fingerprint] += 1;
    },
    (index) => { index.documents.reverse(); },
    (index) => { index.lexical_index.token_postings[0].postings[0].count += 1; },
    (index) => { index.counts.token_fingerprint_count += 1; },
  ];

  for (const mutate of mutations) {
    const laundered = clone(projection);
    mutate(laundered.rag_metadata_index);
    laundered.rag_metadata_index.validation = validateRagMetadataIndex(laundered.rag_metadata_index);
    assert.equal(laundered.rag_metadata_index.validation.status, "pass");
    refreshProjectionDigest(laundered);
    assert.throws(
      () => validateProjectHistoryKnowledgeProjection(laundered),
      (error) => error instanceof ProjectHistoryKnowledgeProjectionError
        && error.code.startsWith("rag_metadata_index_")
        && error.code.endsWith("_mismatch"),
    );
  }
});

test("persisted validator rejects extra index aliases and source-attestation substitution", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  const extras = [
    ["accepted_history", true],
    ["canon_entry", true],
    ["feature_active", true],
    ["owner_approved", true],
    ["record_text", "SOURCE BODY MUST NOT SURVIVE"],
  ];
  for (const [key, value] of extras) {
    const laundered = clone(projection);
    laundered.rag_metadata_index[key] = value;
    laundered.rag_metadata_index.validation = validateRagMetadataIndex(laundered.rag_metadata_index);
    assert.equal(laundered.rag_metadata_index.validation.status, "pass");
    refreshProjectionDigest(laundered);
    assert.throws(
      () => validateProjectHistoryKnowledgeProjection(laundered),
      (error) => error.code === "rag_metadata_index_derivation_mismatch",
    );
  }

  const substituted = clone(projection);
  const foreignAttestation = sha256Canonical({ source: "foreign" });
  substituted.input_binding.source_attestation_digest = foreignAttestation;
  substituted.rag_manifest.source_refs.source_attestation_digest = foreignAttestation;
  refreshProjectionDigest(substituted);
  assert.throws(
    () => validateProjectHistoryKnowledgeProjection(substituted),
    (error) => error.code === "projection_id_mismatch",
  );
});

test("RAG rebuild rejects live, authoritative, wrong-origin, and foreign manifests", async () => {
  const projection = await buildProjectHistoryKnowledgeProjection(makeGeneration(), {
    knowledgeScope: "common",
    originProjectCode: ORIGIN_PROJECT_CODE,
  });
  assert.equal(validateProjectHistoryKnowledgeRagManifest(projection.rag_manifest), projection.rag_manifest);
  const mutations = [
    (manifest) => { manifest.feature_state = "on"; },
    (manifest) => { manifest.authority.owner_approval = true; },
    (manifest) => { manifest.route = "canon_entry"; },
    (manifest) => { manifest.scope.origin_project_code = "P26-999"; },
    (manifest) => { manifest.generator_id = "foreign.generator"; },
  ];
  for (const mutate of mutations) {
    const manifest = clone(projection.rag_manifest);
    mutate(manifest);
    await assert.rejects(
      rebuildProjectHistoryKnowledgeRagIndex(manifest),
      (error) => error instanceof ProjectHistoryKnowledgeProjectionError,
    );
  }
});

test("CLI requires explicit scope and origin and emits canonical stdout without writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-project-history-knowledge-"));
  try {
    const generationPath = join(root, "generation.json");
    await writeFile(generationPath, `${JSON.stringify(makeGeneration())}\n`, "utf8");
    const result = spawnSync(process.execPath, [
      CLI,
      "--generation",
      generationPath,
      "--knowledge-scope",
      "common",
      "--origin-project-code",
      ORIGIN_PROJECT_CODE,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const projection = JSON.parse(result.stdout);
    assert.equal(validateProjectHistoryKnowledgeProjection(projection), projection);
    assert.equal(projection.owner_project_code, "system");
    assert.deepEqual(await readdir(root), ["generation.json"]);

    const missingScope = spawnSync(process.execPath, [
      CLI,
      "--generation",
      generationPath,
      "--origin-project-code",
      ORIGIN_PROJECT_CODE,
    ], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(missingScope.status, 1);
    assert.match(missingScope.stderr, /invalid_arguments/u);

    const missingOrigin = spawnSync(process.execPath, [
      CLI,
      "--generation",
      generationPath,
      "--knowledge-scope",
      "common",
    ], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(missingOrigin.status, 1);
    assert.match(missingOrigin.stderr, /invalid_arguments/u);

    const help = spawnSync(process.execPath, [CLI, "--help"], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /does not write source data, accepted history, RAG state, graph state, or canon/u);

    const persisted = JSON.parse(await readFile(generationPath, "utf8"));
    assert.equal(persisted.accepted_history, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
