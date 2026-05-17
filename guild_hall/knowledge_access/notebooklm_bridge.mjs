import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { appendJsonl, normalizeRepoPath } from "../shared/io.mjs";
import {
  analyzeKnowledgeAccessLedgers,
  buildKnowledgeAccessEvent,
  resolveLedgerTarget,
  validateKnowledgeAccessEvent,
} from "./ledger.mjs";

export const NOTEBOOKLM_BRIDGE_IMPORT_SCHEMA_VERSION = "soulforge.notebooklm_metadata_bridge_import.v0";

const INPUT_EXTENSIONS = new Set([".json", ".md", ".markdown", ".yaml", ".yml"]);
const STRUCTURED_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);
const MARKDOWN_TABLE_EXTENSIONS = new Set([".md", ".markdown"]);
const AUTH_OR_SESSION_PATH_PATTERN =
  /(^|[/\\. _-])(auth|authorization|cookie|cookies|credential|credentials|login|password|passwd|secret|session|token)([/\\._ -]|$)/i;
const NOTEBOOKLM_LOCAL_STATE_PATTERN = /(^|[/\\])(?:\.notebooklm|\.notebooklm-mcp-cli)(?:[/\\]|$)/i;
const EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:[A-Za-z]:[\\/][^\s"'`)\]}>,;]*)/;
const EMBEDDED_WINDOWS_UNC_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:\\\\[^\\/\s"'`)\]}>,;]+[\\/][^\s"'`)\]}>,;]*)/;
const EMBEDDED_POSIX_RUNTIME_PATH_PATTERN =
  /(?:^|[\s"'`([{<])\/(?:Users|home|tmp|var|etc|opt|mnt|Volumes|workspace|workspaces|Soulforge|repo)(?:\/[^\s"'`)\]}>,;]*)?/i;
const SECOND_PRECISION_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const DISALLOWED_PAYLOAD_COLUMN_PATTERN =
  /(^|_)(answer|body|content|copied_text|document_text|excerpt|payload|prompt_text|query_text|raw_text|response|source_text|summary_text|transcript)(_|$)/u;
const ALLOWED_PAYLOAD_STATE_COLUMNS = new Set(["payload_state", "source_payload_state", "target_payload_state"]);

export async function importNotebookLmBridgeMetadata(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now);
  const generatedAtUtc = formatTimestampUtc(now);
  const bindingInput = resolveBridgeInput({
    repoRoot,
    file: options.bindingFile,
    ref: options.bindingRef ?? options.binding_ref,
    fieldName: "binding",
    allowedExtensions: STRUCTURED_EXTENSIONS,
  });
  const binding = await readStructuredObject(bindingInput, "binding");
  const sourceLedgerInput = resolveBridgeInput({
    repoRoot,
    file: options.sourceLedgerFile,
    ref: options.sourceLedgerRef ?? options.source_ledger_ref ?? getBridgeSurfaceRef(binding, "source_ledger_ref"),
    fieldName: "source_ledger",
    allowedExtensions: INPUT_EXTENSIONS,
  });
  const queryLogInput = resolveBridgeInput({
    repoRoot,
    file: options.queryLogFile,
    ref: options.queryLogRef ?? options.query_log_ref ?? getBridgeSurfaceRef(binding, "query_log_ref"),
    fieldName: "query_log",
    allowedExtensions: INPUT_EXTENSIONS,
  });
  const ledger = resolveLedgerTarget({
    repoRoot,
    ledgerRoot: options.ledgerRoot,
    ledgerFile: options.ledgerFile,
    now,
  });
  const sourceRows = await readBridgeRows(sourceLedgerInput, {
    rowArrayKeys: ["sources", "source_ledger", "rows", "entries"],
    rowKind: "source_ledger",
  });
  const queryRows = await readBridgeRows(queryLogInput, {
    rowArrayKeys: ["queries", "query_log", "rows", "entries"],
    rowKind: "query_log",
  });
  const sourceIndex = buildSourceIndex(sourceRows);
  const prepared = prepareImportedEvents({
    repoRoot,
    ledgerRef: ledger.ledger_ref,
    binding,
    sourceIndex,
    queryRows,
    queryLogRef: queryLogInput.ref,
  });

  if (queryRows.length === 0) {
    return buildImportSummary({
      status: "blocked",
      generatedAtUtc,
      bindingRef: bindingInput.ref,
      sourceLedgerRef: sourceLedgerInput.ref,
      queryLogRef: queryLogInput.ref,
      ledgerRef: ledger.ledger_ref,
      sourceRows,
      queryRows,
      importedEvents: [],
      blockers: [
        {
          code: "query_log_has_no_importable_rows",
          source_ref: queryLogInput.ref,
        },
      ],
    });
  }

  if (sourceIndex.blockers.length > 0 || prepared.blockers.length > 0) {
    return buildImportSummary({
      status: "blocked",
      generatedAtUtc,
      bindingRef: bindingInput.ref,
      sourceLedgerRef: sourceLedgerInput.ref,
      queryLogRef: queryLogInput.ref,
      ledgerRef: ledger.ledger_ref,
      sourceRows,
      queryRows,
      importedEvents: [],
      blockers: [...sourceIndex.blockers, ...prepared.blockers],
    });
  }

  for (const event of prepared.events) {
    await appendJsonl(ledger.path, event);
  }

  const analysis = await analyzeKnowledgeAccessLedgers({
    repoRoot,
    ledgerFiles: ledger.path,
    now,
    reviewScopeRef: queryLogInput.ref,
  });

  return buildImportSummary({
    status: "imported",
    generatedAtUtc,
    bindingRef: bindingInput.ref,
    sourceLedgerRef: sourceLedgerInput.ref,
    queryLogRef: queryLogInput.ref,
    ledgerRef: ledger.ledger_ref,
    sourceRows,
    queryRows,
    importedEvents: prepared.events,
    blockers: [],
    analysis,
  });
}

function prepareImportedEvents({ repoRoot, ledgerRef, binding, sourceIndex, queryRows, queryLogRef }) {
  const importPolicy = binding.import_policy && typeof binding.import_policy === "object"
    ? binding.import_policy
    : {};
  const defaultWorkContext =
    importPolicy.default_work_context && typeof importPolicy.default_work_context === "object"
      ? importPolicy.default_work_context
      : {};
  const actor = importPolicy.actor && typeof importPolicy.actor === "object" ? importPolicy.actor : {};
  const captureMode = importPolicy.capture_mode ?? "imported_log_entry";
  const blockers = [];
  const events = [];

  if (captureMode !== "imported_log_entry") {
    blockers.push({
      code: "capture_mode_must_be_imported_log_entry",
      source_ref: queryLogRef,
    });
    return { events: [], blockers };
  }

  for (const row of queryRows) {
    const entryRef = getFirstText(row, ["entry_ref", "entry_id", "query_ref"]) ?? `row-${row.__line_number ?? events.length + 1}`;
    const sourceRef = getFirstText(row, ["source_ref", "source_id"]);
    const timestampUtc = getFirstText(row, ["timestamp_utc", "timestamp"]);
    const knowledgeRef = getFirstText(row, ["target_knowledge_ref", "knowledge_ref", "target_ref"]);
    const rowBlockers = [];

    if (!sourceRef) {
      rowBlockers.push("missing_source_ref");
    } else if (!sourceIndex.sourceRefs.has(sourceRef)) {
      rowBlockers.push("source_ref_not_declared_in_source_ledger");
    }
    if (!timestampUtc) {
      rowBlockers.push("missing_timestamp_utc");
    } else {
      const timestampError = validateImportedTimestampUtc(timestampUtc);
      if (timestampError) {
        rowBlockers.push(timestampError);
      }
    }
    if (isUnsafeEntryRef(entryRef)) {
      rowBlockers.push("entry_ref_unsafe_path_blocked");
    }
    if (!knowledgeRef) {
      rowBlockers.push("missing_target_knowledge_ref");
    }

    if (rowBlockers.length > 0) {
      blockers.push(buildRowBlocker({ entryRef, queryLogRef, row, errors: rowBlockers }));
      continue;
    }

    try {
      const event = buildKnowledgeAccessEvent({
        repoRoot,
        ledgerRef,
        now: timestampUtc,
        captureMode: "imported_log_entry",
        actorType: getFirstText(row, ["actor_type"]) ?? actor.type ?? "advisory_handoff",
        actorId: getFirstText(row, ["actor_id"]) ?? actor.id ?? "notebooklm_metadata_bridge",
        actorRef: actor.ref,
        knowledgeRef,
        accessType: getFirstText(row, ["access_type"]) ?? importPolicy.access_type ?? "advisory_handoff",
        outcomeState: getFirstText(row, ["outcome_state"]) ?? importPolicy.outcome_state ?? "unknown",
        reasonUsed: buildImportedReasonUsed(row),
        eventSourceRef: `${queryLogRef}#${sanitizeAnchor(entryRef)}`,
        advisoryHandoffRef: `${queryLogRef}#${sanitizeAnchor(entryRef)}`,
        workflowId: getFirstText(row, ["workflow_id"]) ?? defaultWorkContext.workflow_id,
        skillId: getFirstText(row, ["skill_id"]) ?? defaultWorkContext.skill_id,
        missionId: getFirstText(row, ["mission_id"]) ?? defaultWorkContext.mission_id,
        taskRef: getFirstText(row, ["task_ref"]) ?? defaultWorkContext.task_ref,
        runRef: getFirstText(row, ["run_ref"]) ?? defaultWorkContext.run_ref,
        sourceWorkflowId: getFirstText(row, ["source_workflow_id"]) ?? importPolicy.source_workflow_id,
        targetType: getFirstText(row, ["target_type"]) ?? importPolicy.target_type ?? "knowledge_node",
      });
      const validation = validateKnowledgeAccessEvent(event);
      if (!validation.ok) {
        blockers.push(buildRowBlocker({ entryRef, queryLogRef, row, errors: validation.errors }));
        continue;
      }
      events.push(event);
    } catch (error) {
      blockers.push(
        buildRowBlocker({
          entryRef,
          queryLogRef,
          row,
          errors: [error instanceof Error ? error.message : String(error)],
        }),
      );
    }
  }

  return { events, blockers };
}

function buildImportSummary({
  status,
  generatedAtUtc,
  bindingRef,
  sourceLedgerRef,
  queryLogRef,
  ledgerRef,
  sourceRows,
  queryRows,
  importedEvents,
  blockers,
  analysis,
}) {
  return {
    schema_version: NOTEBOOKLM_BRIDGE_IMPORT_SCHEMA_VERSION,
    kind: "notebooklm_metadata_bridge_import",
    status,
    generated_at_utc: generatedAtUtc,
    binding_ref: bindingRef,
    source_ledger_ref: sourceLedgerRef,
    query_log_ref: queryLogRef,
    ledger_ref: ledgerRef,
    source_ledger_row_count: sourceRows.length,
    query_log_row_count: queryRows.length,
    imported_event_count: importedEvents.length,
    blocked_event_count: blockers.length,
    imported_events: importedEvents.map((event) => ({
      event_id: event.event_id,
      timestamp_utc: event.timestamp_utc,
      capture_mode: event.capture_mode,
      actor_type: event.actor.type,
      target_knowledge_ref: event.target.knowledge_ref,
      access_type: event.access_type,
      outcome_state: event.outcome_state,
      event_source_ref: event.event_source_ref,
    })),
    usage_summary: buildUsageSummary(importedEvents),
    blockers,
    analysis: analysis ?? null,
    authority_boundary: {
      metadata_only: true,
      imported_from_explicit_files_only: true,
      nlm_calls_executed: false,
      auth_or_session_files_read: false,
      source_payloads_read: false,
      payload_copied: false,
      notebooklm_advisory_only: true,
      canon_or_ontology_mutated: false,
      archive_or_retire_executed: false,
      no_events_fabricated_when_query_log_empty: queryRows.length === 0 ? importedEvents.length === 0 : "not_applicable",
    },
  };
}

function buildImportedReasonUsed(row) {
  const label =
    sanitizeImportedReasonLabel(getFirstText(row, ["reason_label", "reason_code", "metadata_reason_label"])) ??
    sanitizeImportedReasonLabel(getFirstText(row, ["query_ref", "query_id"])) ??
    sanitizeImportedReasonLabel(getFirstText(row, ["source_ref", "source_id"])) ??
    "metadata_row";

  return `notebooklm_import:${label}`;
}

function sanitizeImportedReasonLabel(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (AUTH_OR_SESSION_PATH_PATTERN.test(text) || NOTEBOOKLM_LOCAL_STATE_PATTERN.test(text)) {
    return null;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(text) ? text : null;
}

function buildUsageSummary(events) {
  const counts = new Map();
  for (const event of events) {
    const target = event.target.knowledge_ref;
    const row = counts.get(target) ?? {
      knowledge_ref: target,
      imported_event_count: 0,
      access_type_counts: {},
      outcome_state_counts: {},
      last_imported_timestamp_utc: null,
    };
    row.imported_event_count += 1;
    row.access_type_counts[event.access_type] = (row.access_type_counts[event.access_type] ?? 0) + 1;
    row.outcome_state_counts[event.outcome_state] = (row.outcome_state_counts[event.outcome_state] ?? 0) + 1;
    if (!row.last_imported_timestamp_utc || event.timestamp_utc > row.last_imported_timestamp_utc) {
      row.last_imported_timestamp_utc = event.timestamp_utc;
    }
    counts.set(target, row);
  }
  return {
    counts_by_target: [...counts.values()]
      .sort((left, right) => left.knowledge_ref.localeCompare(right.knowledge_ref))
      .map((row) => ({
        ...row,
        access_type_counts: sortObjectByKey(row.access_type_counts),
        outcome_state_counts: sortObjectByKey(row.outcome_state_counts),
      })),
  };
}

async function readStructuredObject(input, fieldName) {
  const ext = path.extname(input.path).toLowerCase();
  const raw = await fs.readFile(input.path, "utf8");
  const parsed = ext === ".json" ? JSON.parse(raw) : parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName}_must_be_mapping`);
  }
  return parsed;
}

async function readBridgeRows(input, { rowArrayKeys, rowKind }) {
  const raw = await fs.readFile(input.path, "utf8");
  const ext = path.extname(input.path).toLowerCase();
  const rows = MARKDOWN_TABLE_EXTENSIONS.has(ext)
    ? parseMarkdownTableRows(raw)
    : extractStructuredRows(ext === ".json" ? JSON.parse(raw) : parseYaml(raw), rowArrayKeys, rowKind);

  assertNoPayloadColumns(rows, rowKind, input.ref);
  return rows;
}

function extractStructuredRows(parsed, rowArrayKeys, rowKind) {
  if (Array.isArray(parsed)) {
    return parsed.map((row, index) => normalizeRowObject(row, index + 1, rowKind));
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${rowKind}_must_be_table_or_row_list`);
  }
  for (const key of rowArrayKeys) {
    if (Array.isArray(parsed[key])) {
      return parsed[key].map((row, index) => normalizeRowObject(row, index + 1, rowKind));
    }
  }
  throw new Error(`${rowKind}_must_include_rows`);
}

function parseMarkdownTableRows(raw) {
  const lines = raw.split(/\r?\n/u);
  let header = null;
  let separatorLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || !line.endsWith("|")) {
      continue;
    }
    const cells = splitMarkdownTableLine(line);
    if (!header) {
      header = cells.map(normalizeHeaderKey);
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))) {
      separatorLine = index;
      break;
    }
    header = cells.map(normalizeHeaderKey);
  }

  if (!header || separatorLine === -1) {
    throw new Error("markdown_table_header_not_found");
  }

  const rows = [];
  for (let index = separatorLine + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    if (!line.startsWith("|") || !line.endsWith("|")) {
      continue;
    }
    const cells = splitMarkdownTableLine(line);
    const row = {};
    for (let cellIndex = 0; cellIndex < header.length; cellIndex += 1) {
      row[header[cellIndex]] = cells[cellIndex] ?? "";
    }
    row.__line_number = index + 1;
    rows.push(row);
  }
  return rows;
}

function splitMarkdownTableLine(line) {
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

function normalizeRowObject(row, lineNumber, rowKind) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`${rowKind}_row_must_be_mapping`);
  }
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeaderKey(key)] = value === undefined || value === null ? "" : String(value).trim();
  }
  normalized.__line_number = lineNumber;
  return normalized;
}

function assertNoPayloadColumns(rows, rowKind, sourceRef) {
  const disallowed = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith("__")) {
        continue;
      }
      if (ALLOWED_PAYLOAD_STATE_COLUMNS.has(key)) {
        continue;
      }
      if (DISALLOWED_PAYLOAD_COLUMN_PATTERN.test(key)) {
        disallowed.add(key);
      }
    }
  }
  if (disallowed.size > 0) {
    throw new Error(`${rowKind}_payload_columns_blocked: ${sourceRef}`);
  }
}

function buildSourceIndex(sourceRows) {
  const sourceRefs = new Set();
  const blockers = [];
  for (const row of sourceRows) {
    const sourceRef = getFirstText(row, ["source_ref", "source_id"]);
    if (!sourceRef) {
      blockers.push({
        code: "source_ledger_row_missing_source_ref",
        line_number: row.__line_number ?? null,
      });
      continue;
    }
    sourceRefs.add(sourceRef);
  }
  return { sourceRefs, blockers };
}

function validateImportedTimestampUtc(value) {
  if (!SECOND_PRECISION_UTC_PATTERN.test(value)) {
    return "timestamp_utc_must_be_second_precision_utc";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || formatTimestampUtc(parsed) !== value) {
    return "timestamp_utc_must_be_valid_utc";
  }
  return null;
}

function isUnsafeEntryRef(value) {
  const text = String(value).trim();
  const looksLikePath = /[/\\]/u.test(text) || containsRuntimeAbsolutePath(text);
  return NOTEBOOKLM_LOCAL_STATE_PATTERN.test(text) || containsRuntimeAbsolutePath(text) || (looksLikePath && AUTH_OR_SESSION_PATH_PATTERN.test(text));
}

function buildRowBlocker({ entryRef, queryLogRef, row, errors }) {
  return {
    code: "query_log_row_blocked",
    source_ref: queryLogRef,
    entry_ref: sanitizeBlockerText(entryRef),
    line_number: Number.isInteger(row.__line_number) ? row.__line_number : null,
    errors: errors.map((error) => normalizeBridgeBlockerError(error)).slice(0, 20),
  };
}

function normalizeBridgeBlockerError(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (AUTH_OR_SESSION_PATH_PATTERN.test(text) || NOTEBOOKLM_LOCAL_STATE_PATTERN.test(text)) {
    return "validation_error_redacted_sensitive_path";
  }
  if (containsRuntimeAbsolutePath(text)) {
    return "validation_error_redacted_runtime_absolute_path";
  }

  const invalidEnum = text.match(/^(capture_mode|actor\.type|access_type|outcome_state)(?:_not_allowed| is not allowed):/u);
  if (invalidEnum) {
    return `${invalidEnum[1]}_not_allowed`;
  }
  if (text.startsWith("knowledge_ref_root_blocked:")) {
    return "knowledge_ref_root_blocked";
  }
  if (/^missing required field: (event_id|timestamp_utc|capture_mode|ledger_ref|actor|target|access_type|reason_used|work_context|outcome_state|redaction)$/u.test(text)) {
    return text;
  }
  if (/^missing_required_field: [a-z0-9_.]+$/u.test(text)) {
    return text;
  }
  if (/^[a-z0-9_.]+$/u.test(text)) {
    return text;
  }
  return "validation_error_redacted";
}

function resolveBridgeInput({ repoRoot, file, ref, fieldName, allowedExtensions }) {
  if ((file && ref) || (!file && !ref)) {
    throw new Error(`provide_exactly_one_${fieldName}_file_or_ref`);
  }
  const raw = String(file ?? ref).trim();
  if (!raw) {
    throw new Error(`missing_required_field: ${fieldName}`);
  }
  if (raw.includes("\0")) {
    throw new Error(`${fieldName}_path_contains_null_byte`);
  }
  assertNotAuthOrSessionPath(raw, fieldName);

  const resolved = file
    ? resolveInputFilePath(repoRoot, raw)
    : resolveInputRefPath(repoRoot, raw, fieldName);
  const extension = path.extname(resolved).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error(`${fieldName}_file_extension_not_allowed`);
  }
  return {
    path: resolved,
    ref: buildInputRef(repoRoot, resolved),
  };
}

function resolveInputFilePath(repoRoot, raw) {
  return path.isAbsolute(raw) || path.win32.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(repoRoot, raw);
}

function resolveInputRefPath(repoRoot, raw, fieldName) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    throw new Error(`${fieldName}_ref_must_be_repo_relative`);
  }
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    throw new Error(`${fieldName}_ref_must_be_repo_relative`);
  }
  const normalized = raw.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${fieldName}_ref_must_not_use_path_traversal`);
  }
  return path.resolve(repoRoot, normalized);
}

function buildInputRef(repoRoot, filePath) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedFile = path.resolve(filePath);
  if (isSubpath(resolvedRoot, resolvedFile)) {
    return normalizeRepoPath(path.relative(resolvedRoot, resolvedFile));
  }
  return `bridge_file:${path.basename(resolvedFile)}`;
}

function assertNotAuthOrSessionPath(raw, fieldName) {
  if (AUTH_OR_SESSION_PATH_PATTERN.test(raw) || NOTEBOOKLM_LOCAL_STATE_PATTERN.test(raw)) {
    throw new Error(`${fieldName}_auth_or_session_path_blocked`);
  }
}

function getBridgeSurfaceRef(binding, key) {
  if (binding.bridge_surface && typeof binding.bridge_surface === "object") {
    return binding.bridge_surface[key];
  }
  return binding[key];
}

function getFirstText(row, keys) {
  for (const key of keys) {
    const value = row[normalizeHeaderKey(key)];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function sanitizeAnchor(value) {
  return String(value).trim().replace(/[^A-Za-z0-9._:-]+/gu, "-").slice(0, 80) || "row";
}

function sanitizeBlockerText(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (AUTH_OR_SESSION_PATH_PATTERN.test(text) || NOTEBOOKLM_LOCAL_STATE_PATTERN.test(text)) {
    return "blocked_sensitive_path";
  }
  if (containsRuntimeAbsolutePath(text)) {
    return "blocked_absolute_path";
  }
  return text.length <= 160 ? text : `${text.slice(0, 145)}... [truncated]`;
}

function containsRuntimeAbsolutePath(value) {
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
    EMBEDDED_WINDOWS_UNC_PATH_PATTERN.test(value) ||
    EMBEDDED_POSIX_RUNTIME_PATH_PATTERN.test(value)
  );
}

function normalizeHeaderKey(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

function sortObjectByKey(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isSubpath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeNow(value) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function formatTimestampUtc(value) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}
