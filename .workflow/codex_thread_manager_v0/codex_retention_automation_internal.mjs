import { writeFile, rename, mkdir, lstat, realpath, unlink, open } from "node:fs/promises";
import { dirname, join, resolve, isAbsolute, relative } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { runLifecycleRetentionReport, defaultRepoRoot } from "./lifecycle_retention.mjs";
import { scanFeatureManualInventory } from "./feature_manual_inventory.mjs";
import { appendActivityEvent } from "../../guild_hall/activity/activity_log.mjs";

export const CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA = "soulforge.codex_thread_manager.codex_retention_automation_report.v1";

/**
 * `retention.candidates` grows with the enrolled-thread count and `inventory.rows` with the feature
 * count, and neither had a bound. The one reader of this report,
 * `codex-retention-projection-internal.mjs`, refuses a file over 512 KB, so an unbounded producer
 * eventually publishes a report nothing can open. The repair belongs here rather than in a raised
 * limit: the limit exists to keep a reader from being handed something unbounded. The 200 KB budget
 * below is deliberately well under that ceiling. (`receipt-expiry-adapter.mjs` has a stricter
 * 256 KB limit but never reads this file; it reads the receipt-expiry binding and its evidence
 * paths.)
 *
 * Neither array is read by any consumer in this repository; the projection validates the top-level
 * key set and then reads only `summary`. They are kept for a future consumer, bounded, and never
 * silently cut - every truncation states what it dropped.
 */
export const MAX_REPORT_ROWS = 200;
export const MAX_REPORT_BYTES = 200 * 1024;
export const MAX_SETTLE_ITERATIONS = 8;

function boundReportRows(rows, limit = MAX_REPORT_ROWS) {
  const total = rows.length;
  const included = Math.min(total, limit);
  return {
    rows: rows.slice(0, included),
    marker: {
      total_count: total,
      included_count: included,
      dropped_count: total - included,
      truncated: total > included,
      order: "producer_order_first_n"
    }
  };
}

/**
 * A row count is a proxy for the thing the readers actually limit, which is bytes.
 *
 * Two things this has to get right, both of which it got wrong first. It must measure the artifact
 * that is actually written — pretty-printed UTF-8 including the digest — and not the compact UTF-16
 * length, which understated the file by 4.2x in probing and let a 504 KB file past a 200 KB budget.
 * And it must say so when it cannot reach the budget: only two lists here are shrinkable, so weight
 * anywhere else (`classifications`, `source_refs`, `source_health`) can hold the report over the
 * limit no matter how much detail is dropped. Exiting quietly there produced a 712 KB file that had
 * discarded 100% of its candidates and reported nothing about either fact.
 */
const PLACEHOLDER_DIGEST = `sha256:${"0".repeat(64)}`;

function writtenByteLength(envelope) {
  // The digest is assigned after this runs but is present in the file, and a sha256 hex string is
  // always the same length, so measuring with a placeholder measures the real artifact.
  return Buffer.byteLength(JSON.stringify({ ...envelope, digest: PLACEHOLDER_DIGEST }, null, 2), "utf8");
}

function shrinkReportToBudget(envelope, maxBytes = MAX_REPORT_BYTES) {
  // The marker is created BEFORE the loop, because the loop's own exit test has to measure the
  // artifact that includes it. Measuring without it left a 177-byte window just under the budget in
  // which a report was published over the limit, with `shrink_passes: 0` and the blame placed on an
  // unshrinkable remainder, while its lists sat there untouched and plainly shrinkable.
  envelope.retention.report_budget = {
    max_bytes: maxBytes,
    measured_bytes: 0,
    budget_met: false,
    shrink_passes: 0,
    unshrinkable_remainder: false
  };

  /**
   * Settles every field of the marker against the artifact that contains the marker, and returns
   * that artifact's exact byte length.
   *
   * It converges: after the first iteration exactly one of the two booleans is `true` and they are
   * exact negations, so their combined length is fixed and the map reduces to
   * `v -> constant + digits(v)`, which is monotone and confined to a seven-value span. A cycle
   * would need two sizes with different digit counts mapping to each other, which monotonicity
   * forbids. The bound is a backstop, not the mechanism.
   */
  const settle = () => {
    let measured = 0;
    for (let iteration = 0; iteration < MAX_SETTLE_ITERATIONS; iteration += 1) {
      const next = writtenByteLength(envelope);
      if (next === measured) return measured;
      measured = next;
      const budget = envelope.retention.report_budget;
      budget.measured_bytes = measured;
      budget.budget_met = measured <= maxBytes;
      budget.unshrinkable_remainder = measured > maxBytes;
    }
    return measured;
  };

  let passes = 0;
  while (settle() > maxBytes) {
    const candidateCount = envelope.retention.candidates.length;
    const rowCount = envelope.inventory.rows.length;
    if (candidateCount === 0 && rowCount === 0) break;
    passes += 1;
    envelope.retention.candidates = envelope.retention.candidates.slice(0, Math.floor(candidateCount / 2));
    envelope.inventory.rows = envelope.inventory.rows.slice(0, Math.floor(rowCount / 2));
    envelope.retention.candidates_truncation = {
      ...envelope.retention.candidates_truncation,
      included_count: envelope.retention.candidates.length,
      dropped_count: envelope.retention.candidates_truncation.total_count - envelope.retention.candidates.length,
      truncated: envelope.retention.candidates_truncation.total_count > envelope.retention.candidates.length
    };
    envelope.inventory.rows_truncation = {
      ...envelope.inventory.rows_truncation,
      included_count: envelope.inventory.rows.length,
      dropped_count: envelope.inventory.rows_truncation.total_count - envelope.inventory.rows.length,
      truncated: envelope.inventory.rows_truncation.total_count > envelope.inventory.rows.length
    };
    // The pass count is inside the measured artifact too, so it is written before the next settle
    // rather than after the loop.
    envelope.retention.report_budget.shrink_passes = passes;
  }
  return passes;
}
export const FEATURE_CATALOG_SCHEMA = "soulforge.codex_thread_manager.codex_retention_feature_catalog.v1";
export const RELATIVE_REPORT_PATH = "reports/codex_retention/current.json";
const MAX_VALID_TIMESTAMP_MS = 8640000000000000;

export const DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG = Object.freeze({
  schema_version: FEATURE_CATALOG_SCHEMA,
  features: Object.freeze([
    {
      feature_id: "codex_lifecycle_retention_core",
      owner_root: ".workflow/codex_thread_manager_v0",
      owner_readme: ".workflow/codex_thread_manager_v0/README.md",
      operating_manual_ref: "docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md",
      validator_ref: "node --test .workflow/codex_thread_manager_v0/tests/lifecycle_retention.test.mjs",
      changelog_ref: "CHANGELOG.md",
      roadmap_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      last_validation_state: "not_run"
    },
    {
      feature_id: "codex_feature_manual_inventory",
      owner_root: ".workflow/codex_thread_manager_v0",
      owner_readme: ".workflow/codex_thread_manager_v0/README.md",
      operating_manual_ref: "docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md",
      validator_ref: "node --test .workflow/codex_thread_manager_v0/tests/feature_manual_inventory.test.mjs",
      changelog_ref: "CHANGELOG.md",
      roadmap_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      last_validation_state: "not_run"
    },
    {
      feature_id: "codex_retention_automation",
      owner_root: ".workflow/codex_thread_manager_v0",
      owner_readme: ".workflow/codex_thread_manager_v0/README.md",
      operating_manual_ref: "docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md",
      validator_ref: "node --test .workflow/codex_thread_manager_v0/tests/codex_retention_automation.test.mjs",
      changelog_ref: "CHANGELOG.md",
      roadmap_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      last_validation_state: "not_run"
    }
  ])
});

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

export function validateFeatureCatalogInput(rawCatalog) {
  if (rawCatalog === null || typeof rawCatalog !== "object" || Array.isArray(rawCatalog)) {
    throw new Error("catalog_file_invalid");
  }
  const keys = Object.keys(rawCatalog);
  if (keys.length !== 2 || !keys.includes("schema_version") || !keys.includes("features")) {
    throw new Error("catalog_file_invalid");
  }
  if (rawCatalog.schema_version !== FEATURE_CATALOG_SCHEMA) {
    throw new Error("catalog_file_invalid");
  }
  if (!Array.isArray(rawCatalog.features) || rawCatalog.features.length === 0) {
    throw new Error("catalog_file_invalid");
  }
  return rawCatalog.features;
}

async function verifyHardenedWriteSeam(activityRoot, targetReportPath, adapters = {}) {
  const absActivityRoot = resolve(activityRoot);
  const absTargetReportPath = resolve(targetReportPath);

  const rel = relative(absActivityRoot, absTargetReportPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("write_root_escape_attempt");
  }

  const lstatFn = adapters.lstat ?? lstat;
  const realpathFn = adapters.realpath ?? realpath;
  const mkdirFn = adapters.mkdir ?? mkdir;

  try {
    await mkdirFn(absActivityRoot, { recursive: true });
  } catch {
    throw new Error("activity_root_invalid");
  }

  let rootStat;
  try {
    rootStat = await lstatFn(absActivityRoot);
  } catch {
    throw new Error("activity_root_invalid");
  }

  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("reparse_target_forbidden");
  }

  let canonicalRoot;
  try {
    canonicalRoot = await realpathFn(absActivityRoot);
  } catch {
    throw new Error("reparse_target_forbidden");
  }

  const isWin = adapters.isWin !== undefined ? Boolean(adapters.isWin) : (process.platform === "win32");
  if (isWin) {
    if (!canonicalRoot || canonicalRoot.toLowerCase() !== absActivityRoot.toLowerCase()) {
      throw new Error("reparse_target_forbidden");
    }
  } else {
    // Non-Windows: permits canonical ancestor aliases (e.g. /var to /private/var),
    // but rejects activityRoot if activityRoot itself is a symlink.
    if (rootStat.isSymbolicLink()) {
      throw new Error("reparse_target_forbidden");
    }
  }

  const targetDir = dirname(absTargetReportPath);
  try {
    await mkdirFn(targetDir, { recursive: true });
    const dirStat = await lstatFn(targetDir);
    if (!dirStat || dirStat.isSymbolicLink()) {
      throw new Error("reparse_target_forbidden");
    }
    const canonicalTargetDir = await realpathFn(targetDir);
    const relCanonical = relative(canonicalRoot, canonicalTargetDir);
    if (relCanonical.startsWith("..") || isAbsolute(relCanonical)) {
      throw new Error("reparse_target_forbidden");
    }
  } catch (err) {
    const msg = err?.message || "";
    if (msg === "reparse_target_forbidden" || msg === "write_root_escape_attempt") {
      throw err;
    }
    throw new Error("reparse_target_forbidden");
  }
}

export async function runCodexRetentionAutomationInternal(options = {}, adapters = {}) {
  const repoRoot = resolve(options.repoRoot ?? defaultRepoRoot());
  const activityRoot = options.activityRoot ? resolve(options.activityRoot) : null;

  if (!activityRoot) {
    throw new Error("activity_root_invalid");
  }

  const targetReportPath = join(activityRoot, RELATIVE_REPORT_PATH);

  await verifyHardenedWriteSeam(activityRoot, targetReportPath, adapters);

  const rawCatalog = options.catalog ?? DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG;
  const catalogArray = validateFeatureCatalogInput(rawCatalog);

  const nowVal = options.now;
  const nowMs = typeof nowVal === "function"
    ? nowVal()
    : (nowVal instanceof Date
      ? nowVal.getTime()
      : (Number.isFinite(nowVal) ? nowVal : Date.now()));

  if (!Number.isFinite(nowMs) || nowMs <= 0 || nowMs > MAX_VALID_TIMESTAMP_MS) {
    throw new Error("invalid_time");
  }
  // `canonicalizeJson` deliberately excludes `generated_at` from the digest so that identical
  // content at two different times digests the same. `report_budget.measured_bytes` counts
  // `generated_at`'s bytes and IS inside the digest, which reintroduces that coupling whenever the
  // ISO string changes length — `new Date(3e14).toISOString()` is 27 characters, not 24. Refusing
  // such a timestamp keeps the canonicalizer's promise true rather than quietly breaking it.
  if (new Date(nowMs).toISOString().length !== 24) {
    throw new Error("invalid_time");
  }

  const isoNow = new Date(nowMs).toISOString();

  const runLifecycleRetentionReportFn = adapters.runLifecycleRetentionReport ?? runLifecycleRetentionReport;

  let retentionReport;
  let retentionError = null;
  try {
    retentionReport = await runLifecycleRetentionReportFn({
      repoRoot,
      now: nowMs,
      readJson: adapters.readJsonSource,
      inspectWorktrees: adapters.inspectWorktrees
    });
  } catch {
    retentionError = "lifecycle_retention_report_failed";
  }

  let inventoryReport;
  let inventoryError = null;
  try {
    inventoryReport = await scanFeatureManualInventory(catalogArray, {
      repoRoot,
      now: nowMs,
      readFile: adapters.readFile,
      access: adapters.access
    });
  } catch {
    inventoryError = "feature_manual_inventory_scan_failed";
  }

  const sourceHealth = retentionReport?.source_health ?? null;
  const preflight = retentionReport?.worktree_preflight ?? null;

  const isSourceHealthAvailable = sourceHealth
    && sourceHealth.enrollment === "available"
    && sourceHealth.lifecycle === "available"
    && sourceHealth.result_gate === "available"
    && sourceHealth.task_worktree_binding === "available";

  const isWorktreeHealthAvailable = preflight
    && (preflight.list_status === "available" || preflight.list_status === "ok")
    && (preflight.comparison_ref_status === "available" || preflight.comparison_ref_status === "ok");

  const retentionEvidenceStatus = (!retentionError && isSourceHealthAvailable && isWorktreeHealthAvailable) ? "PASS" : "HOLD";
  const inventoryStatus = (!inventoryError && inventoryReport?.status === "PASS") ? "PASS" : "HOLD";

  const overallStatus = (retentionEvidenceStatus === "PASS" && inventoryStatus === "PASS") ? "PASS" : "HOLD";

  const unboundedRetentionCandidates = Array.isArray(retentionReport?.candidates)
    ? retentionReport.candidates.map((c) => ({
        candidate_id: c.candidate_id,
        retention_action: "HOLD",
        classification: c.classification,
        enrollment_lifecycle: c.enrollment_lifecycle,
        reason_codes: c.reason_codes,
        hold_reasons: c.hold_reasons,
        metadata_counts: c.metadata_counts
      }))
    : [];

  const unboundedInventoryRows = Array.isArray(inventoryReport?.rows)
    ? inventoryReport.rows.map((r) => ({
        feature_id: r.feature_id,
        owner_root: r.owner_root,
        owner_readme: r.owner_readme,
        operating_manual_ref: r.operating_manual_ref,
        validator_ref: r.validator_ref,
        changelog_ref: r.changelog_ref,
        changelog_status: r.changelog_status,
        roadmap_ref: r.roadmap_ref,
        roadmap_status: r.roadmap_status,
        last_validation_state: r.last_validation_state,
        last_validation_state_source: r.last_validation_state_source,
        stable_gap_codes: r.stable_gap_codes,
        next_action: r.next_action
      }))
    : [];

  const sanitizedRetentionCandidates = boundReportRows(unboundedRetentionCandidates);
  const sanitizedInventoryRows = boundReportRows(unboundedInventoryRows);

  // Pin exact Phase 1 preflight field names ONLY
  const totalW = preflight?.total_worktrees ?? 0;
  const dirtyW = preflight?.dirty_worktrees ?? 0;
  const untrackedW = preflight?.untracked_worktrees ?? 0;
  const lockedW = preflight?.locked_worktrees ?? 0;
  const indexLockW = preflight?.index_lock_worktrees ?? 0;
  const opMarkerW = preflight?.operation_marker_worktrees ?? 0;
  const uniqueCommitW = preflight?.unique_commit_worktrees ?? 0;
  const prunableW = preflight?.prunable_worktrees ?? 0;

  const classificationsObj = retentionReport?.classifications ?? {};
  const activeClass = classificationsObj.active ?? 0;
  const inputWaitingClass = classificationsObj.input_waiting ?? 0;
  const resultWaitingClass = classificationsObj.result_waiting ?? 0;
  const completedClass = classificationsObj.completed ?? 0;
  const interruptedClass = classificationsObj.interrupted ?? 0;
  const duplicateClass = (classificationsObj.duplicate ?? 0) + (classificationsObj.duplicate_candidate_hold ?? 0);
  const unknownClass = classificationsObj.unknown ?? 0;

  const envelope = {
    schema_version: CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
    generated_at: isoNow,
    report_only: true,
    status: overallStatus,
    retention: {
      evidence_status: retentionEvidenceStatus,
      retention_action: "HOLD",
      ...(retentionError ? { error_code: retentionError } : {}),
      source_health: sourceHealth,
      total_active_enrolled_threads: retentionReport?.thread_scope?.current_or_accepted_count ?? 0,
      bound_candidates: retentionReport?.thread_scope?.bound_task_count ?? 0,
      unbound_active_tasks: retentionReport?.thread_scope?.unbound_task_count ?? 0,
      counts_by_classification: classificationsObj,
      worktree_totals: {
        total_worktrees: totalW,
        dirty_worktrees: dirtyW,
        untracked_worktrees: untrackedW,
        locked_worktrees: lockedW,
        index_lock_worktrees: indexLockW,
        operation_marker_worktrees: opMarkerW,
        unique_commit_worktrees: uniqueCommitW,
        prunable_worktrees: prunableW
      },
      candidates: sanitizedRetentionCandidates.rows,
      candidates_truncation: sanitizedRetentionCandidates.marker,
      digest: retentionReport?.digest ?? null
    },
    inventory: {
      status: inventoryStatus,
      ...(inventoryError ? { error_code: inventoryError } : {}),
      total_features: inventoryReport?.total_features ?? 0,
      covered_features: inventoryReport?.covered_features ?? 0,
      gap_features: inventoryReport?.gap_features ?? 0,
      summary_gap_counts: inventoryReport?.summary_gap_counts ?? {},
      source_refs: inventoryReport?.source_refs ?? [],
      rows: sanitizedInventoryRows.rows,
      rows_truncation: sanitizedInventoryRows.marker,
      digest: inventoryReport?.digest ?? null
    },
    summary: {
      retention_evidence_status: retentionEvidenceStatus,
      retention_action: "HOLD",
      inventory_status: inventoryStatus,
      bound_candidate_count: retentionReport?.thread_scope?.bound_task_count ?? 0,
      unbound_active_task_count: retentionReport?.thread_scope?.unbound_task_count ?? 0,
      inventory_gap_count: inventoryReport?.gap_features ?? 0,
      task_classifications: {
        active: activeClass,
        input_waiting: inputWaitingClass,
        result_waiting: resultWaitingClass,
        completed: completedClass,
        interrupted: interruptedClass,
        duplicate: duplicateClass,
        unknown: unknownClass
      },
      worktree_totals: {
        total: totalW,
        dirty: dirtyW,
        locked: lockedW,
        index_lock: indexLockW,
        operation_marker: opMarkerW,
        unique_commit: uniqueCommitW,
        prunable: prunableW
      },
      destructive_action_count: 0,
      local_automation_install_count: 0
    }
  };

  shrinkReportToBudget(envelope);
  envelope.digest = computeAutomationReportDigest(envelope);

  // Check expected digest BEFORE any file write and BEFORE any Activity event
  if (options.expectedDigest !== undefined && options.expectedDigest !== null) {
    if (typeof options.expectedDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(options.expectedDigest)) {
      throw new Error("digest_mismatch");
    }
    if (options.expectedDigest !== envelope.digest) {
      throw new Error("digest_mismatch");
    }
  }

  // Step 1: Append Activity event BEFORE publishing current.json
  const appendActivityEventFn = adapters.appendActivityEvent ?? appendActivityEvent;
  let activitySuccess = false;
  try {
    const actRes = await appendActivityEventFn({
      repoRoot,
      activityRoot,
      now: new Date(nowMs),
      input: {
        scope: "codex_retention",
        action: "prepare_report",
        result: overallStatus === "PASS" ? "prepared" : "hold",
        summary: `Codex retention report evaluation prepared: status=${overallStatus}, bound_candidates=${envelope.summary.bound_candidate_count}, inventory_gaps=${envelope.summary.inventory_gap_count}, destructive_actions=0`,
        refs: ["reports/codex_retention/current.json"],
        next_action: overallStatus === "PASS" ? null : "HOLD",
        carry_forward: false
      }
    });
    if (actRes && !actRes.error) {
      activitySuccess = true;
    }
  } catch {
    activitySuccess = false;
  }

  if (!activitySuccess) {
    throw new Error("activity_append_failed");
  }

  // Step 2: Publish report via hardened atomic write seam AFTER Activity append succeeds
  const mkdirFn = adapters.mkdir ?? mkdir;
  const renameFn = adapters.rename ?? rename;
  const openFn = adapters.open ?? open;
  const unlinkFn = adapters.unlink ?? unlink;

  const targetDir = dirname(targetReportPath);
  try {
    await mkdirFn(targetDir, { recursive: true });
  } catch {
    throw new Error("atomic_write_failed");
  }

  const tempNonce = randomBytes(8).toString("hex");
  const tempReportPath = join(targetDir, `current.json.tmp.${tempNonce}`);

  let handle;
  let handleClosed = false;

  const closeHandle = async () => {
    if (handle && !handleClosed) {
      handleClosed = true;
      if (typeof handle.close === "function") {
        await handle.close().catch(() => {});
      }
    }
  };

  try {
    if (adapters.open) {
      handle = await openFn(tempReportPath, "wx");
      await handle.writeFile(JSON.stringify(envelope, null, 2), "utf8");
    } else {
      handle = await open(tempReportPath, "wx");
      await handle.writeFile(JSON.stringify(envelope, null, 2), "utf8");
    }
    await closeHandle();
    await renameFn(tempReportPath, targetReportPath);
  } catch {
    await closeHandle();
    await unlinkFn(tempReportPath).catch(() => {});
    throw new Error("atomic_write_failed");
  }

  const portableReportRef = relative(activityRoot, targetReportPath).replace(/\\/g, "/");

  return {
    report: envelope,
    report_path: portableReportRef,
    activity_result: {
      status: "recorded"
    }
  };
}
