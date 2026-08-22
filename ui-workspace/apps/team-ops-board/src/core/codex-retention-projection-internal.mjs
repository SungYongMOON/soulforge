import { lstat, open, realpath } from "node:fs/promises";
import path, { resolve } from "node:path";
import { createHash } from "node:crypto";

export const CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA = "soulforge.team_ops_board.codex_retention_projection.v1";
export const CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA = "soulforge.codex_thread_manager.codex_retention_automation_report.v1";
export const CODEX_RETENTION_ENDPOINT_PATH = "/codex-retention.snapshot.json";

export const DEFAULT_PERIOD_SECONDS = 86_400; // 24 hours
export const DEFAULT_GRACE_SECONDS = 3_600;  // 1 hour
const MAX_BYTES = 512 * 1024; // 512 KB
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes

const ALLOWED_TOP_LEVEL_KEYS = Object.freeze(new Set([
  "schema_version", "generated_at", "report_only", "status", "retention", "inventory", "summary", "digest"
]));

const ALLOWED_SUMMARY_KEYS = Object.freeze(new Set([
  "retention_evidence_status", "retention_action", "inventory_status", "bound_candidate_count", "unbound_active_task_count",
  "inventory_gap_count", "task_classifications", "worktree_totals",
  "destructive_action_count", "local_automation_install_count"
]));

const ALLOWED_TASK_CLASSIFICATION_KEYS = Object.freeze(new Set([
  "active", "input_waiting", "result_waiting", "completed", "interrupted", "duplicate", "unknown"
]));

const ALLOWED_WORKTREE_TOTAL_KEYS = Object.freeze(new Set([
  "total", "dirty", "locked", "index_lock", "operation_marker", "unique_commit", "prunable"
]));

const ALLOWLISTED_PROJECTION_REASONS = Object.freeze(new Set([
  "codex_retention_report_path_unconfigured",
  "codex_retention_report_unreadable",
  "codex_retention_report_json_invalid",
  "codex_retention_projection_failed",
  "file_path_invalid",
  "file_absent_or_unreadable",
  "file_not_regular",
  "file_is_symlink",
  "file_has_hard_links",
  "file_oversized",
  "file_realpath_failed",
  "reparse_path_forbidden",
  "file_identity_changed",
  "report_envelope_invalid",
  "report_extra_keys_forbidden",
  "report_schema_invalid",
  "report_generated_at_invalid",
  "generated_at_future_timestamp",
  "report_only_required",
  "report_status_invalid",
  "report_summary_invalid",
  "summary_extra_keys_forbidden",
  "summary_retention_evidence_status_invalid",
  "summary_retention_action_invalid",
  "summary_inventory_status_invalid",
  "summary_bound_candidate_count_invalid",
  "summary_unbound_active_task_count_invalid",
  "summary_inventory_gap_count_invalid",
  "summary_task_classifications_invalid",
  "summary_worktree_totals_invalid",
  "destructive_action_count_must_be_zero",
  "local_automation_install_count_must_be_zero",
  "report_digest_invalid",
  "report_digest_mismatch",
  "invalid_period_or_grace_window"
]));

function codePointCompare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function canonicalizeJson(obj, isRoot = true) {
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => (item === undefined ? "null" : canonicalizeJson(item, false))).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort(codePointCompare);
  const parts = [];
  for (const key of sortedKeys) {
    if (isRoot && (key === "generated_at" || key === "digest")) {
      continue;
    }
    const val = obj[key];
    if (val !== undefined) {
      parts.push(JSON.stringify(key) + ":" + canonicalizeJson(val, false));
    }
  }
  return "{" + parts.join(",") + "}";
}

export function computeAutomationReportDigest(report) {
  const canonical = canonicalizeJson(report, true);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

function defaultPathsEqual(pathA, pathB) {
  const normA = resolve(pathA);
  const normB = resolve(pathB);
  if (process.platform === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

export async function readStableFile(filePath, testHooks = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("file_path_invalid");
  }
  if (typeof testHooks.readStableFileOverride === "function") {
    return testHooks.readStableFileOverride(filePath);
  }

  // One code used to cover six unrelated conditions, so when it fired nobody could tell whether the
  // repair was to publish a missing file, fix a permission, replace a link, or shrink a payload. On
  // this machine it was always the first of those and never the last, while the name said oversized.
  let beforeStat;
  try {
    beforeStat = await lstat(filePath);
  } catch {
    throw new Error("file_absent_or_unreadable");
  }

  if (!beforeStat.isFile()) throw new Error("file_not_regular");
  if (beforeStat.isSymbolicLink()) throw new Error("file_is_symlink");
  if (beforeStat.nlink !== 1) throw new Error("file_has_hard_links");
  if (beforeStat.size > MAX_BYTES) throw new Error("file_oversized");

  let canonicalPath;
  try {
    canonicalPath = await realpath(filePath);
  } catch {
    throw new Error("file_realpath_failed");
  }

  const pathsEqual = typeof testHooks.pathsEqual === "function" ? testHooks.pathsEqual : defaultPathsEqual;
  if (!pathsEqual(canonicalPath, filePath)) {
    throw new Error("reparse_path_forbidden");
  }

  let handle;
  try {
    handle = await open(filePath, "r");
    const openedStat = await handle.stat();

    if (
      !openedStat.isFile()
      || openedStat.nlink !== 1
      || String(openedStat.dev) !== String(beforeStat.dev)
      || String(openedStat.ino) !== String(beforeStat.ino)
      || openedStat.size !== beforeStat.size
      || openedStat.mtimeMs !== beforeStat.mtimeMs
    ) {
      throw new Error("file_identity_changed");
    }

    const bytes = await handle.readFile();
    const afterPathStat = await lstat(filePath);

    if (
      !afterPathStat.isFile()
      || afterPathStat.isSymbolicLink()
      || afterPathStat.nlink !== 1
      || String(afterPathStat.dev) !== String(openedStat.dev)
      || String(afterPathStat.ino) !== String(openedStat.ino)
      || afterPathStat.size !== openedStat.size
      || afterPathStat.mtimeMs !== openedStat.mtimeMs
    ) {
      throw new Error("file_identity_changed");
    }

    return bytes.toString("utf8");
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
  }
}

export function validateCodexRetentionAutomationReport(report, options = {}) {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report_envelope_invalid");
  }

  const topKeys = Object.keys(report);
  for (const k of topKeys) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) {
      throw new Error("report_extra_keys_forbidden");
    }
  }

  if (report.schema_version !== CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA) {
    throw new Error("report_schema_invalid");
  }
  if (typeof report.generated_at !== "string" || !Number.isFinite(Date.parse(report.generated_at))) {
    throw new Error("report_generated_at_invalid");
  }

  const nowMs = typeof options.now === "function" ? options.now() : (Number.isFinite(options.now) ? options.now : Date.now());
  const genMs = Date.parse(report.generated_at);
  if (genMs > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new Error("generated_at_future_timestamp");
  }

  if (report.report_only !== true) {
    throw new Error("report_only_required");
  }
  if (report.status !== "PASS" && report.status !== "HOLD") {
    throw new Error("report_status_invalid");
  }

  if (!report.summary || typeof report.summary !== "object" || Array.isArray(report.summary)) {
    throw new Error("report_summary_invalid");
  }

  const sumKeys = Object.keys(report.summary);
  for (const k of sumKeys) {
    if (!ALLOWED_SUMMARY_KEYS.has(k)) {
      throw new Error("summary_extra_keys_forbidden");
    }
  }

  if (report.summary.retention_evidence_status !== "PASS" && report.summary.retention_evidence_status !== "HOLD") {
    throw new Error("summary_retention_evidence_status_invalid");
  }
  if (report.summary.retention_action !== "HOLD") {
    throw new Error("summary_retention_action_invalid");
  }
  if (report.summary.inventory_status !== "PASS" && report.summary.inventory_status !== "HOLD") {
    throw new Error("summary_inventory_status_invalid");
  }

  for (const field of ["bound_candidate_count", "unbound_active_task_count", "inventory_gap_count"]) {
    const val = report.summary[field];
    if (!Number.isInteger(val) || val < 0) {
      throw new Error(`summary_${field}_invalid`);
    }
  }

  const tc = report.summary.task_classifications;
  if (tc === null || typeof tc !== "object" || Array.isArray(tc)) {
    throw new Error("summary_task_classifications_invalid");
  }
  const tcKeys = Object.keys(tc);
  if (tcKeys.length !== ALLOWED_TASK_CLASSIFICATION_KEYS.size) {
    throw new Error("summary_task_classifications_invalid");
  }
  for (const key of tcKeys) {
    if (!ALLOWED_TASK_CLASSIFICATION_KEYS.has(key)) throw new Error("summary_task_classifications_invalid");
    const val = tc[key];
    if (!Number.isInteger(val) || val < 0) throw new Error("summary_task_classifications_invalid");
  }

  const wt = report.summary.worktree_totals;
  if (wt === null || typeof wt !== "object" || Array.isArray(wt)) {
    throw new Error("summary_worktree_totals_invalid");
  }
  const wtKeys = Object.keys(wt);
  if (wtKeys.length !== ALLOWED_WORKTREE_TOTAL_KEYS.size) {
    throw new Error("summary_worktree_totals_invalid");
  }
  for (const key of wtKeys) {
    if (!ALLOWED_WORKTREE_TOTAL_KEYS.has(key)) throw new Error("summary_worktree_totals_invalid");
    const val = wt[key];
    if (!Number.isInteger(val) || val < 0) throw new Error("summary_worktree_totals_invalid");
  }

  if (report.summary.destructive_action_count !== 0) {
    throw new Error("destructive_action_count_must_be_zero");
  }
  if (report.summary.local_automation_install_count !== 0) {
    throw new Error("local_automation_install_count_must_be_zero");
  }

  if (typeof report.digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(report.digest)) {
    throw new Error("report_digest_invalid");
  }

  const recomputedDigest = computeAutomationReportDigest(report);
  if (report.digest !== recomputedDigest) {
    throw new Error("report_digest_mismatch");
  }

  return report;
}

export function unavailableProjection(reason = "codex_retention_report_unavailable", nowMs = Date.now()) {
  const safeReason = ALLOWLISTED_PROJECTION_REASONS.has(reason) ? reason : "codex_retention_report_unreadable";
  return {
    schema_version: CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA,
    observed_at: new Date(nowMs).toISOString(),
    status: "unavailable",
    reason: safeReason,
    age_seconds: null,
    summary: {
      retention_evidence_status: "HOLD",
      retention_action: "HOLD",
      inventory_status: "UNKNOWN",
      bound_candidate_count: 0,
      unbound_active_task_count: 0,
      inventory_gap_count: 0,
      task_classifications: {
        active: 0,
        input_waiting: 0,
        result_waiting: 0,
        completed: 0,
        interrupted: 0,
        duplicate: 0,
        unknown: 0
      },
      worktree_totals: {
        total: 0,
        dirty: 0,
        locked: 0,
        index_lock: 0,
        operation_marker: 0,
        unique_commit: 0,
        prunable: 0
      },
      destructive_action_count: 0,
      local_automation_install_count: 0
    },
    authority_boundary: {
      read_only: true,
      runtime_authority: false,
      repair_authority: false,
      destructive_authority: false
    }
  };
}

export function evaluateCodexRetentionProjection(report, options = {}) {
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const graceSeconds = options.graceSeconds ?? DEFAULT_GRACE_SECONDS;

  if (!Number.isInteger(periodSeconds) || periodSeconds <= 0) {
    throw new Error("invalid_period_or_grace_window");
  }
  if (!Number.isInteger(graceSeconds) || graceSeconds < 0) {
    throw new Error("invalid_period_or_grace_window");
  }

  const nowMs = typeof options.now === "function" ? options.now() : (Number.isFinite(options.now) ? options.now : Date.now());
  const validated = validateCodexRetentionAutomationReport(report, { now: nowMs });

  const generatedMs = Date.parse(validated.generated_at);
  const ageSeconds = Math.max(0, Math.floor((nowMs - generatedMs) / 1000));

  let status = "current";
  let reason = null;

  if (ageSeconds > periodSeconds + graceSeconds) {
    status = "stale";
    reason = "report_stale";
  } else if (ageSeconds > periodSeconds) {
    status = "late";
    reason = "report_late";
  } else if (validated.status === "HOLD") {
    reason = "retention_or_inventory_hold";
  }

  const tc = validated.summary.task_classifications ?? {};
  const wt = validated.summary.worktree_totals ?? {};

  return {
    schema_version: CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA,
    observed_at: new Date(nowMs).toISOString(),
    status,
    reason,
    age_seconds: ageSeconds,
    summary: {
      retention_evidence_status: validated.summary.retention_evidence_status,
      retention_action: validated.summary.retention_action ?? "HOLD",
      inventory_status: validated.summary.inventory_status,
      bound_candidate_count: validated.summary.bound_candidate_count,
      unbound_active_task_count: validated.summary.unbound_active_task_count,
      inventory_gap_count: validated.summary.inventory_gap_count,
      task_classifications: {
        active: tc.active ?? 0,
        input_waiting: tc.input_waiting ?? 0,
        result_waiting: tc.result_waiting ?? 0,
        completed: tc.completed ?? 0,
        interrupted: tc.interrupted ?? 0,
        duplicate: tc.duplicate ?? 0,
        unknown: tc.unknown ?? 0
      },
      worktree_totals: {
        total: wt.total ?? 0,
        dirty: wt.dirty ?? 0,
        locked: wt.locked ?? 0,
        index_lock: wt.index_lock ?? 0,
        operation_marker: wt.operation_marker ?? 0,
        unique_commit: wt.unique_commit ?? 0,
        prunable: wt.prunable ?? 0
      },
      destructive_action_count: 0,
      local_automation_install_count: 0
    },
    authority_boundary: {
      read_only: true,
      runtime_authority: false,
      repair_authority: false,
      destructive_authority: false
    }
  };
}

export async function readCodexRetentionProjectionInternal(options = {}, testHooks = {}) {
  const nowMs = typeof options.now === "function" ? options.now() : (Number.isFinite(options.now) ? options.now : Date.now());

  let reportPath = options.reportPath || null;
  if (!reportPath && options.ownerRoot && typeof options.ownerRoot === "string") {
    reportPath = path.join(
      options.ownerRoot,
      "guild_hall",
      "state",
      "operations",
      "soulforge_activity",
      "reports",
      "codex_retention",
      "current.json"
    );
  }

  if (!reportPath) {
    return unavailableProjection("codex_retention_report_path_unconfigured", nowMs);
  }

  let rawContent;
  try {
    rawContent = await readStableFile(reportPath, testHooks);
  } catch (err) {
    const code = err?.message || "";
    const safeReason = ALLOWLISTED_PROJECTION_REASONS.has(code) ? code : "codex_retention_report_unreadable";
    return unavailableProjection(safeReason, nowMs);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return unavailableProjection("codex_retention_report_json_invalid", nowMs);
  }

  try {
    return evaluateCodexRetentionProjection(parsed, {
      now: nowMs,
      periodSeconds: options.periodSeconds,
      graceSeconds: options.graceSeconds
    });
  } catch (err) {
    const code = err?.message || "";
    const safeReason = ALLOWLISTED_PROJECTION_REASONS.has(code) ? code : "codex_retention_projection_failed";
    return unavailableProjection(safeReason, nowMs);
  }
}
