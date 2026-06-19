import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendJsonl, normalizeRepoPath, readJson, writeJson } from "../shared/io.mjs";

export const KNOWLEDGE_INGEST_RECEIPT_SCHEMA_VERSION = "soulforge.knowledge_ingest_receipt.v0";
export const KNOWLEDGE_INGEST_MISSING_AUDIT_SCHEMA_VERSION = "soulforge.knowledge_ingest_missing_audit.v0";
export const KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID = "knowledge_ingest_receipt_v0";

export const KNOWLEDGE_INGEST_LAYERS = ["candidate", "source", "wiki", "rag", "canon"];

export const KNOWLEDGE_INGEST_LAYER_STATUSES = new Set([
  "missing",
  "queued",
  "recorded",
  "stored",
  "prepared",
  "completed",
  "blocked",
  "owner_decision_needed",
  "not_applicable",
]);

const CLOSED_LAYER_STATUSES = new Set(["recorded", "stored", "prepared", "completed", "not_applicable"]);
const REF_REQUIRED_LAYER_STATUSES = new Set(["recorded", "stored", "prepared", "completed"]);
const OPEN_LAYER_STATUSES = new Set(["missing", "queued", "blocked", "owner_decision_needed"]);

const CAPTURE_SURFACES = new Set([
  "codex_chat",
  "uploaded_file",
  "manual_note",
  "source_packet",
  "knowledge_ingest_cell",
  "knowledge_source_audit",
  "knowledge_wiki_pipeline",
  "post_development_review",
]);

const CLAIM_CEILINGS = new Set([
  "observed",
  "source_supported",
  "validated_private",
  "canon_candidate",
  "canon_entry",
  "rejected_or_blocked",
]);

const REQUIRED_BOUNDARY_FLAGS = {
  metadata_only: true,
  raw_payload_stored: false,
  source_payload_read: false,
  notebooklm_answer_stored: false,
  drive_or_notebooklm_upload_executed: false,
  source_text_or_index_build_executed: false,
  canon_or_ontology_mutated: false,
  graph_mutation_executed: false,
  secret_present: false,
  runtime_absolute_path_present: false,
};

const RECEIPT_ALLOWED_KEYS = new Set([
  "schema_version",
  "workflow_id",
  "kind",
  "receipt_id",
  "created_at",
  "project_code",
  "capture_surface",
  "ingest_request_ref",
  "summary_label",
  "trigger_skill_id",
  "source_thread_ref",
  "source_pc_label",
  "required_layers",
  "layer_states",
  "claim_ceiling",
  "boundary",
]);

const LAYER_STATE_ALLOWED_KEYS = new Set([
  "status",
  "ref",
  "next_action",
  "note",
  "owner_decision_ref",
]);

const AUDIT_ALLOWED_KEYS = new Set([
  "schema_version",
  "workflow_id",
  "kind",
  "audit_id",
  "generated_at_utc",
  "status",
  "source_ledger_refs",
  "source_ledger_count",
  "jsonl_row_count",
  "accepted_receipt_count",
  "invalid_receipt_count",
  "open_receipt_count",
  "closed_receipt_count",
  "table",
  "issues",
  "boundary",
  "output_refs",
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
const TEXT_PAYLOAD_EXTENSION_PATTERN = /\.(?:log|rtf|text|txt)(?:$|[?#\s])/i;
const RAW_SOURCE_PATH_SEGMENT_PATTERN =
  /(^|[/\\._-])(?:attachment|attachments|mail_body|payload|payloads|raw|raws|raw_source|raw_sources|transcript|transcripts)([/\\._-]|$)/i;
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/;
const RECEIPT_LEDGER_REF_PATTERN =
  /^_workmeta\/(system|P\d{2}-\d{3})\/knowledge_ingest_receipts\/.+\.jsonl$/;
const AUDIT_OUTPUT_ROOT_REF_PATTERN =
  /^_workmeta\/(system|P\d{2}-\d{3})\/reports\/knowledge_ingest_missing_audit\/[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/;
const SECOND_PRECISION_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export async function appendKnowledgeIngestReceipt(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const target = resolveReceiptLedgerTarget({
    repoRoot,
    ledgerFile: options.ledgerFile,
    ledgerRef: options.ledgerRef,
  });
  const receipt = buildKnowledgeIngestReceipt(options);
  const validation = validateKnowledgeIngestReceipt(receipt);

  if (!validation.ok) {
    throw new Error(`knowledge_ingest_receipt_invalid: ${validation.errors.join("; ")}`);
  }

  await appendJsonl(target.path, receipt);

  return {
    receipt,
    ledger_path: target.path,
    ledger_ref: target.ledger_ref,
  };
}

export async function validateKnowledgeIngestReceiptLedgers(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sources = normalizeReceiptLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
  });
  const { records, issues, jsonlRowCount } = await readReceiptRecords({ sources });

  return {
    schema_version: KNOWLEDGE_INGEST_MISSING_AUDIT_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID,
    kind: "knowledge_ingest_receipt_ledger_validation",
    status: issues.length === 0 ? "pass" : "fail",
    source_ledger_refs: sources.map((source) => source.ledger_ref),
    source_ledger_count: sources.length,
    jsonl_row_count: jsonlRowCount,
    accepted_receipt_count: records.length,
    invalid_receipt_count: issues.length,
    issues,
    boundary: buildAuditBoundary(),
  };
}

export async function buildKnowledgeIngestMissingAudit(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const generatedAtUtc = formatTimestampUtc(options.generatedAt ?? options.generated_at ?? options.now);
  const sources = normalizeReceiptLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
  });
  const { records, issues, jsonlRowCount } = await readReceiptRecords({ sources });
  const table = buildMissingAuditRows(records);
  const auditId = normalizeAuditId(options.auditId ?? options.audit_id, generatedAtUtc);
  const openReceiptCount = table.filter((row) => row.completion_state !== "closed").length;
  const audit = {
    schema_version: KNOWLEDGE_INGEST_MISSING_AUDIT_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID,
    kind: "knowledge_ingest_missing_audit",
    audit_id: auditId,
    generated_at_utc: generatedAtUtc,
    status: issues.length === 0 ? "complete" : "complete_with_rejected_rows",
    source_ledger_refs: sources.map((source) => source.ledger_ref),
    source_ledger_count: sources.length,
    jsonl_row_count: jsonlRowCount,
    accepted_receipt_count: records.length,
    invalid_receipt_count: issues.length,
    open_receipt_count: openReceiptCount,
    closed_receipt_count: table.length - openReceiptCount,
    table,
    issues,
    boundary: buildAuditBoundary(),
  };

  const validation = validateKnowledgeIngestMissingAudit(audit);
  if (!validation.ok) {
    throw new Error(`knowledge_ingest_missing_audit_invalid: ${validation.errors.join("; ")}`);
  }

  if (options.write) {
    const outputRefs = await writeMissingAuditOutputs({
      repoRoot,
      audit,
      auditId,
      outputRootRef: options.outputRootRef ?? options.output_root_ref,
    });
    return {
      ...audit,
      output_refs: outputRefs,
    };
  }

  return audit;
}

export async function validateKnowledgeIngestMissingAuditRef(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const auditRef = sanitizeRef(options.auditRef ?? options.audit_ref, "audit_ref");
  if (!auditRef.endsWith(".json")) {
    throw new Error("audit_ref_must_be_json");
  }
  const auditPath = path.resolve(repoRoot, auditRef);
  if (!isSubpath(repoRoot, auditPath)) {
    throw new Error("audit_ref_must_be_repo_relative");
  }
  const audit = await readJson(auditPath);
  const validation = validateKnowledgeIngestMissingAudit(audit);
  return {
    schema_version: KNOWLEDGE_INGEST_MISSING_AUDIT_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID,
    kind: "knowledge_ingest_missing_audit_validation",
    status: validation.ok ? "pass" : "fail",
    audit_ref: auditRef,
    errors: validation.errors,
    boundary: buildAuditBoundary(),
  };
}

export function buildKnowledgeIngestReceipt(options = {}) {
  const createdAt = formatTimestampUtc(options.createdAt ?? options.created_at ?? options.now);
  const projectCode = normalizeProjectCode(options.projectCode ?? options.project_code);
  const captureSurface = requireAllowed(
    options.captureSurface ?? options.capture_surface ?? "knowledge_ingest_cell",
    CAPTURE_SURFACES,
    "capture_surface",
  );
  const requiredLayers = normalizeLayerList(options.requiredLayers ?? options.required_layers ?? KNOWLEDGE_INGEST_LAYERS);
  const layerStates = normalizeLayerStates(options.layerStates ?? options.layer_states, requiredLayers);
  const boundary = normalizeBoundary(options.boundary);
  const claimCeiling = normalizeClaimCeiling(
    options.claimCeiling ?? options.claim_ceiling ?? inferClaimCeiling(layerStates),
  );
  const base = {
    schema_version: KNOWLEDGE_INGEST_RECEIPT_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID,
    kind: "knowledge_ingest_receipt",
    created_at: createdAt,
    project_code: projectCode,
    capture_surface: captureSurface,
    ingest_request_ref: sanitizeRef(options.ingestRequestRef ?? options.ingest_request_ref, "ingest_request_ref"),
    summary_label: sanitizeMetadataText(options.summaryLabel ?? options.summary_label, "summary_label", 240),
    trigger_skill_id: sanitizeNullableText(
      options.triggerSkillId ?? options.trigger_skill_id ?? "soulforge-knowledge-ingest-cell-launcher",
      "trigger_skill_id",
      120,
    ),
    source_thread_ref: sanitizeNullableRef(
      options.sourceThreadRef ?? options.source_thread_ref ?? options.sourceSessionRef ?? options.source_session_ref,
      "source_thread_ref",
    ),
    source_pc_label: sanitizeNullableText(options.sourcePcLabel ?? options.source_pc_label, "source_pc_label", 80),
    required_layers: requiredLayers,
    layer_states: layerStates,
    claim_ceiling: claimCeiling,
    boundary,
  };

  return {
    ...base,
    receipt_id: normalizeReceiptId(options.receiptId ?? options.receipt_id, base),
  };
}

export function validateKnowledgeIngestReceipt(receipt) {
  const errors = [];

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return { ok: false, errors: ["receipt_must_be_object"] };
  }

  for (const key of [
    "schema_version",
    "workflow_id",
    "kind",
    "receipt_id",
    "created_at",
    "project_code",
    "capture_surface",
    "ingest_request_ref",
    "summary_label",
    "required_layers",
    "layer_states",
    "claim_ceiling",
    "boundary",
  ]) {
    if (!(key in receipt)) {
      errors.push(`missing_required_field:${key}`);
    }
  }

  for (const key of Object.keys(receipt)) {
    if (!RECEIPT_ALLOWED_KEYS.has(key)) {
      errors.push(`unknown_key:${key}`);
    }
  }

  if (receipt.schema_version !== KNOWLEDGE_INGEST_RECEIPT_SCHEMA_VERSION) {
    errors.push("schema_version_not_allowed");
  }
  if (receipt.workflow_id !== KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID) {
    errors.push("workflow_id_not_allowed");
  }
  if (receipt.kind !== "knowledge_ingest_receipt") {
    errors.push("kind_not_allowed");
  }
  if (!/^knowledge_ingest_receipt_[a-f0-9]{16}$/.test(String(receipt.receipt_id ?? ""))) {
    errors.push("receipt_id_shape_invalid");
  }
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(receipt.created_at ?? ""))) {
    errors.push("created_at_must_be_second_precision_utc");
  }
  if (!isValidProjectCode(receipt.project_code)) {
    errors.push("project_code_not_allowed");
  }
  if (!CAPTURE_SURFACES.has(receipt.capture_surface)) {
    errors.push("capture_surface_not_allowed");
  }
  if (!CLAIM_CEILINGS.has(receipt.claim_ceiling)) {
    errors.push("claim_ceiling_not_allowed");
  }
  errors.push(...validateLayerList(receipt.required_layers));
  errors.push(...validateLayerStates(receipt.layer_states, receipt.required_layers));
  errors.push(...validateBoundary(receipt.boundary));
  errors.push(...validateClaimVsLayers(receipt));
  errors.push(...findForbiddenKeyBlockers(receipt));
  errors.push(...findUnsafeValueBlockers(receipt));

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].map((error) => sanitizeIssue(error)),
  };
}

export function validateKnowledgeIngestMissingAudit(audit) {
  const errors = [];

  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    return { ok: false, errors: ["audit_must_be_object"] };
  }
  for (const key of [
    "schema_version",
    "workflow_id",
    "kind",
    "audit_id",
    "generated_at_utc",
    "status",
    "source_ledger_refs",
    "source_ledger_count",
    "jsonl_row_count",
    "accepted_receipt_count",
    "invalid_receipt_count",
    "open_receipt_count",
    "closed_receipt_count",
    "table",
    "issues",
    "boundary",
  ]) {
    if (!(key in audit)) {
      errors.push(`missing_required_field:${key}`);
    }
  }
  for (const key of Object.keys(audit)) {
    if (!AUDIT_ALLOWED_KEYS.has(key)) {
      errors.push(`unknown_key:${key}`);
    }
  }
  if (audit.schema_version !== KNOWLEDGE_INGEST_MISSING_AUDIT_SCHEMA_VERSION) {
    errors.push("schema_version_not_allowed");
  }
  if (audit.workflow_id !== KNOWLEDGE_INGEST_RECEIPT_WORKFLOW_ID) {
    errors.push("workflow_id_not_allowed");
  }
  if (audit.kind !== "knowledge_ingest_missing_audit") {
    errors.push("kind_not_allowed");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(String(audit.audit_id ?? ""))) {
    errors.push("audit_id_shape_invalid");
  }
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(audit.generated_at_utc ?? ""))) {
    errors.push("generated_at_utc_must_be_second_precision_utc");
  }
  if (!["complete", "complete_with_rejected_rows"].includes(String(audit.status ?? ""))) {
    errors.push("status_not_allowed");
  }
  if (!Array.isArray(audit.table)) {
    errors.push("table_must_be_array");
  }
  if (!Array.isArray(audit.issues)) {
    errors.push("issues_must_be_array");
  }
  if (Array.isArray(audit.table)) {
    for (const row of audit.table) {
      errors.push(...validateAuditRow(row));
    }
  }
  errors.push(...validateAuditBoundary(audit.boundary));
  errors.push(...findForbiddenKeyBlockers(audit));
  errors.push(...findUnsafeValueBlockers(audit));

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].map((error) => sanitizeIssue(error)),
  };
}

export function resolveReceiptLedgerTarget({ repoRoot = process.cwd(), ledgerFile, ledgerRef } = {}) {
  if ((ledgerFile && ledgerRef) || (!ledgerFile && !ledgerRef)) {
    throw new Error("provide_exactly_one_of_ledger_file_or_ledger_ref");
  }

  const root = path.resolve(repoRoot);
  if (ledgerRef) {
    const ref = normalizeReceiptLedgerRef(ledgerRef);
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

function normalizeReceiptLedgerSources({ repoRoot, ledgerFiles, ledgerRefs }) {
  const files = normalizeInputList(ledgerFiles);
  const refs = normalizeInputList(ledgerRefs);

  if (files.length === 0 && refs.length === 0) {
    throw new Error("provide_at_least_one_ledger_file_or_ledger_ref");
  }

  return [
    ...files.map((ledgerFile) => resolveReceiptLedgerTarget({ repoRoot, ledgerFile })),
    ...refs.map((ledgerRef) => resolveReceiptLedgerTarget({ repoRoot, ledgerRef })),
  ];
}

async function readReceiptRecords({ sources }) {
  const records = [];
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

      let receipt;
      try {
        receipt = JSON.parse(line);
      } catch {
        issues.push(buildIssue(source.ledger_ref, index + 1, "invalid_json", ["json_parse_failed"]));
        continue;
      }

      const validation = validateKnowledgeIngestReceipt(receipt);
      if (!validation.ok) {
        issues.push(buildIssue(source.ledger_ref, index + 1, "invalid_receipt", validation.errors, receipt.receipt_id));
        continue;
      }
      records.push({
        receipt,
        source_ledger_ref: source.ledger_ref,
        line_number: index + 1,
      });
    }
  }

  return { records, issues, jsonlRowCount };
}

function buildMissingAuditRows(records) {
  return records
    .map(({ receipt, source_ledger_ref: sourceLedgerRef, line_number: lineNumber }) => {
      const requiredLayers = receipt.required_layers ?? KNOWLEDGE_INGEST_LAYERS;
      const layerStatuses = Object.fromEntries(
        KNOWLEDGE_INGEST_LAYERS.map((layer) => [layer, receipt.layer_states?.[layer]?.status ?? "missing"]),
      );
      const missingLayers = requiredLayers.filter((layer) => ["missing", "queued"].includes(layerStatuses[layer]));
      const blockedLayers = requiredLayers.filter((layer) => layerStatuses[layer] === "blocked");
      const ownerDecisionLayers = requiredLayers.filter((layer) => layerStatuses[layer] === "owner_decision_needed");
      const openLayers = requiredLayers.filter((layer) => OPEN_LAYER_STATUSES.has(layerStatuses[layer]));
      return {
        receipt_id: receipt.receipt_id,
        receipt_ref: `${sourceLedgerRef}#L${lineNumber}`,
        project_code: receipt.project_code,
        capture_surface: receipt.capture_surface,
        summary_label: receipt.summary_label,
        claim_ceiling: receipt.claim_ceiling,
        required_layers: requiredLayers,
        layer_statuses: layerStatuses,
        missing_layers: missingLayers,
        blocked_layers: blockedLayers,
        owner_decision_layers: ownerDecisionLayers,
        completion_state: completionStateForLayers({ missingLayers, blockedLayers, ownerDecisionLayers, openLayers }),
        next_action: nextActionForLayers({ receipt, missingLayers, blockedLayers, ownerDecisionLayers, openLayers }),
      };
    })
    .sort((left, right) => `${left.project_code}|${left.receipt_id}`.localeCompare(`${right.project_code}|${right.receipt_id}`));
}

async function writeMissingAuditOutputs({ repoRoot, audit, auditId, outputRootRef }) {
  const rootRef = normalizeAuditOutputRootRef(outputRootRef ?? `_workmeta/system/reports/knowledge_ingest_missing_audit/${auditId}`);
  const outputRoot = path.resolve(repoRoot, rootRef);
  if (!isSubpath(repoRoot, outputRoot)) {
    throw new Error("audit_output_root_must_be_repo_relative");
  }

  const jsonRef = `${rootRef}/missing_audit.json`;
  const csvRef = `${rootRef}/missing_audit.csv`;
  const mdRef = `${rootRef}/missing_audit.md`;
  const writableAudit = {
    ...audit,
    output_refs: {
      json: jsonRef,
      csv: csvRef,
      markdown: mdRef,
    },
  };
  await writeJson(path.resolve(repoRoot, jsonRef), writableAudit);
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.resolve(repoRoot, csvRef), renderAuditCsv(audit.table), "utf8");
  await fs.writeFile(path.resolve(repoRoot, mdRef), renderAuditMarkdown(writableAudit), "utf8");

  return writableAudit.output_refs;
}

function renderAuditCsv(rows) {
  const headers = [
    "receipt_id",
    "receipt_ref",
    "project_code",
    "capture_surface",
    "summary_label",
    "claim_ceiling",
    "candidate_status",
    "source_status",
    "wiki_status",
    "rag_status",
    "canon_status",
    "missing_layers",
    "blocked_layers",
    "owner_decision_layers",
    "completion_state",
    "next_action",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = header.endsWith("_status")
            ? row.layer_statuses[header.replace(/_status$/u, "")]
            : Array.isArray(row[header])
              ? row[header].join("|")
              : row[header];
          return csvCell(value);
        })
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderAuditMarkdown(audit) {
  const lines = [
    `# Knowledge Ingest Missing Audit - ${audit.audit_id}`,
    "",
    `Generated: ${audit.generated_at_utc}`,
    `Status: ${audit.status}`,
    `Accepted receipts: ${audit.accepted_receipt_count}`,
    `Open receipts: ${audit.open_receipt_count}`,
    `Invalid receipt rows: ${audit.invalid_receipt_count}`,
    "",
    "| Receipt | Project | Summary | Missing | Blocked | Owner Decision | State | Next Action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of audit.table) {
    lines.push(
      [
        row.receipt_id,
        row.project_code,
        row.summary_label,
        row.missing_layers.join(", ") || "-",
        row.blocked_layers.join(", ") || "-",
        row.owner_decision_layers.join(", ") || "-",
        row.completion_state,
        row.next_action,
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }
  lines.push("");
  lines.push("Boundary: metadata-only audit; no source payloads, raw transcripts, NotebookLM answers, secrets, uploads, index builds, graph mutations, or canon mutations are performed.");
  return `${lines.join("\n")}\n`;
}

function validateAuditRow(row) {
  const errors = [];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return ["table.row_must_be_object"];
  }
  for (const key of [
    "receipt_id",
    "receipt_ref",
    "project_code",
    "capture_surface",
    "summary_label",
    "claim_ceiling",
    "required_layers",
    "layer_statuses",
    "missing_layers",
    "blocked_layers",
    "owner_decision_layers",
    "completion_state",
    "next_action",
  ]) {
    if (!(key in row)) {
      errors.push(`table.missing_required_field:${key}`);
    }
  }
  if (!["closed", "open_missing_layers", "blocked", "owner_decision_needed"].includes(String(row.completion_state ?? ""))) {
    errors.push("table.completion_state_not_allowed");
  }
  return errors;
}

function validateLayerStates(value, requiredLayers) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["layer_states_must_be_object"];
  }
  for (const layer of KNOWLEDGE_INGEST_LAYERS) {
    const state = value[layer];
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      errors.push(`layer_states.${layer}_must_be_object`);
      continue;
    }
    for (const key of Object.keys(state)) {
      if (!LAYER_STATE_ALLOWED_KEYS.has(key)) {
        errors.push(`layer_states.${layer}.unknown_key:${key}`);
      }
    }
    if (!KNOWLEDGE_INGEST_LAYER_STATUSES.has(state.status)) {
      errors.push(`layer_states.${layer}.status_not_allowed`);
    }
    if (REF_REQUIRED_LAYER_STATUSES.has(state.status) && !state.ref) {
      errors.push(`layer_states.${layer}.ref_required_for_${state.status}`);
    }
    if (OPEN_LAYER_STATUSES.has(state.status) && !state.next_action) {
      errors.push(`layer_states.${layer}.next_action_required_for_${state.status}`);
    }
  }
  for (const layer of requiredLayers ?? []) {
    if (!value[layer]) {
      errors.push(`required_layer_state_missing:${layer}`);
    }
  }
  return errors;
}

function validateLayerList(value) {
  const errors = [];
  if (!Array.isArray(value) || value.length === 0) {
    return ["required_layers_must_be_non_empty_array"];
  }
  for (const layer of value) {
    if (!KNOWLEDGE_INGEST_LAYERS.includes(layer)) {
      errors.push(`required_layer_not_allowed:${layer}`);
    }
  }
  return errors;
}

function validateClaimVsLayers(receipt) {
  const errors = [];
  const canonState = receipt.layer_states?.canon;
  if (receipt.claim_ceiling === "canon_entry" && canonState?.status !== "completed") {
    errors.push("canon_entry_claim_requires_canon_completed_layer");
  }
  if (canonState?.status === "completed" && !canonState.ref) {
    errors.push("canon_completed_layer_requires_ref");
  }
  if (receipt.claim_ceiling === "rejected_or_blocked") {
    const hasBlockedLayer = Object.values(receipt.layer_states ?? {}).some((state) => state?.status === "blocked");
    if (!hasBlockedLayer) {
      errors.push("rejected_or_blocked_claim_requires_blocked_layer");
    }
  }
  return errors;
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

function validateAuditBoundary(value) {
  const errors = [];
  const expected = buildAuditBoundary();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["boundary_must_be_object"];
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      errors.push(`boundary.${key}_must_be_${expectedValue}`);
    }
  }
  return errors;
}

function normalizeLayerStates(value = {}, requiredLayers = KNOWLEDGE_INGEST_LAYERS) {
  const states = {};
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (const layer of KNOWLEDGE_INGEST_LAYERS) {
    states[layer] = normalizeLayerState(layer, source[layer] ?? {}, requiredLayers.includes(layer));
  }
  return states;
}

function normalizeLayerState(layer, value, isRequired) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const ref = sanitizeNullableRef(source.ref, `layer_states.${layer}.ref`);
  const status = requireAllowed(source.status ?? (ref ? "recorded" : isRequired ? "missing" : "not_applicable"), KNOWLEDGE_INGEST_LAYER_STATUSES, `layer_states.${layer}.status`);
  const nextAction = sanitizeNullableText(source.nextAction ?? source.next_action ?? defaultLayerNextAction(layer, status), `layer_states.${layer}.next_action`, 240);
  return {
    status,
    ref,
    next_action: nextAction,
    note: sanitizeNullableText(source.note, `layer_states.${layer}.note`, 160),
    owner_decision_ref: sanitizeNullableRef(source.ownerDecisionRef ?? source.owner_decision_ref, `layer_states.${layer}.owner_decision_ref`),
  };
}

function normalizeLayerList(value) {
  const list = normalizeInputList(value).length > 0 ? normalizeInputList(value) : KNOWLEDGE_INGEST_LAYERS;
  const normalized = [...new Set(list.map((layer) => requireAllowed(layer, new Set(KNOWLEDGE_INGEST_LAYERS), "required_layer")))];
  if (normalized.length === 0) {
    throw new Error("required_layers_must_be_non_empty_array");
  }
  return normalized;
}

function normalizeBoundary(value) {
  const boundary = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...REQUIRED_BOUNDARY_FLAGS,
    ...boundary,
  };
}

function buildAuditBoundary() {
  return {
    metadata_only: true,
    reads_receipt_jsonl_only: true,
    source_payloads_read: false,
    raw_transcripts_read: false,
    notebooklm_answer_read_or_stored: false,
    drive_or_notebooklm_upload_executed: false,
    source_text_or_index_build_executed: false,
    canon_or_ontology_mutated: false,
    graph_mutation_executed: false,
    owner_decision_applied: false,
  };
}

function completionStateForLayers({ missingLayers, blockedLayers, ownerDecisionLayers, openLayers }) {
  if (blockedLayers.length > 0) {
    return "blocked";
  }
  if (ownerDecisionLayers.length > 0) {
    return "owner_decision_needed";
  }
  if (missingLayers.length > 0 || openLayers.length > 0) {
    return "open_missing_layers";
  }
  return "closed";
}

function nextActionForLayers({ receipt, missingLayers, blockedLayers, ownerDecisionLayers, openLayers }) {
  if (blockedLayers.length > 0) {
    return `Resolve blocked layers before stronger claims: ${blockedLayers.join(", ")}.`;
  }
  if (ownerDecisionLayers.length > 0) {
    return `Collect owner decision refs for: ${ownerDecisionLayers.join(", ")}.`;
  }
  if (missingLayers.includes("candidate")) {
    return "Append a metadata-only candidate or receipt row before relying on chat memory.";
  }
  if (missingLayers.includes("source")) {
    return "Run source storage audit or create source-card/manifest metadata before wiki or RAG work.";
  }
  if (missingLayers.includes("wiki")) {
    return "Route wiki preparation through knowledge_wiki_pipeline_v0 with source refs only.";
  }
  if (missingLayers.includes("rag")) {
    return "Prepare metadata-only RAG handoff or owner-gated source-text/index decision.";
  }
  if (missingLayers.includes("canon")) {
    return "Hold as candidate or route to owner/review canon decision; do not infer canon from lower layers.";
  }
  if (openLayers.length > 0) {
    return `Close queued layers or mark not_applicable with reason: ${openLayers.join(", ")}.`;
  }
  return `No missing required layers for ${receipt.receipt_id}; keep refs available for later audit.`;
}

function defaultLayerNextAction(layer, status) {
  if (CLOSED_LAYER_STATUSES.has(status)) {
    return null;
  }
  if (status === "owner_decision_needed") {
    return `Owner decision required before advancing ${layer}.`;
  }
  if (status === "blocked") {
    return `Resolve blocker before advancing ${layer}.`;
  }
  if (status === "queued") {
    return `Process queued ${layer} step.`;
  }
  return `Record ${layer} metadata ref or mark not_applicable with reason.`;
}

function inferClaimCeiling(layerStates) {
  if (Object.values(layerStates).some((state) => state.status === "blocked")) {
    return "rejected_or_blocked";
  }
  if (layerStates.canon?.status === "completed") {
    return "canon_entry";
  }
  if (layerStates.canon?.status === "prepared") {
    return "canon_candidate";
  }
  if (layerStates.wiki?.status === "completed" || layerStates.rag?.status === "completed") {
    return "validated_private";
  }
  if (layerStates.source?.status === "completed" || layerStates.source?.status === "stored") {
    return "source_supported";
  }
  return "observed";
}

function normalizeClaimCeiling(value) {
  return requireAllowed(value, CLAIM_CEILINGS, "claim_ceiling");
}

function normalizeReceiptLedgerRef(value) {
  const ref = sanitizeRef(value, "ledger_ref");
  if (!RECEIPT_LEDGER_REF_PATTERN.test(ref)) {
    throw new Error("ledger_ref_must_be_under_workmeta_knowledge_ingest_receipts");
  }
  return ref;
}

function normalizeAuditOutputRootRef(value) {
  const ref = sanitizeRef(value, "output_root_ref");
  if (!AUDIT_OUTPUT_ROOT_REF_PATTERN.test(ref)) {
    throw new Error("output_root_ref_must_be_under_workmeta_knowledge_ingest_missing_audit");
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
    normalizeReceiptLedgerRef(ref);
  }
  return filePath;
}

function normalizeReceiptId(value, receiptBase) {
  if (value !== undefined && value !== null && value !== "") {
    const id = requireNonEmptyText(value, "receipt_id");
    if (!/^knowledge_ingest_receipt_[a-f0-9]{16}$/.test(id)) {
      throw new Error("receipt_id_shape_invalid");
    }
    return id;
  }

  const stableBase = {
    project_code: receiptBase.project_code,
    capture_surface: receiptBase.capture_surface,
    ingest_request_ref: receiptBase.ingest_request_ref,
    summary_label: receiptBase.summary_label,
    required_layers: receiptBase.required_layers,
    layer_states: receiptBase.layer_states,
  };
  return `knowledge_ingest_receipt_${stableHash(stableBase).slice(0, 16)}`;
}

function normalizeAuditId(value, generatedAtUtc) {
  if (value !== undefined && value !== null && value !== "") {
    const id = requireNonEmptyText(value, "audit_id");
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(id)) {
      throw new Error("audit_id_shape_invalid");
    }
    return id;
  }
  return `knowledge_ingest_missing_audit_${generatedAtUtc.replace(/[-:]/gu, "").replace("T", "_").replace("Z", "")}`;
}

function normalizeProjectCode(value) {
  const code = requireNonEmptyText(value, "project_code");
  if (!isValidProjectCode(code)) {
    throw new Error("project_code_not_allowed");
  }
  return code;
}

function isValidProjectCode(value) {
  return value === "system" || PROJECT_CODE_PATTERN.test(String(value ?? ""));
}

function buildIssue(sourceLedgerRef, lineNumber, issueType, errors, receiptId) {
  const issue = {
    source_ledger_ref: sourceLedgerRef,
    line_number: lineNumber,
    issue_type: issueType,
    errors: errors.map((error) => sanitizeIssue(error)).slice(0, 20),
  };
  if (/^knowledge_ingest_receipt_[a-f0-9]{16}$/.test(String(receiptId ?? ""))) {
    issue.receipt_id = receiptId;
  }
  return issue;
}

function findForbiddenKeyBlockers(value, trail = "receipt") {
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
    const isRequiredBoundaryFlag = trail.endsWith(".boundary") && Object.hasOwn(REQUIRED_BOUNDARY_FLAGS, key);
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

function findUnsafeValueBlockers(value, trail = "receipt") {
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
  if (isRawSourceLikeRef(value)) {
    blockers.push(`raw_source_like_ref:${trail}`);
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
  if (isRawSourceLikeRef(normalized)) {
    throw new Error(`${key}_raw_source_like_ref_blocked`);
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

function isRawSourceLikeRef(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  return RAW_SOURCE_PATH_SEGMENT_PATTERN.test(normalized) || TEXT_PAYLOAD_EXTENSION_PATTERN.test(normalized);
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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/gu, " ");
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
