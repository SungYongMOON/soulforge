import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendJsonl, normalizeRepoPath } from "../shared/io.mjs";

export const KNOWLEDGE_RAG_CANDIDATE_SCHEMA_VERSION = "soulforge.knowledge_rag_candidate.v0";
export const KNOWLEDGE_RAG_CANDIDATE_TRIAGE_SCHEMA_VERSION = "soulforge.knowledge_rag_candidate_triage.v0";
export const KNOWLEDGE_RAG_CANDIDATE_WORKFLOW_ID = "knowledge_rag_candidate_ledger_v0";

export const CANDIDATE_ROUTES = new Set([
  "metadata_only_record",
  "sourcebound_review_candidate",
  "rag_ingestion_candidate",
  "ontology_candidate",
  "owner_decision_needed",
  "reject_or_hold",
]);

export const CANDIDATE_STATUSES = new Set([
  "open",
  "triaged",
  "held",
  "rejected",
  "accepted_for_review",
]);

export const CANDIDATE_CLAIM_CEILINGS = new Set([
  "observed",
  "source_supported",
  "rejected_or_blocked",
]);

const CANDIDATE_KINDS = new Set([
  "knowledge_trigger",
  "rag_readiness_gap",
  "sourcebound_gap",
  "ontology_pattern",
  "repeated_use_signal",
  "owner_decision_gap",
  "manual_candidate",
  "completion_knowledge",
]);

const REQUIRED_BOUNDARY_FLAGS = {
  metadata_only: true,
  payload_copied: false,
  source_payload_read: false,
  notebooklm_answer_stored: false,
  raw_prompt_or_question_stored: false,
  secret_present: false,
  runtime_absolute_path_present: false,
  canon_or_ontology_mutated: false,
  rag_ingestion_executed: false,
  graph_mutation_executed: false,
};

const CANDIDATE_ALLOWED_KEYS = new Set([
  "schema_version",
  "workflow_id",
  "kind",
  "candidate_id",
  "created_at",
  "project_code",
  "source_context_ref",
  "candidate_kind",
  "short_reason",
  "suggested_route",
  "claim_ceiling",
  "missing_inputs",
  "owner_question",
  "status",
  "boundary",
  "item_ref",
  "knowledge_hint",
  "repeated_use_signal",
]);

const REPEATED_USE_SIGNAL_ALLOWED_KEYS = new Set([
  "count",
  "source_event_count",
  "last_seen_at",
  "signal_ref",
]);

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "attachment",
  "attachments",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_text",
  "chunks",
  "content",
  "eml",
  "html",
  "mail_body",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "notebooklm_output",
  "notebooklm_question",
  "payload",
  "private_payload",
  "prompt",
  "question",
  "question_text",
  "raw",
  "raw_payload",
  "raw_prompt",
  "raw_question",
  "source_body",
  "source_chunk",
  "source_chunks",
  "source_content",
  "source_payload",
  "source_text",
  "text",
]);

const SECRET_LIKE_KEY_PATTERN =
  /(^|[._-])(access[_-]?token|api[_-]?key|authorization|bearer|client[_-]?secret|cookie|credential|credentials|id[_-]?token|password|passwd|private[_-]?key|refresh[_-]?token|secret|session|token)([._-]|$)/i;
const SECRET_LIKE_TEXT_PATTERN =
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie|authorization|bearer)\s*[:=]\s*["']?[^"',\s)]+/i;
const SECRET_LIKE_PATH_PATTERN =
  /(^|[/\\._-])(?:\.env|id_rsa|id_dsa|id_ecdsa|id_ed25519|token|password|passwd|secret|credential|credentials|cookie|session|authorization|auth)([/\\._-]|$)/i;
const RAW_PAYLOAD_EXTENSION_PATTERN =
  /\.(?:msg|eml|pst|ost|doc|docx|xls|xlsx|ppt|pptx|pdf|hwp|hwpx|zip|7z|rar|tar|tgz|gz|bz2|xz|wav|mp3|mp4|m4a|aac|flac|ogg)(?:$|[?#\s])/i;
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/;
// P00-000_INBOX 는 회사 일반/미분류 업무의 예약 코드 — 로드맵 daily ledger 수용 기준이
// "validator 는 P00-000_INBOX 를 예약 코드로 수용" 을 명시한다(DEVELOPMENT_ROADMAP_V0).
const RESERVED_INBOX_CODE = "P00-000_INBOX";
const CANDIDATE_LEDGER_REF_PATTERN =
  /^_workmeta\/(system|P\d{2}-\d{3}|P00-000_INBOX)\/knowledge_rag_candidate_ledger\/.+\.jsonl$/;
const SECOND_PRECISION_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export async function appendKnowledgeRagCandidate(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const target = resolveCandidateLedgerTarget({
    repoRoot,
    ledgerFile: options.ledgerFile,
    ledgerRef: options.ledgerRef,
  });
  const candidate = buildKnowledgeRagCandidate(options);
  const validation = validateKnowledgeRagCandidate(candidate);

  if (!validation.ok) {
    throw new Error(`knowledge_rag_candidate_invalid: ${validation.errors.join("; ")}`);
  }

  await appendJsonl(target.path, candidate);

  return {
    candidate,
    ledger_path: target.path,
    ledger_ref: target.ledger_ref,
  };
}

export async function validateKnowledgeRagCandidateLedgers(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sources = normalizeLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
  });
  const { rows, issues, jsonlRowCount } = await readCandidateRows({ sources });

  return {
    schema_version: KNOWLEDGE_RAG_CANDIDATE_TRIAGE_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_RAG_CANDIDATE_WORKFLOW_ID,
    kind: "knowledge_rag_candidate_ledger_validation",
    status: issues.length === 0 ? "pass" : "fail",
    source_ledger_refs: sources.map((source) => source.ledger_ref),
    source_ledger_count: sources.length,
    jsonl_row_count: jsonlRowCount,
    accepted_candidate_count: rows.length,
    invalid_candidate_count: issues.length,
    issues,
    boundary: buildTriageBoundary(),
  };
}

export async function triageKnowledgeRagCandidates(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = formatTimestampUtc(options.now);
  const sources = normalizeLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
  });
  const { rows, issues, jsonlRowCount } = await readCandidateRows({ sources });
  const acceptedRows = rows.filter((row) => row.status !== "rejected");
  const groups = buildTriageGroups(acceptedRows);

  return {
    schema_version: KNOWLEDGE_RAG_CANDIDATE_TRIAGE_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_RAG_CANDIDATE_WORKFLOW_ID,
    kind: "knowledge_rag_candidate_batch_triage_dry_run",
    status: issues.length === 0 ? "dry_run_complete" : "dry_run_with_rejected_rows",
    generated_at_utc: now,
    source_ledger_refs: sources.map((source) => source.ledger_ref),
    source_ledger_count: sources.length,
    jsonl_row_count: jsonlRowCount,
    accepted_candidate_count: rows.length,
    invalid_candidate_count: issues.length,
    project_count: new Set(acceptedRows.map((row) => row.project_code)).size,
    route_count: new Set(acceptedRows.map((row) => row.suggested_route)).size,
    groups,
    owner_questions: collectOwnerQuestions(acceptedRows),
    issues,
    boundary: buildTriageBoundary(),
  };
}

export function buildKnowledgeRagCandidate(options = {}) {
  const createdAt = formatTimestampUtc(options.createdAt ?? options.created_at ?? options.now);
  const projectCode = normalizeProjectCode(options.projectCode ?? options.project_code);
  const sourceContextRef = sanitizeRef(options.sourceContextRef ?? options.source_context_ref, "source_context_ref");
  const candidateKind = requireAllowed(
    options.candidateKind ?? options.candidate_kind ?? "manual_candidate",
    CANDIDATE_KINDS,
    "candidate_kind",
  );
  const suggestedRoute = requireAllowed(
    options.suggestedRoute ?? options.suggested_route,
    CANDIDATE_ROUTES,
    "suggested_route",
  );
  const claimCeiling = requireAllowed(
    options.claimCeiling ?? options.claim_ceiling ?? defaultClaimCeilingForRoute(suggestedRoute),
    CANDIDATE_CLAIM_CEILINGS,
    "claim_ceiling",
  );
  const missingInputs = normalizeTextList(options.missingInputs ?? options.missing_inputs, "missing_inputs", 120);
  const ownerQuestion = sanitizeNullableText(options.ownerQuestion ?? options.owner_question, "owner_question", 240);
  const status = requireAllowed(options.status ?? "open", CANDIDATE_STATUSES, "status");
  const boundary = normalizeBoundary(options.boundary);
  const itemRef = sanitizeNullableText(options.itemRef ?? options.item_ref, "item_ref", 120);
  const knowledgeHint = sanitizeNullableText(options.knowledgeHint ?? options.knowledge_hint, "knowledge_hint", 300);
  const repeatedUseSignal = normalizeRepeatedUseSignal(options.repeatedUseSignal ?? options.repeated_use_signal);
  const base = {
    schema_version: KNOWLEDGE_RAG_CANDIDATE_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_RAG_CANDIDATE_WORKFLOW_ID,
    kind: "knowledge_rag_candidate",
    created_at: createdAt,
    project_code: projectCode,
    source_context_ref: sourceContextRef,
    candidate_kind: candidateKind,
    short_reason: sanitizeMetadataText(options.shortReason ?? options.short_reason, "short_reason", 240),
    suggested_route: suggestedRoute,
    claim_ceiling: claimCeiling,
    missing_inputs: missingInputs,
    owner_question: ownerQuestion,
    status,
    boundary,
  };
  if (itemRef) {
    base.item_ref = itemRef;
  }
  if (knowledgeHint) {
    base.knowledge_hint = knowledgeHint;
  }

  const withOptional = repeatedUseSignal ? { ...base, repeated_use_signal: repeatedUseSignal } : base;

  return {
    ...withOptional,
    candidate_id: normalizeCandidateId(options.candidateId ?? options.candidate_id, withOptional),
  };
}

export function validateKnowledgeRagCandidate(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, errors: ["candidate_must_be_object"] };
  }

  for (const key of [
    "schema_version",
    "workflow_id",
    "kind",
    "candidate_id",
    "created_at",
    "project_code",
    "source_context_ref",
    "candidate_kind",
    "short_reason",
    "suggested_route",
    "claim_ceiling",
    "missing_inputs",
    "owner_question",
    "status",
    "boundary",
  ]) {
    if (!(key in candidate)) {
      errors.push(`missing_required_field:${key}`);
    }
  }

  for (const key of Object.keys(candidate)) {
    if (!CANDIDATE_ALLOWED_KEYS.has(key)) {
      errors.push(`unknown_key:${key}`);
    }
  }

  if (candidate.schema_version !== KNOWLEDGE_RAG_CANDIDATE_SCHEMA_VERSION) {
    errors.push("schema_version_not_allowed");
  }
  if (candidate.workflow_id !== KNOWLEDGE_RAG_CANDIDATE_WORKFLOW_ID) {
    errors.push("workflow_id_not_allowed");
  }
  if (candidate.kind !== "knowledge_rag_candidate") {
    errors.push("kind_not_allowed");
  }
  if (!/^knowledge_rag_candidate_[a-f0-9]{16}$/.test(String(candidate.candidate_id ?? ""))) {
    errors.push("candidate_id_shape_invalid");
  }
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(candidate.created_at ?? ""))) {
    errors.push("created_at_must_be_second_precision_utc");
  }
  if (!isValidProjectCode(candidate.project_code)) {
    errors.push("project_code_not_allowed");
  }
  if (!CANDIDATE_KINDS.has(candidate.candidate_kind)) {
    errors.push("candidate_kind_not_allowed");
  }
  if (!CANDIDATE_ROUTES.has(candidate.suggested_route)) {
    errors.push("suggested_route_not_allowed");
  }
  if (!CANDIDATE_CLAIM_CEILINGS.has(candidate.claim_ceiling)) {
    errors.push("claim_ceiling_not_allowed");
  }
  if (!CANDIDATE_STATUSES.has(candidate.status)) {
    errors.push("status_not_allowed");
  }
  if (!Array.isArray(candidate.missing_inputs)) {
    errors.push("missing_inputs_must_be_array");
  }
  if ("item_ref" in candidate && (typeof candidate.item_ref !== "string" || !candidate.item_ref.trim())) {
    errors.push("item_ref_must_be_non_empty_string");
  }
  if ("knowledge_hint" in candidate && (typeof candidate.knowledge_hint !== "string" || !candidate.knowledge_hint.trim())) {
    errors.push("knowledge_hint_must_be_non_empty_string");
  }
  errors.push(...validateBoundary(candidate.boundary));
  errors.push(...validateRepeatedUseSignal(candidate.repeated_use_signal));
  errors.push(...findForbiddenKeyBlockers(candidate));
  errors.push(...findUnsafeValueBlockers(candidate));
  errors.push(...validateRouteBoundary(candidate));

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].map((error) => sanitizeIssue(error)),
  };
}

export function resolveCandidateLedgerTarget({ repoRoot = process.cwd(), ledgerFile, ledgerRef } = {}) {
  if ((ledgerFile && ledgerRef) || (!ledgerFile && !ledgerRef)) {
    throw new Error("provide_exactly_one_of_ledger_file_or_ledger_ref");
  }

  const root = path.resolve(repoRoot);
  if (ledgerRef) {
    const ref = normalizeCandidateLedgerRef(ledgerRef);
    return {
      path: path.resolve(root, ref),
      ledger_ref: ref,
    };
  }

  const filePath = normalizeExternalOrRepoLedgerFile(root, ledgerFile);
  return {
    path: filePath,
    ledger_ref: isSubpath(root, filePath) ? normalizeRepoPath(path.relative(root, filePath)) : `ledger_file:${path.basename(filePath)}`,
  };
}

function buildTriageGroups(rows) {
  const groups = new Map();

  for (const row of rows) {
    const readiness = readinessForRow(row);
    const key = `${row.project_code}\n${row.suggested_route}\n${readiness}`;
    const group = groups.get(key) ?? {
      project_code: row.project_code,
      suggested_route: row.suggested_route,
      source_readiness: readiness,
      candidate_count: 0,
      status_counts: {},
      claim_ceiling_counts: {},
      missing_input_counts: {},
      repeated_use_signal_count: 0,
      candidate_refs: [],
      recommended_next_action: recommendedNextAction(row.suggested_route, readiness),
    };

    group.candidate_count += 1;
    group.candidate_refs.push(row.candidate_id);
    group.repeated_use_signal_count += row.repeated_use_signal ? 1 : 0;
    increment(group.status_counts, row.status);
    increment(group.claim_ceiling_counts, row.claim_ceiling);
    for (const missingInput of row.missing_inputs ?? []) {
      increment(group.missing_input_counts, missingInput);
    }
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      candidate_refs: group.candidate_refs.sort(),
      status_counts: sortObject(group.status_counts),
      claim_ceiling_counts: sortObject(group.claim_ceiling_counts),
      missing_input_counts: sortObject(group.missing_input_counts),
    }))
    .sort((left, right) =>
      `${left.project_code}|${left.suggested_route}|${left.source_readiness}`.localeCompare(
        `${right.project_code}|${right.suggested_route}|${right.source_readiness}`,
      ),
    );
}

function collectOwnerQuestions(rows) {
  return rows
    .filter((row) => row.owner_question)
    .map((row) => ({
      candidate_id: row.candidate_id,
      project_code: row.project_code,
      suggested_route: row.suggested_route,
      owner_question: row.owner_question,
    }))
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
}

async function readCandidateRows({ sources }) {
  const rows = [];
  const issues = [];
  let jsonlRowCount = 0;

  for (const source of sources) {
    const raw = await fs.readFile(source.path, "utf8");
    const lines = raw.split(/\r?\n/u);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }
      jsonlRowCount += 1;

      let candidate;
      try {
        candidate = JSON.parse(line);
      } catch {
        issues.push(buildIssue(source.ledger_ref, index + 1, "invalid_json", ["json_parse_failed"]));
        continue;
      }

      const validation = validateKnowledgeRagCandidate(candidate);
      if (!validation.ok) {
        issues.push(buildIssue(source.ledger_ref, index + 1, "invalid_candidate", validation.errors, candidate.candidate_id));
        continue;
      }
      rows.push(candidate);
    }
  }

  return { rows, issues, jsonlRowCount };
}

function normalizeLedgerSources({ repoRoot, ledgerFiles, ledgerRefs }) {
  const files = normalizeInputList(ledgerFiles);
  const refs = normalizeInputList(ledgerRefs);

  if (files.length === 0 && refs.length === 0) {
    throw new Error("provide_at_least_one_ledger_file_or_ledger_ref");
  }

  return [
    ...files.map((ledgerFile) => resolveCandidateLedgerTarget({ repoRoot, ledgerFile })),
    ...refs.map((ledgerRef) => resolveCandidateLedgerTarget({ repoRoot, ledgerRef })),
  ];
}

function normalizeCandidateLedgerRef(value) {
  const ref = sanitizeRef(value, "ledger_ref");
  if (!CANDIDATE_LEDGER_REF_PATTERN.test(ref)) {
    throw new Error("ledger_ref_must_be_under_workmeta_candidate_ledger");
  }
  return ref;
}

function normalizeExternalOrRepoLedgerFile(repoRoot, value) {
  const raw = requireNonEmptyText(value, "ledger_file");
  if (raw.includes("\0")) {
    throw new Error("ledger_file_contains_null_byte");
  }
  if (hasTraversal(raw)) {
    throw new Error("ledger_file_must_not_use_path_traversal");
  }
  if (isSecretLikePath(raw)) {
    throw new Error("ledger_file_secret_like_path_blocked");
  }
  if (path.extname(raw).toLowerCase() !== ".jsonl") {
    throw new Error("ledger_file_must_be_jsonl");
  }

  const filePath = path.isAbsolute(raw) || path.win32.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repoRoot, raw);
  if (isSubpath(repoRoot, filePath)) {
    const ref = normalizeRepoPath(path.relative(repoRoot, filePath));
    normalizeCandidateLedgerRef(ref);
  }
  return filePath;
}

function normalizeCandidateId(value, candidateBase) {
  if (value !== undefined && value !== null && value !== "") {
    const id = requireNonEmptyText(value, "candidate_id");
    if (!/^knowledge_rag_candidate_[a-f0-9]{16}$/.test(id)) {
      throw new Error("candidate_id_shape_invalid");
    }
    return id;
  }

  const stableBase = {
    project_code: candidateBase.project_code,
    source_context_ref: candidateBase.source_context_ref,
    candidate_kind: candidateBase.candidate_kind,
    short_reason: candidateBase.short_reason,
    suggested_route: candidateBase.suggested_route,
    claim_ceiling: candidateBase.claim_ceiling,
    missing_inputs: candidateBase.missing_inputs,
    owner_question: candidateBase.owner_question,
  };
  return `knowledge_rag_candidate_${stableHash(stableBase).slice(0, 16)}`;
}

function normalizeProjectCode(value) {
  const code = requireNonEmptyText(value, "project_code");
  if (!isValidProjectCode(code)) {
    throw new Error("project_code_not_allowed");
  }
  return code;
}

function isValidProjectCode(value) {
  const code = String(value ?? "");
  return code === "system" || code === RESERVED_INBOX_CODE || PROJECT_CODE_PATTERN.test(code);
}

function normalizeBoundary(value) {
  const boundary = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...REQUIRED_BOUNDARY_FLAGS,
    ...boundary,
  };
}

function validateBoundary(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["boundary_must_be_object"];
  }
  for (const [key, expected] of Object.entries(REQUIRED_BOUNDARY_FLAGS)) {
    if (value[key] !== expected) {
      errors.push(`boundary.${key}_must_be_${expected}`);
    }
  }
  return errors;
}

function normalizeRepeatedUseSignal(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("repeated_use_signal_must_be_object");
  }
  const signal = {};
  if (value.count !== undefined) {
    signal.count = normalizeNonNegativeInteger(value.count, "repeated_use_signal.count");
  }
  if (value.source_event_count !== undefined || value.sourceEventCount !== undefined) {
    signal.source_event_count = normalizeNonNegativeInteger(
      value.source_event_count ?? value.sourceEventCount,
      "repeated_use_signal.source_event_count",
    );
  }
  if (value.last_seen_at !== undefined || value.lastSeenAt !== undefined) {
    signal.last_seen_at = normalizeNullableTimestamp(value.last_seen_at ?? value.lastSeenAt, "repeated_use_signal.last_seen_at");
  }
  if (value.signal_ref !== undefined || value.signalRef !== undefined) {
    signal.signal_ref = sanitizeNullableRef(value.signal_ref ?? value.signalRef, "repeated_use_signal.signal_ref");
  }
  return signal;
}

function validateRepeatedUseSignal(value) {
  const errors = [];
  if (value === undefined || value === null) {
    return errors;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return ["repeated_use_signal_must_be_object"];
  }
  for (const key of Object.keys(value)) {
    if (!REPEATED_USE_SIGNAL_ALLOWED_KEYS.has(key)) {
      errors.push(`repeated_use_signal.unknown_key:${key}`);
    }
  }
  if ("count" in value && (!Number.isInteger(value.count) || value.count < 0)) {
    errors.push("repeated_use_signal.count_must_be_non_negative_integer");
  }
  if ("source_event_count" in value && (!Number.isInteger(value.source_event_count) || value.source_event_count < 0)) {
    errors.push("repeated_use_signal.source_event_count_must_be_non_negative_integer");
  }
  if (value.last_seen_at && !SECOND_PRECISION_UTC_PATTERN.test(String(value.last_seen_at))) {
    errors.push("repeated_use_signal.last_seen_at_must_be_second_precision_utc");
  }
  return errors;
}

function validateRouteBoundary(candidate) {
  const errors = [];
  if (candidate.suggested_route === "rag_ingestion_candidate") {
    if (!candidate.missing_inputs?.includes("owner_rag_ingestion_decision")) {
      errors.push("rag_ingestion_candidate_requires_owner_rag_ingestion_decision_missing_input");
    }
    if (!candidate.missing_inputs?.includes("knowledge_source_card")) {
      errors.push("rag_ingestion_candidate_requires_knowledge_source_card_missing_input");
    }
  }
  if (candidate.suggested_route === "ontology_candidate" && candidate.claim_ceiling === "canon_entry") {
    errors.push("ontology_candidate_must_not_claim_canon_entry");
  }
  return errors;
}

function defaultClaimCeilingForRoute(route) {
  if (route === "reject_or_hold") {
    return "rejected_or_blocked";
  }
  return "observed";
}

function readinessForRow(row) {
  if (row.status === "held" || row.status === "rejected") {
    return "held_or_rejected";
  }
  if ((row.missing_inputs ?? []).length > 0) {
    return "missing_inputs_required";
  }
  if (row.suggested_route === "metadata_only_record") {
    return "metadata_only_ready";
  }
  return "owner_review_ready";
}

function recommendedNextAction(route, readiness) {
  if (readiness === "held_or_rejected") {
    return "Keep the candidate held unless the owner supplies a new metadata-only decision ref.";
  }
  if (route === "metadata_only_record") {
    return "Keep as a metadata-only signal; do not promote, index, or read source payloads.";
  }
  if (route === "sourcebound_review_candidate") {
    return "Prepare a sourcebound review packet from approved metadata refs before reading any source payload.";
  }
  if (route === "rag_ingestion_candidate") {
    return "Ask the owner for a knowledge source card and explicit RAG ingestion decision before any indexing.";
  }
  if (route === "ontology_candidate") {
    return "Route to ontology/public-canon review; do not mutate graph or canon from the ledger row.";
  }
  if (route === "owner_decision_needed") {
    return "Ask the owner question and hold the candidate until a metadata-only decision ref exists.";
  }
  return "Reject or hold; keep only the metadata row unless the owner reopens it.";
}

function buildTriageBoundary() {
  return {
    metadata_only: true,
    reads_candidate_jsonl_only: true,
    source_payloads_read: false,
    raw_mail_or_attachment_read: false,
    notebooklm_answer_read_or_stored: false,
    raw_prompt_or_question_stored: false,
    rag_ingestion_executed: false,
    source_text_index_built: false,
    canon_or_ontology_mutated: false,
    graph_mutation_executed: false,
    archive_or_retire_executed: false,
    owner_decision_applied: false,
  };
}

function buildIssue(sourceLedgerRef, lineNumber, issueType, errors, candidateId) {
  const issue = {
    source_ledger_ref: sourceLedgerRef,
    line_number: lineNumber,
    issue_type: issueType,
    errors: errors.map((error) => sanitizeIssue(error)).slice(0, 20),
  };
  if (/^knowledge_rag_candidate_[a-f0-9]{16}$/.test(String(candidateId ?? ""))) {
    issue.candidate_id = candidateId;
  }
  return issue;
}

function findForbiddenKeyBlockers(value, trail = "candidate") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findForbiddenKeyBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const isRequiredBoundaryFlag = trail === "candidate.boundary" && Object.hasOwn(REQUIRED_BOUNDARY_FLAGS, key);
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
      blockers.push(`forbidden_raw_or_payload_key:${trail}.${key}`);
    }
    if (!isRequiredBoundaryFlag && SECRET_LIKE_KEY_PATTERN.test(normalizedKey)) {
      blockers.push(`secret_like_key:${trail}.${key}`);
    }
    blockers.push(...findForbiddenKeyBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function findUnsafeValueBlockers(value, trail = "candidate") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findUnsafeValueBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      blockers.push(...findUnsafeValueBlockers(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") {
    return blockers;
  }
  if (hasRuntimeAbsolutePath(value)) {
    blockers.push(`runtime_absolute_path:${trail}`);
  }
  if (hasTraversal(value)) {
    blockers.push(`path_traversal:${trail}`);
  }
  if (isSecretLikePath(value) || SECRET_LIKE_TEXT_PATTERN.test(value)) {
    blockers.push(`secret_like_value:${trail}`);
  }
  if (RAW_PAYLOAD_EXTENSION_PATTERN.test(value)) {
    blockers.push(`raw_payload_ref_or_extension:${trail}`);
  }
  return blockers;
}

function sanitizeMetadataText(value, key, maxLength) {
  const text = requireNonEmptyText(value, key).replace(/\s+/g, " ");
  assertSafeMetadataString(text, key);
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 15))}... [truncated]`;
}

function sanitizeNullableText(value, key, maxLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return sanitizeMetadataText(value, key, maxLength);
}

function sanitizeNullableRef(value, key) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return sanitizeRef(value, key);
}

function sanitizeRef(value, key) {
  const raw = requireNonEmptyText(value, key);
  assertSafeMetadataString(raw, key);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    throw new Error(`${key}_must_be_repo_relative_or_stable_metadata_ref`);
  }
  const normalized = raw.replaceAll("\\", "/");
  if (normalized !== path.posix.normalize(normalized)) {
    throw new Error(`${key}_must_be_normalized`);
  }
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${key}_must_not_use_path_traversal`);
  }
  return normalized;
}

function assertSafeMetadataString(value, key) {
  if (String(value).includes("\0")) {
    throw new Error(`${key}_contains_null_byte`);
  }
  if (hasRuntimeAbsolutePath(value)) {
    throw new Error(`${key}_must_not_be_runtime_absolute_path`);
  }
  if (isSecretLikePath(value) || SECRET_LIKE_TEXT_PATTERN.test(value)) {
    throw new Error(`${key}_secret_like_text_blocked`);
  }
  if (RAW_PAYLOAD_EXTENSION_PATTERN.test(value)) {
    throw new Error(`${key}_raw_payload_ref_or_extension_blocked`);
  }
}

function normalizeTextList(value, key, maxLength) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.map((item) => sanitizeMetadataText(item, key, maxLength)).filter(Boolean).slice(0, 20);
}

function normalizeNonNegativeInteger(value, key) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key}_must_be_non_negative_integer`);
  }
  return parsed;
}

function normalizeNullableTimestamp(value, key) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const timestamp = formatTimestampUtc(value);
  if (!SECOND_PRECISION_UTC_PATTERN.test(timestamp)) {
    throw new Error(`${key}_must_be_second_precision_utc`);
  }
  return timestamp;
}

function requireAllowed(value, allowed, key) {
  const text = requireNonEmptyText(value, key);
  if (!allowed.has(text)) {
    throw new Error(`${key}_not_allowed`);
  }
  return text;
}

function requireNonEmptyText(value, key) {
  const text = typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
  if (!text) {
    throw new Error(`missing_required_field:${key}`);
  }
  return text;
}

function normalizeInputList(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function hasRuntimeAbsolutePath(value) {
  const text = String(value ?? "");
  return (
    path.isAbsolute(text) ||
    path.win32.isAbsolute(text) ||
    path.posix.isAbsolute(text) ||
    /^[A-Za-z]:[\\/]/.test(text) ||
    /(?:^|[\s"'`([{<])(?:[A-Za-z]:[\\/][^\s"'`)\]}>,;]*)/.test(text) ||
    /(?:^|[\s"'`([{<])(?:\\\\[^\\/\s"'`)\]}>,;]+[\\/][^\s"'`)\]}>,;]*)/.test(text) ||
    /(?:^|[\s"'`([{<])\/(?:Users|home|tmp|var|etc|opt|mnt|Volumes|workspace|workspaces|Soulforge|repo)(?:\/[^\s"'`)\]}>,;]*)?/i.test(text)
  );
}

function hasTraversal(value) {
  return String(value ?? "").replaceAll("\\", "/").split("/").includes("..");
}

function isSecretLikePath(value) {
  return SECRET_LIKE_PATH_PATTERN.test(String(value ?? ""));
}

function sanitizeIssue(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "validation_error_redacted";
  }
  if (hasRuntimeAbsolutePath(text)) {
    return "validation_error_runtime_absolute_path";
  }
  if (isSecretLikePath(text) || SECRET_LIKE_TEXT_PATTERN.test(text)) {
    return "validation_error_secret_like_text";
  }
  if (/DO_NOT_ECHO|PRIVATE_PAYLOAD/i.test(text)) {
    return "validation_error_redacted";
  }
  return text.replace(/:[^:]+$/u, "");
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isSubpath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function formatTimestampUtc(value) {
  if (!value) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_timestamp");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
