// Strict reader for the reconciler-owned, precomputed file-activity projection.
// This module reads one exact metadata file. It never scans a workspace, revision state,
// observation partition, or directory tree.
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA = "soulforge.file_activity_life_tree_projection.v1";
export const FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES = 8 * 1024 * 1024;
export const FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_EVENTS = 5000;

const TOP_LEVEL_KEYS = [
  "schema_version", "project_code", "workspace_binding_id", "generated_at", "source_checkpoint",
  "coverage", "boundary", "events",
];
const CHECKPOINT_KEYS = ["checkpoint_id", "checkpoint_digest", "through_received_at", "partition_refs"];
const COVERAGE_KEYS = [
  "state", "from_received_at", "through_received_at", "source_months", "source_event_count",
  "event_count", "truncated", "gap_reasons",
];
const BOUNDARY_KEYS = [
  "metadata_only", "derived_rebuildable", "absolute_paths_present", "raw_payload_present", "live_activation",
];
const EVENT_KEYS = [
  "source_event_id", "source_kind", "event_kind", "logical_file_id", "revision_id", "node_id", "node_role",
  "scan_id", "packet_digest", "observation_id", "observed_at", "ingested_at", "received_at", "change_interval",
  "identity_claim", "identity_basis", "uncertainty", "content_id", "size_bytes", "erp_upload_event_ref",
  "evidence_refs", "access",
];
const ACCESS_KEYS = ["visibility", "account_refs"];
const INTERVAL_KEYS = ["after", "before", "basis"];

const OBSERVATION_EVENT_KINDS = new Set([
  "file_first_observed", "observed", "touch", "content_revision", "rename", "copy", "joined_shared_path",
  "cross_node_revision_unordered", "ambiguous_same_content_identity", "stale_observation", "hash_pending",
  "held_packet_evidence",
]);
const TRANSITION_EVENT_KINDS = new Set(["missing_candidate", "delete", "restore"]);
const SIZE_WITHOUT_CONTENT_EVENT_KINDS = new Set(["hash_pending", "held_packet_evidence"]);
const SOURCE_KINDS = new Set(["scanner_observation", "reconciler_transition"]);
const NODE_ROLES = new Set(["work_pc", "tool_pc", "portable_dev_pc", "always_on_node"]);
const IDENTITY_CLAIMS = new Set(["assigned", "observed", "inferred", "uncertain", "unavailable"]);
const IDENTITY_BASES = new Set([
  "first_exact_content_observation",
  "same_node_path_and_exact_content",
  "same_exact_content_with_changed_stat_hint",
  "same_node_path_with_changed_exact_content",
  "unique_same_node_same_content_move_in_complete_listing",
  "same_node_source_path_retained_with_same_exact_content",
  "cross_node_exact_path_with_existing_logical_file",
  "new_node_content_without_known_parent_revision",
  "multiple_same_content_identity_candidates",
  "known_historical_revision_seen_on_node",
  "unclassified_identity_resolution",
  "late_or_stale_node_sequence",
  "node_sequence_gap",
  "producer_chain_mismatch",
]);
const UNCERTAINTY_STATES = new Set(["confirmed", "partial", "review_needed", "conflict"]);
const INTERVAL_BASES = new Set([
  "bounded_by_node_observations",
  "confirmed_absence_receipt_threshold",
  "bounded_by_delete_receipt_and_primary_receipt",
  "first_observed_upper_bound_only",
  "receipt_order_only_clock_skew",
  "exact_order_blocked_clock_skew",
]);
const GAP_REASONS = new Set([
  "workspace_root_unavailable",
  "collector_owned_root_withheld",
  "sensitive_root_withheld",
  "directory_read_failed",
  "entry_stat_failed",
  "directory_containment_failed",
  "entry_budget_exhausted",
  "large_file_hash_queued",
  "hash_byte_budget_exhausted",
  "file_changed_during_hash",
  "file_hash_failed",
  "clock_skew_blocked_exact_order",
  "clock_skew_receipt_order_warning",
  "late_or_stale_node_sequence",
  "node_sequence_gap",
  "producer_chain_mismatch",
  "scan_incomplete",
  "erp_upload_adapter_unavailable",
  "live_collector_not_activated",
  "event_window_truncated",
]);
const VISIBILITIES = new Set(["admins", "accounts"]);
const STRICT_UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PROJECT_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]{0,63}$/u;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ACCOUNT_REF_RE = /^[^\\/\x00-\x1f\x7f]{1,128}$/u;
const SAFE_TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const SOURCE_EVENT_ID_RE = /^(?:obs|file-event):[a-f0-9]{64}$/u;
const EVIDENCE_REF_RE = /^(?:(?:obs|file-event|scan|lf|rev|gap|collision|node-file):[a-f0-9]{64}|sha256:[a-f0-9]{64})$/u;
const SECRET_SEGMENT_RE = /^(?:\.env(?:\..*)?|secret|secrets|credential|credentials|token|tokens|password|passwords|cookie|cookies|session|sessions|\.ssh)(?:\..*)?$/iu;

class ProjectionValidationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new ProjectionValidationError(code);
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function strictUtc(value, { nullable = false, code = "projection_clock_invalid" } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !STRICT_UTC_MS_RE.test(value)) fail(code);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail(code);
  return value;
}

function exactSha(value, { nullable = false, prefix = "sha256", code = "projection_digest_invalid" } = {}) {
  if (value === null && nullable) return null;
  const pattern = new RegExp(`^${prefix}:[a-f0-9]{64}$`, "u");
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function nullableId(value, prefix, code) {
  if (value === null) return null;
  return exactSha(value, { prefix, code });
}

function nonNegativeInteger(value, code, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(code);
  return value;
}

function nullableNonNegativeInteger(value, code) {
  return value === null ? null : nonNegativeInteger(value, code);
}

function sortedUniqueStrings(values, { max, allowed = null, pattern = null, code }) {
  if (!Array.isArray(values) || values.length > max) fail(code);
  const normalized = values.map((value) => String(value ?? ""));
  if (normalized.some((value) => !value || (allowed && !allowed.has(value)) || (pattern && !pattern.test(value)))) fail(code);
  const sorted = [...new Set(normalized)].sort();
  if (sorted.length !== normalized.length || sorted.some((value, index) => value !== normalized[index])) fail(code);
  return sorted;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeInterval(value, eventKind) {
  if (value === null) {
    if (TRANSITION_EVENT_KINDS.has(eventKind)) fail("projection_transition_interval_required");
    return null;
  }
  exactKeys(value, INTERVAL_KEYS, "projection_change_interval_shape_invalid");
  const basis = String(value.basis ?? "");
  if (!INTERVAL_BASES.has(basis)) fail("projection_change_interval_basis_invalid");
  const after = strictUtc(value.after, { nullable: true, code: "projection_change_interval_after_invalid" });
  const before = strictUtc(value.before, { code: "projection_change_interval_before_invalid" });
  if (basis === "first_observed_upper_bound_only") {
    if (after !== null) fail("projection_change_interval_after_invalid");
  } else if (after === null || Date.parse(after) > Date.parse(before)) {
    fail("projection_change_interval_order_invalid");
  }
  const requiredBasis = {
    missing_candidate: "bounded_by_node_observations",
    delete: "confirmed_absence_receipt_threshold",
    restore: "bounded_by_delete_receipt_and_primary_receipt",
  }[eventKind];
  if (requiredBasis && basis !== requiredBasis) fail("projection_change_interval_basis_mismatch");
  return { after, before, basis };
}

function normalizeAccess(value) {
  exactKeys(value, ACCESS_KEYS, "projection_access_shape_invalid");
  const visibility = String(value.visibility ?? "");
  if (!VISIBILITIES.has(visibility)) fail("projection_access_visibility_invalid");
  const accountRefs = sortedUniqueStrings(value.account_refs, {
    max: 50,
    pattern: ACCOUNT_REF_RE,
    code: "projection_access_account_refs_invalid",
  });
  if (visibility === "accounts" ? accountRefs.length === 0 : accountRefs.length !== 0) {
    fail("projection_access_account_refs_invalid");
  }
  return { visibility, account_refs: accountRefs };
}

function normalizeEvent(value) {
  exactKeys(value, EVENT_KEYS, "projection_event_shape_invalid");
  const sourceKind = String(value.source_kind ?? "");
  const eventKind = String(value.event_kind ?? "");
  if (!SOURCE_KINDS.has(sourceKind)) fail("projection_source_kind_invalid");
  const allowedKinds = sourceKind === "scanner_observation" ? OBSERVATION_EVENT_KINDS : TRANSITION_EVENT_KINDS;
  if (!allowedKinds.has(eventKind)) fail("projection_event_kind_invalid");

  const sourceEventId = String(value.source_event_id ?? "");
  if (!SOURCE_EVENT_ID_RE.test(sourceEventId)) fail("projection_source_event_id_invalid");
  const observationId = nullableId(value.observation_id, "obs", "projection_observation_id_invalid");
  if (sourceKind === "scanner_observation") {
    if (observationId === null || sourceEventId !== observationId) fail("projection_observation_source_id_mismatch");
  } else if (observationId !== null || !sourceEventId.startsWith("file-event:")) {
    fail("projection_transition_source_id_invalid");
  }

  const logicalFileId = nullableId(value.logical_file_id, "lf", "projection_logical_file_id_invalid");
  const revisionId = nullableId(value.revision_id, "rev", "projection_revision_id_invalid");
  const nodeId = String(value.node_id ?? "");
  const nodeRole = String(value.node_role ?? "");
  if (!IDENTIFIER_RE.test(nodeId) || !NODE_ROLES.has(nodeRole)) fail("projection_node_identity_invalid");
  const scanId = exactSha(value.scan_id, { prefix: "scan", code: "projection_scan_id_invalid" });
  const packetDigest = exactSha(value.packet_digest, { nullable: true, code: "projection_packet_digest_invalid" });
  const observedAt = strictUtc(value.observed_at, { nullable: true, code: "projection_observed_at_invalid" });
  const ingestedAt = strictUtc(value.ingested_at, { nullable: true, code: "projection_ingested_at_invalid" });
  const receivedAt = strictUtc(value.received_at, { nullable: true, code: "projection_received_at_invalid" });
  if (sourceKind === "scanner_observation" && (observedAt === null || ingestedAt === null)) {
    fail("projection_observation_clock_required");
  }
  if (sourceKind === "reconciler_transition" && receivedAt === null) fail("projection_transition_receipt_required");
  const changeInterval = normalizeInterval(value.change_interval, eventKind);
  if (sourceKind === "scanner_observation") {
    const skewMs = Math.abs(Date.parse(ingestedAt) - Date.parse(observedAt));
    const skewBasis = skewMs > 15 * 60 * 1000
      ? "exact_order_blocked_clock_skew"
      : skewMs > 5 * 60 * 1000 ? "receipt_order_only_clock_skew" : null;
    if (skewBasis) {
      if (receivedAt === null || changeInterval?.basis !== skewBasis) fail("projection_clock_interval_mismatch");
    } else if (["receipt_order_only_clock_skew", "exact_order_blocked_clock_skew"].includes(changeInterval?.basis)) {
      fail("projection_clock_interval_mismatch");
    }
  }

  const identityClaim = String(value.identity_claim ?? "");
  const identityBasis = value.identity_basis === null ? null : String(value.identity_basis ?? "");
  const uncertainty = String(value.uncertainty ?? "");
  if (!IDENTITY_CLAIMS.has(identityClaim)) fail("projection_identity_claim_invalid");
  if (identityBasis !== null && (!SAFE_TOKEN_RE.test(identityBasis) || !IDENTITY_BASES.has(identityBasis))) {
    fail("projection_identity_basis_invalid");
  }
  if (!UNCERTAINTY_STATES.has(uncertainty)) fail("projection_uncertainty_invalid");
  const contentId = exactSha(value.content_id, { nullable: true, code: "projection_content_id_invalid" });
  const sizeBytes = nullableNonNegativeInteger(value.size_bytes, "projection_size_bytes_invalid");
  if (
    (contentId !== null && sizeBytes === null)
    || (contentId === null && sizeBytes !== null && !SIZE_WITHOUT_CONTENT_EVENT_KINDS.has(eventKind))
  ) {
    fail("projection_content_size_pair_invalid");
  }
  const erpUploadEventRef = value.erp_upload_event_ref === null ? null : String(value.erp_upload_event_ref);
  if (erpUploadEventRef !== null && !/^event_log:[1-9][0-9]*$/u.test(erpUploadEventRef)) {
    fail("projection_erp_upload_event_ref_invalid");
  }
  const evidenceRefs = sortedUniqueStrings(value.evidence_refs, {
    max: 32,
    pattern: EVIDENCE_REF_RE,
    code: "projection_evidence_refs_invalid",
  });
  if (!evidenceRefs.includes(sourceEventId)) fail("projection_source_evidence_missing");

  return {
    source_event_id: sourceEventId,
    source_kind: sourceKind,
    event_kind: eventKind,
    logical_file_id: logicalFileId,
    revision_id: revisionId,
    node_id: nodeId,
    node_role: nodeRole,
    scan_id: scanId,
    packet_digest: packetDigest,
    observation_id: observationId,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    received_at: receivedAt,
    change_interval: changeInterval,
    identity_claim: identityClaim,
    identity_basis: identityBasis,
    uncertainty,
    content_id: contentId,
    size_bytes: sizeBytes,
    erp_upload_event_ref: erpUploadEventRef,
    evidence_refs: evidenceRefs,
    access: normalizeAccess(value.access),
  };
}

function normalizePartitionRef(value, projectCode) {
  const ref = String(value ?? "");
  const prefix = `_workmeta/${projectCode}/reports/file_activity/`;
  const segments = ref.split("/");
  if (
    ref.length > 512
    || !ref.startsWith(prefix)
    || !ref.endsWith(".json")
    || ref.includes("\\")
    || /[\x00-\x1f\x7f]/u.test(ref)
    || segments.some((segment) => !segment || segment === "." || segment === ".." || SECRET_SEGMENT_RE.test(segment))
    || !/^[A-Za-z0-9가-힣._:/-]+$/u.test(ref)
  ) fail("projection_partition_ref_invalid");
  return ref;
}

function normalizeProjection(value, requestedProject) {
  exactKeys(value, TOP_LEVEL_KEYS, "projection_top_level_shape_invalid");
  if (value.schema_version !== FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA) fail("projection_schema_invalid");
  const projectCode = String(value.project_code ?? "");
  if (!PROJECT_RE.test(projectCode) || projectCode.includes("..") || projectCode !== requestedProject) {
    fail("projection_project_mismatch");
  }
  const workspaceBindingId = String(value.workspace_binding_id ?? "");
  if (!IDENTIFIER_RE.test(workspaceBindingId)) fail("projection_workspace_binding_invalid");
  const generatedAt = strictUtc(value.generated_at, { code: "projection_generated_at_invalid" });

  exactKeys(value.source_checkpoint, CHECKPOINT_KEYS, "projection_checkpoint_shape_invalid");
  const checkpointId = String(value.source_checkpoint.checkpoint_id ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(checkpointId)) fail("projection_checkpoint_id_invalid");
  const checkpointDigest = exactSha(value.source_checkpoint.checkpoint_digest, { code: "projection_checkpoint_digest_invalid" });
  const checkpointThrough = strictUtc(value.source_checkpoint.through_received_at, {
    code: "projection_checkpoint_clock_invalid",
  });
  const partitionRefs = sortedUniqueStrings(value.source_checkpoint.partition_refs, {
    max: 5000,
    code: "projection_partition_refs_invalid",
  }).map((ref) => normalizePartitionRef(ref, projectCode));

  exactKeys(value.coverage, COVERAGE_KEYS, "projection_coverage_shape_invalid");
  const coverageState = String(value.coverage.state ?? "");
  if (!new Set(["complete", "partial"]).has(coverageState)) fail("projection_coverage_state_invalid");
  const fromReceivedAt = strictUtc(value.coverage.from_received_at, { nullable: true, code: "projection_coverage_from_invalid" });
  const throughReceivedAt = strictUtc(value.coverage.through_received_at, { nullable: true, code: "projection_coverage_through_invalid" });
  if ((fromReceivedAt && !throughReceivedAt) || (fromReceivedAt && Date.parse(fromReceivedAt) > Date.parse(throughReceivedAt))) {
    fail("projection_coverage_clock_order_invalid");
  }
  if (throughReceivedAt !== null && throughReceivedAt !== checkpointThrough) fail("projection_checkpoint_coverage_mismatch");
  const sourceMonths = sortedUniqueStrings(value.coverage.source_months, {
    max: 120,
    pattern: MONTH_RE,
    code: "projection_source_months_invalid",
  });
  const sourceEventCount = nonNegativeInteger(value.coverage.source_event_count, "projection_source_event_count_invalid");
  const eventCount = nonNegativeInteger(value.coverage.event_count, "projection_event_count_invalid", {
    max: FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_EVENTS,
  });
  if (!Array.isArray(value.events) || value.events.length !== eventCount) fail("projection_event_count_mismatch");
  if (sourceEventCount < eventCount) fail("projection_source_event_count_invalid");
  if (typeof value.coverage.truncated !== "boolean") fail("projection_truncated_invalid");
  if (sourceEventCount > eventCount && value.coverage.truncated !== true) fail("projection_truncation_invalid");
  const gapReasons = sortedUniqueStrings(value.coverage.gap_reasons, {
    max: 100,
    allowed: GAP_REASONS,
    code: "projection_gap_reasons_invalid",
  });
  if (coverageState === "complete" && (value.coverage.truncated || gapReasons.length > 0)) {
    fail("projection_complete_coverage_contradiction");
  }

  exactKeys(value.boundary, BOUNDARY_KEYS, "projection_boundary_shape_invalid");
  if (
    value.boundary.metadata_only !== true
    || value.boundary.derived_rebuildable !== true
    || value.boundary.absolute_paths_present !== false
    || value.boundary.raw_payload_present !== false
    || value.boundary.live_activation !== false
  ) fail("projection_boundary_invalid");

  if (value.events.length > FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_EVENTS) fail("projection_event_limit_exceeded");
  const eventsById = new Map();
  for (const sourceEvent of value.events) {
    const event = normalizeEvent(sourceEvent);
    const canonical = canonicalJson(event);
    const previous = eventsById.get(event.source_event_id);
    if (previous && previous.canonical !== canonical) fail("projection_duplicate_source_event_conflict");
    if (!previous) eventsById.set(event.source_event_id, { canonical, event });
  }
  const events = [...eventsById.values()].map((entry) => entry.event)
    .sort((left, right) => left.source_event_id.localeCompare(right.source_event_id));
  return {
    schema_version: FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    generated_at: generatedAt,
    source_checkpoint: {
      checkpoint_id: checkpointId,
      checkpoint_digest: checkpointDigest,
      through_received_at: checkpointThrough,
      partition_refs: partitionRefs,
    },
    coverage: {
      state: coverageState,
      from_received_at: fromReceivedAt,
      through_received_at: throughReceivedAt,
      source_months: sourceMonths,
      source_event_count: sourceEventCount,
      event_count: eventCount,
      truncated: value.coverage.truncated,
      gap_reasons: gapReasons,
    },
    events,
  };
}

function callerRefs(scope) {
  return new Set([
    scope?.actor,
    ...(Array.isArray(scope?.assignee_any) ? scope.assignee_any : []),
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
}

function eventAccessible(event, scope) {
  if (!scope || scope.all === true) return true;
  if (event.access.visibility === "admins") return false;
  const refs = callerRefs(scope);
  return event.access.account_refs.some((ref) => refs.has(ref));
}

function result(state, overrides = {}) {
  return {
    state,
    read_mode: "exact_precomputed_file_only",
    events: [],
    coverage_state: "partial",
    gap_reasons: [],
    source_event_count: 0,
    projection_event_count: 0,
    accessible_event_count: 0,
    scope_withheld: false,
    duplicate_count: 0,
    truncated: false,
    rejection_reason: null,
    ...overrides,
  };
}

function assertNoSymlinkComponents(rootPath, candidatePath) {
  const resolvedRoot = resolve(rootPath);
  const resolvedCandidate = resolve(candidatePath);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) fail("projection_path_outside_root");
  const segments = relativePath.split(sep).filter(Boolean);
  let current = resolvedRoot;
  for (const segment of [null, ...segments.slice(0, -1)]) {
    if (segment !== null) current = join(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail("projection_symlink_component_blocked");
  }
}

export function readFileActivityLifeTreeProjection(root, projectCode, { scope = null } = {}) {
  if (!PROJECT_RE.test(String(projectCode ?? "")) || String(projectCode).includes("..")) {
    return result("rejected", { rejection_reason: "projection_project_invalid", gap_reasons: ["projection_rejected"] });
  }
  const projectionPath = join(
    resolve(root), "_workmeta", projectCode, "reports", "file_activity", "projections", "life_tree_events.json",
  );
  let pathStat;
  try {
    assertNoSymlinkComponents(root, projectionPath);
    pathStat = lstatSync(projectionPath);
  } catch (error) {
    return error?.code === "ENOENT"
      ? result("missing", { gap_reasons: ["projection_not_precomputed"] })
      : result("rejected", {
          rejection_reason: error instanceof ProjectionValidationError ? error.code : "projection_stat_failed",
          gap_reasons: ["projection_rejected"],
        });
  }
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    return result("rejected", { rejection_reason: "projection_not_regular_file", gap_reasons: ["projection_rejected"] });
  }
  if (pathStat.size > FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES) {
    return result("rejected", { rejection_reason: "projection_oversize", gap_reasons: ["projection_rejected"] });
  }
  let descriptor;
  try {
    descriptor = openSync(projectionPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT") return result("missing", { gap_reasons: ["projection_not_precomputed"] });
    const reason = ["ELOOP", "EMLINK"].includes(error?.code)
      ? "projection_not_regular_file"
      : "projection_open_failed";
    return result("rejected", { rejection_reason: reason, gap_reasons: ["projection_rejected"] });
  }
  try {
    let stat;
    try {
      stat = fstatSync(descriptor);
    } catch {
      return result("rejected", { rejection_reason: "projection_stat_failed", gap_reasons: ["projection_rejected"] });
    }
    if (!stat.isFile()) {
      return result("rejected", { rejection_reason: "projection_not_regular_file", gap_reasons: ["projection_rejected"] });
    }
    assertNoSymlinkComponents(root, projectionPath);
    const currentPathStat = lstatSync(projectionPath);
    if (stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
      return result("rejected", { rejection_reason: "projection_changed_during_open", gap_reasons: ["projection_rejected"] });
    }
    if (stat.dev !== currentPathStat.dev || stat.ino !== currentPathStat.ino) {
      return result("rejected", { rejection_reason: "projection_changed_during_open", gap_reasons: ["projection_rejected"] });
    }
    if (stat.size > FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES) {
      return result("rejected", { rejection_reason: "projection_oversize", gap_reasons: ["projection_rejected"] });
    }
    let raw;
    try {
      raw = readFileSync(descriptor, "utf8");
    } catch {
      return result("rejected", { rejection_reason: "projection_read_failed", gap_reasons: ["projection_rejected"] });
    }
    if (Buffer.byteLength(raw, "utf8") > FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES) {
      return result("rejected", { rejection_reason: "projection_oversize", gap_reasons: ["projection_rejected"] });
    }
    const parsed = JSON.parse(raw);
    const projection = normalizeProjection(parsed, projectCode);
    const accessible = projection.events.filter((event) => eventAccessible(event, scope));
    const withheldCount = projection.events.length - accessible.length;
    const scoped = Boolean(scope && scope.all !== true);
    return result("loaded", {
      events: accessible,
      coverage_state: projection.coverage.state,
      gap_reasons: scoped
        ? projection.coverage.gap_reasons.filter((reason) => reason !== "event_window_truncated")
        : projection.coverage.gap_reasons,
      source_event_count: scoped ? accessible.length : projection.coverage.source_event_count,
      projection_event_count: scoped ? accessible.length : projection.events.length,
      accessible_event_count: accessible.length,
      scope_withheld: withheldCount > 0,
      duplicate_count: scoped ? 0 : projection.coverage.event_count - projection.events.length,
      truncated: scoped ? false : projection.coverage.truncated,
    });
  } catch (error) {
    const rejectionReason = error instanceof ProjectionValidationError ? error.code : "projection_json_invalid";
    return result("rejected", { rejection_reason: rejectionReason, gap_reasons: ["projection_rejected"] });
  } finally {
    try {
      closeSync(descriptor);
    } catch {
      // The descriptor was read-only; a close failure must not echo host details or revive a rejected artifact.
    }
  }
}
