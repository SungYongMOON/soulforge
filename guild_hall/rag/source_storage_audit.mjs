import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";

export const KNOWLEDGE_SOURCE_STORAGE_AUDIT_SCHEMA_VERSION =
  "soulforge.knowledge_source_storage_audit.v0";
export const KNOWLEDGE_SOURCE_STORAGE_AUDIT_RUNNER_ID =
  "guild_hall.rag.knowledge_source_storage_audit.v0";

const DEFAULT_OUTPUT_ROOT = "_workmeta/system/reports/knowledge_source_storage_audit";
const DEFAULT_WORKMETA_ROOT = "_workmeta";
const DEFAULT_WORKSPACE_ROOTS = ["_workspaces"];
const AUDIT_FILENAMES = new Set([
  "metadata_source_ledger.yaml",
  "source_roots.yaml",
  "document_probe.json",
  "file_hashes_sha256.csv",
  "extraction_status.csv",
]);
const PAYLOAD_EXTENSIONS = new Set([
  ".7z",
  ".csv",
  ".doc",
  ".docx",
  ".egg",
  ".eml",
  ".hwp",
  ".hwpx",
  ".json",
  ".md",
  ".mbox",
  ".msg",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rar",
  ".txt",
  ".xls",
  ".xlsm",
  ".xlsx",
  ".yaml",
  ".yml",
  ".zip",
]);
const SECRET_LIKE_SEGMENT_PATTERN =
  /(^|[\\/_.-])(auth|authorization|bearer|cookie|credential|credentials|passwd|password|private_key|refresh_token|secret|session|token)([\\/_.-]|$)/iu;

export async function buildKnowledgeSourceStorageAudit(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now, options.date);
  const auditId = normalizeSafeId(
    options.auditId ?? `knowledge_source_storage_audit_${now.slice(0, 10).replaceAll("-", "")}`,
  );
  const outputRootRef = safeRepoRelativeRef(options.outputRootRef ?? DEFAULT_OUTPUT_ROOT);
  const outputDirRef = safeRepoRelativeRef(path.posix.join(outputRootRef, auditId));
  const workmetaRootRef = safeRepoRelativeRef(options.workmetaRootRef ?? DEFAULT_WORKMETA_ROOT);
  const workspaceRootRefs = normalizeRefArray(options.workspaceRootRefs ?? DEFAULT_WORKSPACE_ROOTS);
  const scanWorkspace = options.scanWorkspace !== false;
  const hashFiles = options.hashFiles === true;
  const maxOrphanRows = normalizePositiveInteger(options.maxOrphanRows, 5000);

  const discovered = await discoverAuditFiles({ repoRoot, workmetaRootRef });
  const sourceRootBindings = await loadSourceRootBindings({ repoRoot, refs: discovered.sourceRootRefs });
  const sourceRecords = new Map();
  const parseWarnings = [];

  for (const ref of discovered.metadataLedgerRefs) {
    await mergeRecordsFromMetadataLedger({
      repoRoot,
      ref,
      sourceRootBindings,
      sourceRecords,
      parseWarnings,
    });
  }
  for (const ref of discovered.documentProbeRefs) {
    await mergeRecordsFromDocumentProbe({ repoRoot, ref, sourceRecords, parseWarnings });
  }
  for (const ref of discovered.fileHashCsvRefs) {
    await mergeRecordsFromFileHashesCsv({ repoRoot, ref, sourceRecords, parseWarnings });
  }
  for (const ref of discovered.extractionStatusCsvRefs) {
    await mergeRecordsFromExtractionStatusCsv({ repoRoot, ref, sourceRecords, parseWarnings });
  }

  const workspaceRoots = await resolveWorkspaceRoots({ repoRoot, workspaceRootRefs });
  const sourceRows = await buildSourceRows({
    repoRoot,
    now,
    records: [...sourceRecords.values()],
    workspaceRoots,
    hashFiles,
  });
  sourceRows.sort(compareSourceRows);
  sourceRows.forEach((row, index) => {
    row.row_number = index + 1;
  });

  const duplicateRecordedHashes = buildDuplicateRecordedHashRows(sourceRows);
  const sourcePathIndex = buildSourcePathIndex(sourceRows);
  const orphanWorkspaceFiles = scanWorkspace
    ? await buildOrphanWorkspaceRows({ repoRoot, workspaceRoots, sourcePathIndex, maxOrphanRows })
    : [];
  const orphanRowsTruncated = scanWorkspace && orphanWorkspaceFiles.length >= maxOrphanRows;
  const summary = buildSummary({
    now,
    auditId,
    outputDirRef,
    discovered,
    sourceRows,
    duplicateRecordedHashes,
    orphanWorkspaceFiles,
    orphanRowsTruncated,
    workspaceRoots,
    parseWarnings,
    hashFiles,
    scanWorkspace,
  });
  const audit = {
    schema_version: KNOWLEDGE_SOURCE_STORAGE_AUDIT_SCHEMA_VERSION,
    kind: "knowledge_source_storage_audit",
    audit_id: auditId,
    generated_at_utc: now,
    runner_id: KNOWLEDGE_SOURCE_STORAGE_AUDIT_RUNNER_ID,
    claim_ceiling: "observed",
    boundary: metadataOnlyBoundary({ hashFiles }),
    scan_policy: {
      workmeta_root_ref: workmetaRootRef,
      workspace_root_refs: workspaceRootRefs,
      workspace_scan_enabled: scanWorkspace,
      max_orphan_rows: maxOrphanRows,
      source_payloads_copied_or_moved: false,
      source_text_or_payload_bodies_included: false,
      secret_like_paths_skipped: true,
    },
    artifacts: buildArtifactRefs(outputDirRef),
    summary,
    workspace_roots: workspaceRoots.map((item) => ({
      workspace_ref: item.ref,
      path: item.path,
      real_path: item.realPath,
      exists: item.exists,
    })),
    source_rows: sourceRows,
    duplicate_recorded_hashes: duplicateRecordedHashes,
    orphan_workspace_files: orphanWorkspaceFiles,
    parse_warnings: parseWarnings,
  };
  const validation = validateKnowledgeSourceStorageAudit(audit);
  return {
    schema_version: "soulforge.knowledge_source_storage_audit_result.v0",
    kind: "knowledge_source_storage_audit_result",
    status: validation.status === "pass" ? "ready" : "invalid",
    generated_at_utc: now,
    output_dir_ref: outputDirRef,
    artifacts: audit.artifacts,
    summary,
    audit,
    validation,
    rendered: {
      source_storage_audit_csv: renderSourceRowsCsv(sourceRows),
      missing_originals_csv: renderSourceRowsCsv(sourceRows.filter((row) => row.source_file_state === "missing_original")),
      pointer_only_sources_csv: renderSourceRowsCsv(
        sourceRows.filter((row) => row.storage_class === "external_pointer_only"),
      ),
      duplicate_recorded_hashes_csv: renderDuplicateRecordedHashesCsv(duplicateRecordedHashes),
      orphan_workspace_files_csv: renderOrphanRowsCsv(orphanWorkspaceFiles),
      summary_md: renderSummaryMarkdown(summary),
      owner_decision_queue_yaml: renderOwnerDecisionQueueYaml({ summary, sourceRows, orphanRowsTruncated }),
      validation_log_md: renderValidationLog({ validation, summary }),
    },
  };
}

export async function writeKnowledgeSourceStorageAudit(options = {}) {
  const result = await buildKnowledgeSourceStorageAudit(options);
  if (result.validation.status !== "pass") {
    const detail = result.validation.errors.join("; ") || "unknown validation error";
    throw new Error(`knowledge source storage audit failed validation: ${detail}`);
  }
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = path.join(repoRoot, result.output_dir_ref);
  await fs.mkdir(outputDir, { recursive: true });
  await writeJson(path.join(repoRoot, result.artifacts.audit_json_ref), result.audit);
  await writeJson(path.join(repoRoot, result.artifacts.summary_json_ref), result.summary);
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.source_storage_audit_csv_ref),
    result.rendered.source_storage_audit_csv,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.missing_originals_csv_ref),
    result.rendered.missing_originals_csv,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.pointer_only_sources_csv_ref),
    result.rendered.pointer_only_sources_csv,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.duplicate_recorded_hashes_csv_ref),
    result.rendered.duplicate_recorded_hashes_csv,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.orphan_workspace_files_csv_ref),
    result.rendered.orphan_workspace_files_csv,
    "utf8",
  );
  await fs.writeFile(path.join(repoRoot, result.artifacts.summary_md_ref), result.rendered.summary_md, "utf8");
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.owner_decision_queue_ref),
    result.rendered.owner_decision_queue_yaml,
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, result.artifacts.validation_log_ref),
    result.rendered.validation_log_md,
    "utf8",
  );
  return {
    status: "written",
    output_dir_ref: result.output_dir_ref,
    artifacts: result.artifacts,
    summary: result.summary.counts,
  };
}

export async function loadKnowledgeSourceStorageAudit({ repoRoot = process.cwd(), auditRef } = {}) {
  if (!auditRef) throw new Error("--audit-ref requires a value");
  return readJson(path.join(path.resolve(repoRoot), safeRepoRelativeRef(auditRef)));
}

export function validateKnowledgeSourceStorageAudit(audit) {
  const errors = [];
  if (audit?.schema_version !== KNOWLEDGE_SOURCE_STORAGE_AUDIT_SCHEMA_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (audit?.kind !== "knowledge_source_storage_audit") errors.push("kind_mismatch");
  if (audit?.boundary?.metadata_only !== true) errors.push("boundary_metadata_only_must_be_true");
  if (audit?.boundary?.read_only !== true) errors.push("boundary_read_only_must_be_true");
  if (audit?.boundary?.source_mutation_executed !== false) {
    errors.push("boundary_source_mutation_executed_must_be_false");
  }
  if (audit?.boundary?.source_payloads_copied_or_moved !== false) {
    errors.push("boundary_source_payloads_copied_or_moved_must_be_false");
  }
  if (audit?.boundary?.source_text_decoded !== false) errors.push("boundary_source_text_decoded_must_be_false");
  if (audit?.boundary?.source_text_or_payload_bodies_included !== false) {
    errors.push("boundary_source_text_or_payload_bodies_included_must_be_false");
  }
  if (!Array.isArray(audit?.source_rows)) errors.push("source_rows_must_be_array");
  if (!Array.isArray(audit?.orphan_workspace_files)) errors.push("orphan_workspace_files_must_be_array");
  if (!audit?.summary?.counts) errors.push("summary_counts_missing");
  for (const row of audit?.source_rows ?? []) {
    if (!row.row_id || !row.relative_path) errors.push(`source_row_missing_identity:${row?.row_number ?? "unknown"}`);
    if (row.source_text_or_payload_body_included !== false) {
      errors.push(`source_row_includes_payload_body:${row.row_id ?? "unknown"}`);
    }
    if (!["existing_original", "missing_original", "unresolved_path", "unreadable"].includes(row.source_file_state)) {
      errors.push(`source_row_bad_file_state:${row.row_id ?? "unknown"}`);
    }
  }
  return {
    schema_version: "soulforge.knowledge_source_storage_audit_validation.v0",
    status: errors.length === 0 ? "pass" : "fail",
    errors,
  };
}

async function discoverAuditFiles({ repoRoot, workmetaRootRef }) {
  const root = path.join(repoRoot, workmetaRootRef);
  const refs = [];
  if (await pathExists(root)) {
    for await (const filePath of walkFiles(root, { skipSecretLike: true })) {
      const name = path.basename(filePath);
      if (!AUDIT_FILENAMES.has(name)) continue;
      refs.push(normalizeRepoPath(path.relative(repoRoot, filePath)));
    }
  }
  refs.sort();
  return {
    all_refs: refs,
    metadataLedgerRefs: refs.filter((ref) => ref.endsWith("metadata_source_ledger.yaml")),
    sourceRootRefs: refs.filter((ref) => ref.endsWith("source_roots.yaml")),
    documentProbeRefs: refs.filter((ref) => ref.endsWith("document_probe.json")),
    fileHashCsvRefs: refs.filter((ref) => ref.endsWith("file_hashes_sha256.csv")),
    extractionStatusCsvRefs: refs.filter((ref) => ref.endsWith("extraction_status.csv")),
  };
}

async function loadSourceRootBindings({ repoRoot, refs }) {
  const byRef = new Map();
  const byProject = new Map();
  for (const ref of refs) {
    const raw = await fs.readFile(path.join(repoRoot, ref), "utf8");
    const parsed = parseYaml(raw) ?? {};
    const projectCode = parsed.project_code ?? inferProjectCodeFromRef(ref);
    const bindings = [];
    for (const binding of parsed.bindings ?? []) {
      const normalized = {
        binding_ref: ref,
        project_code: projectCode,
        binding_id: binding.binding_id ?? null,
        storage_surface: binding.storage_surface ?? null,
        source_root_label: binding.source_root_label ?? null,
        source_root_path: binding.source_root_path ?? null,
        source_root_path_is_private: binding.source_root_path_is_private ?? null,
        source_payload_owner: binding.source_payload_owner ?? null,
        agent_mutation_allowed: binding.agent_mutation_allowed ?? null,
        notebooklm_upload_allowed: binding.notebooklm_upload_allowed ?? null,
      };
      bindings.push(normalized);
      const projectList = byProject.get(projectCode) ?? [];
      projectList.push(normalized);
      byProject.set(projectCode, projectList);
    }
    byRef.set(ref, bindings);
  }
  return { byRef, byProject };
}

async function mergeRecordsFromMetadataLedger({ repoRoot, ref, sourceRootBindings, sourceRecords, parseWarnings }) {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ref), "utf8");
    const parsed = parseYaml(raw) ?? {};
    const projectCode = parsed.project_code ?? inferProjectCodeFromRef(ref);
    const bindingRef = parsed.source_root_binding_ref ? normalizeRepoPath(parsed.source_root_binding_ref) : null;
    const binding = firstBindingForLedger({ bindingRef, projectCode, sourceRootBindings });
    for (const entry of parsed.source_entries ?? []) {
      const relativePath = entry.storage_locator?.relative_path ?? entry.relative_path ?? entry.title_label;
      mergeSourceRecord(sourceRecords, {
        source_handle: entry.source_handle ?? null,
        project_code: projectCode,
        title_label: entry.title_label ?? relativePath,
        source_kind: entry.source_kind ?? path.extname(relativePath ?? ""),
        source_class: entry.source_class ?? null,
        category: entry.category ?? null,
        lifecycle_state: entry.lifecycle_state ?? null,
        storage_surface: entry.storage_locator?.storage_surface ?? binding?.storage_surface ?? null,
        locator_kind: entry.storage_locator?.locator_kind ?? null,
        relative_path: relativePath,
        source_root_path: binding?.source_root_path ?? null,
        source_root_binding_ref: bindingRef,
        source_root_binding_id: binding?.binding_id ?? null,
        recorded_size_bytes: normalizeInteger(entry.file_identity?.bytes),
        recorded_sha256: normalizeHash(entry.file_identity?.sha256),
        extraction_status: entry.extraction_probe?.status ?? null,
        private_text_ref: entry.extraction_probe?.private_text_ref ?? null,
        claim_ceiling: entry.review_state?.claim_ceiling ?? parsed.claim_policy?.default_claim_ceiling ?? "observed",
        evidence_refs: [ref],
        evidence_kinds: ["metadata_source_ledger"],
      });
    }
  } catch (error) {
    parseWarnings.push({ ref, warning: `metadata_ledger_parse_failed:${error.message}` });
  }
}

async function mergeRecordsFromDocumentProbe({ repoRoot, ref, sourceRecords, parseWarnings }) {
  try {
    const parsed = await readJson(path.join(repoRoot, ref));
    const projectCode = inferProjectCodeFromRef(ref);
    for (const row of parsed.rows ?? []) {
      mergeSourceRecord(sourceRecords, {
        source_handle: row.handle ?? null,
        project_code: projectCode,
        title_label: row.relative_path ?? row.handle ?? null,
        source_kind: row.extension ?? path.extname(row.relative_path ?? ""),
        relative_path: row.relative_path ?? null,
        source_root_path: parsed.source_root ?? null,
        recorded_size_bytes: normalizeInteger(row.bytes),
        recorded_sha256: normalizeHash(row.sha256),
        extraction_status: row.status ?? null,
        private_text_ref: row.private_text_ref || null,
        claim_ceiling: "observed",
        evidence_refs: [ref],
        evidence_kinds: ["document_probe"],
      });
    }
  } catch (error) {
    parseWarnings.push({ ref, warning: `document_probe_parse_failed:${error.message}` });
  }
}

async function mergeRecordsFromFileHashesCsv({ repoRoot, ref, sourceRecords, parseWarnings }) {
  try {
    const rows = parseCsv(await fs.readFile(path.join(repoRoot, ref), "utf8"));
    const projectCode = inferProjectCodeFromRef(ref);
    const sourceRootPath = await siblingDocumentProbeSourceRoot({ repoRoot, ref });
    for (const row of rows) {
      mergeSourceRecord(sourceRecords, {
        project_code: projectCode,
        title_label: row.relative_path ?? null,
        relative_path: row.relative_path ?? null,
        source_root_path: sourceRootPath,
        recorded_size_bytes: normalizeInteger(row.bytes),
        recorded_sha256: normalizeHash(row.sha256),
        claim_ceiling: "observed",
        evidence_refs: [ref],
        evidence_kinds: ["file_hashes_sha256"],
      });
    }
  } catch (error) {
    parseWarnings.push({ ref, warning: `file_hashes_csv_parse_failed:${error.message}` });
  }
}

async function mergeRecordsFromExtractionStatusCsv({ repoRoot, ref, sourceRecords, parseWarnings }) {
  try {
    const rows = parseCsv(await fs.readFile(path.join(repoRoot, ref), "utf8"));
    const projectCode = inferProjectCodeFromRef(ref);
    const sourceRootPath = await siblingDocumentProbeSourceRoot({ repoRoot, ref });
    for (const row of rows) {
      mergeSourceRecord(sourceRecords, {
        source_handle: row.handle ?? null,
        project_code: projectCode,
        title_label: row.relative_path ?? row.handle ?? null,
        source_kind: row.extension ?? path.extname(row.relative_path ?? ""),
        relative_path: row.relative_path ?? null,
        source_root_path: sourceRootPath,
        recorded_size_bytes: normalizeInteger(row.bytes),
        recorded_sha256: normalizeHash(row.sha256),
        extraction_status: row.status ?? null,
        private_text_ref: row.private_text_ref || null,
        claim_ceiling: "observed",
        evidence_refs: [ref],
        evidence_kinds: ["extraction_status"],
      });
    }
  } catch (error) {
    parseWarnings.push({ ref, warning: `extraction_status_csv_parse_failed:${error.message}` });
  }
}

function mergeSourceRecord(sourceRecords, patch) {
  if (!patch.relative_path && !patch.source_handle) return;
  const key = sourceRecordKey(patch);
  const current = sourceRecords.get(key) ?? {
    source_handle: null,
    project_code: patch.project_code ?? "unknown",
    evidence_refs: [],
    evidence_kinds: [],
  };
  for (const [keyName, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") continue;
    if (keyName === "evidence_refs" || keyName === "evidence_kinds") continue;
    if (current[keyName] === undefined || current[keyName] === null || current[keyName] === "") {
      current[keyName] = value;
    }
  }
  current.evidence_refs = unique([...(current.evidence_refs ?? []), ...(patch.evidence_refs ?? [])]);
  current.evidence_kinds = unique([...(current.evidence_kinds ?? []), ...(patch.evidence_kinds ?? [])]);
  sourceRecords.set(key, current);
}

function sourceRecordKey(record) {
  const projectCode = record.project_code ?? "unknown";
  if (record.source_handle) return `${projectCode}|handle|${record.source_handle}`;
  return `${projectCode}|path|${record.source_root_path ?? ""}|${record.relative_path ?? ""}|${record.recorded_sha256 ?? ""}`;
}

async function buildSourceRows({ repoRoot, now, records, workspaceRoots, hashFiles }) {
  const rows = [];
  for (const record of records) {
    const resolvedPath = resolveSourcePath(record);
    const statResult = resolvedPath ? await statFileSafe(resolvedPath) : { state: "unresolved_path" };
    const realPath = statResult.exists ? await realpathSafe(resolvedPath) : null;
    const sourceFileState = statResult.state;
    const storageClass = classifyStorage({
      repoRoot,
      resolvedPath,
      realPath,
      sourceFileState,
      workspaceRoots,
    });
    const actualSha256 =
      hashFiles && statResult.exists ? await hashFileSha256(resolvedPath).catch(() => null) : null;
    const hashStatus = classifyHashStatus(record.recorded_sha256, actualSha256, hashFiles, statResult.exists);
    const sizeStatus = classifySizeStatus(record.recorded_size_bytes, statResult.sizeBytes);
    rows.push({
      row_id: rowId("knowledge_source_storage", `${record.project_code}:${record.source_handle ?? record.relative_path}`),
      generated_at_utc: now,
      project_code: record.project_code ?? "unknown",
      source_handle: record.source_handle ?? null,
      title_label: record.title_label ?? record.relative_path ?? record.source_handle ?? null,
      source_kind: record.source_kind ?? path.extname(record.relative_path ?? ""),
      source_class: record.source_class ?? null,
      category: record.category ?? null,
      lifecycle_state: record.lifecycle_state ?? null,
      claim_ceiling: record.claim_ceiling ?? "observed",
      storage_surface: record.storage_surface ?? null,
      locator_kind: record.locator_kind ?? null,
      source_root_binding_ref: record.source_root_binding_ref ?? null,
      source_root_binding_id: record.source_root_binding_id ?? null,
      source_root_path: record.source_root_path ?? null,
      relative_path: record.relative_path ?? null,
      resolved_path: resolvedPath,
      real_path: realPath,
      storage_class: storageClass,
      source_file_state: sourceFileState,
      recorded_size_bytes: record.recorded_size_bytes ?? null,
      actual_size_bytes: statResult.sizeBytes ?? null,
      size_status: sizeStatus,
      recorded_sha256: record.recorded_sha256 ?? null,
      actual_sha256: actualSha256,
      hash_status: hashStatus,
      extraction_status: record.extraction_status ?? null,
      private_text_ref: record.private_text_ref ?? null,
      evidence_kinds: record.evidence_kinds ?? [],
      evidence_refs: record.evidence_refs ?? [],
      recommended_action: recommendSourceAction({
        sourceFileState,
        storageClass,
        sizeStatus,
        hashStatus,
      }),
      source_text_or_payload_body_included: false,
    });
  }
  return rows;
}

async function resolveWorkspaceRoots({ repoRoot, workspaceRootRefs }) {
  const roots = [];
  for (const ref of workspaceRootRefs) {
    const rootPath = path.join(repoRoot, ref);
    const exists = await pathExists(rootPath);
    roots.push({
      ref,
      path: rootPath,
      realPath: exists ? await realpathSafe(rootPath) : null,
      exists,
    });
  }
  return roots;
}

async function buildOrphanWorkspaceRows({ repoRoot, workspaceRoots, sourcePathIndex, maxOrphanRows }) {
  const rows = [];
  for (const workspaceRoot of workspaceRoots) {
    if (!workspaceRoot.exists) continue;
    for await (const filePath of walkFiles(workspaceRoot.path, { skipSecretLike: true })) {
      const extension = path.extname(filePath).toLowerCase();
      if (!PAYLOAD_EXTENSIONS.has(extension)) continue;
      const resolvedPath = path.resolve(filePath);
      const realPath = await realpathSafe(filePath);
      if (sourcePathIndex.has(pathKey(resolvedPath)) || sourcePathIndex.has(pathKey(realPath))) continue;
      const stat = await statFileSafe(filePath);
      rows.push({
        row_number: rows.length + 1,
        workspace_ref: workspaceRoot.ref,
        repo_relative_path: normalizeRepoPath(path.relative(repoRoot, filePath)),
        real_path: realPath,
        extension,
        size_bytes: stat.sizeBytes ?? null,
        recommended_action: "review whether this workspace file needs a metadata source ledger row",
        source_text_or_payload_body_included: false,
      });
      if (rows.length >= maxOrphanRows) return rows;
    }
  }
  return rows;
}

function buildSourcePathIndex(sourceRows) {
  const values = new Set();
  for (const row of sourceRows) {
    if (row.resolved_path) values.add(pathKey(row.resolved_path));
    if (row.real_path) values.add(pathKey(row.real_path));
  }
  return values;
}

function buildDuplicateRecordedHashRows(sourceRows) {
  const byHash = new Map();
  for (const row of sourceRows) {
    if (!row.recorded_sha256) continue;
    const rows = byHash.get(row.recorded_sha256) ?? [];
    rows.push(row);
    byHash.set(row.recorded_sha256, rows);
  }
  const duplicates = [];
  for (const [sha256, rows] of byHash.entries()) {
    if (rows.length < 2) continue;
    duplicates.push({
      recorded_sha256: sha256,
      count: rows.length,
      project_codes: unique(rows.map((row) => row.project_code)).join(";"),
      source_handles: unique(rows.map((row) => row.source_handle).filter(Boolean)).join(";"),
      relative_paths: unique(rows.map((row) => row.relative_path).filter(Boolean)).join(";"),
      recommended_action: "dedupe review; duplicate hash can be legitimate but should have one source-of-record",
    });
  }
  duplicates.sort((a, b) => b.count - a.count || a.recorded_sha256.localeCompare(b.recorded_sha256));
  return duplicates;
}

function buildSummary({
  now,
  auditId,
  outputDirRef,
  discovered,
  sourceRows,
  duplicateRecordedHashes,
  orphanWorkspaceFiles,
  orphanRowsTruncated,
  workspaceRoots,
  parseWarnings,
  hashFiles,
  scanWorkspace,
}) {
  const counts = {
    source_records: sourceRows.length,
    existing_originals: sourceRows.filter((row) => row.source_file_state === "existing_original").length,
    missing_originals: sourceRows.filter((row) => row.source_file_state === "missing_original").length,
    unresolved_paths: sourceRows.filter((row) => row.source_file_state === "unresolved_path").length,
    unreadable_paths: sourceRows.filter((row) => row.source_file_state === "unreadable").length,
    workspace_backed_sources: sourceRows.filter((row) => row.storage_class === "workspace_backed").length,
    external_pointer_only_sources: sourceRows.filter((row) => row.storage_class === "external_pointer_only").length,
    size_mismatches: sourceRows.filter((row) => row.size_status === "mismatch").length,
    hash_mismatches: sourceRows.filter((row) => row.hash_status === "mismatch").length,
    duplicate_recorded_hash_groups: duplicateRecordedHashes.length,
    orphan_workspace_files: orphanWorkspaceFiles.length,
    parse_warnings: parseWarnings.length,
  };
  return {
    schema_version: "soulforge.knowledge_source_storage_audit_summary.v0",
    kind: "knowledge_source_storage_audit_summary",
    audit_id: auditId,
    generated_at_utc: now,
    output_dir_ref: outputDirRef,
    claim_ceiling: "observed",
    counts,
    discovered_refs: {
      source_root_bindings: discovered.sourceRootRefs.length,
      metadata_ledgers: discovered.metadataLedgerRefs.length,
      document_probes: discovered.documentProbeRefs.length,
      file_hash_csvs: discovered.fileHashCsvRefs.length,
      extraction_status_csvs: discovered.extractionStatusCsvRefs.length,
    },
    options: {
      hash_files: hashFiles,
      workspace_scan_enabled: scanWorkspace,
      orphan_rows_truncated: orphanRowsTruncated,
    },
    workspace_roots: workspaceRoots.map((item) => ({ ref: item.ref, exists: item.exists })),
    next_actions: buildNextActions(counts),
  };
}

function buildNextActions(counts) {
  const actions = [];
  if (counts.external_pointer_only_sources > 0) {
    actions.push("Review external pointer-only sources and decide whether to copy/link them into _workspaces or _workspaces/knowledge.");
  }
  if (counts.missing_originals > 0 || counts.unresolved_paths > 0 || counts.unreadable_paths > 0) {
    actions.push("Locate missing/unresolved originals or mark their source records blocked with an owner decision.");
  }
  if (counts.orphan_workspace_files > 0) {
    actions.push("Review orphan workspace files and add metadata source ledger rows where they are durable knowledge sources.");
  }
  if (counts.duplicate_recorded_hash_groups > 0) {
    actions.push("Review duplicate recorded hashes and choose source-of-record rows where needed.");
  }
  if (actions.length === 0) actions.push("No storage cleanup action detected by this metadata-only audit.");
  return actions;
}

function renderSourceRowsCsv(rows) {
  const columns = [
    "row_number",
    "project_code",
    "source_handle",
    "title_label",
    "source_kind",
    "storage_class",
    "source_file_state",
    "size_status",
    "hash_status",
    "recorded_size_bytes",
    "actual_size_bytes",
    "recorded_sha256",
    "source_root_path",
    "relative_path",
    "resolved_path",
    "evidence_kinds",
    "recommended_action",
  ];
  return renderCsv(columns, rows.map((row) => ({ ...row, evidence_kinds: row.evidence_kinds.join(";") })));
}

function renderDuplicateRecordedHashesCsv(rows) {
  return renderCsv(
    ["recorded_sha256", "count", "project_codes", "source_handles", "relative_paths", "recommended_action"],
    rows,
  );
}

function renderOrphanRowsCsv(rows) {
  return renderCsv(
    ["row_number", "workspace_ref", "repo_relative_path", "real_path", "extension", "size_bytes", "recommended_action"],
    rows,
  );
}

function renderSummaryMarkdown(summary) {
  return [
    "# Knowledge Source Storage Audit",
    "",
    `Generated: ${summary.generated_at_utc}`,
    `Audit id: ${summary.audit_id}`,
    `Claim ceiling: ${summary.claim_ceiling}`,
    "",
    "## Counts",
    "",
    ...Object.entries(summary.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Next Actions",
    "",
    ...summary.next_actions.map((item) => `- ${item}`),
    "",
    "## Boundary",
    "",
    "- Metadata-only report.",
    "- No source payload copying, moving, deletion, upload, or raw text inclusion.",
    "- Hash verification reads file bytes only when explicitly enabled.",
    "",
  ].join("\n");
}

function renderOwnerDecisionQueueYaml({ summary, sourceRows, orphanRowsTruncated }) {
  const decisionRows = sourceRows
    .filter((row) =>
      ["external_pointer_only", "missing_or_unresolved", "unresolved", "unreadable"].includes(row.storage_class),
    )
    .slice(0, 200)
    .map((row) => ({
      project_code: row.project_code,
      source_handle: row.source_handle,
      relative_path: row.relative_path,
      storage_class: row.storage_class,
      source_file_state: row.source_file_state,
      recommended_action: row.recommended_action,
    }));
  return [
    "schema_version: soulforge.knowledge_source_storage_owner_decision_queue.v0",
    "kind: knowledge_source_storage_owner_decision_queue",
    `audit_id: ${quoteYaml(summary.audit_id)}`,
    `generated_at_utc: ${quoteYaml(summary.generated_at_utc)}`,
    "claim_ceiling: observed",
    "boundary:",
    "  metadata_only: true",
    "  source_payloads_included: false",
    "  owner_approval_granted: false",
    `orphan_rows_truncated: ${orphanRowsTruncated ? "true" : "false"}`,
    "decision_items:",
    ...decisionRows.flatMap((row) => [
      "  - project_code: " + quoteYaml(row.project_code),
      "    source_handle: " + quoteYaml(row.source_handle ?? ""),
      "    relative_path: " + quoteYaml(row.relative_path ?? ""),
      "    storage_class: " + quoteYaml(row.storage_class),
      "    source_file_state: " + quoteYaml(row.source_file_state),
      "    recommended_action: " + quoteYaml(row.recommended_action),
    ]),
    decisionRows.length === 0 ? "  []" : null,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function renderValidationLog({ validation, summary }) {
  return [
    "# Knowledge Source Storage Audit Validation",
    "",
    `Status: ${validation.status}`,
    `Audit id: ${summary.audit_id}`,
    "",
    "## Errors",
    "",
    ...(validation.errors.length ? validation.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
  ].join("\n");
}

function renderCsv(columns, rows) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    "",
  ].join("\n");
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join(";") : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildArtifactRefs(outputDirRef) {
  return {
    audit_json_ref: path.posix.join(outputDirRef, "knowledge_source_storage_audit.json"),
    summary_json_ref: path.posix.join(outputDirRef, "summary.json"),
    source_storage_audit_csv_ref: path.posix.join(outputDirRef, "source_storage_audit.csv"),
    missing_originals_csv_ref: path.posix.join(outputDirRef, "missing_originals.csv"),
    pointer_only_sources_csv_ref: path.posix.join(outputDirRef, "pointer_only_sources.csv"),
    duplicate_recorded_hashes_csv_ref: path.posix.join(outputDirRef, "duplicate_recorded_hashes.csv"),
    orphan_workspace_files_csv_ref: path.posix.join(outputDirRef, "orphan_workspace_files.csv"),
    summary_md_ref: path.posix.join(outputDirRef, "summary.md"),
    owner_decision_queue_ref: path.posix.join(outputDirRef, "owner_decision_queue.yaml"),
    validation_log_ref: path.posix.join(outputDirRef, "validation_log.md"),
  };
}

function metadataOnlyBoundary({ hashFiles }) {
  return {
    metadata_only: true,
    read_only: true,
    source_mutation_executed: false,
    source_payloads_copied_or_moved: false,
    source_payloads_uploaded: false,
    source_text_decoded: false,
    source_text_or_payload_bodies_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: true,
    runtime_absolute_paths_purpose: "private source pointer audit",
    source_payload_bytes_read_for_hash: hashFiles,
  };
}

function firstBindingForLedger({ bindingRef, projectCode, sourceRootBindings }) {
  if (bindingRef && sourceRootBindings.byRef.has(bindingRef)) return sourceRootBindings.byRef.get(bindingRef)?.[0] ?? null;
  return sourceRootBindings.byProject.get(projectCode)?.[0] ?? null;
}

async function siblingDocumentProbeSourceRoot({ repoRoot, ref }) {
  const probeRef = normalizeRepoPath(path.posix.join(path.posix.dirname(ref), "document_probe.json"));
  if (!(await pathExists(path.join(repoRoot, probeRef)))) return null;
  try {
    const probe = await readJson(path.join(repoRoot, probeRef));
    return probe.source_root ?? null;
  } catch {
    return null;
  }
}

function resolveSourcePath(record) {
  if (record.relative_path && path.isAbsolute(record.relative_path)) return path.resolve(record.relative_path);
  if (!record.source_root_path || !record.relative_path) return null;
  return path.resolve(record.source_root_path, record.relative_path);
}

async function statFileSafe(filePath) {
  if (!filePath) return { state: "unresolved_path", exists: false };
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return { state: "unreadable", exists: false };
    return { state: "existing_original", exists: true, sizeBytes: stat.size };
  } catch (error) {
    if (error?.code === "ENOENT") return { state: "missing_original", exists: false };
    return { state: "unreadable", exists: false };
  }
}

async function realpathSafe(filePath) {
  if (!filePath) return null;
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

async function hashFileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(Buffer.from(chunk));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function classifyStorage({ repoRoot, resolvedPath, realPath, sourceFileState, workspaceRoots }) {
  if (!resolvedPath) return "unresolved";
  if (sourceFileState === "missing_original") return "missing_or_unresolved";
  if (sourceFileState === "unreadable") return "unreadable";
  if (isUnderPath(resolvedPath, path.join(repoRoot, "_workspaces")) || isUnderPath(realPath, path.join(repoRoot, "_workspaces"))) {
    return "workspace_backed";
  }
  for (const root of workspaceRoots) {
    if (isUnderPath(resolvedPath, root.path) || isUnderPath(realPath, root.realPath)) return "workspace_backed";
  }
  if (isUnderPath(resolvedPath, repoRoot) || isUnderPath(realPath, repoRoot)) return "repo_local_non_workspace";
  return "external_pointer_only";
}

function classifySizeStatus(recordedSize, actualSize) {
  if (!Number.isSafeInteger(recordedSize)) return "no_recorded_size";
  if (!Number.isSafeInteger(actualSize)) return "not_checked";
  return recordedSize === actualSize ? "match" : "mismatch";
}

function classifyHashStatus(recordedHash, actualHash, hashFiles, exists) {
  if (!recordedHash) return "no_recorded_hash";
  if (!hashFiles) return "not_checked";
  if (!exists || !actualHash) return "not_checked";
  return recordedHash.toLowerCase() === actualHash.toLowerCase() ? "match" : "mismatch";
}

function recommendSourceAction({ sourceFileState, storageClass, sizeStatus, hashStatus }) {
  if (sourceFileState === "missing_original") return "locate original file or mark source record blocked";
  if (sourceFileState === "unresolved_path") return "add source root binding or relative path metadata";
  if (sourceFileState === "unreadable") return "review filesystem access and source root health";
  if (storageClass === "external_pointer_only") {
    return "owner decision: keep external source root, or copy/link source into _workspaces or _workspaces/knowledge";
  }
  if (sizeStatus === "mismatch" || hashStatus === "mismatch") return "review source identity mismatch";
  return "no storage action detected";
}

function compareSourceRows(a, b) {
  return `${a.project_code}\0${a.source_handle ?? ""}\0${a.relative_path ?? ""}`.localeCompare(
    `${b.project_code}\0${b.source_handle ?? ""}\0${b.relative_path ?? ""}`,
  );
}

async function* walkFiles(root, { skipSecretLike = true } = {}) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (skipSecretLike && SECRET_LIKE_SEGMENT_PATTERN.test(filePath)) continue;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      yield* walkFiles(filePath, { skipSecretLike });
    } else if (entry.isFile()) {
      yield filePath;
    }
  }
}

function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function inferProjectCodeFromRef(ref) {
  const parts = normalizeRepoPath(ref).split("/");
  const index = parts.indexOf("_workmeta");
  return index >= 0 && parts[index + 1] ? parts[index + 1] : "unknown";
}

function normalizeNow(now, date) {
  if (now) return new Date(now).toISOString();
  if (date) return new Date(`${date}T00:00:00.000Z`).toISOString();
  return new Date().toISOString();
}

function normalizeSafeId(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (!normalized) throw new Error("safe id required");
  return normalized;
}

function safeRepoRelativeRef(value) {
  const normalized = normalizeRepoPath(path.posix.normalize(String(value ?? "").trim()));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)) {
    throw new Error(`unsafe repo-relative ref: ${value}`);
  }
  return normalized;
}

function normalizeRefArray(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => item !== undefined && item !== null).map((item) => safeRepoRelativeRef(item));
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeHash(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/^sha256:/u, "");
  return /^[a-f0-9]{64}$/u.test(text) ? text : null;
}

function isUnderPath(candidate, root) {
  if (!candidate || !root) return false;
  const normalizedCandidate = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathKey(value) {
  return process.platform === "win32" ? path.resolve(value ?? "").toLowerCase() : path.resolve(value ?? "");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function rowId(prefix, value) {
  const digest = crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function quoteYaml(value) {
  return JSON.stringify(String(value ?? ""));
}
