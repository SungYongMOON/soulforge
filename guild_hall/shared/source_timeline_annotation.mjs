import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

export const sourceTimelineAnnotationSchemaVersion = "soulforge.source_timeline_annotation.v1";

const SCHEMA = JSON.parse(readFileSync(
  new URL("./source_timeline_annotation.v1.schema.json", import.meta.url),
  "utf8",
));
const EXPLICIT_ZONE_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const KST_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+09:00$/u;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const validateSchema = new Ajv2020({
  allErrors: true,
  strict: true,
  formats: {
    "date-time": {
      type: "string",
      validate(value) {
        return KST_DATE_TIME_PATTERN.test(value)
          && Number.isFinite(Date.parse(value));
      },
    },
  },
}).compile(SCHEMA);
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const SECRET_PATTERN = /(?:password|passwd|secret|access[_ -]?token|bearer|cookie|authorization|credential|(?:xox[abprs]|xapp)-|sk-(?:proj-)?)/iu;

export class SourceTimelineAnnotationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "SourceTimelineAnnotationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SourceTimelineAnnotationError(code, message);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeRef(value, field) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)) {
    fail("safe_ref_required", `${field} must be an opaque safe reference`);
  }
  if (SECRET_PATTERN.test(value)) {
    fail("secret_like_ref_rejected", `${field} resembles secret material`);
  }
  return value;
}

function optionalSafeRef(value, field) {
  return value === null || value === undefined ? null : safeRef(value, field);
}

function safeRefArray(values, field) {
  return [...new Set((values ?? []).map((value, index) => safeRef(value, `${field}[${index}]`)))].sort();
}

function digestValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("label_value_required", `${field} cannot be empty`);
  if (SECRET_PATTERN.test(normalized)) fail("secret_like_label_rejected", `${field} resembles secret material`);
  return sha256(normalized.normalize("NFKC").toLocaleLowerCase("ko"));
}

export function toKstDateTime(value, field = "date_time") {
  if (typeof value !== "string" || !EXPLICIT_ZONE_DATE_TIME_PATTERN.test(value)) {
    fail("date_time_required", `${field} must include an explicit UTC or numeric offset`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("date_time_required", `${field} must be a valid date-time`);
  return `${new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, -1)}+09:00`;
}

function normalizedOffset(value, field) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail("offset_invalid", `${field} must be null or a non-negative integer`);
  return value;
}

export function createSourceTimelineAnnotation(input) {
  const relativeStartMs = normalizedOffset(input.relative_start_ms, "relative_start_ms");
  const relativeEndMs = normalizedOffset(input.relative_end_ms, "relative_end_ms");
  if ((relativeStartMs === null) !== (relativeEndMs === null)) {
    fail("offset_pair_required", "relative offsets must both be null or both be present");
  }
  if (relativeStartMs !== null && relativeEndMs < relativeStartMs) {
    fail("offset_order_invalid", "relative_end_ms precedes relative_start_ms");
  }
  const sourceLane = input.source_lane;
  const itemId = safeRef(input.item_id, "item_id");
  const sourceRevisionId = safeRef(input.source_revision_id, "source_revision_id");
  const sourceUnitRef = safeRef(input.source_unit_ref, "source_unit_ref");
  const sourceSpanRef = safeRef(input.source_span_ref, "source_span_ref");
  const canonicalRef = optionalSafeRef(input.canonical_ref, "canonical_ref");
  const projectRef = optionalSafeRef(input.project_ref, "project_ref");
  const projectBasisRefs = safeRefArray(input.project_basis_refs, "project_basis_refs");
  const speakerRef = optionalSafeRef(input.speaker_ref, "speaker_ref");
  const actorRefs = safeRefArray(input.actor_refs, "actor_refs");
  const producerRef = safeRef(input.producer_ref, "producer_ref");
  const policyRef = safeRef(input.policy_ref, "policy_ref");
  const supersedesRevisionId = optionalSafeRef(
    input.supersedes_revision_id,
    "supersedes_revision_id",
  );
  const labelValueSha256 = input.label_value_sha256 ?? digestValue(input.label_value, "label_value");
  const lineageIdentity = {
    source_lane: sourceLane,
    item_id: itemId,
    source_unit_ref: sourceUnitRef,
    source_span_ref: sourceSpanRef,
  };
  const lineageDigest = sha256(stableStringify(lineageIdentity));
  const occurrenceId = `occ_${lineageDigest.slice(0, 24)}`;
  const lineageId = `tal_${lineageDigest.slice(0, 24)}`;
  const revisionIdentity = {
    ...lineageIdentity,
    source_sequence: input.source_sequence,
    relative_start_ms: relativeStartMs,
    relative_end_ms: relativeEndMs,
    label_kind: input.label_kind,
    source_revision_id: sourceRevisionId,
    body_sha256: input.body_sha256,
    occurred_at: toKstDateTime(input.occurred_at, "occurred_at"),
    time_precision: input.time_precision,
    label_value_sha256: labelValueSha256,
    canonical_ref: canonicalRef,
    label_state: input.label_state ?? "candidate",
    project_ref: projectRef,
    project_resolution_state: input.project_resolution_state ?? "unassigned",
    project_basis_refs: projectBasisRefs,
    speaker_ref: speakerRef,
    actor_refs: actorRefs,
    producer_kind: input.producer_kind,
    producer_ref: producerRef,
    policy_ref: policyRef,
    confidence_score: input.confidence_score,
    confidence_band: input.confidence_band,
    acoustic_score: input.acoustic_score ?? null,
    context_score: input.context_score ?? null,
    supersedes_revision_id: supersedesRevisionId,
  };
  const revisionDigest = sha256(stableStringify(revisionIdentity));
  const revisionId = `tar_${revisionDigest.slice(0, 24)}`;
  const annotation = {
    schema_version: sourceTimelineAnnotationSchemaVersion,
    annotation_id: `taa_${revisionDigest.slice(0, 24)}`,
    lineage_id: lineageId,
    revision_id: revisionId,
    source: {
      lane: sourceLane,
      item_id: itemId,
      source_revision_id: sourceRevisionId,
      body_sha256: input.body_sha256,
    },
    occurrence: {
      occurrence_id: occurrenceId,
      occurred_at: revisionIdentity.occurred_at,
      time_precision: input.time_precision,
      relative_start_ms: relativeStartMs,
      relative_end_ms: relativeEndMs,
      source_sequence: input.source_sequence,
    },
    label: {
      kind: input.label_kind,
      value_sha256: labelValueSha256,
      canonical_ref: canonicalRef,
      state: input.label_state ?? "candidate",
    },
    project: {
      project_ref: projectRef,
      resolution_state: input.project_resolution_state ?? "unassigned",
      basis_refs: projectBasisRefs,
    },
    actors: {
      speaker_ref: speakerRef,
      actor_refs: actorRefs,
    },
    evidence: {
      source_unit_ref: sourceUnitRef,
      source_span_ref: sourceSpanRef,
      supersedes_revision_id: supersedesRevisionId,
    },
    producer: {
      kind: input.producer_kind,
      producer_ref: producerRef,
      policy_ref: policyRef,
    },
    confidence: {
      score: input.confidence_score,
      band: input.confidence_band,
      acoustic_score: input.acoustic_score ?? null,
      context_score: input.context_score ?? null,
    },
    boundaries: {
      raw_body_copied: false,
      official_task_mutated: false,
      official_project_assignment_mutated: false,
      secret_material_present: false,
    },
  };
  const validation = validateSourceTimelineAnnotation(annotation);
  if (!validation.ok) fail("annotation_invalid", validation.errors.join("; "));
  return annotation;
}

export function createSourceArrivalAnnotation(input) {
  return createSourceTimelineAnnotation({
    source_lane: input.source_lane,
    item_id: input.item_id,
    source_revision_id: input.source_revision_id,
    body_sha256: input.body_sha256,
    source_unit_ref: input.source_unit_ref ?? input.item_id,
    source_span_ref: input.source_span_ref ?? `arrival:${input.source_revision_id}`,
    source_sequence: input.source_sequence ?? 0,
    occurred_at: input.occurred_at,
    time_precision: "event",
    relative_start_ms: null,
    relative_end_ms: null,
    label_kind: "source_arrival",
    label_value: input.source_lane,
    canonical_ref: null,
    project_ref: input.project_ref ?? null,
    project_resolution_state: input.project_ref
      ? (input.project_resolution_state ?? "candidate")
      : "unassigned",
    project_basis_refs: input.project_basis_refs ?? [],
    speaker_ref: null,
    actor_refs: input.actor_refs ?? [],
    producer_kind: "deterministic",
    producer_ref: input.producer_ref ?? "source_arrival_adapter_v1",
    policy_ref: "policy:source_timeline_v1",
    confidence_score: 1,
    confidence_band: "high",
    acoustic_score: null,
    context_score: null,
  });
}

function expectedAnnotationIds(annotation) {
  const lineageIdentity = {
    source_lane: annotation.source.lane,
    item_id: annotation.source.item_id,
    source_unit_ref: annotation.evidence.source_unit_ref,
    source_span_ref: annotation.evidence.source_span_ref,
  };
  const lineageDigest = sha256(stableStringify(lineageIdentity));
  const revisionIdentity = {
    ...lineageIdentity,
    source_sequence: annotation.occurrence.source_sequence,
    relative_start_ms: annotation.occurrence.relative_start_ms,
    relative_end_ms: annotation.occurrence.relative_end_ms,
    label_kind: annotation.label.kind,
    source_revision_id: annotation.source.source_revision_id,
    body_sha256: annotation.source.body_sha256,
    occurred_at: annotation.occurrence.occurred_at,
    time_precision: annotation.occurrence.time_precision,
    label_value_sha256: annotation.label.value_sha256,
    canonical_ref: annotation.label.canonical_ref,
    label_state: annotation.label.state,
    project_ref: annotation.project.project_ref,
    project_resolution_state: annotation.project.resolution_state,
    project_basis_refs: annotation.project.basis_refs,
    speaker_ref: annotation.actors.speaker_ref,
    actor_refs: annotation.actors.actor_refs,
    producer_kind: annotation.producer.kind,
    producer_ref: annotation.producer.producer_ref,
    policy_ref: annotation.producer.policy_ref,
    confidence_score: annotation.confidence.score,
    confidence_band: annotation.confidence.band,
    acoustic_score: annotation.confidence.acoustic_score,
    context_score: annotation.confidence.context_score,
    supersedes_revision_id: annotation.evidence.supersedes_revision_id,
  };
  const revisionDigest = sha256(stableStringify(revisionIdentity));
  return {
    annotation_id: `taa_${revisionDigest.slice(0, 24)}`,
    lineage_id: `tal_${lineageDigest.slice(0, 24)}`,
    occurrence_id: `occ_${lineageDigest.slice(0, 24)}`,
    revision_id: `tar_${revisionDigest.slice(0, 24)}`,
  };
}

export function validateSourceTimelineAnnotation(annotation) {
  const ok = validateSchema(annotation);
  const errors = ok
    ? []
    : (validateSchema.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`);
  if (annotation?.occurrence?.relative_start_ms !== null
    && annotation?.occurrence?.relative_end_ms < annotation?.occurrence?.relative_start_ms) {
    errors.push("/occurrence relative_end_ms must not precede relative_start_ms");
  }
  if (annotation?.label?.state === "superseded"
    && annotation?.evidence?.supersedes_revision_id === null) {
    errors.push("/evidence superseded labels require supersedes_revision_id");
  }
  if (errors.length === 0) {
    for (const [field, value] of [
      ["source.item_id", annotation.source.item_id],
      ["source.source_revision_id", annotation.source.source_revision_id],
      ["label.canonical_ref", annotation.label.canonical_ref],
      ["project.project_ref", annotation.project.project_ref],
      ["actors.speaker_ref", annotation.actors.speaker_ref],
      ["producer.producer_ref", annotation.producer.producer_ref],
      ["producer.policy_ref", annotation.producer.policy_ref],
      ["evidence.source_unit_ref", annotation.evidence.source_unit_ref],
      ["evidence.source_span_ref", annotation.evidence.source_span_ref],
      ["evidence.supersedes_revision_id", annotation.evidence.supersedes_revision_id],
    ]) {
      if (value !== null && SECRET_PATTERN.test(value)) errors.push(`/${field} secret-like reference forbidden`);
    }
    for (const [field, values] of [
      ["project.basis_refs", annotation.project.basis_refs],
      ["actors.actor_refs", annotation.actors.actor_refs],
    ]) {
      values.forEach((value) => {
        if (SECRET_PATTERN.test(value)) errors.push(`/${field} secret-like reference forbidden`);
      });
    }
  }
  if (errors.length === 0) {
    const expected = expectedAnnotationIds(annotation);
    if (annotation.annotation_id !== expected.annotation_id) errors.push("/annotation_id identity mismatch");
    if (annotation.lineage_id !== expected.lineage_id) errors.push("/lineage_id identity mismatch");
    if (annotation.revision_id !== expected.revision_id) errors.push("/revision_id identity mismatch");
    if (annotation.occurrence.occurrence_id !== expected.occurrence_id) {
      errors.push("/occurrence/occurrence_id identity mismatch");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function reduceSourceTimelineAnnotations(annotations) {
  if (!Array.isArray(annotations)) fail("annotation_array_required", "annotations must be an array");
  const revisions = new Map();
  const lineageMembers = new Map();
  for (const [index, annotation] of annotations.entries()) {
    const validation = validateSourceTimelineAnnotation(annotation);
    if (!validation.ok) fail("annotation_invalid", `index ${index}: ${validation.errors.join("; ")}`);
    const retained = revisions.get(annotation.revision_id);
    const digest = sha256(stableStringify(annotation));
    if (retained && retained.digest !== digest) {
      fail("revision_collision", `revision ${annotation.revision_id} has conflicting content`);
    }
    if (retained) continue;
    revisions.set(annotation.revision_id, { annotation, digest });
    const members = lineageMembers.get(annotation.lineage_id) ?? [];
    members.push(annotation);
    lineageMembers.set(annotation.lineage_id, members);
  }
  for (const [lineageId, members] of lineageMembers) {
    const roots = [];
    const childByPrior = new Map();
    for (const annotation of members) {
      const prior = annotation.evidence.supersedes_revision_id;
      if (prior === null) {
        roots.push(annotation.revision_id);
        continue;
      }
      const priorEntry = revisions.get(prior);
      if (!priorEntry) fail("supersedes_missing", `revision ${annotation.revision_id} supersedes unknown ${prior}`);
      if (priorEntry.annotation.lineage_id !== lineageId) {
        fail("cross_lineage_supersession", "supersession must remain inside one lineage");
      }
      if (childByPrior.has(prior)) {
        fail("supersession_branch", `revision ${prior} has more than one successor`);
      }
      childByPrior.set(prior, annotation.revision_id);
    }
    if (roots.length !== 1) {
      fail("lineage_root_invalid", `lineage ${lineageId} must contain exactly one root revision`);
    }
    let visited = 0;
    let cursor = roots[0];
    const seen = new Set();
    while (cursor !== undefined) {
      if (seen.has(cursor)) fail("supersession_cycle", `lineage ${lineageId} contains a cycle`);
      seen.add(cursor);
      visited += 1;
      cursor = childByPrior.get(cursor);
    }
    if (visited !== members.length) {
      fail("lineage_disconnected", `lineage ${lineageId} is not one append-only chain`);
    }
  }
  return {
    unique_revision_count: revisions.size,
    lineage_count: lineageMembers.size,
    annotations: [...revisions.values()]
      .map((entry) => entry.annotation)
      .sort((left, right) => left.revision_id.localeCompare(right.revision_id)),
  };
}

export async function writeSourceTimelineJsonl({ target_path: targetPath, annotations }) {
  if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) {
    fail("absolute_target_required", "target_path must be absolute");
  }
  const reduced = reduceSourceTimelineAnnotations(annotations);
  const content = reduced.annotations.map((annotation) => JSON.stringify(annotation)).join("\n");
  const finalContent = content ? `${content}\n` : "";
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    const existing = await fs.readFile(targetPath, "utf8");
    if (existing !== finalContent) fail("deterministic_output_conflict", "existing timeline output differs");
    return { duplicate: true, count: reduced.unique_revision_count };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.writeFile(temporaryPath, finalContent, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, targetPath);
  return { duplicate: false, count: reduced.unique_revision_count };
}
