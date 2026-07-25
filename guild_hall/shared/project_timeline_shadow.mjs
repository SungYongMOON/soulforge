import crypto from "node:crypto";

import {
  createSourceArrivalAnnotation,
  validateSourceTimelineAnnotation,
} from "./source_timeline_annotation.mjs";
import {
  buildProjectTimelineProjection,
  createScopeTimelineBinding,
  validateProjectTimelineProjection,
} from "./project_timeline_projection.mjs";

export const PROJECT_TIMELINE_SHADOW_SCHEMA_VERSION =
  "soulforge.project_timeline_shadow.v1";
export const PROJECT_TIMELINE_SHADOW_INPUT_SCHEMA_VERSION =
  "soulforge.project_timeline_shadow_input.v1";

const SOURCE_LANES = Object.freeze([
  "mail",
  "slack",
  "voice",
  "structured_pc_work",
  "team_files",
  "run_logs",
]);
const COVERAGE_STATES = new Set([
  "complete_with_events",
  "complete_no_events",
  "partial",
  "failed",
  "not_collected",
  "not_applicable",
]);
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const SHA256_PATTERN = /^(?:sha256:)?([0-9a-f]{64})$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SECRET_PATTERN =
  /(?:password|passwd|secret|access[_ -]?token|bearer|cookie|authorization|credential|(?:xox[abprs]|xapp)-|sk-(?:proj-)?)/iu;

export class ProjectTimelineShadowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProjectTimelineShadowError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectTimelineShadowError(code, message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
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

function safeRefs(values, field) {
  if (!Array.isArray(values)) fail("array_required", `${field} must be an array`);
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort();
}

function lowercaseSha256(value, field) {
  const match = String(value ?? "").match(SHA256_PATTERN);
  if (!match) fail("sha256_required", `${field} must be a lowercase SHA-256`);
  return match[1];
}

function canonicalUtc(value, field) {
  if (typeof value !== "string" || !UTC_PATTERN.test(value)
      || !Number.isFinite(Date.parse(value))) {
    fail("utc_required", `${field} must be an exact millisecond UTC timestamp`);
  }
  return value;
}

function boolean(value, field) {
  if (typeof value !== "boolean") fail("boolean_required", `${field} must be boolean`);
  return value;
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("non_negative_integer_required", `${field} must be a non-negative integer`);
  }
  return value;
}

function projectBinding(annotation, {
  projectCode,
  basisRefs,
  knownAt,
  generatedAt,
  producerRef,
}) {
  return createScopeTimelineBinding({
    annotation,
    scope_kind: "project",
    project_ref: projectCode,
    candidate_project_refs: [],
    resolution_state: "confirmed",
    basis_refs: basisRefs,
    known_at: knownAt,
    recorded_at: generatedAt,
    producer_kind: "deterministic",
    producer_ref: producerRef,
    policy_ref: "policy:project_timeline_shadow_v1",
  });
}

function mailAnnotation(row, index, projectCode) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    fail("mail_row_invalid", `mail_history.rows[${index}] must be an object`);
  }
  const historyKey = safeRef(row.history_key, `mail_history.rows[${index}].history_key`);
  if (row.project_code !== projectCode) {
    fail("mail_project_mismatch", `mail_history.rows[${index}] belongs to another project`);
  }
  boolean(row.raw_copied, `mail_history.rows[${index}].raw_copied`);
  if (row.raw_copied) return null;
  if (typeof row.occurred_at !== "string" || !row.occurred_at.trim()) {
    fail("mail_time_required", `mail_history.rows[${index}].occurred_at is required`);
  }
  if (typeof row.event_type !== "string" || !row.event_type.trim()) {
    fail("mail_event_type_required", `mail_history.rows[${index}].event_type is required`);
  }
  const metadataContent = {
    history_key: historyKey,
    occurred_at: row.occurred_at,
    project_code: projectCode,
    event_type_sha256: sha256(row.event_type.normalize("NFKC")),
    raw_copied: false,
  };
  const metadataSha256 = sha256(canonicalJson(metadataContent));
  return createSourceArrivalAnnotation({
    source_lane: "mail",
    item_id: `mailhist:${historyKey}`,
    source_revision_id: `mailrow:${metadataSha256.slice(0, 24)}`,
    body_sha256: metadataSha256,
    source_unit_ref: `mailhist:${historyKey}`,
    source_span_ref: `csvrow:${index + 2}`,
    source_sequence: index,
    occurred_at: row.occurred_at,
    project_ref: null,
    project_resolution_state: "unassigned",
    project_basis_refs: [],
    actor_refs: [],
    producer_ref: "project_mail_history_shadow_v1",
  });
}

function explicitEventAnnotation(event, index, projectCode) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    fail("explicit_event_invalid", `explicit_events[${index}] must be an object`);
  }
  if (event.project_code !== projectCode) {
    fail("explicit_event_project_mismatch", `explicit_events[${index}] belongs to another project`);
  }
  if (!["voice", "structured_pc_work", "team_files", "run_logs"].includes(event.source_lane)) {
    fail("explicit_event_lane_invalid", `explicit_events[${index}] uses an unsupported lane`);
  }
  const eventId = safeRef(event.event_id, `explicit_events[${index}].event_id`);
  const contentSha256 = lowercaseSha256(
    event.content_sha256,
    `explicit_events[${index}].content_sha256`,
  );
  return createSourceArrivalAnnotation({
    source_lane: event.source_lane,
    item_id: eventId,
    source_revision_id: `${event.source_lane}evt:${contentSha256.slice(0, 24)}`,
    body_sha256: contentSha256,
    source_unit_ref: eventId,
    source_span_ref: `event:${contentSha256.slice(0, 24)}`,
    source_sequence: nonNegativeInteger(
      event.source_sequence,
      `explicit_events[${index}].source_sequence`,
    ),
    occurred_at: event.occurred_at,
    project_ref: null,
    project_resolution_state: "unassigned",
    project_basis_refs: [],
    actor_refs: [],
    producer_ref: "explicit_project_event_shadow_v1",
  });
}

function normalizeSourceAnnotations(annotations, projectCode) {
  if (!Array.isArray(annotations)) {
    fail("annotation_array_required", "source_annotations must be an array");
  }
  return annotations.map((annotation, index) => {
    const validation = validateSourceTimelineAnnotation(annotation);
    if (!validation.ok) {
      fail("annotation_invalid", `source_annotations[${index}]: ${validation.errors.join("; ")}`);
    }
    if (annotation.source.lane !== "slack") {
      fail(
        "annotation_lane_invalid",
        `source_annotations[${index}] must be a Slack source annotation`,
      );
    }
    if (annotation.project.project_ref !== projectCode
        || annotation.project.resolution_state !== "confirmed") {
      fail(
        "annotation_project_not_confirmed",
        `source_annotations[${index}] lacks the exact confirmed project binding`,
      );
    }
    return annotation;
  });
}

function normalizeCoverage(inputCoverage, acceptedCounts, observedCounts, heldCounts) {
  if (inputCoverage === null || typeof inputCoverage !== "object"
      || Array.isArray(inputCoverage)) {
    fail("coverage_required", "coverage must be an object");
  }
  const coverage = {};
  for (const lane of SOURCE_LANES) {
    const row = inputCoverage[lane];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      fail("coverage_lane_required", `coverage.${lane} must be an object`);
    }
    if (!COVERAGE_STATES.has(row.state)) {
      fail("coverage_state_invalid", `coverage.${lane}.state is invalid`);
    }
    const gapCodes = safeRefs(row.gap_codes ?? [], `coverage.${lane}.gap_codes`);
    const acceptedCount = nonNegativeInteger(
      row.accepted_count,
      `coverage.${lane}.accepted_count`,
    );
    const observedCount = nonNegativeInteger(
      row.observed_count,
      `coverage.${lane}.observed_count`,
    );
    const heldCount = nonNegativeInteger(
      row.held_count,
      `coverage.${lane}.held_count`,
    );
    if (acceptedCount !== (acceptedCounts[lane] ?? 0)) {
      fail("coverage_accepted_count_mismatch", `coverage.${lane}.accepted_count mismatches input`);
    }
    if (observedCount !== (observedCounts[lane] ?? 0)) {
      fail("coverage_observed_count_mismatch", `coverage.${lane}.observed_count mismatches input`);
    }
    if (heldCount !== (heldCounts[lane] ?? 0)) {
      fail("coverage_held_count_mismatch", `coverage.${lane}.held_count mismatches input`);
    }
    if (row.state === "complete_no_events" && acceptedCount !== 0) {
      fail("coverage_state_count_mismatch", `coverage.${lane} has accepted events`);
    }
    if (row.state === "complete_with_events" && acceptedCount === 0) {
      fail("coverage_state_count_mismatch", `coverage.${lane} has no accepted events`);
    }
    if (["not_collected", "not_applicable"].includes(row.state)
        && (observedCount !== 0 || acceptedCount !== 0 || heldCount !== 0)) {
      fail("coverage_state_count_mismatch", `coverage.${lane} must have zero counts`);
    }
    coverage[lane] = {
      state: row.state,
      observed_count: observedCount,
      accepted_count: acceptedCount,
      held_count: heldCount,
      gap_codes: gapCodes,
    };
  }
  const actualKeys = Object.keys(inputCoverage).sort();
  if (canonicalJson(actualKeys) !== canonicalJson([...SOURCE_LANES].sort())) {
    fail("coverage_exact_lanes_required", "coverage must contain exactly the six source lanes");
  }
  return coverage;
}

function shadowWithoutDigest(shadow) {
  const result = {};
  for (const [key, value] of Object.entries(shadow)) {
    if (key !== "shadow_digest") result[key] = value;
  }
  return result;
}

export function buildProjectTimelineShadow(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("input_object_required", "input must be an object");
  }
  if (input.schema_version !== PROJECT_TIMELINE_SHADOW_INPUT_SCHEMA_VERSION) {
    fail("input_schema_invalid", "unexpected input schema_version");
  }
  const projectCode = safeRef(input.project_code, "project_code");
  const generationId = safeRef(input.generation_id, "generation_id");
  const generatedAt = canonicalUtc(input.generated_at, "generated_at");
  if (input.mail_history === null || typeof input.mail_history !== "object"
      || Array.isArray(input.mail_history)
      || !Array.isArray(input.mail_history.rows)) {
    fail("mail_history_required", "mail_history with rows is required");
  }
  const mailSourceRef = safeRef(input.mail_history.source_ref, "mail_history.source_ref");
  const mailSourceSha256 = lowercaseSha256(
    input.mail_history.source_sha256,
    "mail_history.source_sha256",
  );

  const mailAnnotations = [];
  let excludedRawMailRows = 0;
  for (const [index, row] of input.mail_history.rows.entries()) {
    const annotation = mailAnnotation(row, index, projectCode);
    if (annotation === null) excludedRawMailRows += 1;
    else mailAnnotations.push(annotation);
  }
  const sourceAnnotations = normalizeSourceAnnotations(
    input.source_annotations ?? [],
    projectCode,
  );
  const explicitEvents = Array.isArray(input.explicit_events)
    ? input.explicit_events
    : fail("explicit_event_array_required", "explicit_events must be an array");
  const explicitAnnotations = explicitEvents.map(
    (event, index) => explicitEventAnnotation(event, index, projectCode),
  );

  const annotations = [
    ...mailAnnotations,
    ...sourceAnnotations,
    ...explicitAnnotations,
  ];
  const bindings = [];
  for (const annotation of mailAnnotations) {
    bindings.push(projectBinding(annotation, {
      projectCode,
      basisRefs: [mailSourceRef],
      knownAt: generatedAt,
      generatedAt,
      producerRef: "project_mail_history_scope_v1",
    }));
  }
  for (const annotation of sourceAnnotations) {
    bindings.push(projectBinding(annotation, {
      projectCode,
      basisRefs: [...new Set([
        ...annotation.project.basis_refs,
        `annotation:${annotation.annotation_id}`,
      ])].sort(),
      knownAt: generatedAt,
      generatedAt,
      producerRef: "source_annotation_scope_v1",
    }));
  }
  for (const [index, annotation] of explicitAnnotations.entries()) {
    const event = explicitEvents[index];
    bindings.push(projectBinding(annotation, {
      projectCode,
      basisRefs: safeRefs(event.binding_basis_refs, `explicit_events[${index}].binding_basis_refs`),
      knownAt: canonicalUtc(event.known_at, `explicit_events[${index}].known_at`),
      generatedAt,
      producerRef: "explicit_project_event_scope_v1",
    }));
  }

  const acceptedCounts = Object.fromEntries(SOURCE_LANES.map((lane) => [lane, 0]));
  annotations.forEach((annotation) => {
    acceptedCounts[annotation.source.lane] += 1;
  });
  const observedCounts = {
    ...Object.fromEntries(SOURCE_LANES.map((lane) => [lane, 0])),
    mail: input.mail_history.rows.length,
    slack: sourceAnnotations.filter((row) => row.source.lane === "slack").length
      + nonNegativeInteger(input.coverage.slack.held_count, "coverage.slack.held_count"),
    voice: explicitAnnotations.filter((row) => row.source.lane === "voice").length,
  };
  for (const lane of ["structured_pc_work", "team_files", "run_logs"]) {
    observedCounts[lane] = explicitAnnotations.filter(
      (row) => row.source.lane === lane,
    ).length;
  }
  const heldCounts = {
    ...Object.fromEntries(SOURCE_LANES.map((lane) => [lane, 0])),
    mail: excludedRawMailRows,
    slack: nonNegativeInteger(input.coverage.slack.held_count, "coverage.slack.held_count"),
  };
  const coverage = normalizeCoverage(
    input.coverage,
    acceptedCounts,
    observedCounts,
    heldCounts,
  );

  const projection = buildProjectTimelineProjection({
    annotations,
    bindings,
    generation_id: generationId,
    generated_at: generatedAt,
  });
  const shadow = {
    schema_version: PROJECT_TIMELINE_SHADOW_SCHEMA_VERSION,
    project_code: projectCode,
    generation_id: generationId,
    generated_at: generatedAt,
    source_inventory: {
      mail_history_source_ref: mailSourceRef,
      mail_history_source_sha256: mailSourceSha256,
      mail_history_row_count: input.mail_history.rows.length,
      source_annotation_count: sourceAnnotations.length,
      explicit_event_count: explicitEvents.length,
      excluded_raw_mail_row_count: excludedRawMailRows,
    },
    coverage,
    projection,
    shadow_digest: "",
    boundaries: {
      raw_body_copied: false,
      official_task_mutated: false,
      official_project_assignment_mutated: false,
      database_mutated: false,
      runtime_writer_activated: false,
    },
  };
  shadow.shadow_digest = sha256Canonical(shadowWithoutDigest(shadow));
  const validation = validateProjectTimelineShadow(shadow);
  if (!validation.ok) fail("shadow_invalid", validation.errors.join("; "));
  return shadow;
}

export function validateProjectTimelineShadow(shadow) {
  const errors = [];
  if (shadow === null || typeof shadow !== "object" || Array.isArray(shadow)) {
    return { ok: false, errors: ["/ expected object"] };
  }
  if (shadow.schema_version !== PROJECT_TIMELINE_SHADOW_SCHEMA_VERSION) {
    errors.push("/schema_version invalid");
  }
  try {
    safeRef(shadow.project_code, "project_code");
    safeRef(shadow.generation_id, "generation_id");
    canonicalUtc(shadow.generated_at, "generated_at");
  } catch (error) {
    errors.push(`/${error.code ?? "identity_invalid"}`);
  }
  const projectionValidation = validateProjectTimelineProjection(shadow.projection);
  if (!projectionValidation.ok) {
    errors.push(...projectionValidation.errors.map((entry) => `/projection${entry}`));
  } else {
    if (shadow.projection.generation_id !== shadow.generation_id
        || shadow.projection.generated_at !== shadow.generated_at) {
      errors.push("/projection generation identity mismatch");
    }
    if (shadow.projection.project_timelines.length !== 1
        || shadow.projection.project_timelines[0]?.project_ref !== shadow.project_code) {
      errors.push("/projection must contain exactly the selected project");
    }
    for (const rows of Object.values(shadow.projection.routing)) {
      if (rows.length !== 0) errors.push("/projection routing must be empty");
    }
  }
  if (shadow.coverage === null || typeof shadow.coverage !== "object") {
    errors.push("/coverage invalid");
  } else {
    const coverageKeys = Object.keys(shadow.coverage).sort();
    if (canonicalJson(coverageKeys) !== canonicalJson([...SOURCE_LANES].sort())) {
      errors.push("/coverage lanes invalid");
    }
    const accepted = Object.values(shadow.coverage).reduce(
      (total, row) => total + Number(row?.accepted_count ?? 0),
      0,
    );
    const projected = shadow.projection?.project_timelines?.[0]?.entries?.length ?? 0;
    if (accepted !== projected) errors.push("/coverage accepted count mismatches projection");
  }
  const expectedBoundaries = {
    raw_body_copied: false,
    official_task_mutated: false,
    official_project_assignment_mutated: false,
    database_mutated: false,
    runtime_writer_activated: false,
  };
  if (canonicalJson(shadow.boundaries) !== canonicalJson(expectedBoundaries)) {
    errors.push("/boundaries invalid");
  }
  const expectedDigest = sha256Canonical(shadowWithoutDigest(shadow));
  if (shadow.shadow_digest !== expectedDigest) errors.push("/shadow_digest mismatch");
  return { ok: errors.length === 0, errors };
}

function csvCell(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/u.test(normalized) ? `'${normalized}` : normalized;
  return /[",\r\n]/u.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

export function renderProjectTimelineCsv(shadow) {
  const validation = validateProjectTimelineShadow(shadow);
  if (!validation.ok) fail("shadow_invalid", validation.errors.join("; "));
  const columns = [
    "occurred_at",
    "project_ref",
    "source_lane",
    "label_kind",
    "entry_id",
    "source_item_ref",
    "source_revision_ref",
    "binding_id",
    "confidence_band",
  ];
  const entries = shadow.projection.project_timelines[0].entries;
  const lines = [
    columns.join(","),
    ...entries.map((entry) => columns.map((column) => {
      const value = {
        occurred_at: entry.occurred_at,
        project_ref: entry.project_ref,
        source_lane: entry.source_lane,
        label_kind: entry.label_kind,
        entry_id: entry.entry_id,
        source_item_ref: entry.source_item_ref,
        source_revision_ref: entry.source_revision_ref,
        binding_id: entry.binding_id,
        confidence_band: entry.confidence_band,
      }[column];
      return csvCell(value);
    }).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function renderProjectTimelineMonthJsonl(shadow) {
  const validation = validateProjectTimelineShadow(shadow);
  if (!validation.ok) fail("shadow_invalid", validation.errors.join("; "));
  const grouped = new Map();
  for (const entry of shadow.projection.project_timelines[0].entries) {
    const month = entry.occurred_at.slice(0, 7);
    const rows = grouped.get(month) ?? [];
    rows.push(entry);
    grouped.set(month, rows);
  }
  return new Map(
    [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([month, entries]) => [
        month,
        `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      ]),
  );
}
