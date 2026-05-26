import crypto from "node:crypto";
import path from "node:path";
import { normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";
import {
  loadSourceTextExtractionPacket,
  validateSourceTextExtractionPacket,
} from "./source_text_extraction_packet.mjs";

export const SOURCE_TEXT_EXTRACTION_RUN_REPORT_SCHEMA_VERSION =
  "soulforge.source_text_extraction_run_report.v0";
export const SOURCE_TEXT_EXTRACTION_RUN_REPORT_VALIDATION_SCHEMA_VERSION =
  "soulforge.source_text_extraction_run_report_validation.v0";
export const SOURCE_TEXT_EXTRACTION_RUN_REPORT_GENERATOR_ID =
  "guild_hall.rag.source_text_extraction_run_report_generator.v0";

const DEFAULT_SOURCE_TEXT_EXTRACTION_RUN_ROOT =
  "_workmeta/system/reports/rag/source_text_extraction_runs";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const REPORT_STATUSES = new Set(["dry_run_report_only", "blocked_invalid_packet"]);
const FORBIDDEN_KEYS = new Set([
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
  "secret",
  "source_body",
  "source_locator_ref",
  "source_text",
  "text",
]);

export async function buildSourceTextExtractionRunReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const packet = options.packet ?? await loadSourceTextExtractionPacket({
    repoRoot,
    packetRef: options.packetRef,
  });
  const packetValidation = validateSourceTextExtractionPacket(packet);
  const reportId = normalizeSimpleId(options.reportId ?? `source_text_extraction_run_${packet?.packet_id ?? "invalid_packet"}`, "report_id");
  const generatedAtUtc = formatTimestampUtc(options.now);
  const base = {
    schema_version: SOURCE_TEXT_EXTRACTION_RUN_REPORT_SCHEMA_VERSION,
    kind: "source_text_extraction_run_report",
    report_id: reportId,
    generator_id: SOURCE_TEXT_EXTRACTION_RUN_REPORT_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      extraction_packet_ref: options.packetRef ?? null,
      extraction_packet_id: safeIdOrNull(packet?.packet_id),
      profile_ref: safeRefOrNull(packet?.source_refs?.profile_ref),
      profile_id: safeIdOrNull(packet?.source_refs?.profile_id),
      metadata_index_ref: null,
    },
    boundary: sourceTextExtractionRunReportBoundary(),
  };

  if (packetValidation.status !== "pass") {
    return {
      ...base,
      status: "blocked_invalid_packet",
      run_policy: runPolicy(),
      counts: emptyCounts(),
      adapter_summary: [],
      blocker_summary: summarizeBlockers(packetValidation.blockers ?? []),
      target_reports: [],
      answer_engine_handoff: answerEngineHandoff({ packet, targetCount: 0 }),
      validation: {
        status: "unchecked",
        blockers: [],
        upstream_packet_validation: packetValidation,
      },
    };
  }

  const targetReports = (packet.target_items ?? []).map(buildTargetReport).sort((left, right) => {
    return left.target_ref.localeCompare(right.target_ref);
  });
  const blockerCodes = targetReports.flatMap((target) => target.blocker_codes ?? []);
  const adapterIds = targetReports.map((target) => target.adapter_id);

  return {
    ...base,
    status: "dry_run_report_only",
    run_policy: runPolicy(),
    counts: {
      target_count: targetReports.length,
      metadata_field_count: packet.counts?.metadata_field_count ?? 0,
      log_import_task_count: packet.counts?.log_import_task_count ?? 0,
      adapter_route_count: packet.counts?.adapter_route_count ?? 0,
      source_text_read_grant_count: 0,
      private_payload_write_grant_count: 0,
      index_build_grant_count: 0,
      target_status_counts: countBy(targetReports.map((target) => target.target_status)),
      adapter_counts: countBy(adapterIds),
      blocker_counts: countBy(blockerCodes),
    },
    adapter_summary: summarizeAdapters(targetReports),
    blocker_summary: summarizeBlockers(blockerCodes),
    target_reports: targetReports,
    answer_engine_handoff: answerEngineHandoff({ packet, targetCount: targetReports.length }),
    validation: {
      status: "unchecked",
      blockers: [],
      upstream_packet_validation: packetValidation.status,
    },
  };
}

export async function writeSourceTextExtractionRunReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const packet = options.packet ?? (options.packetRef
    ? await loadSourceTextExtractionPacket({ repoRoot, packetRef: options.packetRef })
    : undefined);
  const report = await buildSourceTextExtractionRunReport({ ...options, packet });
  const outputRef = options.outputRef ?? defaultSourceTextExtractionRunReportOutputRef({
    report,
    packet,
    projectCode: options.projectCode,
  });
  const outputPath = path.join(repoRoot, safeSourceTextExtractionRunReportOutputPath(outputRef));
  await writeJson(outputPath, report);
  return {
    status: "written",
    run_report_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    report_id: report.report_id,
    report_status: report.status,
    target_count: report.counts.target_count,
    source_text_read_grant_count: report.counts.source_text_read_grant_count,
    index_build_grant_count: report.counts.index_build_grant_count,
  };
}

export async function loadSourceTextExtractionRunReport({ repoRoot = process.cwd(), runReportRef } = {}) {
  if (!runReportRef) throw new Error("source_text_extraction_run_report_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(runReportRef)));
}

export function validateSourceTextExtractionRunReport(report) {
  const blockers = [];
  if (report?.schema_version !== SOURCE_TEXT_EXTRACTION_RUN_REPORT_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (report?.kind !== "source_text_extraction_run_report") blockers.push("kind_must_be_source_text_extraction_run_report");
  if (!isSafeId(report?.report_id)) blockers.push("report_id_unsafe");
  if (!REPORT_STATUSES.has(report?.status)) blockers.push("run_report_status_unknown");
  validateBoundary(report?.boundary ?? {}, blockers);
  validateSourceRefs(report?.source_refs ?? {}, blockers);
  validateCounts(report?.counts ?? {}, blockers);
  validateRunPolicy(report?.run_policy ?? {}, blockers);
  for (const summary of arrayField(report, "adapter_summary", blockers, { required: false })) {
    if (!isSafeId(summary?.adapter_id)) blockers.push("adapter_summary_id_unsafe");
    if (!Number.isInteger(summary?.target_count) || summary.target_count < 0) blockers.push("adapter_summary_target_count_invalid");
  }
  for (const target of arrayField(report, "target_reports", blockers, { required: false })) {
    validateTargetReport(target, blockers);
  }
  validateAnswerEngineHandoff(report?.answer_engine_handoff ?? {}, blockers);
  blockers.push(...findUnsafeReportStrings(report));
  return {
    schema_version: SOURCE_TEXT_EXTRACTION_RUN_REPORT_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_extraction_run_report_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    report_id: report?.report_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: report?.boundary?.metadata_only === true,
      no_extractor_execution: report?.boundary?.extractor_executed === false,
      no_source_text_read: report?.boundary?.source_text_read === false,
      no_source_payloads: report?.boundary?.source_payloads_included === false,
      no_private_payloads: report?.boundary?.private_payloads_written === false,
      no_index_build: report?.boundary?.index_build_executed === false,
      no_notebooklm_answers: report?.boundary?.notebooklm_answers_included === false,
      no_runtime_absolute_paths: report?.boundary?.runtime_absolute_paths_included === false,
    },
  };
}

function sourceTextExtractionRunReportBoundary() {
  return {
    metadata_only: true,
    dry_run_only: true,
    packet_read_only: true,
    extractor_executed: false,
    source_files_opened: false,
    source_text_read: false,
    source_payloads_included: false,
    chunk_payloads_included: false,
    private_payloads_written: false,
    embeddings_included: false,
    bm25_or_vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    index_build_executed: false,
    owner_approval_granted: false,
    public_canon_promotion_allowed: false,
  };
}

function runPolicy() {
  return {
    purpose: "validate_source_text_extraction_packet_readiness_without_opening_sources",
    runner_action: "report_only",
    reads_packet_only: true,
    opens_source_locator_refs: false,
    imports_extractor_libraries: false,
    writes_private_payloads: false,
    builds_index: false,
    mutates_notebooklm_or_drive: false,
    allowed_next_actions: [
      "answer_engine_metadata_preflight_overlay",
      "owner_select_source_text_retrieval_scope",
      "owner_select_private_payload_worksite",
      "future_extractor_runner_dry_run_with_payload_guard",
    ],
  };
}

function buildTargetReport(target) {
  return {
    target_ref: target.target_ref,
    source_slice_ref: target.source_slice_ref,
    adapter_id: target.adapter_route?.adapter_id ?? "unknown_adapter",
    planned_action: target.adapter_route?.planned_action ?? "unknown_action",
    target_status: target.target_status ?? "unknown",
    metadata_preflight: target.execution_grants?.metadata_preflight === true,
    source_text_read: false,
    private_payload_write: false,
    index_build: false,
    hwp_preprocess_required: target.adapter_route?.adapter_id === "hwp_to_hwpx_preprocess",
    blocker_codes: [...new Set(target.blocker_codes ?? [])].filter(isSafeId).sort(),
    next_owner_action: "approve_source_text_retrieval_scope_before_body_reading",
  };
}

function summarizeAdapters(targetReports) {
  const byAdapter = new Map();
  for (const target of targetReports) {
    const current = byAdapter.get(target.adapter_id) ?? {
      adapter_id: target.adapter_id,
      target_count: 0,
      planned_actions: new Set(),
      source_text_read: false,
      private_payload_write: false,
      index_build: false,
    };
    current.target_count += 1;
    current.planned_actions.add(target.planned_action);
    byAdapter.set(target.adapter_id, current);
  }
  return [...byAdapter.values()]
    .map((item) => ({
      ...item,
      planned_actions: [...item.planned_actions].sort(),
    }))
    .sort((left, right) => left.adapter_id.localeCompare(right.adapter_id));
}

function summarizeBlockers(blockers) {
  return Object.entries(countBy(blockers.filter(isSafeId))).map(([code, count]) => ({
    blocker_code: code,
    count,
  }));
}

function answerEngineHandoff({ packet, targetCount }) {
  return {
    handoff_mode: "metadata_preflight_overlay_only",
    allowed_answer_engine_mode: "metadata_index_answer",
    report_is_not_citation_evidence: true,
    report_may_explain_sourcebound_readiness: true,
    source_text_answer_allowed: false,
    sourcebound_target_count: targetCount,
    metadata_field_count: packet?.counts?.metadata_field_count ?? 0,
    next_action: "answer_engine_may_use_this_report_for_readiness_status_only",
  };
}

function emptyCounts() {
  return {
    target_count: 0,
    metadata_field_count: 0,
    log_import_task_count: 0,
    adapter_route_count: 0,
    source_text_read_grant_count: 0,
    private_payload_write_grant_count: 0,
    index_build_grant_count: 0,
    target_status_counts: {},
    adapter_counts: {},
    blocker_counts: {},
  };
}

function validateBoundary(boundary, blockers) {
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.dry_run_only !== true) blockers.push("boundary_dry_run_only_must_be_true");
  if (boundary.packet_read_only !== true) blockers.push("boundary_packet_read_only_must_be_true");
  if (boundary.extractor_executed !== false) blockers.push("extractor_must_not_be_executed");
  if (boundary.source_files_opened !== false) blockers.push("source_files_must_not_be_opened");
  if (boundary.source_text_read !== false) blockers.push("source_text_must_not_be_read");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.private_payloads_written !== false) blockers.push("private_payloads_must_not_be_written");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_or_vector_index_included !== false) blockers.push("bm25_or_vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.index_build_executed !== false) blockers.push("index_build_must_not_be_executed");
  if (boundary.owner_approval_granted !== false) blockers.push("owner_approval_must_not_be_granted");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");
}

function validateSourceRefs(sourceRefs, blockers) {
  if (sourceRefs.extraction_packet_ref !== null && !isSafeMetadataRef(sourceRefs.extraction_packet_ref)) {
    blockers.push("extraction_packet_ref_unsafe");
  }
  if (sourceRefs.extraction_packet_id !== null && !isSafeId(sourceRefs.extraction_packet_id)) {
    blockers.push("extraction_packet_id_unsafe");
  }
  if (sourceRefs.profile_ref !== null && !isSafeMetadataRef(sourceRefs.profile_ref)) blockers.push("profile_ref_unsafe");
  if (sourceRefs.profile_id !== null && !isSafeId(sourceRefs.profile_id)) blockers.push("profile_id_unsafe");
  if (sourceRefs.metadata_index_ref !== null) blockers.push("metadata_index_ref_must_be_null");
}

function validateCounts(counts, blockers) {
  for (const key of [
    "target_count",
    "metadata_field_count",
    "log_import_task_count",
    "adapter_route_count",
    "source_text_read_grant_count",
    "private_payload_write_grant_count",
    "index_build_grant_count",
  ]) {
    if (!Number.isInteger(counts[key]) || counts[key] < 0) blockers.push(`${key}_invalid`);
  }
  if (counts.source_text_read_grant_count !== 0) blockers.push("source_text_read_grant_count_must_be_zero");
  if (counts.private_payload_write_grant_count !== 0) blockers.push("private_payload_write_grant_count_must_be_zero");
  if (counts.index_build_grant_count !== 0) blockers.push("index_build_grant_count_must_be_zero");
}

function validateRunPolicy(policy, blockers) {
  if (policy.reads_packet_only !== true) blockers.push("policy_must_read_packet_only");
  if (policy.opens_source_locator_refs !== false) blockers.push("policy_must_not_open_source_locators");
  if (policy.imports_extractor_libraries !== false) blockers.push("policy_must_not_import_extractors");
  if (policy.writes_private_payloads !== false) blockers.push("policy_must_not_write_private_payloads");
  if (policy.builds_index !== false) blockers.push("policy_must_not_build_index");
  if (policy.mutates_notebooklm_or_drive !== false) blockers.push("policy_must_not_mutate_notebooklm_or_drive");
}

function validateTargetReport(target, blockers) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    blockers.push("target_report_must_be_object");
    return;
  }
  if (!isSafeId(target.target_ref)) blockers.push("target_ref_unsafe");
  if (!isSafeId(target.source_slice_ref)) blockers.push("target_source_slice_ref_unsafe");
  if (!isSafeId(target.adapter_id)) blockers.push("target_adapter_id_unsafe");
  if (target.metadata_preflight !== true) blockers.push("target_metadata_preflight_must_be_true");
  if (target.source_text_read !== false) blockers.push("target_source_text_read_must_be_false");
  if (target.private_payload_write !== false) blockers.push("target_private_payload_write_must_be_false");
  if (target.index_build !== false) blockers.push("target_index_build_must_be_false");
  for (const code of arrayField(target, "blocker_codes", blockers, { required: false })) {
    if (!isSafeId(code)) blockers.push("target_blocker_code_unsafe");
  }
}

function validateAnswerEngineHandoff(handoff, blockers) {
  if (handoff.handoff_mode !== "metadata_preflight_overlay_only") blockers.push("handoff_mode_unknown");
  if (handoff.allowed_answer_engine_mode !== "metadata_index_answer") blockers.push("handoff_answer_mode_must_be_metadata_index_answer");
  if (handoff.report_is_not_citation_evidence !== true) blockers.push("handoff_report_must_not_be_citation_evidence");
  if (handoff.source_text_answer_allowed !== false) blockers.push("handoff_source_text_answer_must_not_be_allowed");
}

function safeSourceTextExtractionRunReportOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_TEXT_EXTRACTION_RUN_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_text_extraction_runs\//.test(ref)
  ) {
    throw new Error("source text extraction run report output must be under _workmeta/system/reports/rag/source_text_extraction_runs/ or _workmeta/<project_code>/reports/rag/source_text_extraction_runs/");
  }
  return ref;
}

function defaultSourceTextExtractionRunReportOutputRef({ report, packet, projectCode }) {
  if (packet?.planned_outputs?.metadata_run_report_ref) {
    return packet.planned_outputs.metadata_run_report_ref;
  }
  const filename = "source_text_extraction_run_report.json";
  if (projectCode) {
    const code = normalizeSimpleId(projectCode, "project_code");
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_text_extraction_runs", report.report_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_TEXT_EXTRACTION_RUN_ROOT, report.report_id, filename));
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

function findUnsafeReportStrings(value, trail = "report") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findUnsafeReportStrings(item, `${trail}[${index}]`)));
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) blockers.push(`forbidden_key:${trail}.${key}`);
      blockers.push(...findUnsafeReportStrings(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
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

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = isSafeId(value) ? String(value) : "unsafe_or_redacted";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function safeIdOrNull(value) {
  return isSafeId(value) ? value : null;
}

function safeRefOrNull(value) {
  return isSafeMetadataRef(value) ? value : null;
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
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
