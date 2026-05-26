import crypto from "node:crypto";
import path from "node:path";
import { normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";
import {
  buildRagRetrievalTrace,
  loadRagMetadataIndex,
  validateRagMetadataIndex,
  validateRagRetrievalTrace,
} from "./rag.mjs";
import {
  loadSourceTextExtractionPacket,
  validateSourceTextExtractionPacket,
} from "./source_text_extraction_packet.mjs";
import {
  loadSourceTextExtractionRunReport,
  validateSourceTextExtractionRunReport,
} from "./source_text_extraction_run_report.mjs";

export const RAG_ANSWER_ENGINE_RUN_SCHEMA_VERSION = "soulforge.rag_answer_engine_run.v0";
export const RAG_ANSWER_ENGINE_RUN_VALIDATION_SCHEMA_VERSION =
  "soulforge.rag_answer_engine_run_validation.v0";
export const RAG_ANSWER_ENGINE_RUN_GENERATOR_ID = "guild_hall.rag.answer_engine_run_generator.v0";

const DEFAULT_ANSWER_ENGINE_RUN_ROOT = "_workmeta/system/reports/rag/answer_engine_runs";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const RESPONSE_STATUSES = new Set([
  "metadata_index_answer",
  "sourcebound_preflight_status",
  "blocked_invalid_metadata_index",
  "blocked_invalid_extraction_packet",
  "blocked_invalid_retrieval_trace",
]);
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
  "question",
  "raw",
  "raw_payload",
  "raw_query",
  "secret",
  "source_body",
  "source_handle",
  "source_handles",
  "source_locator_ref",
  "source_text",
  "storage_locator",
  "text",
]);

export async function buildRagAnswerEngineRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) throw new Error("answer engine run requires --question");

  const metadataIndex = options.metadataIndex ?? await loadRagMetadataIndex({
    repoRoot,
    metadataIndexRef: options.metadataIndexRef,
  });
  const indexValidation = validateRagMetadataIndex(metadataIndex);
  const extractionPacket = options.extractionPacket ?? (options.extractionPacketRef
    ? await loadSourceTextExtractionPacket({ repoRoot, packetRef: options.extractionPacketRef })
    : null);
  const packetValidation = extractionPacket ? validateSourceTextExtractionPacket(extractionPacket) : null;
  const extractionRunReport = options.extractionRunReport ?? (options.extractionRunReportRef
    ? await loadSourceTextExtractionRunReport({ repoRoot, runReportRef: options.extractionRunReportRef })
    : null);
  const reportValidation = extractionRunReport ? validateSourceTextExtractionRunReport(extractionRunReport) : null;
  const runId = normalizeSimpleId(
    options.runId ?? `answer_engine_run_${stableHash(`${metadataIndex?.index_id ?? "unknown"}:${question}`).slice(0, 12)}`,
    "run_id",
  );
  const generatedAtUtc = formatTimestampUtc(options.now);
  const base = {
    schema_version: RAG_ANSWER_ENGINE_RUN_SCHEMA_VERSION,
    kind: "rag_answer_engine_run",
    run_id: runId,
    generator_id: RAG_ANSWER_ENGINE_RUN_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex?.index_id ?? null,
      manifest_ref: metadataIndex?.source_refs?.manifest_ref ?? null,
      manifest_id: metadataIndex?.source_refs?.manifest_id ?? null,
      extraction_packet_ref: options.extractionPacketRef ?? null,
      extraction_packet_id: extractionPacket?.packet_id ?? null,
      extraction_run_report_ref: options.extractionRunReportRef ?? null,
      extraction_run_report_id: extractionRunReport?.report_id ?? null,
    },
    boundary: answerEngineRunBoundary(),
    query: {
      raw_query_persisted: false,
      query_fingerprint: stableHash(`answer_engine_query:${question}`),
      query_token_count: tokenize(question).size,
      query_token_fingerprints: tokenFingerprintsForValue(question),
    },
  };

  if (indexValidation.status !== "pass") {
    return {
      ...base,
      status: "blocked_invalid_metadata_index",
      response: blockedResponse("blocked_invalid_metadata_index", "metadata index validation failed", {
        next_action: "regenerate_or_fix_metadata_index",
      }),
      retrieval_trace: null,
      validation: {
        status: "unchecked",
        blockers: [],
        upstream_validation: indexValidation,
      },
    };
  }

  if (packetValidation && packetValidation.status !== "pass") {
    return {
      ...base,
      status: "blocked_invalid_extraction_packet",
      response: blockedResponse("blocked_invalid_extraction_packet", "source-text extraction packet validation failed", {
        next_action: "regenerate_or_fix_source_text_extraction_packet",
      }),
      retrieval_trace: null,
      validation: {
        status: "unchecked",
        blockers: [],
        upstream_validation: packetValidation,
      },
    };
  }

  if (reportValidation && reportValidation.status !== "pass") {
    return {
      ...base,
      status: "blocked_invalid_extraction_packet",
      response: blockedResponse("blocked_invalid_extraction_packet", "source-text extraction run report validation failed", {
        next_action: "regenerate_or_fix_source_text_extraction_run_report",
      }),
      retrieval_trace: null,
      validation: {
        status: "unchecked",
        blockers: [],
        upstream_validation: reportValidation,
      },
    };
  }

  const trace = await buildRagRetrievalTrace({
    repoRoot,
    metadataIndex,
    metadataIndexRef: options.metadataIndexRef,
    question,
    maxUnits: options.maxUnits,
    traceId: options.traceId,
    now: options.now,
  });
  const traceValidation = validateRagRetrievalTrace(trace);
  if (traceValidation.status !== "pass") {
    return {
      ...base,
      status: "blocked_invalid_retrieval_trace",
      response: blockedResponse("blocked_invalid_retrieval_trace", "retrieval trace validation failed", {
        next_action: "inspect_retrieval_trace_validator",
      }),
      retrieval_trace: null,
      validation: {
        status: "unchecked",
        blockers: [],
        upstream_validation: traceValidation,
      },
    };
  }

  const retrievedUnits = trace.retrieved_units ?? [];
  const response = retrievedUnits.length > 0
    ? metadataIndexResponse({ metadataIndex, trace, extractionPacket, extractionRunReport })
    : sourceboundPreflightStatusResponse({ metadataIndex, trace, extractionPacket, extractionRunReport });
  return {
    ...base,
    status: response.status,
    response,
    retrieval_trace: compactTrace(trace),
    validation: {
      status: "unchecked",
      blockers: [],
      upstream_validation: {
        metadata_index: indexValidation.status,
        source_text_extraction_packet: packetValidation?.status ?? "not_supplied",
        source_text_extraction_run_report: reportValidation?.status ?? "not_supplied",
        retrieval_trace: traceValidation.status,
      },
    },
  };
}

export async function writeRagAnswerEngineRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const run = await buildRagAnswerEngineRun(options);
  const outputRef = options.outputRef ?? defaultAnswerEngineRunOutputRef({
    run,
    projectCode: options.projectCode,
  });
  const outputPath = path.join(repoRoot, safeAnswerEngineRunOutputPath(outputRef));
  await writeJson(outputPath, run);
  return {
    status: "written",
    answer_engine_run_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    run_id: run.run_id,
    response_status: run.status,
    retrieved_unit_count: run.response.retrieved_unit_count,
    sourcebound_target_count: run.response.sourcebound_target_count,
  };
}

export async function loadRagAnswerEngineRun({ repoRoot = process.cwd(), runRef } = {}) {
  if (!runRef) throw new Error("answer_engine_run_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(runRef)));
}

export function validateRagAnswerEngineRun(run) {
  const blockers = [];
  if (run?.schema_version !== RAG_ANSWER_ENGINE_RUN_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (run?.kind !== "rag_answer_engine_run") blockers.push("kind_must_be_rag_answer_engine_run");
  if (!isSafeId(run?.run_id)) blockers.push("run_id_unsafe");
  if (!RESPONSE_STATUSES.has(run?.status)) blockers.push("answer_engine_run_status_unknown");
  validateBoundary(run?.boundary ?? {}, blockers);
  validateSourceRefs(run?.source_refs ?? {}, blockers);
  validateQuery(run?.query ?? {}, blockers);
  validateResponse(run?.response ?? {}, blockers);
  validateCompactTrace(run?.retrieval_trace, blockers);
  blockers.push(...findUnsafeRunStrings(run));
  return {
    schema_version: RAG_ANSWER_ENGINE_RUN_VALIDATION_SCHEMA_VERSION,
    kind: "rag_answer_engine_run_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    run_id: run?.run_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: run?.boundary?.metadata_only === true,
      no_raw_query_persisted: run?.boundary?.raw_query_persisted === false,
      no_source_text_loaded: run?.boundary?.source_text_loaded === false,
      no_source_payloads: run?.boundary?.source_payloads_included === false,
      no_private_payloads: run?.boundary?.private_payloads_included === false,
      no_index_mutation: run?.boundary?.index_mutation_allowed === false,
      no_notebooklm_answers: run?.boundary?.notebooklm_answers_included === false,
      no_runtime_absolute_paths: run?.boundary?.runtime_absolute_paths_included === false,
    },
  };
}

export function renderAnswerEngineRunText(run) {
  const lines = [
    run.response?.response_text ?? "Answer engine run has no response text.",
    "",
    `상태: ${run.status}`,
    `주장 한계: ${run.response?.claim_ceiling ?? "observed"}`,
    `Metadata index: ${run.source_refs?.metadata_index_ref ?? "n/a"}`,
    run.source_refs?.extraction_packet_ref ? `Extraction packet: ${run.source_refs.extraction_packet_ref}` : null,
    run.source_refs?.extraction_run_report_ref ? `Dry-run report: ${run.source_refs.extraction_run_report_ref}` : null,
    "근거 refs:",
  ].filter(Boolean);
  for (const citation of run.response?.citations ?? []) {
    lines.push(`- ${citation.ref} (${citation.role})`);
  }
  if ((run.response?.citations ?? []).length === 0) lines.push("- 없음");
  lines.push("");
  lines.push("경계: metadata-only answer-engine run. Raw query, source text, private payloads, indexes, and NotebookLM answers were not persisted or loaded.");
  return `${lines.join("\n")}\n`;
}

function metadataIndexResponse({ metadataIndex, trace, extractionPacket, extractionRunReport }) {
  const top = trace.retrieved_units[0];
  const supporting = trace.retrieved_units.slice(1).map((unit) => unit.title_label).filter(Boolean);
  const sourceboundTargetCount = extractionRunReport?.counts?.target_count ?? extractionPacket?.counts?.target_count ?? 0;
  const sourceboundNote = extractionRunReport
    ? ` Sourcebound dry-run report is connected with ${sourceboundTargetCount} report-only targets, but source bodies are still not read.`
    : extractionPacket
    ? ` Sourcebound preflight packet is connected with ${sourceboundTargetCount} metadata-only targets, but source bodies are still not read.`
    : " No source-text extraction packet was supplied for sourcebound follow-up.";
  return {
    status: "metadata_index_answer",
    response_mode: "metadata_index_with_sourcebound_preflight",
    response_text: [
      `metadata index answer engine found "${top.title_label}" as the closest current answer signal.`,
      top.summary ? `Summary signal: ${top.summary}` : "The top item is represented mainly by graph metadata.",
      `The current claim ceiling is ${top.claim_ceiling}.`,
      supporting.length > 0 ? `Related metadata hits: ${supporting.join(", ")}.` : "",
      sourceboundNote,
    ].filter(Boolean).join(" "),
    claim_ceiling: weakestClaimCeiling(trace.retrieved_units.map((unit) => unit.claim_ceiling)),
    retrieved_unit_count: trace.retrieved_units.length,
    sourcebound_target_count: sourceboundTargetCount,
    answer_uses_source_text: false,
    next_action: extractionRunReport ? "owner_approve_sourcebound_payload_worksite_before_body_reading" : extractionPacket ? "run_sourcebound_dry_run_preflight_report" : "supply_source_text_extraction_packet_for_followup",
    citations: trace.citations ?? [],
  };
}

function sourceboundPreflightStatusResponse({ metadataIndex, trace, extractionPacket, extractionRunReport }) {
  const sourceboundTargetCount = extractionRunReport?.counts?.target_count ?? extractionPacket?.counts?.target_count ?? 0;
  const fieldCount = extractionRunReport?.counts?.metadata_field_count ?? extractionPacket?.counts?.metadata_field_count ?? 0;
  const logImportTaskCount = extractionRunReport?.counts?.log_import_task_count ?? extractionPacket?.counts?.log_import_task_count ?? 0;
  return {
    status: "sourcebound_preflight_status",
    response_mode: "metadata_index_no_hit_with_sourcebound_preflight_status",
    response_text: [
      "metadata index did not find a direct current answer signal for this query.",
      extractionRunReport
        ? `The answer engine is connected to a sourcebound dry-run report with ${sourceboundTargetCount} targets, ${fieldCount} metadata fields, and ${logImportTaskCount} extraction-log import task(s).`
        : extractionPacket
        ? `The answer engine is connected to a sourcebound preflight packet with ${sourceboundTargetCount} targets, ${fieldCount} metadata fields, and ${logImportTaskCount} extraction-log import task(s).`
        : "No sourcebound extraction packet was supplied.",
      `Metadata index ${metadataIndex.index_id} remains the active safe retrieval layer.`,
      "Next step is an owner-approved dry-run runner that reports readable targets and payload output routing before any source body is opened.",
    ].join(" "),
    claim_ceiling: "observed",
    retrieved_unit_count: trace.retrieved_units.length,
    sourcebound_target_count: sourceboundTargetCount,
    answer_uses_source_text: false,
    next_action: extractionRunReport ? "owner_approve_sourcebound_payload_worksite_before_body_reading" : extractionPacket ? "run_sourcebound_dry_run_preflight_report" : "create_or_supply_source_text_extraction_packet",
    citations: trace.citations ?? [],
  };
}

function blockedResponse(status, reason, extra = {}) {
  return {
    status,
    response_mode: "blocked",
    response_text: `Answer engine run is blocked: ${reason}.`,
    claim_ceiling: "rejected_or_blocked",
    retrieved_unit_count: 0,
    sourcebound_target_count: 0,
    answer_uses_source_text: false,
    citations: [],
    ...extra,
  };
}

function compactTrace(trace) {
  if (!trace) return null;
  return {
    trace_id: trace.trace_id,
    status: trace.status,
    question_fingerprint: trace.question_fingerprint,
    query_token_count: trace.query_token_count,
    retrieved_unit_count: trace.retrieved_units?.length ?? 0,
    retrieved_units: (trace.retrieved_units ?? []).map((unit) => ({
      unit_ref: unit.unit_ref,
      graph_node_ref: unit.graph_node_ref,
      title_label: unit.title_label,
      score: unit.score,
      match_reasons: unit.match_reasons ?? [],
      claim_ceiling: unit.claim_ceiling,
      retrieval_status: unit.retrieval_status,
    })),
  };
}

function answerEngineRunBoundary() {
  return {
    metadata_only: true,
    raw_query_persisted: false,
    source_text_loaded: false,
    source_payloads_included: false,
    chunk_payloads_included: false,
    private_payloads_included: false,
    embeddings_included: false,
    bm25_or_vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    index_mutation_allowed: false,
    owner_approval_granted: false,
    public_canon_promotion_allowed: false,
    answer_is_navigation_signal_not_source_truth: true,
  };
}

function validateBoundary(boundary, blockers) {
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.raw_query_persisted !== false) blockers.push("raw_query_must_not_be_persisted");
  if (boundary.source_text_loaded !== false) blockers.push("source_text_must_not_be_loaded");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.private_payloads_included !== false) blockers.push("private_payloads_must_not_be_included");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_or_vector_index_included !== false) blockers.push("bm25_or_vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.index_mutation_allowed !== false) blockers.push("index_mutation_must_not_be_allowed");
  if (boundary.owner_approval_granted !== false) blockers.push("owner_approval_must_not_be_granted");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");
}

function validateSourceRefs(sourceRefs, blockers) {
  if (sourceRefs.metadata_index_ref !== null && !isSafeMetadataRef(sourceRefs.metadata_index_ref)) blockers.push("metadata_index_ref_unsafe");
  if (!isSafeId(sourceRefs.index_id)) blockers.push("index_id_unsafe");
  if (sourceRefs.manifest_ref !== null && !isSafeMetadataRef(sourceRefs.manifest_ref)) blockers.push("manifest_ref_unsafe");
  if (sourceRefs.manifest_id !== null && !isSafeId(sourceRefs.manifest_id)) blockers.push("manifest_id_unsafe");
  if (sourceRefs.extraction_packet_ref !== null && !isSafeMetadataRef(sourceRefs.extraction_packet_ref)) blockers.push("extraction_packet_ref_unsafe");
  if (sourceRefs.extraction_packet_id !== null && !isSafeId(sourceRefs.extraction_packet_id)) blockers.push("extraction_packet_id_unsafe");
  if (sourceRefs.extraction_run_report_ref !== null && !isSafeMetadataRef(sourceRefs.extraction_run_report_ref)) blockers.push("extraction_run_report_ref_unsafe");
  if (sourceRefs.extraction_run_report_id !== null && !isSafeId(sourceRefs.extraction_run_report_id)) blockers.push("extraction_run_report_id_unsafe");
}

function validateQuery(query, blockers) {
  if (query.raw_query_persisted !== false) blockers.push("query_raw_query_must_not_be_persisted");
  if (!isSafeId(query.query_fingerprint)) blockers.push("query_fingerprint_unsafe");
  if (!Number.isInteger(query.query_token_count) || query.query_token_count < 0) blockers.push("query_token_count_invalid");
  for (const fingerprint of arrayField(query, "query_token_fingerprints", blockers, { required: false })) {
    if (!isSafeId(fingerprint)) blockers.push("query_token_fingerprint_unsafe");
  }
}

function validateResponse(response, blockers) {
  if (!RESPONSE_STATUSES.has(response.status)) blockers.push("response_status_unknown");
  if (typeof response.response_text !== "string" || response.response_text.trim().length === 0) blockers.push("response_text_required");
  if (!["observed", "source_supported", "validated_private", "canon_candidate", "canon_entry", "rejected_or_blocked"].includes(response.claim_ceiling)) {
    blockers.push("response_claim_ceiling_unknown");
  }
  if (!Number.isInteger(response.retrieved_unit_count) || response.retrieved_unit_count < 0) blockers.push("response_retrieved_unit_count_invalid");
  if (!Number.isInteger(response.sourcebound_target_count) || response.sourcebound_target_count < 0) blockers.push("response_sourcebound_target_count_invalid");
  if (response.answer_uses_source_text !== false) blockers.push("response_must_not_use_source_text");
  for (const citation of arrayField(response, "citations", blockers, { required: false })) {
    if (!isSafeMetadataRef(citation?.ref)) blockers.push("response_citation_ref_unsafe");
    if (!isSafeId(citation?.role)) blockers.push("response_citation_role_unsafe");
  }
}

function validateCompactTrace(trace, blockers) {
  if (trace === null) return;
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    blockers.push("retrieval_trace_must_be_object_or_null");
    return;
  }
  if (!isSafeId(trace.trace_id)) blockers.push("retrieval_trace_id_unsafe");
  if (!isSafeId(trace.question_fingerprint)) blockers.push("retrieval_trace_question_fingerprint_unsafe");
  if (!Number.isInteger(trace.query_token_count) || trace.query_token_count < 0) blockers.push("retrieval_trace_query_token_count_invalid");
  if (!Number.isInteger(trace.retrieved_unit_count) || trace.retrieved_unit_count < 0) blockers.push("retrieval_trace_retrieved_unit_count_invalid");
  for (const unit of arrayField(trace, "retrieved_units", blockers, { required: false })) {
    if (!isSafeMetadataRef(unit?.unit_ref)) blockers.push("retrieval_trace_unit_ref_unsafe");
    if (!isSafeMetadataRef(unit?.graph_node_ref)) blockers.push("retrieval_trace_graph_node_ref_unsafe");
    for (const reason of arrayField(unit, "match_reasons", blockers, { required: false })) {
      if (!isSafeId(reason)) blockers.push("retrieval_trace_match_reason_unsafe");
    }
  }
}

function safeAnswerEngineRunOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_ANSWER_ENGINE_RUN_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/answer_engine_runs\//.test(ref)
  ) {
    throw new Error("answer engine run output must be under _workmeta/system/reports/rag/answer_engine_runs/ or _workmeta/<project_code>/reports/rag/answer_engine_runs/");
  }
  return ref;
}

function defaultAnswerEngineRunOutputRef({ run, projectCode }) {
  const filename = "answer_engine_run.json";
  if (projectCode) {
    const code = normalizeSimpleId(projectCode, "project_code");
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "answer_engine_runs", run.run_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_ANSWER_ENGINE_RUN_ROOT, run.run_id, filename));
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

function findUnsafeRunStrings(value, trail = "run") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findUnsafeRunStrings(item, `${trail}[${index}]`)));
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) blockers.push(`forbidden_key:${trail}.${key}`);
      blockers.push(...findUnsafeRunStrings(child, `${trail}.${key}`));
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

function tokenFingerprint(token) {
  return stableHash(`soulforge_metadata_token:${token}`).slice(0, 32);
}

function tokenFingerprintsForValue(value) {
  return [...tokenize(value)].sort().map((token) => tokenFingerprint(token));
}

function tokenize(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9가-힣_.-]+/u)
      .map((token) => token.trim())
      .filter((token) => token && token.length > 1),
  );
}

function weakestClaimCeiling(values) {
  const rank = {
    rejected_or_blocked: 0,
    observed: 1,
    source_supported: 2,
    validated_private: 3,
    canon_candidate: 4,
    canon_entry: 5,
  };
  const selected = (values ?? []).filter((value) => Object.hasOwn(rank, value));
  if (selected.length === 0) return "observed";
  return selected.sort((left, right) => rank[left] - rank[right])[0];
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
