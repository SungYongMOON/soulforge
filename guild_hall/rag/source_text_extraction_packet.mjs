import crypto from "node:crypto";
import path from "node:path";
import { normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";
import { loadSourceSliceCards, validateSourceSliceCards } from "./rag.mjs";
import {
  loadSourceTextMetadataProfile,
  sourceTextMetadataProfileFingerprint,
  validateSourceTextMetadataProfile,
} from "./source_text_profile.mjs";

export const SOURCE_TEXT_EXTRACTION_PACKET_SCHEMA_VERSION = "soulforge.source_text_extraction_packet.v0";
export const SOURCE_TEXT_EXTRACTION_PACKET_VALIDATION_SCHEMA_VERSION =
  "soulforge.source_text_extraction_packet_validation.v0";
export const SOURCE_TEXT_EXTRACTION_PACKET_GENERATOR_ID =
  "guild_hall.rag.source_text_extraction_packet_generator.v0";

const DEFAULT_SOURCE_TEXT_EXTRACTION_PACKET_ROOT =
  "_workmeta/system/reports/rag/source_text_extraction_packets";
const DEFAULT_SOURCE_TEXT_EXTRACTION_RUN_ROOT =
  "_workmeta/system/reports/rag/source_text_extraction_runs";
const DEFAULT_PACKET_ID = "source_text_extraction_packet_v0";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,80}$/;
const PACKET_STATUSES = new Set(["draft_preflight_not_executed"]);
const EXECUTION_MODES = new Set(["dry_run_preflight"]);
const PAYLOAD_FIELD_NAMES = new Set([
  "answer",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_text",
  "content",
  "excerpt",
  "html",
  "notebooklm_answer",
  "payload",
  "private_payload",
  "raw",
  "raw_payload",
  "source_body",
  "source_text",
  "text",
]);

export async function buildSourceTextExtractionPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? await loadSourceTextMetadataProfile({
    repoRoot,
    profileRef: options.profileRef,
  });
  const profileValidation = validateSourceTextMetadataProfile(profile);
  if (profileValidation.status !== "pass") {
    throw new Error(`source_text_extraction_packet_requires_valid_profile:${profileValidation.blockers.join(",")}`);
  }

  const sourceSliceRef = options.sourceSliceRef ?? profile.scope?.source_slice_ref ?? null;
  const cardSet = sourceSliceRef
    ? options.cardSet ?? await loadSourceSliceCards({ repoRoot, sourceSliceRef })
    : null;
  if (cardSet) {
    const cardValidation = validateSourceSliceCards(cardSet);
    if (cardValidation.status !== "pass") {
      throw new Error(`source_text_extraction_packet_requires_valid_source_slice_cards:${cardValidation.blockers.join(",")}`);
    }
  }

  const packetId = normalizeSimpleId(options.packetId ?? `source_text_extraction_${profile.profile_id ?? DEFAULT_PACKET_ID}`, "packet_id");
  const executionMode = normalizeExecutionMode(options.executionMode ?? "dry_run_preflight");
  const generatedAtUtc = formatTimestampUtc(options.now);
  const metadataFieldPolicy = buildMetadataFieldPolicy(profile);
  const adapterPlan = buildAdapterPlan(profile);
  const targetItems = buildTargetItems({
    cardSet,
    packetId,
  });
  const logImportTasks = buildLogImportTasks(profile);

  return {
    schema_version: SOURCE_TEXT_EXTRACTION_PACKET_SCHEMA_VERSION,
    kind: "source_text_extraction_packet",
    status: "draft_preflight_not_executed",
    packet_id: packetId,
    generator_id: SOURCE_TEXT_EXTRACTION_PACKET_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      profile_ref: options.profileRef ?? null,
      profile_id: profile.profile_id,
      profile_fingerprint: sourceTextMetadataProfileFingerprint(profile),
      source_slice_ref: sourceSliceRef,
      slice_set_id: cardSet?.slice_set_id ?? profile.source_slice_summary?.slice_set_id ?? null,
      extraction_log_refs: profile.scope?.extraction_log_refs ?? [],
    },
    boundary: sourceTextExtractionPacketBoundary(),
    execution_policy: {
      purpose: "preflight_packet_for_future_source_text_extractor",
      execution_mode: executionMode,
      packet_is_not_owner_approval: true,
      packet_does_not_execute_extractor: true,
      runner_action_allowed_now: "validate_and_report_only",
      source_text_read_allowed: false,
      private_payload_write_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
      requires_explicit_next_approval: [
        "source_text_retrieval_scope",
        "payload_output_worksite",
        "extractor_adapter_execution",
        "chunking_or_index_build",
      ],
      hwp_policy: "hwp_must_be_exported_to_hwpx_before_body_reading",
    },
    metadata_field_policy: metadataFieldPolicy,
    adapter_plan: adapterPlan,
    planned_outputs: plannedOutputs({ packetId, projectCode: options.projectCode }),
    counts: {
      target_count: targetItems.length,
      log_import_task_count: logImportTasks.length,
      metadata_field_count: metadataFieldPolicy.required_output_field_ids.length,
      adapter_route_count: adapterPlan.routes.length,
      target_status_counts: countBy(targetItems.map((item) => item.target_status)),
      adapter_counts: countBy(targetItems.map((item) => item.adapter_route.adapter_id)),
    },
    log_import_tasks: logImportTasks,
    target_items: targetItems,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceTextExtractionPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const packet = await buildSourceTextExtractionPacket(options);
  const outputRef = options.outputRef ?? defaultSourceTextExtractionPacketOutputRef({
    packet,
    projectCode: options.projectCode,
  });
  const outputPath = path.join(repoRoot, safeSourceTextExtractionPacketOutputPath(outputRef));
  await writeJson(outputPath, packet);
  return {
    status: "written",
    packet_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    packet_id: packet.packet_id,
    target_count: packet.counts.target_count,
    log_import_task_count: packet.counts.log_import_task_count,
    metadata_field_count: packet.counts.metadata_field_count,
    target_status_counts: packet.counts.target_status_counts,
  };
}

export async function loadSourceTextExtractionPacket({ repoRoot = process.cwd(), packetRef } = {}) {
  if (!packetRef) throw new Error("source_text_extraction_packet_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(packetRef)));
}

export function validateSourceTextExtractionPacket(packet) {
  const blockers = [];
  if (packet?.schema_version !== SOURCE_TEXT_EXTRACTION_PACKET_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (packet?.kind !== "source_text_extraction_packet") blockers.push("kind_must_be_source_text_extraction_packet");
  if (!PACKET_STATUSES.has(packet?.status)) blockers.push("packet_status_unknown");
  if (!isSafeId(packet?.packet_id)) blockers.push("packet_id_unsafe");

  const boundary = packet?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.packet_is_not_owner_approval !== true) blockers.push("packet_must_not_be_owner_approval");
  if (boundary.packet_does_not_execute_extractor !== true) blockers.push("packet_must_not_execute_extractor");
  if (boundary.source_text_read_allowed !== false) blockers.push("source_text_read_must_not_be_allowed");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_or_vector_index_included !== false) blockers.push("bm25_or_vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.private_payload_write_allowed !== false) blockers.push("private_payload_write_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");

  const policy = packet?.execution_policy ?? {};
  if (!EXECUTION_MODES.has(policy.execution_mode)) blockers.push("execution_mode_unknown");
  if (policy.packet_is_not_owner_approval !== true) blockers.push("policy_packet_must_not_be_owner_approval");
  if (policy.packet_does_not_execute_extractor !== true) blockers.push("policy_packet_must_not_execute_extractor");
  if (policy.source_text_read_allowed !== false) blockers.push("policy_source_text_read_must_not_be_allowed");
  if (policy.private_payload_write_allowed !== false) blockers.push("policy_private_payload_write_must_not_be_allowed");
  if (policy.index_build_allowed !== false) blockers.push("policy_index_build_must_not_be_allowed");
  if (policy.notebooklm_packet_membership_allowed !== false) blockers.push("policy_notebooklm_packet_must_not_be_allowed");
  if (policy.public_canon_promotion_allowed !== false) blockers.push("policy_public_canon_promotion_must_not_be_allowed");

  validateSourceRefs(packet?.source_refs ?? {}, blockers);
  validateMetadataFieldPolicy(packet?.metadata_field_policy ?? {}, blockers);
  validateAdapterPlan(packet?.adapter_plan ?? {}, blockers);
  validatePlannedOutputs(packet?.planned_outputs ?? {}, blockers);

  for (const task of arrayField(packet, "log_import_tasks", blockers, { required: false })) {
    if (!isSafeId(task?.task_ref)) blockers.push("log_import_task_ref_unsafe");
    if (!isSafeMetadataRef(task?.log_ref)) blockers.push("log_import_log_ref_unsafe");
    if (!isSafeId(task?.adapter_id)) blockers.push("log_import_adapter_id_unsafe");
    if (task?.payload_values_copied !== false) blockers.push("log_import_payload_values_must_not_be_copied");
    if (task?.source_text_read_allowed !== false) blockers.push("log_import_source_text_read_must_not_be_allowed");
    for (const fieldId of arrayField(task, "usable_metadata_columns", blockers, { required: false })) {
      if (!isSafeFieldId(fieldId)) blockers.push("log_import_metadata_column_unsafe");
      if (PAYLOAD_FIELD_NAMES.has(fieldId)) blockers.push(`log_import_payload_column_forbidden:${fieldId}`);
    }
  }

  const targetRefs = new Set();
  for (const item of arrayField(packet, "target_items", blockers, { required: false })) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      blockers.push("target_item_must_be_object");
      continue;
    }
    if (!isSafeId(item.target_ref)) blockers.push("target_ref_unsafe");
    if (targetRefs.has(item.target_ref)) blockers.push("target_ref_duplicate");
    targetRefs.add(item.target_ref);
    if (!isSafeMetadataRef(item.source_slice_ref)) blockers.push("target_source_slice_ref_unsafe");
    if (!isSafeId(item.source_handle)) blockers.push("target_source_handle_unsafe");
    if (!isSafeMetadataRef(item.source_locator_ref)) blockers.push("target_source_locator_ref_unsafe");
    if (!isSafeId(item.adapter_route?.adapter_id)) blockers.push("target_adapter_id_unsafe");
    const grants = item.execution_grants ?? {};
    if (grants.metadata_preflight !== true) blockers.push("target_metadata_preflight_must_be_true");
    if (grants.source_text_read !== false) blockers.push("target_source_text_read_must_be_false");
    if (grants.private_payload_write !== false) blockers.push("target_private_payload_write_must_be_false");
    if (grants.index_build !== false) blockers.push("target_index_build_must_be_false");
    for (const code of arrayField(item, "blocker_codes", blockers, { required: false })) {
      if (!isSafeId(code)) blockers.push("target_blocker_code_unsafe");
    }
  }

  blockers.push(...findUnsafePacketStrings(packet));
  return {
    schema_version: SOURCE_TEXT_EXTRACTION_PACKET_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_extraction_packet_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    packet_id: packet?.packet_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      not_owner_approval: boundary.packet_is_not_owner_approval === true,
      no_extractor_execution: boundary.packet_does_not_execute_extractor === true,
      no_source_text_read: boundary.source_text_read_allowed === false,
      no_source_payloads: boundary.source_payloads_included === false,
      no_chunk_payloads: boundary.chunk_payloads_included === false,
      no_index_build: boundary.index_build_allowed === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    },
  };
}

function sourceTextExtractionPacketBoundary() {
  return {
    metadata_only: true,
    packet_is_not_owner_approval: true,
    packet_does_not_execute_extractor: true,
    source_text_read_allowed: false,
    source_payloads_included: false,
    chunk_payloads_included: false,
    embeddings_included: false,
    bm25_or_vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    private_payload_write_allowed: false,
    index_build_allowed: false,
    public_canon_promotion_allowed: false,
  };
}

function buildMetadataFieldPolicy(profile) {
  const fields = profile.metadata_field_catalog?.fields ?? [];
  const safeFields = fields.filter((field) => isSafeFieldId(field.field_id) && !PAYLOAD_FIELD_NAMES.has(field.field_id));
  return {
    purpose: "metadata_fields_future_extractor_must_preserve_or_compute",
    profile_field_count: fields.length,
    required_output_field_ids: safeFields.map((field) => field.field_id).sort(),
    field_category_counts: countBy(safeFields.map((field) => field.category ?? "unknown")),
    value_policy_counts: countBy(safeFields.map((field) => field.value_policy ?? "unknown")),
    blocked_payload_field_candidate_count:
      profile.metadata_field_catalog?.blocked_payload_field_candidate_count ?? 0,
    payload_field_policy: {
      reject_as_extractable: [...PAYLOAD_FIELD_NAMES].sort(),
      payload_values_copied: false,
      excerpts_allowed: false,
    },
  };
}

function buildAdapterPlan(profile) {
  const profileAdapters = profile.extractor_adapter_candidates ?? [];
  return {
    purpose: "route_each_target_to_a_future_extractor_without_running_it",
    default_execution_mode: "dry_run_preflight",
    adapter_candidates: [
      ...profileAdapters.map((adapter) => ({
        adapter_id: adapter.adapter_id,
        current_state: adapter.current_state,
        role: adapter.role,
      })),
      {
        adapter_id: "metadata_file_preflight",
        current_state: "built_in_preflight_route",
        role: "inspect metadata file shape only after a later approved runner exists",
      },
    ],
    routes: [
      {
        route_id: "route_existing_extraction_status_csv",
        matcher: "extraction_log_ref:*.csv",
        adapter_id: "existing_extraction_status_csv_importer",
        planned_action: "import_column_counts_and_status_counts_only",
        source_text_read_required: false,
      },
      {
        route_id: "route_hwp_preprocess",
        matcher: "extension:.hwp",
        adapter_id: "hwp_to_hwpx_preprocess",
        planned_action: "export_hwpx_before_any_body_reading",
        source_text_read_required: false,
      },
      {
        route_id: "route_structured_document_converter",
        matcher: "extension:.pdf|.docx|.pptx|.xlsx|.hwpx",
        adapter_id: "docling_document_converter",
        planned_action: "future_owner_approved_structured_conversion",
        source_text_read_required: true,
      },
      {
        route_id: "route_unstructured_partition",
        matcher: "extension:.html|.txt|.md|unknown_document",
        adapter_id: "unstructured_partition",
        planned_action: "future_owner_approved_element_partitioning",
        source_text_read_required: true,
      },
      {
        route_id: "route_metadata_file_preflight",
        matcher: "extension:.yaml|.yml|.json|.mjs|.js",
        adapter_id: "metadata_file_preflight",
        planned_action: "metadata_shape_preflight_only",
        source_text_read_required: false,
      },
    ],
  };
}

function buildLogImportTasks(profile) {
  return (profile.extraction_log_summaries ?? []).map((log) => ({
    task_ref: `source_text_log_import:${stableHash(log.log_ref).slice(0, 16)}`,
    log_ref: log.log_ref,
    adapter_id: "existing_extraction_status_csv_importer",
    planned_action: "reuse_existing_extraction_log_metadata_only",
    payload_values_copied: false,
    source_text_read_allowed: false,
    row_count: log.row_count ?? 0,
    column_count: log.column_count ?? 0,
    usable_metadata_columns: (log.usable_metadata_columns ?? []).filter((column) => isSafeFieldId(column) && !PAYLOAD_FIELD_NAMES.has(column)),
    status_counts: log.status_counts ?? {},
    extension_counts: log.extension_counts ?? {},
    blocked_or_error_count: log.blocked_or_error_count ?? 0,
  }));
}

function buildTargetItems({ cardSet, packetId }) {
  const cards = cardSet?.cards ?? [];
  return cards.map((card) => {
    const adapterRoute = chooseAdapterRoute(card);
    const blockerCodes = new Set(card.blocker_codes ?? []);
    blockerCodes.add("source_text_retrieval_not_approved");
    return {
      target_ref: `source_text_target:${stableHash(`${packetId}:${card.source_slice_ref}`).slice(0, 16)}`,
      source_slice_ref: card.source_slice_ref,
      source_handle: card.source_handle,
      source_locator_ref: card.source_locator_ref,
      source_hash: card.source_hash ?? null,
      source_kind: card.source_kind ?? "unknown",
      source_class: card.source_class ?? "unknown",
      sensitivity: card.sensitivity ?? "unknown",
      claim_ceiling: card.claim_ceiling ?? "observed",
      owner_approval: card.owner_approval ?? "unknown",
      warehouse_state: card.warehouse_state ?? "unknown",
      card_metadata_fingerprint: card.metadata_fingerprint ?? null,
      covered_graph_node_count: card.covered_graph_node_count ?? 0,
      target_status: "planned_metadata_preflight_only",
      adapter_route: adapterRoute,
      execution_grants: {
        metadata_preflight: true,
        source_text_read: false,
        private_payload_write: false,
        index_build: false,
      },
      blocker_codes: [...blockerCodes].filter(isSafeId).sort(),
    };
  }).sort((left, right) => left.source_slice_ref.localeCompare(right.source_slice_ref));
}

function chooseAdapterRoute(card) {
  const extension = extensionFromRef(card.source_locator_ref);
  if (extension === ".hwp") {
    return {
      adapter_id: "hwp_to_hwpx_preprocess",
      route_reason: "hwp_requires_hwpx_before_body_reading",
      planned_action: "preprocess_only_after_owner_approval",
      source_text_read_required: false,
    };
  }
  if ([".pdf", ".docx", ".pptx", ".xlsx", ".hwpx"].includes(extension)) {
    return {
      adapter_id: "docling_document_converter",
      route_reason: `structured_document_extension:${extension}`,
      planned_action: "future_owner_approved_structured_conversion",
      source_text_read_required: true,
    };
  }
  if ([".html", ".txt", ".md"].includes(extension)) {
    return {
      adapter_id: "unstructured_partition",
      route_reason: `partitionable_text_extension:${extension}`,
      planned_action: "future_owner_approved_partitioning",
      source_text_read_required: true,
    };
  }
  if ([".yaml", ".yml", ".json", ".mjs", ".js"].includes(extension)) {
    return {
      adapter_id: "metadata_file_preflight",
      route_reason: `metadata_file_extension:${extension}`,
      planned_action: "metadata_shape_preflight_only",
      source_text_read_required: false,
    };
  }
  return {
    adapter_id: "unstructured_partition",
    route_reason: "unknown_extension",
    planned_action: "future_owner_review_required",
    source_text_read_required: true,
  };
}

function plannedOutputs({ packetId, projectCode }) {
  const root = projectCode
    ? normalizeRepoPath(path.join("_workmeta", normalizeSimpleId(projectCode, "project_code"), "reports", "rag", "source_text_extraction_runs"))
    : DEFAULT_SOURCE_TEXT_EXTRACTION_RUN_ROOT;
  return {
    metadata_run_report_ref: normalizeRepoPath(path.join(root, packetId, "source_text_extraction_run_report.json")),
    target_result_ref_root: normalizeRepoPath(path.join(root, packetId, "targets")),
    private_payload_ref: null,
    payload_output_policy: "not_allowed_until_owner_approved_worksite_is_selected",
    index_output_policy: "not_allowed_in_this_packet",
  };
}

function validateSourceRefs(sourceRefs, blockers) {
  if (sourceRefs.profile_ref !== null && !isSafeMetadataRef(sourceRefs.profile_ref)) blockers.push("profile_ref_unsafe");
  if (!isSafeId(sourceRefs.profile_id)) blockers.push("profile_id_unsafe");
  if (!isSafeId(sourceRefs.profile_fingerprint)) blockers.push("profile_fingerprint_unsafe");
  if (sourceRefs.source_slice_ref !== null && !isSafeMetadataRef(sourceRefs.source_slice_ref)) blockers.push("source_slice_ref_unsafe");
  if (sourceRefs.slice_set_id !== null && !isSafeId(sourceRefs.slice_set_id)) blockers.push("slice_set_id_unsafe");
  for (const ref of arrayField(sourceRefs, "extraction_log_refs", blockers, { required: false })) {
    if (!isSafeMetadataRef(ref)) blockers.push("extraction_log_ref_unsafe");
  }
}

function validateMetadataFieldPolicy(policy, blockers) {
  for (const fieldId of arrayField(policy, "required_output_field_ids", blockers)) {
    if (!isSafeFieldId(fieldId)) blockers.push("required_output_field_id_unsafe");
    if (PAYLOAD_FIELD_NAMES.has(fieldId)) blockers.push(`payload_field_must_not_be_extractable:${fieldId}`);
  }
  for (const fieldId of arrayField(policy.payload_field_policy ?? {}, "reject_as_extractable", blockers)) {
    if (!PAYLOAD_FIELD_NAMES.has(fieldId)) blockers.push("payload_reject_list_contains_unknown_field");
  }
  if (policy.payload_field_policy?.payload_values_copied !== false) blockers.push("payload_values_must_not_be_copied");
  if (policy.payload_field_policy?.excerpts_allowed !== false) blockers.push("excerpts_must_not_be_allowed");
}

function validateAdapterPlan(plan, blockers) {
  for (const adapter of arrayField(plan, "adapter_candidates", blockers)) {
    if (!isSafeId(adapter?.adapter_id)) blockers.push("adapter_candidate_id_unsafe");
  }
  for (const route of arrayField(plan, "routes", blockers)) {
    if (!isSafeId(route?.route_id)) blockers.push("adapter_route_id_unsafe");
    if (!isSafeRouteMatcher(route?.matcher)) blockers.push("adapter_route_matcher_unsafe");
    if (!isSafeId(route?.adapter_id)) blockers.push("adapter_route_adapter_id_unsafe");
    if (![true, false].includes(route?.source_text_read_required)) blockers.push("adapter_route_source_text_required_must_be_boolean");
  }
}

function validatePlannedOutputs(outputs, blockers) {
  if (!isSafeMetadataRef(outputs.metadata_run_report_ref)) blockers.push("metadata_run_report_ref_unsafe");
  if (!isSafeMetadataRef(outputs.target_result_ref_root)) blockers.push("target_result_ref_root_unsafe");
  if (outputs.private_payload_ref !== null) blockers.push("private_payload_ref_must_be_null");
}

function safeSourceTextExtractionPacketOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_TEXT_EXTRACTION_PACKET_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_text_extraction_packets\//.test(ref)
  ) {
    throw new Error("source text extraction packet output must be under _workmeta/system/reports/rag/source_text_extraction_packets/ or _workmeta/<project_code>/reports/rag/source_text_extraction_packets/");
  }
  return ref;
}

function defaultSourceTextExtractionPacketOutputRef({ packet, projectCode }) {
  const filename = "source_text_extraction_packet.json";
  if (projectCode) {
    const code = normalizeSimpleId(projectCode, "project_code");
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_text_extraction_packets", packet.packet_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_TEXT_EXTRACTION_PACKET_ROOT, packet.packet_id, filename));
}

function safeRepoRelativePath(value) {
  const ref = normalizeRepoPath(value);
  if (!isSafeMetadataRef(ref)) throw new Error(`unsafe repo-relative path: ${value}`);
  return ref;
}

function isSafeMetadataRef(value) {
  const ref = String(value ?? "");
  if (!ref || path.isAbsolute(ref) || ref.includes("..")) return false;
  if (ref.includes("\\") || ref.startsWith("~") || /[\u0000-\u001F\u007F]/u.test(ref)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(ref)) return false;
  if (/[A-Za-z]:[\\/]/.test(ref)) return false;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(ref)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) return false;
  return true;
}

function findUnsafePacketStrings(value, trail = "packet") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findUnsafePacketStrings(item, `${trail}[${index}]`)));
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PAYLOAD_FIELD_NAMES.has(key.toLowerCase())) blockers.push(`forbidden_payload_key:${trail}.${key}`);
      blockers.push(...findUnsafePacketStrings(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) {
    blockers.push(`unsafe_url_string:${trail}`);
  }
  if (/[A-Za-z]:[\\/]/.test(value) || /\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(value)) {
    blockers.push(`unsafe_local_path_string:${trail}`);
  }
  if (/(^|[\s/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([\s/_.-]|$)/i.test(value)) {
    blockers.push(`unsafe_secret_string:${trail}`);
  }
  return blockers;
}

function arrayField(value, key, blockers, options = {}) {
  const required = options.required !== false;
  const child = value?.[key];
  if (child === undefined || child === null) {
    if (required) blockers.push(`${key}_must_be_array`);
    return [];
  }
  if (!Array.isArray(child)) {
    blockers.push(`${key}_must_be_array`);
    return [];
  }
  return child;
}

function extensionFromRef(value) {
  const extension = path.extname(String(value ?? "").split("?")[0]).toLowerCase();
  return extension || "unknown";
}

function normalizeExecutionMode(value) {
  const mode = String(value ?? "");
  if (!EXECUTION_MODES.has(mode)) throw new Error("source_text_extraction_packet_execution_mode_must_be_dry_run_preflight");
  return mode;
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = isSafeCountKey(value) ? String(value) : "unsafe_or_redacted";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function isSafeCountKey(value) {
  return /^[A-Za-z0-9가-힣_.:-]{1,160}$/u.test(String(value ?? ""));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

function isSafeFieldId(value) {
  return typeof value === "string" && FIELD_ID_PATTERN.test(value);
}

function isSafeRouteMatcher(value) {
  const matcher = String(value ?? "");
  if (!matcher || matcher.length > 180) return false;
  if (path.isAbsolute(matcher) || matcher.includes("..") || matcher.startsWith("~") || matcher.includes("\\")) {
    return false;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(matcher)) return false;
  if (/[A-Za-z]:[\\/]/.test(matcher)) return false;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(matcher)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(matcher)) {
    return false;
  }
  return /^[A-Za-z0-9_.*:|.-]+$/.test(matcher);
}

function normalizeSimpleId(value, label) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,160}$/.test(id)) throw new Error(`${label}_must_be_simple`);
  return id;
}

function formatTimestampUtc(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_timestamp");
  return date.toISOString();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
