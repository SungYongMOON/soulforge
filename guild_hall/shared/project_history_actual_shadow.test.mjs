import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  computeMetadataDigest,
  deriveOccurrenceId,
  sha256Canonical,
} from "./project_history_envelope.mjs";
import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
  ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION,
  CUSTODY_RECEIPT_PROOF_SCHEMA_VERSION,
  SHADOW_CLASSIFICATION_EVIDENCE_SCHEMA_VERSION,
  buildActualFiveLaneShadowGeneration,
  computeCustodyReceiptProofDigest,
  computeShadowClassificationEvidenceDigest,
  computeSourceAttestationDigest,
  replayActualProjectHistoryShadow,
  validateActualFiveLaneShadowGeneration,
  validateActualFiveLaneShadowPilotPacket,
} from "./project_history_actual_shadow.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "project_history_actual_shadow_cli.mjs");
const PACKET_SCHEMA = join(HERE, "project_history_actual_shadow_packet.v1.schema.json");
const GENERATION_SCHEMA = join(HERE, "project_history_actual_shadow_generation.v1.schema.json");

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
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

function makePacket() {
  const generationId = "generation:p26-016:001";
  const projectRef = ref("project", "pilot_project_registry", "project:p26-016");
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
      receipt_digest: sha256Canonical({ lane, immutable_receipt_bytes: suffix }),
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
        content_ref: ref("content", "pilot_content_registry", sha256Canonical({ lane, content: suffix })),
        event_at: `2026-07-19T00:00:${suffix}.000Z`,
        valid_at: `2026-07-19T00:00:${suffix}.000Z`,
        observed_at: `2026-07-19T00:03:${suffix}.000Z`,
        known_at: `2026-07-19T00:02:${suffix}.000Z`,
        recorded_at: `2026-07-19T00:01:${suffix}.000Z`,
        source_digest: sourceDigest,
        custody_receipt_ref: receiptRef,
        custody_receipt_digest: receiptProof.receipt_digest,
        classification_evidence: classificationEvidence,
      },
      custody_receipt_proof: receiptProof,
    };
  });
  return {
    schema_version: ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: generationId,
    project_ref: projectRef,
    window_start: "2026-07-19T00:00:00.000Z",
    window_end: "2026-07-20T00:00:00.000Z",
    lanes,
  };
}

test("actual pilot packet builds the exact self-contained feature-OFF generation", () => {
  const packet = makePacket();
  assert.equal(validateActualFiveLaneShadowPilotPacket(packet), packet);
  const generation = buildActualFiveLaneShadowGeneration(packet);

  assert.deepEqual(Object.keys(generation), [
    "schema_version",
    "generation_id",
    "project_ref",
    "classification_state",
    "envelopes",
    "coverage_receipts",
    "ordered_event_digest",
    "source_attestation_digest",
    "raw_payload_copied",
    "accepted_history",
  ]);
  assert.equal(generation.schema_version, ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION);
  assert.equal(generation.classification_state, "shadow");
  assert.equal(generation.accepted_history, false);
  assert.equal(generation.raw_payload_copied, false);
  assert.equal(generation.envelopes.length, 5);
  assert.equal(generation.coverage_receipts.length, 5);
  assert.equal(generation.source_attestation_digest, computeSourceAttestationDigest(packet));
  assert.equal(validateActualFiveLaneShadowGeneration(generation), generation);

  assert.deepEqual(
    generation.envelopes.map((envelope) => envelope.native_occurrence_ref.entity_type).sort(),
    Object.values(ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE).sort(),
  );
  for (const envelope of generation.envelopes) {
    assert.equal(envelope.classification_before.state, "unclassified");
    assert.equal(envelope.classification_after.state, "classified");
    assert.deepEqual(envelope.project_ref, packet.project_ref);
    assert.equal(envelope.raw_payload_copied, false);
  }
  for (const receipt of generation.coverage_receipts) {
    assert.equal(receipt.state, "complete_with_events");
    assert.equal(receipt.event_count, 1);
    assert.equal(receipt.raw_payload_copied, false);
  }
});

test("lane input order does not change generation or source attestation digest", () => {
  const packet = makePacket();
  const reversed = clone(packet);
  reversed.lanes.reverse();
  assert.equal(
    canonicalJson(buildActualFiveLaneShadowGeneration(reversed)),
    canonicalJson(buildActualFiveLaneShadowGeneration(packet)),
  );
  assert.equal(computeSourceAttestationDigest(reversed), computeSourceAttestationDigest(packet));
});

test("identical replay is a no-op and immutable event conflicts fail closed", () => {
  const generation = buildActualFiveLaneShadowGeneration(makePacket());
  const replay = replayActualProjectHistoryShadow(generation.envelopes, clone(generation.envelopes));
  assert.equal(replay.added_count, 0);
  assert.equal(replay.replayed_count, 5);
  assert.equal(replay.ordered_event_digest, generation.ordered_event_digest);

  const conflict = clone(generation.envelopes[0]);
  conflict.event_at = "2026-07-19T00:05:01.000Z";
  conflict.metadata_digest = computeMetadataDigest(conflict);
  assertCode(
    () => replayActualProjectHistoryShadow(generation.envelopes, [conflict]),
    "event_ref_conflict",
  );
});

test("one native occurrence cannot be counted across two lanes", () => {
  const generation = buildActualFiveLaneShadowGeneration(makePacket());
  const mail = generation.envelopes.find((envelope) => envelope.lane === "mail");
  const voice = clone(generation.envelopes.find((envelope) => envelope.lane === "voice"));
  voice.native_occurrence_ref = clone(mail.native_occurrence_ref);
  voice.occurrence_id = deriveOccurrenceId(voice.lane, voice.native_occurrence_ref);
  voice.metadata_digest = computeMetadataDigest(voice);
  assertCode(
    () => replayActualProjectHistoryShadow([mail], [voice]),
    "cross_lane_occurrence_conflict",
  );
});

test("receipt proof, receipt binding, and source digest mismatches fail closed", () => {
  const badProof = makePacket();
  badProof.lanes[0].custody_receipt_proof.source_size += 1;
  assertCode(() => validateActualFiveLaneShadowPilotPacket(badProof), "proof_digest_mismatch");

  const badReceiptBinding = makePacket();
  badReceiptBinding.lanes[0].semantic_occurrence.custody_receipt_digest = sha256Canonical({ wrong: "receipt" });
  assertCode(() => validateActualFiveLaneShadowPilotPacket(badReceiptBinding), "custody_receipt_digest_mismatch");

  const badSource = makePacket();
  badSource.lanes[0].semantic_occurrence.source_digest = sha256Canonical({ wrong: "source" });
  assertCode(() => validateActualFiveLaneShadowPilotPacket(badSource), "source_digest_mismatch");
});

test("classification evidence must be digest-bound to one project and generation", () => {
  const badDigest = makePacket();
  badDigest.lanes[0].semantic_occurrence.classification_evidence.shadow_only = false;
  assertCode(() => validateActualFiveLaneShadowPilotPacket(badDigest), "shadow_evidence_required");

  const mixedProject = makePacket();
  const evidence = mixedProject.lanes[0].semantic_occurrence.classification_evidence;
  evidence.project_ref = ref("project", "pilot_project_registry", "project:p26-999");
  evidence.classification_after.project_ref = evidence.project_ref;
  evidence.evidence_digest = computeShadowClassificationEvidenceDigest(evidence);
  assertCode(() => validateActualFiveLaneShadowPilotPacket(mixedProject), "project_mismatch");

  const mixedGeneration = makePacket();
  const generationEvidence = mixedGeneration.lanes[0].semantic_occurrence.classification_evidence;
  generationEvidence.generation_id = "generation:p26-016:002";
  generationEvidence.evidence_digest = computeShadowClassificationEvidenceDigest(generationEvidence);
  assertCode(() => validateActualFiveLaneShadowPilotPacket(mixedGeneration), "generation_mismatch");
});

test("raw, path, URI, body, transcript, and payload fields are forbidden recursively", () => {
  for (const field of ["raw", "source_path", "source_uri", "mail_body", "voice_transcript", "provider_payload"]) {
    const packet = makePacket();
    packet.lanes[0].semantic_occurrence.classification_evidence[field] = "forbidden";
    assertCode(() => validateActualFiveLaneShadowPilotPacket(packet), "forbidden_field");
  }
});

test("the packet requires all five lanes, exact custody aliases, and feature OFF", () => {
  const missing = makePacket();
  missing.lanes.pop();
  assertCode(() => validateActualFiveLaneShadowPilotPacket(missing), "lane_count_invalid");

  const duplicate = makePacket();
  duplicate.lanes[4] = clone(duplicate.lanes[0]);
  assertCode(() => validateActualFiveLaneShadowPilotPacket(duplicate), "duplicate_lane");

  const wrongAlias = makePacket();
  wrongAlias.lanes.find((entry) => entry.lane === "file").custody_lane = "file";
  assertCode(() => validateActualFiveLaneShadowPilotPacket(wrongAlias), "custody_lane_mismatch");

  const wrongNativeType = makePacket();
  const mailSemantic = wrongNativeType.lanes.find((entry) => entry.lane === "mail").semantic_occurrence;
  mailSemantic.native_occurrence_ref.entity_type = "voice_recording";
  mailSemantic.classification_evidence.native_occurrence_ref.entity_type = "voice_recording";
  mailSemantic.classification_evidence.evidence_digest = computeShadowClassificationEvidenceDigest(
    mailSemantic.classification_evidence,
  );
  assertCode(
    () => validateActualFiveLaneShadowPilotPacket(wrongNativeType),
    "native_occurrence_type_mismatch",
  );

  const enabled = makePacket();
  enabled.feature_state = "on";
  assertCode(() => validateActualFiveLaneShadowPilotPacket(enabled), "feature_must_be_off");
});

test("strict draft-2020 schemas accept the packet and generated handoff", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const packetSchema = JSON.parse(await readFile(PACKET_SCHEMA, "utf8"));
  const generationSchema = JSON.parse(await readFile(GENERATION_SCHEMA, "utf8"));
  const validatePacketSchema = ajv.compile(packetSchema);
  const validateGenerationSchema = ajv.compile(generationSchema);
  const packet = makePacket();
  const generation = buildActualFiveLaneShadowGeneration(packet);
  assert.equal(validatePacketSchema(packet), true, JSON.stringify(validatePacketSchema.errors));
  assert.equal(validateGenerationSchema(generation), true, JSON.stringify(validateGenerationSchema.errors));

  const forbidden = clone(packet);
  forbidden.lanes[0].semantic_occurrence.mail_body = "forbidden";
  assert.equal(validatePacketSchema(forbidden), false);
  const wrongNativeType = clone(packet);
  wrongNativeType.lanes[0].semantic_occurrence.native_occurrence_ref.entity_type = "voice_recording";
  assert.equal(validatePacketSchema(wrongNativeType), false);
  const promoted = clone(generation);
  promoted.accepted_history = true;
  assert.equal(validateGenerationSchema(promoted), false);
});

test("CLI reads one private metadata packet and emits canonical stdout without output writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-actual-shadow-"));
  try {
    const packetPath = join(root, "pilot.json");
    await writeFile(packetPath, `${JSON.stringify(makePacket())}\n`, "utf8");
    const result = spawnSync(process.execPath, [CLI, "--packet", packetPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    const generation = JSON.parse(result.stdout);
    assert.equal(validateActualFiveLaneShadowGeneration(generation), generation);
    assert.deepEqual(await readdir(root), ["pilot.json"]);

    const help = spawnSync(process.execPath, [CLI, "--help"], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /does not write ERP, official history/u);

    const missingPath = join(root, "private-packet-location.json");
    const missing = spawnSync(process.execPath, [CLI, "--packet", missingPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /packet_read_failed/u);
    assert.doesNotMatch(missing.stderr, /private-packet-location/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
