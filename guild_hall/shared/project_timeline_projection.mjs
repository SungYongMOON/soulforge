import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";

import {
  canonicalJson,
  sha256Canonical,
} from "./project_history_envelope.mjs";
import {
  reduceSourceTimelineAnnotations,
  validateSourceTimelineAnnotation,
} from "./source_timeline_annotation.mjs";

export const SCOPE_TIMELINE_BINDING_SCHEMA_VERSION =
  "soulforge.scope_timeline_binding.v1";
export const PROJECT_TIMELINE_PROJECTION_SCHEMA_VERSION =
  "soulforge.project_timeline_projection.v1";

const BINDING_SCHEMA = JSON.parse(readFileSync(
  new URL("./scope_timeline_binding.v1.schema.json", import.meta.url),
  "utf8",
));
const PROJECTION_SCHEMA = JSON.parse(readFileSync(
  new URL("./project_timeline_projection.v1.schema.json", import.meta.url),
  "utf8",
));
const UTC_MILLISECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const KST_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+09:00$/u;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const SECRET_PATTERN =
  /(?:password|passwd|secret|access[_ -]?token|bearer|cookie|authorization|credential|(?:xox[abprs]|xapp)-|sk-(?:proj-)?)/iu;
const SOURCE_LANE_RANK = Object.freeze({
  mail: 0,
  slack: 1,
  voice: 2,
  structured_pc_work: 3,
  team_files: 4,
  run_logs: 5,
});
const ROUTING_BUCKETS = Object.freeze([
  "candidate",
  "unassigned",
  "common",
  "restricted",
  "conflict",
]);

const ajvOptions = {
  allErrors: true,
  strict: true,
  formats: {
    "date-time": {
      type: "string",
      validate(value) {
        return (UTC_MILLISECONDS_PATTERN.test(value)
            || KST_DATE_TIME_PATTERN.test(value))
          && Number.isFinite(Date.parse(value));
      },
    },
  },
};
const validateBindingSchema = new Ajv2020(ajvOptions).compile(BINDING_SCHEMA);
const validateProjectionSchema = new Ajv2020(ajvOptions).compile(PROJECTION_SCHEMA);

export class ProjectTimelineProjectionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProjectTimelineProjectionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectTimelineProjectionError(code, message);
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
  if (!Array.isArray(values ?? [])) {
    fail("safe_ref_array_required", `${field} must be an array`);
  }
  return [...new Set((values ?? []).map(
    (value, index) => safeRef(value, `${field}[${index}]`),
  ))].sort();
}

function canonicalUtc(value, field) {
  if (typeof value !== "string"
      || !UTC_MILLISECONDS_PATTERN.test(value)
      || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) {
    fail("utc_timestamp_required", `${field} must be canonical UTC milliseconds`);
  }
  return value;
}

function bindingIdentity(binding) {
  return {
    schema_version: binding.schema_version,
    lineage_id: binding.lineage_id,
    annotation_id: binding.annotation_id,
    annotation_revision_id: binding.annotation_revision_id,
    occurrence_id: binding.occurrence_id,
    source_lane: binding.source_lane,
    scope_kind: binding.scope_kind,
    project_ref: binding.project_ref,
    candidate_project_refs: binding.candidate_project_refs,
    resolution_state: binding.resolution_state,
    basis_refs: binding.basis_refs,
    known_at: binding.known_at,
    recorded_at: binding.recorded_at,
    producer: binding.producer,
    supersedes_binding_id: binding.supersedes_binding_id,
    boundaries: binding.boundaries,
  };
}

function digestId(prefix, value) {
  const start = "sha256:".length;
  return `${prefix}_${sha256Canonical(value).slice(start, start + 24)}`;
}

function validateScopeSemantics(binding, errors) {
  const candidateCount = binding.candidate_project_refs.length;
  if (binding.scope_kind === "project") {
    if (binding.project_ref === null) {
      errors.push("/project_ref project scope requires a project_ref");
    }
    if (!["confirmed", "candidate", "exception_review_required"].includes(
      binding.resolution_state,
    )) {
      errors.push("/resolution_state project scope requires confirmed, candidate, or exception_review_required");
    }
    if (candidateCount !== 0) {
      errors.push("/candidate_project_refs project scope uses project_ref, not candidate_project_refs");
    }
  } else if (binding.scope_kind === "conflict") {
    if (binding.project_ref !== null) {
      errors.push("/project_ref conflict scope must not select a project");
    }
    if (binding.resolution_state !== "exception_review_required") {
      errors.push("/resolution_state conflict scope requires exception_review_required");
    }
    if (candidateCount < 2) {
      errors.push("/candidate_project_refs conflict scope requires at least two project candidates");
    }
  } else {
    if (binding.project_ref !== null) {
      errors.push(`/project_ref ${binding.scope_kind} scope must not select a project`);
    }
    if (candidateCount !== 0) {
      errors.push(`/candidate_project_refs ${binding.scope_kind} scope forbids project candidates`);
    }
    const expectedState = binding.scope_kind === "unassigned"
      ? "unassigned"
      : "confirmed";
    if (binding.resolution_state !== expectedState) {
      errors.push(`/resolution_state ${binding.scope_kind} scope requires ${expectedState}`);
    }
  }
  if (Date.parse(binding.recorded_at) < Date.parse(binding.known_at)) {
    errors.push("/recorded_at must not precede known_at");
  }
}

export function createScopeTimelineBinding({
  annotation,
  scope_kind: scopeKind,
  project_ref: projectRef = null,
  candidate_project_refs: candidateProjectRefs = [],
  resolution_state: resolutionState,
  basis_refs: basisRefs = [],
  known_at: knownAt,
  recorded_at: recordedAt,
  producer_kind: producerKind,
  producer_ref: producerRef,
  policy_ref: policyRef,
  supersedes_binding_id: supersedesBindingId = null,
}) {
  const annotationValidation = validateSourceTimelineAnnotation(annotation);
  if (!annotationValidation.ok) {
    fail("annotation_invalid", annotationValidation.errors.join("; "));
  }
  const binding = {
    schema_version: SCOPE_TIMELINE_BINDING_SCHEMA_VERSION,
    binding_id: "",
    lineage_id: annotation.lineage_id,
    annotation_id: annotation.annotation_id,
    annotation_revision_id: annotation.revision_id,
    occurrence_id: annotation.occurrence.occurrence_id,
    source_lane: annotation.source.lane,
    scope_kind: scopeKind,
    project_ref: optionalSafeRef(projectRef, "project_ref"),
    candidate_project_refs: safeRefArray(
      candidateProjectRefs,
      "candidate_project_refs",
    ),
    resolution_state: resolutionState,
    basis_refs: safeRefArray(basisRefs, "basis_refs"),
    known_at: canonicalUtc(knownAt, "known_at"),
    recorded_at: canonicalUtc(recordedAt, "recorded_at"),
    producer: {
      kind: producerKind,
      producer_ref: safeRef(producerRef, "producer_ref"),
      policy_ref: safeRef(policyRef, "policy_ref"),
    },
    supersedes_binding_id: optionalSafeRef(
      supersedesBindingId,
      "supersedes_binding_id",
    ),
    boundaries: {
      raw_body_copied: false,
      official_task_mutated: false,
      official_project_assignment_mutated: false,
      secret_material_present: false,
    },
  };
  binding.binding_id = digestId("stb", bindingIdentity(binding));
  const validation = validateScopeTimelineBinding(binding);
  if (!validation.ok) fail("binding_invalid", validation.errors.join("; "));
  return binding;
}

export function validateScopeTimelineBinding(binding) {
  const ok = validateBindingSchema(binding);
  const errors = ok
    ? []
    : (validateBindingSchema.errors ?? []).map(
      (error) => `${error.instancePath || "/"} ${error.message}`,
    );
  if (errors.length === 0) {
    validateScopeSemantics(binding, errors);
    for (const [field, value] of [
      ["binding_id", binding.binding_id],
      ["lineage_id", binding.lineage_id],
      ["annotation_id", binding.annotation_id],
      ["annotation_revision_id", binding.annotation_revision_id],
      ["occurrence_id", binding.occurrence_id],
      ["project_ref", binding.project_ref],
      ["producer.producer_ref", binding.producer.producer_ref],
      ["producer.policy_ref", binding.producer.policy_ref],
      ["supersedes_binding_id", binding.supersedes_binding_id],
    ]) {
      if (value !== null && SECRET_PATTERN.test(value)) {
        errors.push(`/${field} secret-like reference forbidden`);
      }
    }
    for (const [field, values] of [
      ["candidate_project_refs", binding.candidate_project_refs],
      ["basis_refs", binding.basis_refs],
    ]) {
      for (const value of values) {
        if (SECRET_PATTERN.test(value)) {
          errors.push(`/${field} secret-like reference forbidden`);
        }
      }
    }
  }
  if (errors.length === 0) {
    const expectedId = digestId("stb", bindingIdentity(binding));
    if (binding.binding_id !== expectedId) {
      errors.push("/binding_id identity mismatch");
    }
  }
  return { ok: errors.length === 0, errors };
}

function reduceScopeTimelineBindings(bindings) {
  if (!Array.isArray(bindings)) {
    fail("binding_array_required", "bindings must be an array");
  }
  const byId = new Map();
  const byLineage = new Map();
  for (const [index, binding] of bindings.entries()) {
    const validation = validateScopeTimelineBinding(binding);
    if (!validation.ok) {
      fail("binding_invalid", `index ${index}: ${validation.errors.join("; ")}`);
    }
    const existing = byId.get(binding.binding_id);
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(binding)) {
        fail("binding_collision", `binding ${binding.binding_id} has conflicting content`);
      }
      continue;
    }
    byId.set(binding.binding_id, binding);
    const members = byLineage.get(binding.lineage_id) ?? [];
    members.push(binding);
    byLineage.set(binding.lineage_id, members);
  }

  const currentByLineage = new Map();
  for (const [lineageId, members] of byLineage) {
    const roots = [];
    const childByPrior = new Map();
    for (const binding of members) {
      const prior = binding.supersedes_binding_id;
      if (prior === null) {
        roots.push(binding.binding_id);
        continue;
      }
      const priorBinding = byId.get(prior);
      if (priorBinding === undefined) {
        fail("binding_supersedes_missing", `${binding.binding_id} supersedes unknown ${prior}`);
      }
      if (priorBinding.lineage_id !== lineageId) {
        fail("binding_cross_lineage", "binding supersession must stay within one source lineage");
      }
      if (childByPrior.has(prior)) {
        fail("binding_supersession_branch", `${prior} has multiple successors`);
      }
      childByPrior.set(prior, binding.binding_id);
    }
    if (roots.length !== 1) {
      fail("binding_root_invalid", `${lineageId} must have exactly one binding root`);
    }
    const seen = new Set();
    let current = roots[0];
    while (current !== undefined) {
      if (seen.has(current)) fail("binding_cycle", `${lineageId} contains a cycle`);
      seen.add(current);
      const next = childByPrior.get(current);
      if (next === undefined) {
        currentByLineage.set(lineageId, byId.get(current));
        break;
      }
      current = next;
    }
    if (seen.size !== members.length) {
      fail("binding_disconnected", `${lineageId} is not one append-only chain`);
    }
  }
  return {
    bindings: [...byId.values()].sort(
      (left, right) => left.binding_id.localeCompare(right.binding_id),
    ),
    currentByLineage,
  };
}

function currentAnnotations(annotations) {
  const reduced = reduceSourceTimelineAnnotations(annotations);
  const byLineage = new Map();
  const supersededRevisionIds = new Set();
  for (const annotation of reduced.annotations) {
    const members = byLineage.get(annotation.lineage_id) ?? [];
    members.push(annotation);
    byLineage.set(annotation.lineage_id, members);
    if (annotation.evidence.supersedes_revision_id !== null) {
      supersededRevisionIds.add(annotation.evidence.supersedes_revision_id);
    }
  }
  const currentByLineage = new Map();
  const current = [];
  for (const [lineageId, members] of byLineage) {
    const leaves = members.filter(
      (annotation) => !supersededRevisionIds.has(annotation.revision_id),
    );
    if (leaves.length !== 1) {
      fail("annotation_leaf_invalid", `${lineageId} must have exactly one current revision`);
    }
    currentByLineage.set(lineageId, leaves[0]);
    current.push(leaves[0]);
  }
  return {
    currentByLineage,
    current: current.sort(compareAnnotation),
  };
}

function compareAnnotation(left, right) {
  return left.occurrence.occurred_at.localeCompare(right.occurrence.occurred_at)
    || SOURCE_LANE_RANK[left.source.lane] - SOURCE_LANE_RANK[right.source.lane]
    || left.occurrence.source_sequence - right.occurrence.source_sequence
    || left.occurrence.occurrence_id.localeCompare(right.occurrence.occurrence_id)
    || left.revision_id.localeCompare(right.revision_id);
}

function routeBucket(binding) {
  if (binding === null) return "unassigned";
  if (binding.scope_kind === "project") {
    if (binding.resolution_state === "confirmed") return "project_confirmed";
    if (binding.resolution_state === "candidate") return "project_candidate";
    return "conflict";
  }
  return binding.scope_kind;
}

function timelineEntry(annotation, binding) {
  const bucket = routeBucket(binding);
  const projectRef = bucket === "project_confirmed" || bucket === "project_candidate"
    ? binding.project_ref
    : null;
  const resolutionState = binding?.resolution_state ?? "unassigned";
  const identity = {
    annotation_revision_id: annotation.revision_id,
    binding_id: binding?.binding_id ?? null,
    route_bucket: bucket,
  };
  return {
    entry_id: digestId("pte", identity),
    annotation_id: annotation.annotation_id,
    annotation_revision_id: annotation.revision_id,
    binding_id: binding?.binding_id ?? null,
    binding_known_at: binding?.known_at ?? null,
    binding_recorded_at: binding?.recorded_at ?? null,
    route_bucket: bucket,
    occurred_at: annotation.occurrence.occurred_at,
    source_lane: annotation.source.lane,
    source_item_ref: annotation.source.item_id,
    source_revision_ref: annotation.source.source_revision_id,
    source_body_sha256: annotation.source.body_sha256,
    source_span_ref: annotation.evidence.source_span_ref,
    occurrence_id: annotation.occurrence.occurrence_id,
    time_precision: annotation.occurrence.time_precision,
    relative_start_ms: annotation.occurrence.relative_start_ms,
    relative_end_ms: annotation.occurrence.relative_end_ms,
    source_sequence: annotation.occurrence.source_sequence,
    label_kind: annotation.label.kind,
    label_state: annotation.label.state,
    canonical_ref: annotation.label.canonical_ref,
    project_ref: projectRef,
    project_resolution_state: resolutionState,
    project_basis_refs: binding?.basis_refs ?? [],
    candidate_project_refs: binding?.candidate_project_refs ?? [],
    speaker_ref: annotation.actors.speaker_ref,
    actor_refs: annotation.actors.actor_refs,
    confidence_band: annotation.confidence.band,
    annotation_producer_ref: annotation.producer.producer_ref,
    binding_producer_ref: binding?.producer.producer_ref ?? null,
  };
}

function compareTimelineEntry(left, right) {
  return left.occurred_at.localeCompare(right.occurred_at)
    || SOURCE_LANE_RANK[left.source_lane] - SOURCE_LANE_RANK[right.source_lane]
    || left.source_sequence - right.source_sequence
    || left.occurrence_id.localeCompare(right.occurrence_id)
    || left.annotation_revision_id.localeCompare(right.annotation_revision_id);
}

function systemReceipt(entry) {
  const projection = {
    annotation_revision_id: entry.annotation_revision_id,
    occurrence_id: entry.occurrence_id,
    route_bucket: entry.route_bucket,
    project_ref: entry.project_ref,
    binding_id: entry.binding_id,
  };
  return {
    receipt_id: digestId("ptr", projection),
    annotation_revision_id: entry.annotation_revision_id,
    occurrence_id: entry.occurrence_id,
    occurred_at: entry.occurred_at,
    source_lane: entry.source_lane,
    route_bucket: entry.route_bucket,
    project_ref: entry.project_ref,
    binding_id: entry.binding_id,
  };
}

function projectionWithoutDigest(projection) {
  const result = {};
  for (const [key, value] of Object.entries(projection)) {
    if (key !== "projection_digest") result[key] = value;
  }
  return result;
}

export function buildProjectTimelineProjection({
  annotations,
  bindings,
  generation_id: generationId,
  generated_at: generatedAt,
}) {
  safeRef(generationId, "generation_id");
  canonicalUtc(generatedAt, "generated_at");
  const annotationState = currentAnnotations(annotations);
  const bindingState = reduceScopeTimelineBindings(bindings);

  for (const [lineageId, binding] of bindingState.currentByLineage) {
    const annotation = annotationState.currentByLineage.get(lineageId);
    if (annotation === undefined) {
      fail("orphan_binding", `${binding.binding_id} has no source annotation lineage`);
    }
    if (binding.annotation_revision_id !== annotation.revision_id
        || binding.annotation_id !== annotation.annotation_id
        || binding.occurrence_id !== annotation.occurrence.occurrence_id
        || binding.source_lane !== annotation.source.lane) {
      fail("stale_binding", `${binding.binding_id} does not bind the current annotation revision`);
    }
  }

  const entries = annotationState.current.map((annotation) => timelineEntry(
    annotation,
    bindingState.currentByLineage.get(annotation.lineage_id) ?? null,
  )).sort(compareTimelineEntry);

  const projectMap = new Map();
  const routing = Object.fromEntries(ROUTING_BUCKETS.map((bucket) => [bucket, []]));
  for (const entry of entries) {
    if (entry.route_bucket === "project_confirmed") {
      const projectEntries = projectMap.get(entry.project_ref) ?? [];
      projectEntries.push(entry);
      projectMap.set(entry.project_ref, projectEntries);
    } else {
      const bucket = entry.route_bucket === "project_candidate"
        ? "candidate"
        : entry.route_bucket;
      routing[bucket].push(entry);
    }
  }

  const projectTimelines = [...projectMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([projectRef, projectEntries]) => ({
      project_ref: projectRef,
      entries: projectEntries.sort(compareTimelineEntry),
      ordered_entry_digest: sha256Canonical(projectEntries),
    }));
  for (const bucket of ROUTING_BUCKETS) routing[bucket].sort(compareTimelineEntry);

  const projection = {
    schema_version: PROJECT_TIMELINE_PROJECTION_SCHEMA_VERSION,
    generation_id: generationId,
    generated_at: generatedAt,
    system_receipts: entries.map(systemReceipt),
    project_timelines: projectTimelines,
    routing,
    projection_digest: "",
    boundaries: {
      raw_body_copied: false,
      official_task_mutated: false,
      official_project_assignment_mutated: false,
      source_annotations_mutated: false,
    },
  };
  projection.projection_digest = sha256Canonical(projectionWithoutDigest(projection));
  const validation = validateProjectTimelineProjection(projection);
  if (!validation.ok) fail("projection_invalid", validation.errors.join("; "));
  return projection;
}

export function validateProjectTimelineProjection(projection) {
  const ok = validateProjectionSchema(projection);
  const errors = ok
    ? []
    : (validateProjectionSchema.errors ?? []).map(
      (error) => `${error.instancePath || "/"} ${error.message}`,
    );
  if (errors.length !== 0) return { ok: false, errors };

  const seenEntryIds = new Set();
  const seenAnnotationRevisions = new Set();
  const seenProjectRefs = new Set();
  const allEntries = [];
  for (const project of projection.project_timelines) {
    if (seenProjectRefs.has(project.project_ref)) {
      errors.push(`/project_timelines duplicate project_ref ${project.project_ref}`);
    }
    seenProjectRefs.add(project.project_ref);
    const sortedProjectEntries = [...project.entries].sort(compareTimelineEntry);
    if (canonicalJson(project.entries) !== canonicalJson(sortedProjectEntries)) {
      errors.push(`/project_timelines/${project.project_ref}/entries order mismatch`);
    }
    for (const entry of project.entries) {
      allEntries.push(entry);
      if (entry.route_bucket !== "project_confirmed"
          || entry.project_ref !== project.project_ref) {
        errors.push(`/project_timelines/${project.project_ref} cross-project entry`);
      }
    }
    if (project.ordered_entry_digest !== sha256Canonical(project.entries)) {
      errors.push(`/project_timelines/${project.project_ref}/ordered_entry_digest mismatch`);
    }
  }
  for (const bucket of ROUTING_BUCKETS) {
    const sortedRoutingEntries = [...projection.routing[bucket]].sort(compareTimelineEntry);
    if (canonicalJson(projection.routing[bucket]) !== canonicalJson(sortedRoutingEntries)) {
      errors.push(`/routing/${bucket} order mismatch`);
    }
    for (const entry of projection.routing[bucket]) {
      allEntries.push(entry);
      const expectedBucket = entry.route_bucket === "project_candidate"
        ? "candidate"
        : entry.route_bucket;
      if (expectedBucket !== bucket) {
        errors.push(`/routing/${bucket} contains ${entry.route_bucket}`);
      }
    }
  }
  for (const entry of allEntries) {
    const expectedEntryId = digestId("pte", {
      annotation_revision_id: entry.annotation_revision_id,
      binding_id: entry.binding_id,
      route_bucket: entry.route_bucket,
    });
    if (entry.entry_id !== expectedEntryId) {
      errors.push(`/entries/${entry.entry_id} identity mismatch`);
    }
    if (entry.route_bucket.startsWith("project_")) {
      if (entry.project_ref === null || entry.binding_id === null) {
        errors.push(`/entries/${entry.entry_id} project route requires project_ref and binding_id`);
      }
    } else if (entry.project_ref !== null) {
      errors.push(`/entries/${entry.entry_id} non-project route must not expose project_ref`);
    }
    if (seenEntryIds.has(entry.entry_id)) {
      errors.push(`/entries duplicate entry_id ${entry.entry_id}`);
    }
    seenEntryIds.add(entry.entry_id);
    if (seenAnnotationRevisions.has(entry.annotation_revision_id)) {
      errors.push(`/entries duplicate annotation revision ${entry.annotation_revision_id}`);
    }
    seenAnnotationRevisions.add(entry.annotation_revision_id);
  }

  const globallyOrderedEntries = [...allEntries].sort(compareTimelineEntry);
  if (projection.system_receipts.length !== globallyOrderedEntries.length) {
    errors.push("/system_receipts count does not match projected entries");
  }
  const receiptRevisions = new Set();
  for (const [index, receipt] of projection.system_receipts.entries()) {
    if (receiptRevisions.has(receipt.annotation_revision_id)) {
      errors.push(`/system_receipts duplicate annotation revision ${receipt.annotation_revision_id}`);
    }
    receiptRevisions.add(receipt.annotation_revision_id);
    const expectedReceipt = globallyOrderedEntries[index] === undefined
      ? null
      : systemReceipt(globallyOrderedEntries[index]);
    if (expectedReceipt !== null
        && canonicalJson(receipt) !== canonicalJson(expectedReceipt)) {
      errors.push(`/system_receipts/${index} does not match its projected entry`);
    }
  }
  for (const revisionId of seenAnnotationRevisions) {
    if (!receiptRevisions.has(revisionId)) {
      errors.push(`/system_receipts missing annotation revision ${revisionId}`);
    }
  }
  const expectedDigest = sha256Canonical(projectionWithoutDigest(projection));
  if (projection.projection_digest !== expectedDigest) {
    errors.push("/projection_digest mismatch");
  }
  return { ok: errors.length === 0, errors };
}
