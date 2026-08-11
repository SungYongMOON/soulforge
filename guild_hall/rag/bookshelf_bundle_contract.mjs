import crypto from "node:crypto";

export const BOOKSHELF_LEDGER_SCHEMA_VERSION =
  "soulforge.llm_wiki_bookshelf.metadata_source_ledger.v0";
export const BOOKSHELF_PACKET_MAP_SCHEMA_VERSION =
  "soulforge.llm_wiki_bookshelf.notebooklm_packet_map.v0";
export const BOOKSHELF_BUNDLE_VALIDATION_SCHEMA_VERSION =
  "soulforge.llm_wiki_bookshelf.bundle_validation.v0";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SAFE_TEMPLATE_REF_PATTERN = /^[A-Za-z0-9_./<>:-]{1,320}$/;
const CLAIM_CEILINGS = new Set(["observed", "source_supported"]);
const WAREHOUSE_STATES = new Set([
  "00_INBOX_candidate",
  "10_CANON_source",
  "20_Project_CANON",
  "30_Domain_CANON",
  "80_SUPERSEDED",
  "90_REJECTED_or_UNCLEAR",
]);
const READY_WAREHOUSE_STATES = new Set([
  "10_CANON_source",
  "20_Project_CANON",
  "30_Domain_CANON",
]);
const READY_APPROVAL_STATUSES = new Set([
  "owner_approved",
  "owner_approved_official_public_source",
]);
const READY_APPROVER_ROLES = new Set(["owner", "steward"]);
const READY_REVIEW_STATUSES = new Set(["source_checked"]);
const TEMPLATE_EXCLUDED_SOURCE_HANDLE = "superseded-or-rejected-source-handle";

const BUNDLE_KEYS = new Set([
  "source_ledger",
  "notebooklm_packet_map",
  "source_root_binding_projection",
]);
const LEDGER_KEYS = new Set([
  "schema_version",
  "template_status",
  "ledger_owner",
  "warehouse_surface",
  "notebooklm_bookshelf_surface",
  "metadata_boundary",
  "claim_policy",
  "folder_state_values",
  "source_entries",
]);
const WAREHOUSE_SURFACE_KEYS = new Set([
  "storage_owner",
  "storage_role",
  "active_work_file_owner",
  "source_payloads_stored_in_public_repo",
]);
const BOOKSHELF_SURFACE_KEYS = new Set(["role", "source_selection_owner"]);
const LEDGER_BOUNDARY_KEYS = new Set([
  "metadata_only",
  "source_payloads_included",
  "notebooklm_answers_included",
  "live_drive_ids_included",
  "runtime_absolute_paths_included",
  "secrets_or_account_state_included",
]);
const LEDGER_CLAIM_POLICY_KEYS = new Set([
  "default_claim_ceiling",
  "notebooklm_output_is_authority",
  "owner_review_required_for_public_promotion",
]);
const LEDGER_SOURCE_KEYS = new Set([
  "source_handle",
  "title_label",
  "source_kind",
  "source_class",
  "warehouse_state",
  "legacy_bookshelf_state_alias",
  "storage_locator",
  "version",
  "owner_approval",
  "notebooklm_use",
  "review_state",
  "tags",
  "audit",
]);
const STORAGE_LOCATOR_KEYS = new Set(["storage_surface", "locator_kind", "locator_label"]);
const VERSION_KEYS = new Set([
  "version_label",
  "effective_date",
  "supersedes_handle",
  "superseded_by_handle",
]);
const OWNER_APPROVAL_KEYS = new Set([
  "approval_status",
  "approved_by_role",
  "approval_basis_ref",
  "approval_note",
]);
const NOTEBOOKLM_USE_KEYS = new Set(["allowed_for_packet", "packet_scope", "excluded_reason"]);
const REVIEW_STATE_KEYS = new Set(["claim_ceiling", "review_status", "next_owner_action"]);
const TAG_KEYS = new Set(["domain", "project"]);
const AUDIT_KEYS = new Set(["created_at_utc", "updated_at_utc", "created_by_role"]);

const PACKET_MAP_KEYS = new Set([
  "schema_version",
  "template_status",
  "packet_boundary",
  "packet",
]);
const PACKET_BOUNDARY_KEYS = new Set([
  "metadata_only",
  "source_payloads_included",
  "notebooklm_answers_included",
  "live_notebook_ids_included",
  "live_drive_ids_included",
  "runtime_absolute_paths_included",
  "advisory_only",
]);
const PACKET_KEYS = new Set([
  "packet_handle",
  "topic_label",
  "intended_use",
  "notebook_ref",
  "source_ledger_ref",
  "source_selection",
  "allowed_warehouse_states",
  "excluded_warehouse_states",
  "query_log_policy",
  "claim_policy",
  "review",
  "downstream_routes",
]);
const NOTEBOOK_REF_KEYS = new Set(["ref_kind", "ref_label"]);
const SOURCE_SELECTION_KEYS = new Set([
  "include_source_handles",
  "exclude_source_handles",
  "selection_rule",
]);
const QUERY_LOG_POLICY_KEYS = new Set([
  "record_queries_as_metadata_only",
  "copy_answers_into_public_repo",
  "copy_source_excerpts_into_public_repo",
  "suggested_private_log_ref",
]);
const PACKET_CLAIM_POLICY_KEYS = new Set([
  "notebooklm_output_claim_ceiling",
  "source_checked_claim_ceiling",
  "canon_or_owner_approval_from_packet",
]);
const PACKET_REVIEW_KEYS = new Set(["packet_status", "reviewer_role", "next_owner_action"]);
const DOWNSTREAM_ROUTE_KEYS = new Set([
  "knowledge_access_event_capture",
  "sourcebound_knowledge_packet_operating_loop",
  "post_development_review_gate",
]);

// This is a redacted projection of current source_roots binding fields. A
// physical source_root_path is intentionally not part of the accepted shape.
const SOURCE_ROOT_BINDING_PROJECTION_KEYS = new Set([
  "binding_ref",
  "project_code",
  "binding_id",
  "storage_surface",
  "source_root_label",
  "source_root_path_is_private",
  "source_payload_owner",
  "agent_mutation_allowed",
  "notebooklm_upload_allowed",
]);

const FORBIDDEN_KEYS = new Set([
  "absolute_path",
  "access_token",
  "account_email",
  "account_id",
  "account_state",
  "answer",
  "api_key",
  "attachment_body",
  "body",
  "body_text",
  "chunk_payload",
  "chunk_text",
  "content",
  "conversation_id",
  "cookie",
  "credential",
  "credentials",
  "drive_file_id",
  "drive_id",
  "email_body",
  "live_account_state",
  "mail_body",
  "notebook_id",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "notebooklm_conversation_id",
  "notebooklm_notebook_id",
  "notebooklm_question",
  "notebooklm_response",
  "password",
  "payload",
  "physical_path",
  "private_payload",
  "question",
  "raw_payload",
  "raw_query",
  "raw_source",
  "root_path",
  "secret",
  "session",
  "source_body",
  "source_content",
  "source_payload",
  "source_root",
  "source_root_path",
  "source_root_paths",
  "source_text",
  "text",
  "token",
]);

const PUBLIC_CONTRACT_KEYS = new Set([
  ...BUNDLE_KEYS,
  ...LEDGER_KEYS,
  ...WAREHOUSE_SURFACE_KEYS,
  ...BOOKSHELF_SURFACE_KEYS,
  ...LEDGER_BOUNDARY_KEYS,
  ...LEDGER_CLAIM_POLICY_KEYS,
  ...LEDGER_SOURCE_KEYS,
  ...STORAGE_LOCATOR_KEYS,
  ...VERSION_KEYS,
  ...OWNER_APPROVAL_KEYS,
  ...NOTEBOOKLM_USE_KEYS,
  ...REVIEW_STATE_KEYS,
  ...TAG_KEYS,
  ...AUDIT_KEYS,
  ...PACKET_MAP_KEYS,
  ...PACKET_BOUNDARY_KEYS,
  ...PACKET_KEYS,
  ...NOTEBOOK_REF_KEYS,
  ...SOURCE_SELECTION_KEYS,
  ...QUERY_LOG_POLICY_KEYS,
  ...PACKET_CLAIM_POLICY_KEYS,
  ...PACKET_REVIEW_KEYS,
  ...DOWNSTREAM_ROUTE_KEYS,
  ...SOURCE_ROOT_BINDING_PROJECTION_KEYS,
  ...FORBIDDEN_KEYS,
]);

/**
 * Pure, metadata-only cross-validator for the current public LLM wiki
 * bookshelf v0 ledger and packet-map contracts plus a redacted projection of a
 * source-roots binding. It does not accept the full binding, read files, query
 * NotebookLM/Drive, inspect accounts, or expose physical source-root paths.
 */
export function validateBookshelfBundle(bundle) {
  const structureBlockers = [];
  const readinessBlockers = [];
  const alignmentConflicts = [];
  const unknownAlignments = [];

  if (!isPlainObject(bundle)) {
    structureBlockers.push("bundle_must_be_object");
  } else {
    validateAllowedKeys(bundle, BUNDLE_KEYS, structureBlockers, "bundle");
  }

  const ledger = isPlainObject(bundle?.source_ledger) ? bundle.source_ledger : {};
  const packetMap = isPlainObject(bundle?.notebooklm_packet_map) ? bundle.notebooklm_packet_map : {};
  const bindingProjection = isPlainObject(bundle?.source_root_binding_projection)
    ? bundle.source_root_binding_projection
    : {};

  if (!isPlainObject(bundle?.source_ledger)) structureBlockers.push("source_ledger_must_be_object");
  if (!isPlainObject(bundle?.notebooklm_packet_map)) {
    structureBlockers.push("notebooklm_packet_map_must_be_object");
  }
  if (!isPlainObject(bundle?.source_root_binding_projection)) {
    structureBlockers.push("source_root_binding_projection_must_be_object");
  }

  const ledgerSources = validateLedger(ledger, structureBlockers, readinessBlockers);
  const packetSelection = validatePacketMap(packetMap, structureBlockers, readinessBlockers);
  validateBindingProjection(bindingProjection, structureBlockers);
  validateMembership({
    ledgerSources,
    packetSelection,
    bindingProjection,
    readinessBlockers,
    alignmentConflicts,
  });

  // Current v0 does not carry these machine-comparable fields. Report the
  // ceiling explicitly instead of fabricating alignment evidence.
  unknownAlignments.push(
    "approval_basis_ref_target_not_read_or_hash_verified_by_pure_validator",
    "binding_identity_not_referenced_by_packet_map_v0",
    "ledger_document_identity_not_self_declared_in_v0",
    "project_scope_not_declared_by_ledger_or_packet_map_v0",
    "immutable_hash_bound_source_revision_identity_not_declared_by_bookshelf_v0",
  );

  structureBlockers.push(...findSafetyBlockers(bundle));

  const canonicalStructureBlockers = canonicalStrings(structureBlockers);
  const canonicalReadinessBlockers = canonicalStrings(readinessBlockers);
  const canonicalAlignmentConflicts = canonicalStrings(alignmentConflicts);
  const canonicalUnknownAlignments = canonicalStrings(unknownAlignments);
  const structureStatus = canonicalStructureBlockers.length === 0 ? "pass" : "blocked";
  const alignmentStatus = canonicalAlignmentConflicts.length > 0
    ? "conflict"
    : canonicalUnknownAlignments.length > 0
      ? "unknown_alignment"
      : "match";
  const readinessStatus = canonicalReadinessBlockers.length > 0 || canonicalAlignmentConflicts.length > 0
    ? "blocked"
    : alignmentStatus === "unknown_alignment"
      ? "hold"
      : "pass";
  const status = structureStatus === "blocked" || readinessStatus === "blocked"
    ? "blocked"
    : readinessStatus === "hold"
      ? "hold"
      : "pass";
  const allBlockers = canonicalStrings([
    ...canonicalStructureBlockers,
    ...canonicalReadinessBlockers,
    ...canonicalAlignmentConflicts,
  ]);

  const resultCore = {
    schema_version: BOOKSHELF_BUNDLE_VALIDATION_SCHEMA_VERSION,
    kind: "llm_wiki_bookshelf_bundle_validation",
    status,
    structure_status: structureStatus,
    readiness_status: readinessStatus,
    alignment_status: alignmentStatus,
    ready_for_manual_notebooklm_use: status === "pass",
    identity: {
      packet_handle: safeOutputId(packetMap?.packet?.packet_handle),
      binding_id: safeOutputId(bindingProjection.binding_id),
      project_code: safeOutputId(bindingProjection.project_code),
    },
    counts: {
      ledger_source_count: ledgerSources.count,
      packet_include_count: packetSelection.includeHandles.length,
      packet_exclude_count: packetSelection.excludeHandles.length,
    },
    selected_source_handles: canonicalStrings(packetSelection.includeHandles),
    structure_blocker_count: canonicalStructureBlockers.length,
    structure_blockers: canonicalStructureBlockers,
    readiness_blocker_count: canonicalReadinessBlockers.length,
    readiness_blockers: canonicalReadinessBlockers,
    alignment_conflict_count: canonicalAlignmentConflicts.length,
    alignment_conflicts: canonicalAlignmentConflicts,
    unknown_alignment_count: canonicalUnknownAlignments.length,
    unknown_alignments: canonicalUnknownAlignments,
    blocker_count: allBlockers.length,
    blockers: allBlockers,
    boundary: {
      metadata_only: hasMetadataOnlyBoundary(ledger, packetMap),
      redacted_binding_projection_only: isRedactedBindingProjection(bindingProjection),
      projection_is_not_persisted_schema: true,
      binding_projection_is_persisted_schema: false,
      binding_projection_is_in_memory_only: true,
      physical_binding_not_loaded: true,
      advisory_only: packetMap?.packet_boundary?.advisory_only === true,
      notebooklm_output_is_authority: false,
      physical_source_root_read: false,
      filesystem_accessed: false,
      network_accessed: false,
      runtime_mutated: false,
      source_payloads_returned: false,
    },
  };

  return {
    ...resultCore,
    result_fingerprint_sha256: sha256(stableStringify(resultCore)),
  };
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function validateLedger(ledger, structureBlockers, readinessBlockers) {
  validateAllowedKeys(ledger, LEDGER_KEYS, structureBlockers, "source_ledger");
  if (ledger.schema_version !== BOOKSHELF_LEDGER_SCHEMA_VERSION) {
    structureBlockers.push("source_ledger_schema_version_mismatch");
  }
  if (!isSafeId(ledger.template_status)) structureBlockers.push("source_ledger_template_status_unsafe");
  if (!isSafeLogicalRef(ledger.ledger_owner)) structureBlockers.push("source_ledger_owner_ref_unsafe");

  const warehouse = objectField(ledger, "warehouse_surface", "source_ledger", structureBlockers);
  validateAllowedKeys(warehouse, WAREHOUSE_SURFACE_KEYS, structureBlockers, "source_ledger.warehouse_surface");
  for (const key of ["storage_owner", "storage_role", "active_work_file_owner"]) {
    if (!isSafeId(warehouse[key])) structureBlockers.push(`source_ledger_warehouse_${key}_unsafe`);
  }
  if (warehouse.source_payloads_stored_in_public_repo !== false) {
    structureBlockers.push("source_ledger_public_repo_source_payloads_must_be_false");
  }

  const bookshelf = objectField(
    ledger,
    "notebooklm_bookshelf_surface",
    "source_ledger",
    structureBlockers,
  );
  validateAllowedKeys(
    bookshelf,
    BOOKSHELF_SURFACE_KEYS,
    structureBlockers,
    "source_ledger.notebooklm_bookshelf_surface",
  );
  for (const key of BOOKSHELF_SURFACE_KEYS) {
    if (!isSafeLabel(bookshelf[key])) structureBlockers.push(`source_ledger_bookshelf_${key}_unsafe`);
  }

  validateBoundary({
    value: ledger.metadata_boundary,
    allowedKeys: LEDGER_BOUNDARY_KEYS,
    requiredTrue: ["metadata_only"],
    requiredFalse: [
      "source_payloads_included",
      "notebooklm_answers_included",
      "live_drive_ids_included",
      "runtime_absolute_paths_included",
      "secrets_or_account_state_included",
    ],
    trail: "source_ledger.metadata_boundary",
    blockers: structureBlockers,
  });

  const claimPolicy = objectField(ledger, "claim_policy", "source_ledger", structureBlockers);
  validateAllowedKeys(claimPolicy, LEDGER_CLAIM_POLICY_KEYS, structureBlockers, "source_ledger.claim_policy");
  if (claimPolicy.default_claim_ceiling !== "observed") {
    structureBlockers.push("source_ledger_default_claim_ceiling_must_be_observed");
  }
  if (claimPolicy.notebooklm_output_is_authority !== false) {
    structureBlockers.push("source_ledger_notebooklm_output_must_not_be_authority");
  }
  if (claimPolicy.owner_review_required_for_public_promotion !== true) {
    structureBlockers.push("source_ledger_public_promotion_owner_review_must_be_true");
  }

  validateEnumArray(
    ledger.folder_state_values,
    WAREHOUSE_STATES,
    "source_ledger.folder_state_values",
    structureBlockers,
    { requireAll: true },
  );

  if (!Array.isArray(ledger.source_entries)) {
    structureBlockers.push("source_ledger_source_entries_must_be_array");
    return { count: 0, byHandle: new Map() };
  }
  if (ledger.source_entries.length === 0) readinessBlockers.push("source_ledger_has_no_sources");

  const byHandle = new Map();
  for (const [index, source] of ledger.source_entries.entries()) {
    const trail = `source_ledger.source_entries[${index}]`;
    if (!isPlainObject(source)) {
      structureBlockers.push(`${trail}_must_be_object`);
      continue;
    }
    validateAllowedKeys(source, LEDGER_SOURCE_KEYS, structureBlockers, trail);
    if (!isSafeId(source.source_handle)) structureBlockers.push(`${trail}.source_handle_unsafe`);
    if (!isSafeLabel(source.title_label)) structureBlockers.push(`${trail}.title_label_unsafe`);
    if (!isSafeLabel(source.source_kind)) structureBlockers.push(`${trail}.source_kind_unsafe`);
    if (!isSafeLabel(source.source_class)) structureBlockers.push(`${trail}.source_class_unsafe`);
    if (!WAREHOUSE_STATES.has(source.warehouse_state)) structureBlockers.push(`${trail}.warehouse_state_unknown`);
    if (!WAREHOUSE_STATES.has(source.legacy_bookshelf_state_alias)) {
      structureBlockers.push(`${trail}.legacy_bookshelf_state_alias_unknown`);
    }

    validateStorageLocator(source.storage_locator, trail, structureBlockers);
    validateVersion(source.version, trail, structureBlockers);
    validateOwnerApproval(source.owner_approval, trail, structureBlockers);
    validateNotebooklmUse(source.notebooklm_use, trail, structureBlockers);
    validateReviewState(source.review_state, trail, structureBlockers);
    validateTags(source.tags, trail, structureBlockers);
    validateAudit(source.audit, trail, structureBlockers);

    if (isSafeId(source.source_handle)) {
      if (byHandle.has(source.source_handle)) {
        structureBlockers.push(`source_ledger_source_handle_duplicate:${source.source_handle}`);
      } else {
        byHandle.set(source.source_handle, source);
      }
    }
  }
  return { count: ledger.source_entries.length, byHandle };
}

function validatePacketMap(packetMap, structureBlockers, readinessBlockers) {
  validateAllowedKeys(packetMap, PACKET_MAP_KEYS, structureBlockers, "notebooklm_packet_map");
  if (packetMap.schema_version !== BOOKSHELF_PACKET_MAP_SCHEMA_VERSION) {
    structureBlockers.push("notebooklm_packet_map_schema_version_mismatch");
  }
  if (!isSafeId(packetMap.template_status)) {
    structureBlockers.push("notebooklm_packet_map_template_status_unsafe");
  }
  validateBoundary({
    value: packetMap.packet_boundary,
    allowedKeys: PACKET_BOUNDARY_KEYS,
    requiredTrue: ["metadata_only", "advisory_only"],
    requiredFalse: [
      "source_payloads_included",
      "notebooklm_answers_included",
      "live_notebook_ids_included",
      "live_drive_ids_included",
      "runtime_absolute_paths_included",
    ],
    trail: "notebooklm_packet_map.packet_boundary",
    blockers: structureBlockers,
  });

  const packet = objectField(packetMap, "packet", "notebooklm_packet_map", structureBlockers);
  validateAllowedKeys(packet, PACKET_KEYS, structureBlockers, "notebooklm_packet_map.packet");
  if (!isSafeId(packet.packet_handle)) structureBlockers.push("notebooklm_packet_map_packet_handle_unsafe");
  if (!isSafeLabel(packet.topic_label)) structureBlockers.push("notebooklm_packet_map_topic_label_unsafe");
  if (!isSafeLabel(packet.intended_use)) structureBlockers.push("notebooklm_packet_map_intended_use_unsafe");
  if (!isSafeLogicalRef(packet.source_ledger_ref)) {
    structureBlockers.push("notebooklm_packet_map_source_ledger_ref_unsafe");
  }

  const notebookRef = objectField(packet, "notebook_ref", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(notebookRef, NOTEBOOK_REF_KEYS, structureBlockers, "notebooklm_packet_map.packet.notebook_ref");
  if (!isSafeId(notebookRef.ref_kind)) structureBlockers.push("notebooklm_packet_map_notebook_ref_kind_unsafe");
  if (!isSafeLabel(notebookRef.ref_label)) structureBlockers.push("notebooklm_packet_map_notebook_ref_label_unsafe");

  const selection = objectField(packet, "source_selection", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(selection, SOURCE_SELECTION_KEYS, structureBlockers, "notebooklm_packet_map.packet.source_selection");
  const includeHandles = validateIdArray(
    selection.include_source_handles,
    "notebooklm_packet_map.packet.source_selection.include_source_handles",
    structureBlockers,
  );
  const excludeHandles = validateIdArray(
    selection.exclude_source_handles,
    "notebooklm_packet_map.packet.source_selection.exclude_source_handles",
    structureBlockers,
  );
  if (!isSafeLabel(selection.selection_rule)) {
    structureBlockers.push("notebooklm_packet_map_selection_rule_unsafe");
  }
  for (const handle of includeHandles) {
    if (excludeHandles.includes(handle)) structureBlockers.push(`packet_source_included_and_excluded:${handle}`);
  }
  if (includeHandles.length === 0) readinessBlockers.push("notebooklm_packet_map_has_no_included_sources");

  validateEnumArray(
    packet.allowed_warehouse_states,
    WAREHOUSE_STATES,
    "notebooklm_packet_map.packet.allowed_warehouse_states",
    structureBlockers,
  );
  validateEnumArray(
    packet.excluded_warehouse_states,
    WAREHOUSE_STATES,
    "notebooklm_packet_map.packet.excluded_warehouse_states",
    structureBlockers,
  );
  const allowedWarehouseStates = new Set(
    Array.isArray(packet.allowed_warehouse_states) ? packet.allowed_warehouse_states : [],
  );
  const excludedWarehouseStates = new Set(
    Array.isArray(packet.excluded_warehouse_states) ? packet.excluded_warehouse_states : [],
  );
  for (const state of allowedWarehouseStates) {
    if (excludedWarehouseStates.has(state)) {
      structureBlockers.push(`notebooklm_packet_map_warehouse_state_allowed_and_excluded:${state}`);
    }
  }

  const queryPolicy = objectField(packet, "query_log_policy", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(queryPolicy, QUERY_LOG_POLICY_KEYS, structureBlockers, "notebooklm_packet_map.packet.query_log_policy");
  if (queryPolicy.record_queries_as_metadata_only !== true) {
    structureBlockers.push("notebooklm_packet_map_queries_must_be_metadata_only");
  }
  if (queryPolicy.copy_answers_into_public_repo !== false) {
    structureBlockers.push("notebooklm_packet_map_public_answer_copy_must_be_false");
  }
  if (queryPolicy.copy_source_excerpts_into_public_repo !== false) {
    structureBlockers.push("notebooklm_packet_map_public_excerpt_copy_must_be_false");
  }
  if (!isSafeLogicalRef(queryPolicy.suggested_private_log_ref)) {
    structureBlockers.push("notebooklm_packet_map_private_log_ref_unsafe");
  }

  const claimPolicy = objectField(packet, "claim_policy", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(claimPolicy, PACKET_CLAIM_POLICY_KEYS, structureBlockers, "notebooklm_packet_map.packet.claim_policy");
  if (claimPolicy.notebooklm_output_claim_ceiling !== "observed") {
    structureBlockers.push("notebooklm_packet_map_output_claim_ceiling_must_be_observed");
  }
  if (claimPolicy.source_checked_claim_ceiling !== "source_supported") {
    structureBlockers.push("notebooklm_packet_map_source_checked_ceiling_must_be_source_supported");
  }
  if (claimPolicy.canon_or_owner_approval_from_packet !== false) {
    structureBlockers.push("notebooklm_packet_map_must_not_grant_canon_or_owner_approval");
  }

  const review = objectField(packet, "review", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(review, PACKET_REVIEW_KEYS, structureBlockers, "notebooklm_packet_map.packet.review");
  if (!isSafeLabel(review.packet_status)) structureBlockers.push("notebooklm_packet_map_packet_status_unsafe");
  if (!isSafeLabel(review.reviewer_role)) structureBlockers.push("notebooklm_packet_map_reviewer_role_unsafe");
  if (!isSafeLabel(review.next_owner_action)) structureBlockers.push("notebooklm_packet_map_next_owner_action_unsafe");
  if (review.packet_status !== "ready_for_manual_notebooklm_use") {
    readinessBlockers.push("notebooklm_packet_map_packet_status_not_ready");
  }

  const routes = objectField(packet, "downstream_routes", "notebooklm_packet_map.packet", structureBlockers);
  validateAllowedKeys(routes, DOWNSTREAM_ROUTE_KEYS, structureBlockers, "notebooklm_packet_map.packet.downstream_routes");
  for (const key of DOWNSTREAM_ROUTE_KEYS) {
    if (!isSafeId(routes[key])) structureBlockers.push(`notebooklm_packet_map_downstream_${key}_unsafe`);
  }

  return {
    includeHandles: canonicalStrings(includeHandles),
    excludeHandles: canonicalStrings(excludeHandles),
    allowedWarehouseStates,
    excludedWarehouseStates,
    sourceCheckedClaimCeiling: claimPolicy.source_checked_claim_ceiling,
  };
}

function validateBindingProjection(binding, structureBlockers) {
  validateAllowedKeys(
    binding,
    SOURCE_ROOT_BINDING_PROJECTION_KEYS,
    structureBlockers,
    "source_root_binding_projection",
  );
  for (const key of ["binding_ref", "project_code", "binding_id", "storage_surface", "source_payload_owner"]) {
    const value = binding[key];
    if (value === undefined || value === null) {
      structureBlockers.push(`source_root_binding_projection_${key}_required`);
      continue;
    }
    const safe = key === "binding_ref" ? isSafeLogicalRef(value) : isSafeId(value);
    if (!safe) structureBlockers.push(`source_root_binding_projection_${key}_unsafe`);
  }
  for (const key of ["source_root_label"]) {
    if (binding[key] !== undefined && binding[key] !== null && !isSafeLabel(binding[key])) {
      structureBlockers.push(`source_root_binding_projection_${key}_unsafe`);
    }
  }
  if (binding.source_root_path_is_private !== true) {
    structureBlockers.push("source_root_binding_projection_source_root_path_is_private_must_be_true");
  }
  if (binding.agent_mutation_allowed !== false) {
    structureBlockers.push("source_root_binding_projection_agent_mutation_allowed_must_be_false");
  }
  if (binding.notebooklm_upload_allowed !== false) {
    structureBlockers.push("source_root_binding_projection_notebooklm_upload_allowed_must_be_false");
  }
}

function validateMembership({
  ledgerSources,
  packetSelection,
  bindingProjection,
  readinessBlockers,
  alignmentConflicts,
}) {
  for (const handle of packetSelection.includeHandles) {
    const source = ledgerSources.byHandle.get(handle);
    if (!source) {
      alignmentConflicts.push(`packet_source_dangling_or_foreign:${handle}`);
      continue;
    }
    if (!packetSelection.allowedWarehouseStates.has(source.warehouse_state)) {
      readinessBlockers.push(`packet_source_warehouse_state_not_allowed:${handle}`);
    }
    if (packetSelection.excludedWarehouseStates.has(source.warehouse_state)) {
      readinessBlockers.push(`packet_source_warehouse_state_excluded:${handle}`);
    }
    if (!READY_WAREHOUSE_STATES.has(source.warehouse_state)) {
      readinessBlockers.push(`packet_source_warehouse_state_not_canon:${handle}`);
    }
    if (!READY_APPROVAL_STATUSES.has(source?.owner_approval?.approval_status)) {
      readinessBlockers.push(`packet_source_not_owner_approved:${handle}`);
    }
    if (!READY_APPROVER_ROLES.has(source?.owner_approval?.approved_by_role)) {
      readinessBlockers.push(`packet_source_approved_role_not_ready:${handle}`);
    }
    if (!isConcreteApprovalBasisRef(source?.owner_approval?.approval_basis_ref)) {
      readinessBlockers.push(`packet_source_approval_basis_ref_not_concrete_owner_surface:${handle}`);
    }
    if (source?.notebooklm_use?.allowed_for_packet !== true) {
      readinessBlockers.push(`packet_source_membership_not_allowed:${handle}`);
    }
    if (source.legacy_bookshelf_state_alias !== source.warehouse_state) {
      readinessBlockers.push(`packet_source_legacy_state_alias_mismatch:${handle}`);
    }
    if (source?.review_state?.claim_ceiling !== packetSelection.sourceCheckedClaimCeiling) {
      readinessBlockers.push(`packet_source_claim_ceiling_not_aligned:${handle}`);
    }
    if (!READY_REVIEW_STATUSES.has(source?.review_state?.review_status)) {
      readinessBlockers.push(`packet_source_review_status_not_ready:${handle}`);
    }
  }

  for (const handle of packetSelection.excludeHandles) {
    if (handle === TEMPLATE_EXCLUDED_SOURCE_HANDLE) continue;
    const source = ledgerSources.byHandle.get(handle);
    if (!source) {
      alignmentConflicts.push(`packet_excluded_source_dangling_or_foreign:${handle}`);
      continue;
    }
    if (!packetSelection.excludedWarehouseStates.has(source.warehouse_state)) {
      readinessBlockers.push(`packet_excluded_source_state_not_excluded:${handle}`);
    }
  }

  const selectedSourceSurfaces = new Set(
    packetSelection.includeHandles
      .map((handle) => ledgerSources.byHandle.get(handle))
      .filter(Boolean)
      .map((source) => source?.storage_locator?.storage_surface)
      .filter((value) => typeof value === "string"),
  );
  if (
    bindingProjection.storage_surface !== undefined &&
    selectedSourceSurfaces.size > 0 &&
    (selectedSourceSurfaces.size !== 1 || !selectedSourceSurfaces.has(bindingProjection.storage_surface))
  ) {
    alignmentConflicts.push("source_root_binding_storage_surface_foreign");
  }
}

function validateStorageLocator(value, sourceTrail, blockers) {
  const locator = nestedObject(value, `${sourceTrail}.storage_locator`, blockers);
  validateAllowedKeys(locator, STORAGE_LOCATOR_KEYS, blockers, `${sourceTrail}.storage_locator`);
  for (const key of STORAGE_LOCATOR_KEYS) {
    if (!isSafeLabel(locator[key])) blockers.push(`${sourceTrail}.storage_locator.${key}_unsafe`);
  }
}

function validateVersion(value, sourceTrail, blockers) {
  const version = nestedObject(value, `${sourceTrail}.version`, blockers);
  validateAllowedKeys(version, VERSION_KEYS, blockers, `${sourceTrail}.version`);
  if (!isSafeLabel(version.version_label)) blockers.push(`${sourceTrail}.version.version_label_unsafe`);
  if (!isDateOrTemplate(version.effective_date)) blockers.push(`${sourceTrail}.version.effective_date_invalid`);
  for (const key of ["supersedes_handle", "superseded_by_handle"]) {
    if (version[key] !== null && !isSafeId(version[key])) blockers.push(`${sourceTrail}.version.${key}_unsafe`);
  }
}

function validateOwnerApproval(value, sourceTrail, blockers) {
  const approval = nestedObject(value, `${sourceTrail}.owner_approval`, blockers);
  validateAllowedKeys(approval, OWNER_APPROVAL_KEYS, blockers, `${sourceTrail}.owner_approval`);
  if (!isSafeLabel(approval.approval_status)) blockers.push(`${sourceTrail}.owner_approval.approval_status_unsafe`);
  if (!isSafeLabel(approval.approved_by_role)) blockers.push(`${sourceTrail}.owner_approval.approved_by_role_unsafe`);
  if (!isSafeLogicalRef(approval.approval_basis_ref)) {
    blockers.push(`${sourceTrail}.owner_approval.approval_basis_ref_unsafe`);
  }
  if (!isSafeLabel(approval.approval_note)) blockers.push(`${sourceTrail}.owner_approval.approval_note_unsafe`);
}

function validateNotebooklmUse(value, sourceTrail, blockers) {
  const use = nestedObject(value, `${sourceTrail}.notebooklm_use`, blockers);
  validateAllowedKeys(use, NOTEBOOKLM_USE_KEYS, blockers, `${sourceTrail}.notebooklm_use`);
  if (typeof use.allowed_for_packet !== "boolean") {
    blockers.push(`${sourceTrail}.notebooklm_use.allowed_for_packet_must_be_boolean`);
  }
  validateLabelArray(use.packet_scope, `${sourceTrail}.notebooklm_use.packet_scope`, blockers);
  if (!isSafeLabel(use.excluded_reason)) blockers.push(`${sourceTrail}.notebooklm_use.excluded_reason_unsafe`);
}

function validateReviewState(value, sourceTrail, blockers) {
  const review = nestedObject(value, `${sourceTrail}.review_state`, blockers);
  validateAllowedKeys(review, REVIEW_STATE_KEYS, blockers, `${sourceTrail}.review_state`);
  if (!CLAIM_CEILINGS.has(review.claim_ceiling)) blockers.push(`${sourceTrail}.review_state.claim_ceiling_unknown`);
  if (!isSafeId(review.review_status)) blockers.push(`${sourceTrail}.review_state.review_status_unsafe`);
  if (!isSafeLabel(review.next_owner_action)) blockers.push(`${sourceTrail}.review_state.next_owner_action_unsafe`);
}

function validateTags(value, sourceTrail, blockers) {
  const tags = nestedObject(value, `${sourceTrail}.tags`, blockers);
  validateAllowedKeys(tags, TAG_KEYS, blockers, `${sourceTrail}.tags`);
  for (const key of TAG_KEYS) validateLabelArray(tags[key], `${sourceTrail}.tags.${key}`, blockers);
}

function validateAudit(value, sourceTrail, blockers) {
  const audit = nestedObject(value, `${sourceTrail}.audit`, blockers);
  validateAllowedKeys(audit, AUDIT_KEYS, blockers, `${sourceTrail}.audit`);
  for (const key of ["created_at_utc", "updated_at_utc"]) {
    if (!isTimestampOrTemplate(audit[key])) blockers.push(`${sourceTrail}.audit.${key}_invalid`);
  }
  if (!isSafeId(audit.created_by_role)) blockers.push(`${sourceTrail}.audit.created_by_role_unsafe`);
}

function validateBoundary({ value, allowedKeys, requiredTrue, requiredFalse, trail, blockers }) {
  const boundary = nestedObject(value, trail, blockers);
  validateAllowedKeys(boundary, allowedKeys, blockers, trail);
  for (const key of requiredTrue) {
    if (boundary[key] !== true) blockers.push(`${trail}.${key}_must_be_true`);
  }
  for (const key of requiredFalse) {
    if (boundary[key] !== false) blockers.push(`${trail}.${key}_must_be_false`);
  }
}

function validateEnumArray(value, allowed, trail, blockers, { requireAll = false } = {}) {
  if (!Array.isArray(value)) {
    blockers.push(`${trail}_must_be_array`);
    return [];
  }
  const seen = new Set();
  for (const entry of value) {
    if (!allowed.has(entry)) blockers.push(`${trail}_contains_unknown_value`);
    if (seen.has(entry)) blockers.push(`${trail}_contains_duplicate`);
    seen.add(entry);
  }
  if (requireAll && (seen.size !== allowed.size || [...allowed].some((entry) => !seen.has(entry)))) {
    blockers.push(`${trail}_must_include_exact_v0_states`);
  }
  return value;
}

function validateIdArray(value, trail, blockers) {
  if (!Array.isArray(value)) {
    blockers.push(`${trail}_must_be_array`);
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (!isSafeId(entry)) {
      blockers.push(`${trail}_contains_unsafe_id`);
      continue;
    }
    if (seen.has(entry)) blockers.push(`${trail}_contains_duplicate:${entry}`);
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function validateLabelArray(value, trail, blockers) {
  if (!Array.isArray(value)) {
    blockers.push(`${trail}_must_be_array`);
    return [];
  }
  const seen = new Set();
  for (const entry of value) {
    if (!isSafeLabel(entry)) blockers.push(`${trail}_contains_unsafe_label`);
    if (seen.has(entry)) blockers.push(`${trail}_contains_duplicate`);
    seen.add(entry);
  }
  return value;
}

function objectField(parent, key, parentTrail, blockers) {
  return nestedObject(parent?.[key], `${parentTrail}.${key}`, blockers);
}

function nestedObject(value, trail, blockers) {
  if (!isPlainObject(value)) {
    blockers.push(`${trail}_must_be_object`);
    return {};
  }
  return value;
}

function validateAllowedKeys(value, allowedKeys, blockers, trail) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) blockers.push(`additional_key:${trail}.${displayKeySegment(key)}`);
  }
}

function findSafetyBlockers(value, trail = "bundle") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => blockers.push(...findSafetyBlockers(entry, `${trail}[${index}]`)));
    return blockers;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      const safeKey = displayKeySegment(key);
      if (isForbiddenKey(normalizedKey)) blockers.push(`forbidden_field:${trail}.${safeKey}`);
      blockers.push(...findSafetyBlockers(child, `${trail}.${safeKey}`));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
  if (hasAbsolutePath(value)) blockers.push(`forbidden_absolute_path_value:${trail}`);
  if (hasUrl(value)) blockers.push(`forbidden_url_value:${trail}`);
  if (hasAccountValue(value)) blockers.push(`forbidden_account_value:${trail}`);
  if (hasSecretValue(value)) blockers.push(`forbidden_secret_value:${trail}`);
  return blockers;
}

function isForbiddenKey(key) {
  if (FORBIDDEN_KEYS.has(key)) return true;
  return /(?:^|_)(?:password|passwd|token|secret|cookie|session|credential|credentials)$/.test(key);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) && isSafeScalar(value);
}

function isSafeLabel(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && isSafeScalar(value);
}

function isSafeLogicalRef(value) {
  if (typeof value !== "string" || !SAFE_TEMPLATE_REF_PATTERN.test(value)) return false;
  if (value.includes("\\") || value.startsWith("/") || value.startsWith("~")) return false;
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  const placeholders = value.match(/<[^>]+>/g) ?? [];
  if (placeholders.some((placeholder) => !["<project_code>", "<packet_ref>", "<scope>"].includes(placeholder))) {
    return false;
  }
  if (hasAbsolutePath(value) || hasUrl(value) || hasSecretPathSegment(value)) return false;
  return isSafeScalar(value);
}

function isSafeScalar(value) {
  return !/[\u0000-\u001F\u007F]/u.test(value) &&
    !hasAbsolutePath(value) &&
    !hasUrl(value) &&
    !hasAccountValue(value) &&
    !hasSecretValue(value);
}

function isDateOrTemplate(value) {
  if (value === "YYYY-MM-DD") return true;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isTimestampOrTemplate(value) {
  if (value === "YYYY-MM-DDTHH:MM:SSZ") return true;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function hasTemplatePlaceholder(value) {
  return typeof value === "string" && /<[^>]+>/.test(value);
}

function isConcreteApprovalBasisRef(value) {
  return typeof value === "string" &&
    !hasTemplatePlaceholder(value) &&
    /^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}\/reports\/source_intake\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}\.ya?ml$/.test(value) &&
    isSafeLogicalRef(value);
}

function hasAbsolutePath(value) {
  const text = String(value ?? "");
  const boundary = String.raw`(?:^|[\s"'(=,:])`;
  return new RegExp(`${boundary}[A-Za-z]:[\\\\/]`).test(text) ||
    new RegExp(`${boundary}\\\\\\\\(?:\\?\\\\|\.\\\\|[^\\\\\\s]+\\\\)`).test(text) ||
    new RegExp(`${boundary}\/(?:\/|$|(?!\\s)[^\\r\\n/]+(?:\/|$))`).test(text) ||
    /(^|[\s"'(])file:\/\//i.test(text);
}

function hasUrl(value) {
  return /\b[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(String(value ?? ""));
}

function hasAccountValue(value) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(String(value ?? ""));
}

function hasSecretValue(value) {
  const text = String(value ?? "");
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(text) ||
    /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie)\s*[:=]\s*["']?[^"'\s]{8,}/i.test(text) ||
    /\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i.test(text);
}

function hasSecretPathSegment(value) {
  return /(^|[/_.-])(?:secret|token|cookie|credential|session|password|passwd|private_key|api_key)([/_.-]|$)/i.test(
    String(value ?? ""),
  );
}

function hasMetadataOnlyBoundary(ledger, packetMap) {
  const ledgerBoundary = ledger?.metadata_boundary;
  const packetBoundary = packetMap?.packet_boundary;
  return ledgerBoundary?.metadata_only === true &&
    [
      "source_payloads_included",
      "notebooklm_answers_included",
      "live_drive_ids_included",
      "runtime_absolute_paths_included",
      "secrets_or_account_state_included",
    ].every((key) => ledgerBoundary?.[key] === false) &&
    packetBoundary?.metadata_only === true &&
    packetBoundary?.advisory_only === true &&
    [
      "source_payloads_included",
      "notebooklm_answers_included",
      "live_notebook_ids_included",
      "live_drive_ids_included",
      "runtime_absolute_paths_included",
    ].every((key) => packetBoundary?.[key] === false);
}

function isRedactedBindingProjection(binding) {
  if (!isPlainObject(binding)) return false;
  if (Object.keys(binding).some((key) => !SOURCE_ROOT_BINDING_PROJECTION_KEYS.has(key))) return false;
  if (!isSafeLogicalRef(binding.binding_ref)) return false;
  if (!["project_code", "binding_id", "storage_surface", "source_payload_owner"].every((key) =>
    isSafeId(binding[key]))) return false;
  if (binding.source_root_label !== undefined && !isSafeLabel(binding.source_root_label)) return false;
  if (binding.source_root_path_is_private !== true) return false;
  if (binding.agent_mutation_allowed !== false) return false;
  if (binding.notebooklm_upload_allowed !== false) return false;
  return findSafetyBlockers(binding, "source_root_binding_projection").length === 0;
}

function safeOutputId(value) {
  return isSafeId(value) ? value : null;
}

function displayKeySegment(key) {
  return PUBLIC_CONTRACT_KEYS.has(key) ? key : `unknown_${sha256(String(key)).slice(0, 12)}`;
}

function canonicalStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string"))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, sortValue(value[key])]),
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
