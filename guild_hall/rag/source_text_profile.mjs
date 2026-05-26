import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";

export const SOURCE_TEXT_METADATA_PROFILE_SCHEMA_VERSION = "soulforge.source_text_metadata_profile.v0";
export const SOURCE_TEXT_METADATA_PROFILE_VALIDATION_SCHEMA_VERSION =
  "soulforge.source_text_metadata_profile_validation.v0";
export const SOURCE_TEXT_METADATA_PROFILE_GENERATOR_ID =
  "guild_hall.rag.source_text_metadata_profile_generator.v0";

const DEFAULT_SOURCE_TEXT_METADATA_PROFILE_ROOT =
  "_workmeta/system/reports/rag/source_text_metadata_profiles";
const DEFAULT_PROFILE_ID = "source_text_metadata_profile_v0";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,80}$/;
const DEFAULT_SCAN_ROOTS = ["."];
const SCANNABLE_EXTENSIONS = new Set([".md", ".mjs", ".js", ".json", ".yaml", ".yml"]);
const RAW_OR_RUNTIME_DIRS = new Set([
  ".git",
  "node_modules",
  "private_extracted_text",
  "private_projection_text",
  "attachments",
  "mailbox",
  "dist",
  "build",
]);
const RAW_OR_RUNTIME_PREFIXES = [
  "_workmeta/",
  "_workspaces/",
  "guild_hall/state/",
  "private-state/",
];
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
const EXTRACTOR_ADAPTER_CANDIDATE_KEYS = new Set([
  "adapter_id",
  "current_state",
  "role",
  "expected_outputs",
  "documentation_ref",
]);
const CORE_METADATA_FIELDS = [
  "source_handle",
  "source_locator_ref",
  "source_hash",
  "source_kind",
  "source_class",
  "warehouse_state",
  "owner_approval",
  "claim_ceiling",
  "sensitivity",
  "extension",
  "bytes",
  "encrypted",
  "page_count",
  "slide_count",
  "sheet_count",
  "cell_text_count",
  "extracted_chars",
  "extraction_status",
  "parser_name",
  "parser_version",
  "parse_strategy",
  "error_code",
  "blocker_codes",
  "private_text_ref",
  "source_text_access",
  "chunking_status",
  "bm25_index_status",
  "vector_index_status",
  "table_count",
  "image_count",
  "language",
  "project_code",
  "workflow_id",
  "run_id",
  "model_id",
  "generated_at_utc",
  "created_at_utc",
  "updated_at_utc",
  "validation_status",
  "drive_ref",
  "notebooklm_packet_ref",
  "artifact_type",
  "stage",
];

export async function buildSourceTextMetadataProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profileId = normalizeSimpleId(options.profileId ?? DEFAULT_PROFILE_ID, "profile_id");
  const generatedAtUtc = formatTimestampUtc(options.now);
  const scanRoots = normalizeScanRoots(options.scanRoots);
  const repoFieldScan = await discoverMetadataFieldsFromRepo({ repoRoot, scanRoots });
  const extractionLogs = await summarizeExtractionLogs({
    repoRoot,
    extractionLogRefs: normalizeOptionalArray(options.extractionLogRefs ?? options.extractionLogRef),
  });
  const sourceSliceSummary = options.sourceSliceRef
    ? await summarizeSourceSliceCards({ repoRoot, sourceSliceRef: options.sourceSliceRef })
    : null;
  const fieldCatalog = buildFieldCatalog({
    repoFieldScan,
    extractionLogs,
    sourceSliceSummary,
  });

  return {
    schema_version: SOURCE_TEXT_METADATA_PROFILE_SCHEMA_VERSION,
    kind: "source_text_metadata_profile",
    status: "draft_pre_extraction",
    profile_id: profileId,
    generator_id: SOURCE_TEXT_METADATA_PROFILE_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    scope: {
      owner_surface: "guild_hall/rag",
      scan_roots: scanRoots,
      source_slice_ref: options.sourceSliceRef ?? null,
      extraction_log_refs: extractionLogs.map((log) => log.log_ref),
      profile_role: "configurable_metadata_field_registry_before_source_text_loading",
    },
    boundary: sourceTextMetadataProfileBoundary(),
    source_slice_summary: sourceSliceSummary,
    extraction_log_summaries: extractionLogs,
    repo_field_scan: repoFieldScan,
    metadata_field_catalog: fieldCatalog,
    extractor_adapter_candidates: buildExtractorAdapterCandidates(),
    downstream_plan: {
      current_use: "prepare_source_text_extractor_metadata_shape",
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      chunk_payloads_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
      next_owner_actions: [
        "approve_source_text_retrieval_scope",
        "choose_extractor_adapter",
        "choose_project_output_owner",
        "run_source_text_extraction_dry_run_with_payload_guard",
      ],
    },
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceTextMetadataProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = await buildSourceTextMetadataProfile(options);
  const outputRef = options.outputRef ?? defaultSourceTextMetadataProfileOutputRef({ profile, projectCode: options.projectCode });
  const outputPath = path.join(repoRoot, safeSourceTextMetadataProfileOutputPath(outputRef));
  await writeJson(outputPath, profile);
  return {
    status: "written",
    profile_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    profile_id: profile.profile_id,
    metadata_field_count: profile.metadata_field_catalog.fields.length,
    extraction_log_count: profile.extraction_log_summaries.length,
    blocked_payload_field_candidate_count:
      profile.metadata_field_catalog.blocked_payload_field_candidate_count,
  };
}

export async function loadSourceTextMetadataProfile({ repoRoot = process.cwd(), profileRef } = {}) {
  if (!profileRef) throw new Error("profile_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativePath(profileRef)));
}

export function validateSourceTextMetadataProfile(profile) {
  const blockers = [];
  if (profile?.schema_version !== SOURCE_TEXT_METADATA_PROFILE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (profile?.kind !== "source_text_metadata_profile") blockers.push("kind_must_be_source_text_metadata_profile");
  if (!isSafeId(profile?.profile_id)) blockers.push("profile_id_unsafe");
  if (profile?.status !== "draft_pre_extraction") blockers.push("profile_status_must_be_draft_pre_extraction");
  const boundary = profile?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_text_loaded !== false) blockers.push("source_text_must_not_be_loaded");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.excerpts_included !== false) blockers.push("excerpts_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_or_vector_index_included !== false) blockers.push("bm25_or_vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");

  const catalog = profile?.metadata_field_catalog ?? {};
  const fields = arrayField(catalog, "fields", blockers);
  const fieldIds = new Set();
  for (const field of fields) {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      blockers.push("metadata_field_must_be_object");
      continue;
    }
    if (!isSafeFieldId(field.field_id)) blockers.push("metadata_field_id_unsafe");
    if (PAYLOAD_FIELD_NAMES.has(field.field_id)) blockers.push(`payload_field_must_not_be_extractable:${field.field_id}`);
    if (fieldIds.has(field.field_id)) blockers.push("metadata_field_id_duplicate");
    fieldIds.add(field.field_id);
    if (!["metadata_only", "count_or_label_only", "hash_or_fingerprint_only"].includes(field.value_policy)) {
      blockers.push("metadata_field_value_policy_unknown");
    }
    for (const ref of arrayField(field, "evidence_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("metadata_field_evidence_ref_unsafe");
    }
  }

  for (const log of arrayField(profile, "extraction_log_summaries", blockers, { required: false })) {
    if (!isSafeMetadataRef(log.log_ref)) blockers.push("extraction_log_ref_unsafe");
    for (const column of arrayField(log, "columns", blockers, { required: false })) {
      if (!isSafeFieldId(column)) blockers.push("extraction_log_column_unsafe");
    }
    for (const column of arrayField(log, "usable_metadata_columns", blockers, { required: false })) {
      if (PAYLOAD_FIELD_NAMES.has(column)) blockers.push(`payload_log_column_must_not_be_usable:${column}`);
    }
  }

  validateExtractorAdapterCandidates(profile?.extractor_adapter_candidates, blockers);
  blockers.push(...findUnsafeProfileStrings(profile));
  return {
    schema_version: SOURCE_TEXT_METADATA_PROFILE_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_metadata_profile_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    profile_id: profile?.profile_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_text_loaded: boundary.source_text_loaded === false,
      no_source_payloads: boundary.source_payloads_included === false,
      no_chunk_payloads: boundary.chunk_payloads_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    },
  };
}

function sourceTextMetadataProfileBoundary() {
  return {
    metadata_only: true,
    source_text_loaded: false,
    source_payloads_included: false,
    chunk_payloads_included: false,
    excerpts_included: false,
    embeddings_included: false,
    bm25_or_vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    profile_is_not_owner_approval: true,
    profile_does_not_execute_extractor: true,
  };
}

async function discoverMetadataFieldsFromRepo({ repoRoot, scanRoots }) {
  const fieldCounts = new Map();
  const blockedPayloadFieldCounts = new Map();
  const scannedFiles = [];
  const skippedRoots = [];

  for (const rootRef of scanRoots) {
    const safeRoot = safeScanRoot(rootRef);
    const rootPath = path.join(repoRoot, safeRoot);
    if (!(await pathExists(rootPath))) {
      skippedRoots.push(safeRoot);
      continue;
    }
    const files = await listScannableFiles({ repoRoot, rootPath });
    for (const fileRef of files) {
      const filePath = path.join(repoRoot, fileRef);
      const raw = await fs.readFile(filePath, "utf8");
      const fields = extractFieldIds(raw);
      if (fields.length === 0) continue;
      scannedFiles.push(fileRef);
      for (const fieldId of fields) {
        const target = PAYLOAD_FIELD_NAMES.has(fieldId) ? blockedPayloadFieldCounts : fieldCounts;
        const current = target.get(fieldId) ?? { count: 0, refs: [] };
        current.count += 1;
        if (current.refs.length < 5) current.refs.push(fileRef);
        target.set(fieldId, current);
      }
    }
  }

  return {
    scan_mode: "repo_public_safe_metadata_field_scan",
    scanned_file_count: scannedFiles.length,
    skipped_roots: skippedRoots,
    field_candidate_count: fieldCounts.size,
    blocked_payload_field_candidate_count: blockedPayloadFieldCounts.size,
    top_fields: [...fieldCounts.entries()]
      .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
      .slice(0, 120)
      .map(([field_id, data]) => ({
        field_id,
        observed_count: data.count,
        evidence_refs: data.refs,
      })),
  };
}

async function listScannableFiles({ repoRoot, rootPath }) {
  const files = [];
  async function walk(currentPath) {
    const currentRef = normalizeRepoPath(path.relative(repoRoot, currentPath) || ".");
    if (shouldSkipPath(currentRef)) return;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const entryRef = normalizeRepoPath(path.relative(repoRoot, entryPath));
      if (entry.isDirectory()) {
        if (!shouldSkipPath(entryRef)) await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkipPath(entryRef)) continue;
      if (!SCANNABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.stat(entryPath);
      if (stat.size > 512_000) continue;
      files.push(entryRef);
      if (files.length >= 1200) return;
    }
  }
  await walk(rootPath);
  return files;
}

function extractFieldIds(raw) {
  const fields = new Set();
  const keyPattern = /^\s*["']?([A-Za-z][A-Za-z0-9_]{1,80})["']?\s*:/gm;
  let match;
  while ((match = keyPattern.exec(raw)) !== null) {
    if (isSafeFieldId(match[1])) fields.add(match[1]);
  }
  const quotedSnakePattern = /["']([a-z][a-z0-9_]{2,80})["']/g;
  while ((match = quotedSnakePattern.exec(raw)) !== null) {
    if (isSafeFieldId(match[1])) fields.add(match[1]);
  }
  return [...fields];
}

async function summarizeExtractionLogs({ repoRoot, extractionLogRefs }) {
  const summaries = [];
  for (const logRef of extractionLogRefs) {
    const safeRef = safeRepoRelativePath(logRef);
    if (!safeRef.endsWith(".csv")) {
      throw new Error("extraction_log_ref_must_be_csv");
    }
    const raw = await fs.readFile(path.join(repoRoot, safeRef), "utf8");
    const rows = parseCsv(raw);
    const columns = rows[0] ?? [];
    const usableMetadataColumns = columns.filter((column) => isSafeFieldId(column) && !PAYLOAD_FIELD_NAMES.has(column));
    const statusIndex = columns.indexOf("status");
    const extensionIndex = columns.indexOf("extension");
    const privateTextRefIndex = columns.indexOf("private_text_ref");
    const statusCounts = {};
    const extensionCounts = {};
    let privateTextRefCount = 0;
    for (const row of rows.slice(1)) {
      incrementCount(statusCounts, row[statusIndex] || "unknown");
      incrementCount(extensionCounts, row[extensionIndex] || "unknown");
      if (privateTextRefIndex >= 0 && row[privateTextRefIndex]) privateTextRefCount += 1;
    }
    const blockedOrErrorCount = Object.entries(statusCounts)
      .filter(([status]) => ["blocked", "container_only", "error"].includes(status))
      .reduce((total, [, count]) => total + count, 0);
    summaries.push({
      log_ref: safeRef,
      log_kind: "extraction_status_csv",
      payload_values_copied: false,
      column_count: columns.length,
      columns: columns.filter(isSafeFieldId),
      usable_metadata_columns: usableMetadataColumns,
      row_count: Math.max(rows.length - 1, 0),
      status_counts: sortObject(statusCounts),
      extension_counts: sortObject(extensionCounts),
      private_text_ref_count: privateTextRefCount,
      blocked_or_error_count: blockedOrErrorCount,
    });
  }
  return summaries;
}

async function summarizeSourceSliceCards({ repoRoot, sourceSliceRef }) {
  const safeRef = safeRepoRelativePath(sourceSliceRef);
  const cardSet = await readJson(path.join(repoRoot, safeRef));
  const cards = Array.isArray(cardSet.cards) ? cardSet.cards : [];
  return {
    source_slice_ref: safeRef,
    schema_version: cardSet.schema_version ?? null,
    slice_set_id: cardSet.slice_set_id ?? null,
    card_count: cards.length,
    source_kind_counts: sortObject(countBy(cards.map((card) => card.source_kind ?? "unknown"))),
    source_class_counts: sortObject(countBy(cards.map((card) => card.source_class ?? "unknown"))),
    sensitivity_counts: sortObject(countBy(cards.map((card) => card.sensitivity ?? "unknown"))),
    claim_ceiling_counts: sortObject(countBy(cards.map((card) => card.claim_ceiling ?? "unknown"))),
    index_readiness_counts: sortObject(countBy(cards.map((card) => card.index_readiness?.status ?? "unknown"))),
  };
}

function buildFieldCatalog({ repoFieldScan, extractionLogs, sourceSliceSummary }) {
  const byField = new Map();
  for (const fieldId of CORE_METADATA_FIELDS) {
    addCatalogField(byField, fieldId, {
      observed_count: 1,
      evidence_refs: ["guild_hall/rag/source_text_profile.mjs"],
      source_surfaces: ["soulforge_core_profile"],
    });
  }
  for (const field of repoFieldScan.top_fields ?? []) {
    addCatalogField(byField, field.field_id, {
      observed_count: field.observed_count,
      evidence_refs: field.evidence_refs,
      source_surfaces: ["repo_field_scan"],
    });
  }
  for (const log of extractionLogs) {
    for (const fieldId of log.usable_metadata_columns ?? []) {
      addCatalogField(byField, fieldId, {
        observed_count: 1,
        evidence_refs: [log.log_ref],
        source_surfaces: ["extraction_status_log"],
      });
    }
  }
  if (sourceSliceSummary) {
    for (const fieldId of ["source_kind", "source_class", "sensitivity", "claim_ceiling", "index_readiness"]) {
      addCatalogField(byField, fieldId, {
        observed_count: sourceSliceSummary.card_count,
        evidence_refs: [sourceSliceSummary.source_slice_ref],
        source_surfaces: ["source_slice_cards"],
      });
    }
  }

  const fields = [...byField.values()]
    .filter((field) => !PAYLOAD_FIELD_NAMES.has(field.field_id))
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      return categoryCompare || right.observed_count - left.observed_count || left.field_id.localeCompare(right.field_id);
    })
    .slice(0, 180);

  return {
    purpose: "metadata fields that a future source-text extractor should preserve or compute",
    field_count: fields.length,
    blocked_payload_field_candidate_count: repoFieldScan.blocked_payload_field_candidate_count ?? 0,
    fields,
  };
}

function addCatalogField(byField, fieldId, data) {
  if (!isSafeFieldId(fieldId) || PAYLOAD_FIELD_NAMES.has(fieldId)) return;
  const current = byField.get(fieldId) ?? {
    field_id: fieldId,
    category: categorizeField(fieldId),
    value_policy: valuePolicyForField(fieldId),
    source_surfaces: [],
    observed_count: 0,
    evidence_refs: [],
    downstream_uses: downstreamUsesForField(fieldId),
  };
  current.observed_count += data.observed_count ?? 1;
  current.source_surfaces = [...new Set([...current.source_surfaces, ...(data.source_surfaces ?? [])])].sort();
  current.evidence_refs = [...new Set([...current.evidence_refs, ...(data.evidence_refs ?? [])])].slice(0, 6);
  byField.set(fieldId, current);
}

function buildExtractorAdapterCandidates() {
  return [
    {
      adapter_id: "existing_extraction_status_csv_importer",
      current_state: "available_metadata_import",
      role: "reuse prior extraction logs without copying extracted bodies",
      expected_outputs: ["extension", "bytes", "extracted_chars", "page_count", "slide_count", "sheet_count", "status"],
    },
    {
      adapter_id: "unstructured_partition",
      current_state: "candidate_external_adapter",
      role: "turn raw documents into typed document elements when source-text retrieval is approved",
      expected_outputs: ["element_type", "page_number", "table_count", "language", "metadata"],
      documentation_ref: "external_docs_unstructured_partitioning",
    },
    {
      adapter_id: "docling_document_converter",
      current_state: "candidate_external_adapter",
      role: "convert mixed documents into structured document representation and chunk-ready exports",
      expected_outputs: ["document_format", "page_count", "table_count", "picture_count", "chunking_status"],
      documentation_ref: "external_docs_docling",
    },
    {
      adapter_id: "hwp_to_hwpx_preprocess",
      current_state: "required_for_hwp_before_body_reading",
      role: "keep HWP as preprocessing target; read exported HWPX only after owner-approved conversion",
      expected_outputs: ["conversion_status", "hwpx_ref", "blocker_codes"],
    },
  ];
}

function categorizeField(fieldId) {
  if (/(source|locator|hash|warehouse|drive|notebooklm|packet)/.test(fieldId)) return "source_identity";
  if (/(page|slide|sheet|cell|table|image|extension|bytes|encrypted|chars|language)/.test(fieldId)) return "document_shape";
  if (/(status|blocker|error|approval|claim|sensitivity|validation|access|chunk|index)/.test(fieldId)) return "governance_state";
  if (/(workflow|run|model|generated|created|updated|project|stage|artifact)/.test(fieldId)) return "provenance";
  return "custom_candidate";
}

function valuePolicyForField(fieldId) {
  if (/(hash|fingerprint)/.test(fieldId)) return "hash_or_fingerprint_only";
  if (/(count|bytes|chars|page|slide|sheet|row|column|table|image)/.test(fieldId)) return "count_or_label_only";
  return "metadata_only";
}

function downstreamUsesForField(fieldId) {
  const uses = ["source_text_preflight"];
  if (/(page|slide|sheet|table|chars|extension|bytes|encrypted|status|error)/.test(fieldId)) uses.push("extractor_selection");
  if (/(source|hash|approval|claim|sensitivity|blocker)/.test(fieldId)) uses.push("owner_decision_gate");
  if (/(workflow|run|model|project|stage|artifact)/.test(fieldId)) uses.push("graph_and_usage_analytics");
  return [...new Set(uses)].sort();
}

function parseCsv(raw) {
  return raw
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map(parseCsvLine);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeScanRoots(value) {
  const roots = normalizeOptionalArray(value);
  const selected = roots.length > 0 ? roots : DEFAULT_SCAN_ROOTS;
  return [...new Set(selected.map(safeScanRoot))].sort();
}

function normalizeOptionalArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function safeScanRoot(value) {
  const ref = normalizeRepoPath(value || ".");
  if (path.isAbsolute(ref) || ref.includes("..") || ref.startsWith("~") || ref.includes("\\")) {
    throw new Error(`unsafe scan root: ${value}`);
  }
  return ref === "" ? "." : ref;
}

function shouldSkipPath(ref) {
  const normalized = normalizeRepoPath(ref);
  if (!normalized || normalized === ".") return false;
  if (RAW_OR_RUNTIME_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
    return true;
  }
  return normalized.split("/").some((segment) => RAW_OR_RUNTIME_DIRS.has(segment));
}

function safeRepoRelativePath(value) {
  const ref = normalizeRepoPath(value);
  if (!isSafeMetadataRef(ref)) throw new Error(`unsafe repo-relative path: ${value}`);
  return ref;
}

function safeSourceTextMetadataProfileOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_TEXT_METADATA_PROFILE_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_text_metadata_profiles\//.test(ref)
  ) {
    throw new Error("source text metadata profile output must be under _workmeta/system/reports/rag/source_text_metadata_profiles/ or _workmeta/<project_code>/reports/rag/source_text_metadata_profiles/");
  }
  return ref;
}

function validateExtractorAdapterCandidates(adapters, blockers) {
  for (const adapter of arrayField({ adapters }, "adapters", blockers, { required: false })) {
    if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
      blockers.push("extractor_adapter_candidate_must_be_object");
      continue;
    }
    for (const key of Object.keys(adapter)) {
      if (!EXTRACTOR_ADAPTER_CANDIDATE_KEYS.has(key)) blockers.push(`extractor_adapter_candidate_unknown_key:${key}`);
    }
    if (!isSafeId(adapter.adapter_id)) blockers.push("extractor_adapter_candidate_id_unsafe");
    if (!isSafeId(adapter.current_state)) blockers.push("extractor_adapter_candidate_state_unsafe");
    if (adapter.documentation_ref !== undefined && !isSafeId(adapter.documentation_ref)) {
      blockers.push("extractor_adapter_candidate_documentation_ref_unsafe");
    }
    for (const output of arrayField(adapter, "expected_outputs", blockers, { required: false })) {
      if (!isSafeFieldId(output)) blockers.push("extractor_adapter_candidate_expected_output_unsafe");
      if (PAYLOAD_FIELD_NAMES.has(output)) blockers.push(`extractor_adapter_candidate_payload_output_forbidden:${output}`);
    }
  }
}

function defaultSourceTextMetadataProfileOutputRef({ profile, projectCode }) {
  const filename = "source_text_metadata_profile.json";
  if (projectCode) {
    const code = normalizeSimpleId(projectCode, "project_code");
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_text_metadata_profiles", profile.profile_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_TEXT_METADATA_PROFILE_ROOT, profile.profile_id, filename));
}

function isSafeMetadataRef(value) {
  const ref = String(value ?? "");
  if (!ref || path.isAbsolute(ref) || ref.includes("..")) return false;
  if (ref.includes("\\") || ref.startsWith("~") || /[\u0000-\u001F\u007F]/u.test(ref)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(ref)) return false;
  if (/[A-Za-z]:[\\/]/.test(ref)) return false;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(ref)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) {
    return false;
  }
  return true;
}

function findUnsafeProfileStrings(value, trail = "profile") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findUnsafeProfileStrings(item, `${trail}[${index}]`)));
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PAYLOAD_FIELD_NAMES.has(key.toLowerCase())) blockers.push(`forbidden_payload_key:${trail}.${key}`);
      blockers.push(...findUnsafeProfileStrings(child, `${trail}.${key}`));
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

function countBy(values) {
  const counts = {};
  for (const value of values) incrementCount(counts, value || "unknown");
  return counts;
}

function incrementCount(target, key) {
  const safeKey = isSafeFieldishValue(key) ? String(key) : "unsafe_or_redacted";
  target[safeKey] = (target[safeKey] ?? 0) + 1;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isSafeFieldishValue(value) {
  return /^[A-Za-z0-9가-힣_.:-]{1,120}$/u.test(String(value ?? ""));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

function isSafeFieldId(value) {
  return typeof value === "string" && FIELD_ID_PATTERN.test(value);
}

function normalizeSimpleId(value, label) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(id)) throw new Error(`${label}_must_be_simple`);
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

export function sourceTextMetadataProfileFingerprint(profile) {
  return stableHash({
    schema_version: profile?.schema_version,
    profile_id: profile?.profile_id,
    field_ids: (profile?.metadata_field_catalog?.fields ?? []).map((field) => field.field_id).sort(),
    extraction_log_refs: profile?.scope?.extraction_log_refs ?? [],
  });
}
