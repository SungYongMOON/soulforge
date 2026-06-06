import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const DAILY_LEDGER_SCHEMA_PREFIX = "daily_work_ledger_capture_v0";
export const PROJECT_DAILY_LEDGER_SCHEMA = `${DAILY_LEDGER_SCHEMA_PREFIX}.project_daily_ledger`;
export const SOULFORGE_DAILY_LEDGER_SCHEMA = `${DAILY_LEDGER_SCHEMA_PREFIX}.soulforge_subledger_daily_ledger`;
export const INBOX_LEDGER_CODE = "P00-000_INBOX";

export const SOULFORGE_SUBLEDGERS = [
  "system",
  "knowledge",
  "workflow",
  "automation",
  "ingress",
  "skill",
  "ui",
  "domain_cell",
];

const SOULFORGE_SUBLEDGER_SET = new Set(SOULFORGE_SUBLEDGERS);
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_TEXT_PATTERN = /^[\p{L}\p{N}\p{P}\p{S} \t\r\n]+$/u;

const PROJECT_LEDGER_FAMILIES = new Set(["company_project", "company_inbox"]);
const ENTRY_LEDGER_FAMILIES = new Set(["company_project", "company_inbox", "soulforge"]);
const ENTRY_KINDS = new Set([
  "company_project_work",
  "company_general_unassigned_work",
  "soulforge_work",
]);
const CONFIDENCE_STATES = new Set(["observed", "partial", "review_needed"]);
const OWNER_REVIEW_STATES = new Set([
  "not_reviewed",
  "review_needed",
  "owner_confirmed",
  "blocked",
]);
const REPORT_VISIBILITY_STATES = new Set([
  "include",
  "include_as_gap",
  "exclude_noise",
  "blocked",
]);

const BLOCKED_RAW_EXTENSIONS = new Set([
  ".7z",
  ".doc",
  ".docx",
  ".egg",
  ".eml",
  ".hwp",
  ".hwpx",
  ".mbox",
  ".msg",
  ".ost",
  ".pdf",
  ".ppt",
  ".pptx",
  ".pst",
  ".rar",
  ".wav",
  ".xls",
  ".xlsm",
  ".xlsx",
  ".zip",
]);

const SAFE_BOUNDARY_KEYS = new Set([
  "metadata_only",
  "raw_payloads_excluded",
  "report_time_rediscovery_allowed",
  "p00_reserved_for_company_general_or_unresolved_company_work",
  "subledger_is_report_category_not_execution_authority",
  "source_payload_copied",
  "secret_or_session_present",
]);

const RAW_FIELD_KEY_PATTERN =
  /(^|_)(raw|body|html|payload|attachment|attachments|content|source_text|transcript|mail_body|file_body)(_|$)/iu;
const SECRET_KEY_PATTERN =
  /(^|[._-])(id_rsa|id_dsa|id_ecdsa|id_ed25519|token|password|passwd|secret|credential|credentials|cookie|session|authorization|auth)([._-]|$)/iu;
const SECRET_BASENAME_PATTERN = /^\.env(?:[._-].*)?$|^\.npmrc$|^\.pypirc$/iu;
const SECRET_TEXT_PATTERN =
  /\b(token|password|passwd|secret|cookie|session|authorization)\s*[:=]\s*["']?[^"',\s)]+/iu;
const EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:[A-Za-z]:[\\/][^\s"'`)\]}>,;]*)/u;
const EMBEDDED_WINDOWS_UNC_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:\\\\[^\\/\s"'`)\]}>,;]+[\\/][^\s"'`)\]}>,;]*)/u;
const EMBEDDED_POSIX_RUNTIME_PATH_PATTERN =
  /(?:^|[\s"'`([{<])\/(?:Users|home|tmp|var|etc|opt|mnt|Volumes|workspace|workspaces|Soulforge|repo)(?:\/[^\s"'`)\]}>,;]*)?/iu;
const RAW_SOURCE_REF_PATTERN =
  /(^|\/)(mail\/raw|raw_mail|attachments?|payloads?|source_text|chunks?)(\/|$)|(^|[:/])git_log[:/]|system_log[:/]/iu;

export function defaultWorkmetaRoot(repoRoot = process.cwd()) {
  return path.join(path.resolve(repoRoot), "_workmeta");
}

export async function validateDailyLedgerFiles(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sources = resolveLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
    allowExternalFiles: true,
  });
  const reports = [];

  for (const source of sources) {
    const ledger = await readLedgerFile(source.path);
    reports.push(validateDailyLedgerObject(ledger, { sourceRef: source.display_ref }));
  }

  const errors = reports.flatMap((report) =>
    report.errors.map((error) => ({
      source_ref: report.source_ref,
      ...error,
    })),
  );

  return {
    ok: errors.length === 0,
    ledger_count: reports.length,
    ledgers: reports,
    error_count: errors.length,
    errors,
  };
}

export async function renderDailyWorklogDraft(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const date = normalizeOptionalDate(options.date);
  const sources = resolveLedgerSources({
    repoRoot,
    ledgerFiles: options.ledgerFiles ?? options.ledgerFile,
    ledgerRefs: options.ledgerRefs ?? options.ledgerRef,
    allowExternalFiles: true,
  });
  const loadedLedgers = [];

  for (const source of sources) {
    const ledger = await readLedgerFile(source.path);
    const report = validateDailyLedgerObject(ledger, { sourceRef: source.display_ref });
    if (!report.ok) {
      throw new Error(`invalid_daily_ledger:${source.display_ref}:${report.errors.map((error) => error.id).join(",")}`);
    }
    if (date && report.ledger_date_local !== date) {
      throw new Error(`daily_ledger_date_mismatch:${source.display_ref}`);
    }
    loadedLedgers.push({
      source,
      ledger,
      report,
      entries: extractEntries(ledger),
    });
  }

  const renderDate = date ?? loadedLedgers[0]?.report.ledger_date_local ?? localDate(new Date());
  const expectedLedgerCodes = normalizeExpectedLedgerCodes(options.expectedLedgerCodes ?? options.expectLedger);
  const gaps = buildGaps({ ledgers: loadedLedgers, expectedLedgerCodes });
  const orderedLedgers = sortLedgersForReport(loadedLedgers);
  const markdown = renderMarkdown({ date: renderDate, ledgers: orderedLedgers, gaps });

  return {
    schema_version: "daily_work_ledger_render_v0.draft",
    generated_from: "explicit_daily_ledger_files_only",
    ledger_count: loadedLedgers.length,
    gap_count: gaps.length,
    markdown,
    boundary: {
      ledger_only: true,
      source_refs_read: false,
      report_time_rediscovery_allowed: false,
    },
  };
}

export function validateDailyLedgerObject(ledger, options = {}) {
  const errors = [];
  const sourceRef = options.sourceRef ?? "ledger_file";

  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return errorReport(sourceRef, ledger, [{ id: "daily_ledger_must_be_object", path: "$" }]);
  }

  collectBoundaryErrors(ledger, errors);
  validateLedgerEnvelope(ledger, errors);

  const entries = extractEntries(ledger);
  if (!Array.isArray(ledger.entries)) {
    errors.push({ id: "daily_ledger_entries_must_be_array", path: "$.entries" });
  }
  if (entries.length === 0) {
    errors.push({ id: "daily_ledger_entries_required", path: "$.entries" });
  }

  for (let index = 0; index < entries.length; index += 1) {
    validateLedgerEntry(entries[index], {
      errors,
      pathPrefix: `$.entries[${index}].entry`,
      ledger,
    });
  }

  return errorReport(sourceRef, ledger, errors);
}

export function normalizeLedgerRef(repoRoot, ledgerRef) {
  const raw = requireText(ledgerRef, "ledger_ref");
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw) || raw.includes("\0")) {
    throw new Error("daily_ledger_ref_must_be_repo_relative");
  }
  if (containsSecretLikePath(raw)) {
    throw new Error("daily_ledger_ref_secret_like_path_blocked");
  }

  const normalized = raw.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (normalized.includes("../") || normalized === ".." || normalized.startsWith("..")) {
    throw new Error("daily_ledger_ref_must_not_traverse");
  }
  if (!isAllowedLedgerRoot(normalized)) {
    throw new Error("daily_ledger_ref_must_stay_under_daily_ledger_roots");
  }
  if (!isLedgerDataFile(normalized)) {
    throw new Error("daily_ledger_ref_must_be_yaml_or_json");
  }

  const absolutePath = path.resolve(repoRoot, normalized);
  if (!isSubpath(repoRoot, absolutePath)) {
    throw new Error("daily_ledger_ref_resolves_outside_repo");
  }

  return {
    path: absolutePath,
    display_ref: normalized,
    kind: "ledger_ref",
  };
}

export function sortLedgersForReport(ledgers) {
  return [...ledgers].sort((left, right) => {
    const leftKey = ledgerSortKey(left.report);
    const rightKey = ledgerSortKey(right.report);
    return leftKey.localeCompare(rightKey);
  });
}

export function buildSyntheticDailyLedger(overrides = {}) {
  const projectCode = overrides.project_code ?? "P26-014";
  const date = overrides.ledger_date_local ?? "2026-06-06";
  const entry = {
    schema_version: `${DAILY_LEDGER_SCHEMA_PREFIX}.entry`,
    entry_id: `${projectCode.toLowerCase().replace(/[^a-z0-9]+/gu, "_")}_${date}_001`,
    ledger_date_local: date,
    ledger_family: projectCode === INBOX_LEDGER_CODE ? "company_inbox" : "company_project",
    ledger_code: projectCode,
    project_code: projectCode,
    soulforge_subledger: null,
    entry_kind: projectCode === INBOX_LEDGER_CODE ? "company_general_unassigned_work" : "company_project_work",
    summary_label: "Synthetic metadata-only work entry",
    work_item_ref: `_workmeta/${projectCode}/reports/work_items/synthetic_review.yaml#item=001`,
    source_refs: [`_workmeta/${projectCode}/reports/activity/synthetic_daily_summary.json#row=1`],
    confidence: "observed",
    owner_review_state: "not_reviewed",
    report_visibility: "include",
    time_hint: {
      started_at: null,
      ended_at: null,
      duration_minutes: null,
    },
    boundary: {
      metadata_only: true,
      source_payload_copied: false,
      secret_or_session_present: false,
    },
  };

  return {
    schema_version: PROJECT_DAILY_LEDGER_SCHEMA,
    ledger_id: `${projectCode}_${date}`,
    ledger_date_local: date,
    ledger_family: projectCode === INBOX_LEDGER_CODE ? "company_inbox" : "company_project",
    ledger_code: projectCode,
    project_code: projectCode,
    project_display_name: projectCode === INBOX_LEDGER_CODE ? "Company general/unassigned work" : "Synthetic project",
    entries: [{ daily_work_ledger_entry_ref: entry.entry_id, entry }],
    coverage: {
      accepted_source_count: 1,
      skipped_source_count: 0,
      review_needed_count: 0,
      blocked_count: 0,
    },
    gaps: [],
    boundary: {
      metadata_only: true,
      raw_payloads_excluded: true,
      report_time_rediscovery_allowed: false,
      p00_reserved_for_company_general_or_unresolved_company_work: true,
    },
    ...overrides,
  };
}

export function buildSyntheticSoulforgeLedger(overrides = {}) {
  const subledger = overrides.soulforge_subledger ?? "system";
  const date = overrides.ledger_date_local ?? "2026-06-06";
  const entry = {
    schema_version: `${DAILY_LEDGER_SCHEMA_PREFIX}.entry`,
    entry_id: `soulforge_${subledger}_${date}_001`,
    ledger_date_local: date,
    ledger_family: "soulforge",
    ledger_code: `soulforge/${subledger}`,
    project_code: "system",
    soulforge_subledger: subledger,
    entry_kind: "soulforge_work",
    summary_label: "Synthetic Soulforge metadata-only work entry",
    work_item_ref: `guild_hall/daily_ledger#synthetic-${subledger}`,
    source_refs: [`_workmeta/system/reports/activity/synthetic_${subledger}.json#row=1`],
    confidence: "observed",
    owner_review_state: "not_reviewed",
    report_visibility: "include",
    time_hint: {
      started_at: null,
      ended_at: null,
      duration_minutes: null,
    },
    boundary: {
      metadata_only: true,
      source_payload_copied: false,
      secret_or_session_present: false,
    },
  };

  return {
    schema_version: SOULFORGE_DAILY_LEDGER_SCHEMA,
    ledger_id: `soulforge_${subledger}_${date}`,
    ledger_date_local: date,
    ledger_family: "soulforge",
    ledger_code: `soulforge/${subledger}`,
    soulforge_subledger: subledger,
    entries: [{ daily_work_ledger_entry_ref: entry.entry_id, entry }],
    coverage: {
      accepted_source_count: 1,
      skipped_source_count: 0,
      review_needed_count: 0,
      blocked_count: 0,
    },
    gaps: [],
    boundary: {
      metadata_only: true,
      raw_payloads_excluded: true,
      report_time_rediscovery_allowed: false,
      subledger_is_report_category_not_execution_authority: true,
    },
    ...overrides,
  };
}

async function readLedgerFile(filePath) {
  const raw = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/u, "");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") {
    return parseYaml(raw);
  }
  return JSON.parse(raw);
}

function resolveLedgerSources({ repoRoot, ledgerFiles, ledgerRefs, allowExternalFiles }) {
  const sources = [];
  for (const ledgerRef of normalizeArray(ledgerRefs)) {
    sources.push(normalizeLedgerRef(repoRoot, ledgerRef));
  }
  for (const ledgerFile of normalizeArray(ledgerFiles)) {
    sources.push(normalizeLedgerFile(repoRoot, ledgerFile, { allowExternalFiles }));
  }
  if (sources.length === 0) {
    throw new Error("daily_ledger_input_required");
  }
  return sources;
}

function normalizeLedgerFile(repoRoot, ledgerFile, options = {}) {
  const raw = requireText(ledgerFile, "ledger_file");
  if (containsSecretLikeText(raw) || containsSecretLikePath(raw)) {
    throw new Error("daily_ledger_file_secret_like_path_blocked");
  }
  if (hasPathTraversal(raw)) {
    throw new Error("daily_ledger_file_must_not_traverse");
  }

  const filePath = path.isAbsolute(raw) || path.win32.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(repoRoot, raw);
  const relative = path.relative(repoRoot, filePath);
  const isInsideRepo = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (isInsideRepo && !isAllowedLedgerRoot(toPosix(relative))) {
    throw new Error("daily_ledger_file_inside_repo_must_stay_under_daily_ledger_roots");
  }
  if (!isInsideRepo && options.allowExternalFiles !== true) {
    throw new Error("daily_ledger_file_outside_repo_not_allowed");
  }
  if (!isLedgerDataFile(filePath)) {
    throw new Error("daily_ledger_file_must_be_yaml_or_json");
  }

  return {
    path: filePath,
    display_ref: isInsideRepo ? toPosix(relative) : `ledger_file:${path.basename(filePath)}`,
    kind: "ledger_file",
  };
}

function validateLedgerEnvelope(ledger, errors) {
  requireEnum(ledger.schema_version, new Set([PROJECT_DAILY_LEDGER_SCHEMA, SOULFORGE_DAILY_LEDGER_SCHEMA]), "$.schema_version", errors);
  requireDate(ledger.ledger_date_local, "$.ledger_date_local", errors);
  requireTextField(ledger.ledger_id, "$.ledger_id", errors);
  requireTextField(ledger.ledger_code, "$.ledger_code", errors);

  if (ledger.schema_version === PROJECT_DAILY_LEDGER_SCHEMA) {
    requireEnum(ledger.ledger_family, PROJECT_LEDGER_FAMILIES, "$.ledger_family", errors);
    validateCompanyLedgerCode(ledger.ledger_code, "$.ledger_code", errors);
    validateCompanyLedgerCode(ledger.project_code, "$.project_code", errors);
    if (ledger.ledger_code !== ledger.project_code) {
      errors.push({ id: "daily_ledger_project_code_mismatch", path: "$.project_code" });
    }
    if (ledger.ledger_code === INBOX_LEDGER_CODE && ledger.ledger_family !== "company_inbox") {
      errors.push({ id: "daily_ledger_p00_must_use_company_inbox_family", path: "$.ledger_family" });
    }
    if (ledger.ledger_code !== INBOX_LEDGER_CODE && ledger.ledger_family !== "company_project") {
      errors.push({ id: "daily_ledger_project_must_use_company_project_family", path: "$.ledger_family" });
    }
    if (ledger.soulforge_subledger !== undefined && ledger.soulforge_subledger !== null) {
      errors.push({ id: "daily_ledger_project_must_not_set_soulforge_subledger", path: "$.soulforge_subledger" });
    }
  }

  if (ledger.schema_version === SOULFORGE_DAILY_LEDGER_SCHEMA) {
    requireExact(ledger.ledger_family, "soulforge", "$.ledger_family", errors);
    validateSoulforgeSubledger(ledger.soulforge_subledger, "$.soulforge_subledger", errors);
    requireExact(ledger.ledger_code, `soulforge/${ledger.soulforge_subledger}`, "$.ledger_code", errors);
    if (ledger.project_code !== undefined && ledger.project_code !== "system") {
      errors.push({ id: "daily_ledger_soulforge_project_code_must_be_system", path: "$.project_code" });
    }
  }

  validateCoverage(ledger.coverage, errors);
  validateGaps(ledger.gaps, errors);
  validateLedgerBoundary(ledger, errors);
}

function validateLedgerEntry(entry, { errors, pathPrefix, ledger }) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push({ id: "daily_ledger_entry_must_be_object", path: pathPrefix });
    return;
  }

  requireExact(entry.schema_version, `${DAILY_LEDGER_SCHEMA_PREFIX}.entry`, `${pathPrefix}.schema_version`, errors);
  requireTextField(entry.entry_id, `${pathPrefix}.entry_id`, errors);
  requireDate(entry.ledger_date_local, `${pathPrefix}.ledger_date_local`, errors);
  requireEnum(entry.ledger_family, ENTRY_LEDGER_FAMILIES, `${pathPrefix}.ledger_family`, errors);
  requireEnum(entry.entry_kind, ENTRY_KINDS, `${pathPrefix}.entry_kind`, errors);
  requireEnum(entry.confidence, CONFIDENCE_STATES, `${pathPrefix}.confidence`, errors);
  requireEnum(entry.owner_review_state, OWNER_REVIEW_STATES, `${pathPrefix}.owner_review_state`, errors);
  requireEnum(entry.report_visibility, REPORT_VISIBILITY_STATES, `${pathPrefix}.report_visibility`, errors);
  requireTextField(entry.summary_label, `${pathPrefix}.summary_label`, errors);

  if (entry.ledger_date_local !== ledger.ledger_date_local) {
    errors.push({ id: "daily_ledger_entry_date_mismatch", path: `${pathPrefix}.ledger_date_local` });
  }
  if (entry.ledger_family !== ledger.ledger_family) {
    errors.push({ id: "daily_ledger_entry_family_mismatch", path: `${pathPrefix}.ledger_family` });
  }
  if (entry.ledger_code !== ledger.ledger_code) {
    errors.push({ id: "daily_ledger_entry_code_mismatch", path: `${pathPrefix}.ledger_code` });
  }

  if (ledger.schema_version === PROJECT_DAILY_LEDGER_SCHEMA) {
    validateCompanyLedgerCode(entry.ledger_code, `${pathPrefix}.ledger_code`, errors);
    validateCompanyLedgerCode(entry.project_code, `${pathPrefix}.project_code`, errors);
    if (entry.project_code !== ledger.project_code) {
      errors.push({ id: "daily_ledger_entry_project_code_mismatch", path: `${pathPrefix}.project_code` });
    }
    if (entry.soulforge_subledger !== null && entry.soulforge_subledger !== undefined) {
      errors.push({ id: "daily_ledger_project_entry_must_not_set_soulforge_subledger", path: `${pathPrefix}.soulforge_subledger` });
    }
    if (entry.ledger_code === INBOX_LEDGER_CODE && entry.entry_kind !== "company_general_unassigned_work") {
      errors.push({ id: "daily_ledger_p00_entry_kind_mismatch", path: `${pathPrefix}.entry_kind` });
    }
    if (entry.ledger_code !== INBOX_LEDGER_CODE && entry.entry_kind !== "company_project_work") {
      errors.push({ id: "daily_ledger_project_entry_kind_mismatch", path: `${pathPrefix}.entry_kind` });
    }
  }

  if (ledger.schema_version === SOULFORGE_DAILY_LEDGER_SCHEMA) {
    requireExact(entry.project_code, "system", `${pathPrefix}.project_code`, errors);
    requireExact(entry.entry_kind, "soulforge_work", `${pathPrefix}.entry_kind`, errors);
    validateSoulforgeSubledger(entry.soulforge_subledger, `${pathPrefix}.soulforge_subledger`, errors);
    requireExact(entry.ledger_code, `soulforge/${entry.soulforge_subledger}`, `${pathPrefix}.ledger_code`, errors);
  }

  validateSourceRefs(entry.source_refs, `${pathPrefix}.source_refs`, errors);
  validateOptionalSafeRef(entry.work_item_ref, `${pathPrefix}.work_item_ref`, errors);
  validateEntryBoundary(entry.boundary, `${pathPrefix}.boundary`, errors);
}

function validateCoverage(coverage, errors) {
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    errors.push({ id: "daily_ledger_coverage_required", path: "$.coverage" });
    return;
  }
  for (const field of ["accepted_source_count", "skipped_source_count", "review_needed_count", "blocked_count"]) {
    if (!Number.isInteger(coverage[field]) || coverage[field] < 0) {
      errors.push({ id: "daily_ledger_coverage_count_must_be_nonnegative_integer", path: `$.coverage.${field}` });
    }
  }
}

function validateGaps(gaps, errors) {
  if (!Array.isArray(gaps)) {
    errors.push({ id: "daily_ledger_gaps_must_be_array", path: "$.gaps" });
    return;
  }
  for (let index = 0; index < gaps.length; index += 1) {
    const gap = gaps[index];
    if (!gap || typeof gap !== "object" || Array.isArray(gap)) {
      errors.push({ id: "daily_ledger_gap_must_be_object", path: `$.gaps[${index}]` });
      continue;
    }
    requireTextField(gap.gap_id, `$.gaps[${index}].gap_id`, errors);
    requireTextField(gap.reason, `$.gaps[${index}].reason`, errors);
    requireTextField(gap.needed_action, `$.gaps[${index}].needed_action`, errors);
  }
}

function validateLedgerBoundary(ledger, errors) {
  const boundary = ledger.boundary;
  if (!boundary || typeof boundary !== "object" || Array.isArray(boundary)) {
    errors.push({ id: "daily_ledger_boundary_required", path: "$.boundary" });
    return;
  }
  requireExact(boundary.metadata_only, true, "$.boundary.metadata_only", errors);
  requireExact(boundary.raw_payloads_excluded, true, "$.boundary.raw_payloads_excluded", errors);
  requireExact(boundary.report_time_rediscovery_allowed, false, "$.boundary.report_time_rediscovery_allowed", errors);
  if (ledger.schema_version === PROJECT_DAILY_LEDGER_SCHEMA) {
    requireExact(
      boundary.p00_reserved_for_company_general_or_unresolved_company_work,
      true,
      "$.boundary.p00_reserved_for_company_general_or_unresolved_company_work",
      errors,
    );
  }
  if (ledger.schema_version === SOULFORGE_DAILY_LEDGER_SCHEMA) {
    requireExact(
      boundary.subledger_is_report_category_not_execution_authority,
      true,
      "$.boundary.subledger_is_report_category_not_execution_authority",
      errors,
    );
  }
}

function validateEntryBoundary(boundary, pathPrefix, errors) {
  if (!boundary || typeof boundary !== "object" || Array.isArray(boundary)) {
    errors.push({ id: "daily_ledger_entry_boundary_required", path: pathPrefix });
    return;
  }
  requireExact(boundary.metadata_only, true, `${pathPrefix}.metadata_only`, errors);
  requireExact(boundary.source_payload_copied, false, `${pathPrefix}.source_payload_copied`, errors);
  requireExact(boundary.secret_or_session_present, false, `${pathPrefix}.secret_or_session_present`, errors);
}

function validateSourceRefs(sourceRefs, pathPrefix, errors) {
  if (!Array.isArray(sourceRefs)) {
    errors.push({ id: "daily_ledger_source_refs_must_be_array", path: pathPrefix });
    return;
  }
  if (sourceRefs.length === 0) {
    errors.push({ id: "daily_ledger_source_refs_required", path: pathPrefix });
  }
  for (let index = 0; index < sourceRefs.length; index += 1) {
    validateSafeMetadataRef(sourceRefs[index], `${pathPrefix}[${index}]`, errors);
  }
}

function validateOptionalSafeRef(value, pathPrefix, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  validateSafeMetadataRef(value, pathPrefix, errors);
}

function validateSafeMetadataRef(value, pathPrefix, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ id: "daily_ledger_ref_must_be_text", path: pathPrefix });
    return;
  }
  const ref = value.trim();
  if (containsRuntimeAbsolutePath(ref)) {
    errors.push({ id: "daily_ledger_ref_must_not_contain_runtime_absolute_path", path: pathPrefix });
  }
  if (containsSecretLikeText(ref) || containsSecretLikePath(ref)) {
    errors.push({ id: "daily_ledger_ref_must_not_be_secret_like", path: pathPrefix });
  }
  if (containsBlockedRawExtension(ref)) {
    errors.push({ id: "daily_ledger_ref_must_not_point_to_raw_payload_extension", path: pathPrefix });
  }
  if (RAW_SOURCE_REF_PATTERN.test(ref)) {
    errors.push({ id: "daily_ledger_ref_must_not_point_to_raw_source", path: pathPrefix });
  }
}

function collectBoundaryErrors(value, errors, pathPrefix = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectBoundaryErrors(value[index], errors, `${pathPrefix}[${index}]`);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      validateArbitrarySafeText(value, pathPrefix, errors);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathPrefix}.${key}`;
    if (isUnsafePayloadKey(key, childPath)) {
      errors.push({ id: "daily_ledger_raw_payload_field_blocked", path: childPath });
    }
    if (SECRET_KEY_PATTERN.test(key) && !SAFE_BOUNDARY_KEYS.has(key)) {
      errors.push({ id: "daily_ledger_secret_like_field_blocked", path: childPath });
    }
    collectBoundaryErrors(child, errors, childPath);
  }
}

function validateArbitrarySafeText(value, pathPrefix, errors) {
  if (!SAFE_TEXT_PATTERN.test(value)) {
    errors.push({ id: "daily_ledger_text_contains_unsupported_control_character", path: pathPrefix });
  }
  if (containsRuntimeAbsolutePath(value)) {
    errors.push({ id: "daily_ledger_text_must_not_contain_runtime_absolute_path", path: pathPrefix });
  }
  if (containsSecretLikeText(value)) {
    errors.push({ id: "daily_ledger_text_must_not_contain_secret_like_text", path: pathPrefix });
  }
  if (containsBlockedRawExtension(value)) {
    errors.push({ id: "daily_ledger_text_must_not_reference_raw_payload_extension", path: pathPrefix });
  }
}

function isUnsafePayloadKey(key, childPath) {
  if (SAFE_BOUNDARY_KEYS.has(key)) {
    return false;
  }
  if (childPath.endsWith(".source_refs") || childPath.includes(".source_refs[")) {
    return false;
  }
  return RAW_FIELD_KEY_PATTERN.test(key);
}

function validateCompanyLedgerCode(value, pathPrefix, errors) {
  if (value === INBOX_LEDGER_CODE) {
    return;
  }
  if (typeof value !== "string" || !PROJECT_CODE_PATTERN.test(value)) {
    errors.push({ id: "daily_ledger_invalid_project_code", path: pathPrefix });
  }
}

function validateSoulforgeSubledger(value, pathPrefix, errors) {
  if (typeof value !== "string" || !SOULFORGE_SUBLEDGER_SET.has(value)) {
    errors.push({ id: "daily_ledger_invalid_soulforge_subledger", path: pathPrefix });
  }
}

function requireTextField(value, pathPrefix, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ id: "daily_ledger_required_text_missing", path: pathPrefix });
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_${label}`);
  }
  return value.trim();
}

function requireDate(value, pathPrefix, errors) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    errors.push({ id: "daily_ledger_invalid_date", path: pathPrefix });
  }
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (!DATE_PATTERN.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error("invalid_daily_ledger_render_date");
  }
  return text;
}

function requireEnum(value, allowed, pathPrefix, errors) {
  if (!allowed.has(value)) {
    errors.push({ id: "daily_ledger_invalid_enum", path: pathPrefix });
  }
}

function requireExact(value, expected, pathPrefix, errors) {
  if (value !== expected) {
    errors.push({ id: "daily_ledger_required_value_mismatch", path: pathPrefix });
  }
}

function errorReport(sourceRef, ledger, errors) {
  return {
    source_ref: sourceRef,
    ok: errors.length === 0,
    schema_version: typeof ledger?.schema_version === "string" ? ledger.schema_version : null,
    ledger_id: typeof ledger?.ledger_id === "string" ? ledger.ledger_id : null,
    ledger_date_local: typeof ledger?.ledger_date_local === "string" ? ledger.ledger_date_local : null,
    ledger_family: typeof ledger?.ledger_family === "string" ? ledger.ledger_family : null,
    ledger_code: typeof ledger?.ledger_code === "string" ? ledger.ledger_code : null,
    errors,
  };
}

function extractEntries(ledger) {
  if (!Array.isArray(ledger?.entries)) {
    return [];
  }
  return ledger.entries.map((row) => row?.entry ?? row);
}

function buildGaps({ ledgers, expectedLedgerCodes }) {
  const gaps = [];
  const present = new Set(ledgers.map((item) => item.report.ledger_code));
  for (const expected of expectedLedgerCodes) {
    if (!present.has(expected)) {
      gaps.push({
        ledger_code: expected,
        gap_type: "missing_ledger",
        reason: "Expected daily ledger was not provided to the renderer.",
        needed_action: "run_or_review_daily_ledger_collector",
      });
    }
  }

  for (const item of ledgers) {
    const coverage = item.ledger.coverage ?? {};
    if ((coverage.review_needed_count ?? 0) > 0 || (coverage.blocked_count ?? 0) > 0) {
      gaps.push({
        ledger_code: item.report.ledger_code,
        gap_type: "incomplete_ledger",
        reason: `review_needed=${coverage.review_needed_count ?? 0}; blocked=${coverage.blocked_count ?? 0}`,
        needed_action: "owner_review_or_metadata_fix",
      });
    }
    for (const gap of item.ledger.gaps ?? []) {
      gaps.push({
        ledger_code: item.report.ledger_code,
        gap_type: "ledger_reported_gap",
        reason: gap.reason,
        needed_action: gap.needed_action,
      });
    }
    for (const entry of item.entries) {
      if (entry.confidence !== "observed" || entry.report_visibility === "include_as_gap" || entry.owner_review_state === "review_needed") {
        gaps.push({
          ledger_code: item.report.ledger_code,
          gap_type: "entry_review_needed",
          reason: entry.summary_label,
          needed_action: entry.owner_review_state === "review_needed" ? "owner_review" : "metadata_fix_or_collector_rerun",
        });
      }
    }
  }

  return gaps;
}

function renderMarkdown({ date, ledgers, gaps }) {
  const lines = [
    `# Daily Work Ledger Draft - ${date}`,
    "",
    "Boundary: generated from explicit daily ledger files only. Source refs are listed as metadata pointers and are not opened during rendering.",
    "",
  ];

  renderLedgerGroup(lines, "Company Projects", ledgers.filter((item) => item.report.ledger_family === "company_project"));
  renderLedgerGroup(lines, "P00-000_INBOX", ledgers.filter((item) => item.report.ledger_code === INBOX_LEDGER_CODE));
  renderLedgerGroup(lines, "Soulforge Sub-Ledgers", ledgers.filter((item) => item.report.ledger_family === "soulforge"));

  lines.push("## Gaps");
  if (gaps.length === 0) {
    lines.push("");
    lines.push("- none");
  } else {
    for (const gap of gaps) {
      lines.push("");
      lines.push(`- ${gap.ledger_code}: ${gap.gap_type} - ${gap.reason}; next=${gap.needed_action}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}`;
}

function renderLedgerGroup(lines, title, ledgers) {
  lines.push(`## ${title}`);
  if (ledgers.length === 0) {
    lines.push("");
    lines.push("- no ledger provided");
    lines.push("");
    return;
  }

  for (const item of ledgers) {
    const label = item.report.ledger_family === "soulforge"
      ? `soulforge/${item.report.ledger_code.split("/")[1]}`
      : item.report.ledger_code;
    lines.push("");
    lines.push(`### ${label}`);
    for (const entry of item.entries.filter((row) => row.report_visibility !== "exclude_noise")) {
      lines.push(`- ${entry.summary_label} [${entry.confidence}; ${entry.owner_review_state}]`);
      if (entry.work_item_ref) {
        lines.push(`  work_item_ref: ${entry.work_item_ref}`);
      }
      if (entry.source_refs?.length > 0) {
        lines.push(`  source_refs: ${entry.source_refs.join(", ")}`);
      }
    }
  }
  lines.push("");
}

function ledgerSortKey(report) {
  if (report.ledger_family === "company_project") {
    return `0:${report.ledger_code}`;
  }
  if (report.ledger_code === INBOX_LEDGER_CODE) {
    return "1:P00-000_INBOX";
  }
  const subledger = report.ledger_code?.split("/")[1] ?? "";
  const index = SOULFORGE_SUBLEDGERS.indexOf(subledger);
  return `2:${String(index === -1 ? 99 : index).padStart(2, "0")}:${subledger}`;
}

function normalizeExpectedLedgerCodes(values) {
  return normalizeArray(values).map((value) => {
    const text = requireText(value, "expected_ledger_code");
    if (text === INBOX_LEDGER_CODE || PROJECT_CODE_PATTERN.test(text)) {
      return text;
    }
    const soulforgeMatch = text.match(/^soulforge\/([a-z_]+)$/u);
    if (soulforgeMatch && SOULFORGE_SUBLEDGER_SET.has(soulforgeMatch[1])) {
      return text;
    }
    throw new Error("invalid_expected_ledger_code");
  });
}

function isAllowedLedgerRoot(ref) {
  if (!ref.startsWith("_workmeta/")) {
    return false;
  }
  const parts = ref.split("/");
  if (parts[1] === "system") {
    return parts[2] === "daily_ledger" && SOULFORGE_SUBLEDGER_SET.has(parts[3]);
  }
  if (parts[1] === INBOX_LEDGER_CODE || PROJECT_CODE_PATTERN.test(parts[1])) {
    return parts[2] === "daily_ledger";
  }
  return false;
}

function isLedgerDataFile(ref) {
  return [".yaml", ".yml", ".json"].includes(path.extname(ref).toLowerCase());
}

function containsBlockedRawExtension(value) {
  const withoutFragment = String(value).split(/[?#]/u)[0];
  return BLOCKED_RAW_EXTENSIONS.has(path.posix.extname(withoutFragment.replace(/\\/gu, "/")).toLowerCase());
}

function containsSecretLikePath(value) {
  const normalized = String(value).replace(/\\/gu, "/").split(/[?#]/u)[0];
  return normalized
    .split("/")
    .filter(Boolean)
    .some((segment) => SECRET_BASENAME_PATTERN.test(segment) || SECRET_KEY_PATTERN.test(segment));
}

function containsSecretLikeText(value) {
  return SECRET_TEXT_PATTERN.test(String(value));
}

function containsRuntimeAbsolutePath(value) {
  const text = String(value);
  return (
    path.isAbsolute(text) ||
    path.win32.isAbsolute(text) ||
    path.posix.isAbsolute(text) ||
    /^[A-Za-z]:[\\/]/u.test(text) ||
    EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN.test(text) ||
    EMBEDDED_WINDOWS_UNC_PATH_PATTERN.test(text) ||
    EMBEDDED_POSIX_RUNTIME_PATH_PATTERN.test(text)
  );
}

function normalizeArray(value) {
  if (value === undefined || value === null || value === false) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function localDate(date) {
  return date.toISOString().slice(0, 10);
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}

function hasPathTraversal(value) {
  return String(value)
    .replace(/\\/gu, "/")
    .split("/")
    .some((segment) => segment === "..");
}

function isSubpath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
