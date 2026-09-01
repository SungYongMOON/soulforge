// Target folder materializer — plan 17, leaf R2.
//
// Materializes the plan-17 data-root catalog view as EMPTY DIRECTORIES ONLY
// under one approved empty canary root. It never moves, copies, renames,
// deletes, or opens any payload byte (existing payload move 0), it is
// idempotent under replay, and its rollback removes only still-empty
// directories authenticated as created by that exact operation.
//
// The approved root ref is an OD-10 Owner decision: without an exact
// non-hold `approved_empty_materialization_root_ref`, planning returns a
// stable HOLD and nothing touches the filesystem. Root admission reuses the
// hardened primitives of `guild_hall/shared/knowledge_root_resolver.mjs`
// (reparse/junction, UNC/device, alternate data stream, Unicode/Windows
// alias, traversal, and realpath-containment drift all reject).
//
// The source lanes are registry-driven: every `row_kind: "source"` row in
// the R1 snapshot gets the uniform external-source lane. A self-selected
// source list cannot satisfy coverage.

import { lstatSync, mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";

import {
  KnowledgeRootResolverError,
  resolveKnowledgeRoot,
} from "../../shared/knowledge_root_resolver.mjs";
import { PATH_REGISTRY_SCHEMA } from "./path_registry_core.mjs";

export const TARGET_MATERIALIZER_SCHEMA = "soulforge.target_materializer.v0";
export const APPROVED_EMPTY_MATERIALIZATION_ROOT_REF = "pathref:recovery.physical_spine_canary";

const REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const SOURCE_LANE_DIRS = Object.freeze([
  "binding", "capture-generations", "manifests", "backup-generation-refs",
  "restore-tests", "receipts", "quarantine-refs", "current-projection",
  "legacy-path-map",
]);

const STATIC_TREE = Object.freeze([
  "00_CATALOG",
  "00_CATALOG/path-registry",
  "00_CATALOG/owners",
  "00_CATALOG/storage-classes",
  "00_CATALOG/asset-classes",
  "00_CATALOG/ledger-catalog",
  "00_CATALOG/case-activity-registry",
  "00_CATALOG/legacy-path-map",
  "10_SOURCE_CAPTURE_CATALOG",
  "20_PROJECT_ASSET_INDEX",
  "25_EVENT_TIMELINE_INDEX",
  "25_EVENT_TIMELINE_INDEX/occurrences",
  "25_EVENT_TIMELINE_INDEX/correlations",
  "25_EVENT_TIMELINE_INDEX/decisions",
  "25_EVENT_TIMELINE_INDEX/validity-intervals",
  "25_EVENT_TIMELINE_INDEX/supersession",
  "30_KNOWLEDGE_INDEX",
  "30_KNOWLEDGE_INDEX/source-catalog",
  "30_KNOWLEDGE_INDEX/ontology",
  "30_KNOWLEDGE_INDEX/project-context",
  "30_KNOWLEDGE_INDEX/accepted-generations",
  "30_KNOWLEDGE_INDEX/rag-indexes",
  "30_KNOWLEDGE_INDEX/rag-indexes/generation-catalog",
  "30_KNOWLEDGE_INDEX/rag-indexes/evaluation",
  "30_KNOWLEDGE_INDEX/rag-indexes/active-pointer",
  "30_KNOWLEDGE_INDEX/rag-indexes/invalidation",
  "30_KNOWLEDGE_INDEX/wiki-projections",
  "30_KNOWLEDGE_INDEX/notebooklm-bindings",
  "40_ASSETS",
  "40_ASSETS/artifacts",
  "40_ASSETS/templates",
  "40_ASSETS/bom-material",
  "40_ASSETS/datasets",
  "40_ASSETS/test-results",
  "40_ASSETS/revisions",
  "45_EVENT_STORES",
  "45_EVENT_STORES/projects",
  "45_EVENT_STORES/organizations",
  "50_AI_WORKFORCE_INDEX",
  "50_AI_WORKFORCE_INDEX/agent-families",
  "50_AI_WORKFORCE_INDEX/agent-marks",
  "50_AI_WORKFORCE_INDEX/runtime-profiles",
  "50_AI_WORKFORCE_INDEX/deployments",
  "50_AI_WORKFORCE_INDEX/runs",
  "50_AI_WORKFORCE_INDEX/memory-generations",
  "55_ANALYTICS_DATASET_INDEX",
  "55_ANALYTICS_DATASET_INDEX/process-mining",
  "55_ANALYTICS_DATASET_INDEX/learning-evaluation",
  "60_BACKUP_GENERATIONS",
  "70_QUARANTINE",
  "80_CUSTODY_RECEIPT_INDEX",
  "90_PROJECTIONS",
  "90_PROJECTIONS/watch-4192",
  "99_RESTORE_REQUEST_REFS",
]);

// A caller-visible receipt is useful recovery evidence, but its public fields
// are not authority to delete anything. These private identity maps bind a
// plan and its apply/recovery receipts to this module invocation only. They
// deliberately make serialization/reconstruction ineligible for rollback.
const trustedPlans = new WeakMap();
const trustedReceipts = new WeakMap();

function hold(holdCode, detail) {
  return Object.freeze({
    status: "hold",
    hold_code: holdCode,
    ...(detail === undefined ? {} : { detail }),
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function sameStringList(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function trustedPlanFor(plan) {
  if (plan === null || typeof plan !== "object" || plan.status !== "planned"
      || plan.schema !== TARGET_MATERIALIZER_SCHEMA || !Array.isArray(plan.directories)) {
    return { error: hold("plan_invalid") };
  }
  const trusted = trustedPlans.get(plan);
  if (trusted === undefined) return { error: hold("plan_untrusted") };
  if (plan.approved_empty_materialization_root_ref !== trusted.approved_root_ref
      || plan.registry_snapshot_digest !== trusted.registry_snapshot_digest
      || !sameStringList(plan.directories, trusted.directories)) {
    return { error: hold("plan_untrusted") };
  }
  return { trusted };
}

function issueReceipt({
  status, trustedPlan, admission, created, existing, uncertain_paths = [],
}) {
  const receipt = deepFreeze({
    status,
    schema: TARGET_MATERIALIZER_SCHEMA,
    approved_empty_materialization_root_ref: trustedPlan.approved_root_ref,
    registry_snapshot_digest: trustedPlan.registry_snapshot_digest,
    root_commitment: admission.local_path_commitment_sha256,
    planned_count: trustedPlan.directories.length,
    created: [...created],
    existing: [...existing],
    ...(uncertain_paths.length > 0 ? { uncertain_paths: [...uncertain_paths] } : {}),
    payload_moved: 0,
  });
  trustedReceipts.set(receipt, Object.freeze({
    status,
    approved_root_ref: trustedPlan.approved_root_ref,
    registry_snapshot_digest: trustedPlan.registry_snapshot_digest,
    root_commitment: admission.local_path_commitment_sha256,
    created: Object.freeze([...created]),
  }));
  return receipt;
}

function holdWithRecovery(holdCode, detail, {
  mode, trustedPlan, admission, created, existing, uncertain_paths,
}) {
  if (mode !== "apply" || (created.length === 0 && uncertain_paths.length === 0)) {
    return hold(holdCode, detail);
  }
  const recoveryReceipt = issueReceipt({
    status: "recovery_required",
    trustedPlan,
    admission,
    created,
    existing,
    uncertain_paths,
  });
  return deepFreeze({
    status: "hold",
    hold_code: holdCode,
    ...(detail === undefined ? {} : { detail }),
    recovery_receipt: recoveryReceipt,
  });
}

function trustedReceiptFor(receipt) {
  if (receipt === null || typeof receipt !== "object"
      || (receipt.status !== "applied" && receipt.status !== "recovery_required")
      || receipt.schema !== TARGET_MATERIALIZER_SCHEMA || !Array.isArray(receipt.created)) {
    return { error: hold("receipt_invalid") };
  }
  const trusted = trustedReceipts.get(receipt);
  if (trusted === undefined) return { error: hold("receipt_untrusted") };
  if (receipt.status !== trusted.status
      || receipt.approved_empty_materialization_root_ref !== trusted.approved_root_ref
      || receipt.registry_snapshot_digest !== trusted.registry_snapshot_digest
      || receipt.root_commitment !== trusted.root_commitment
      || !sameStringList(receipt.created, trusted.created)) {
    return { error: hold("receipt_untrusted") };
  }
  return { trusted };
}

function sourceLaneId(logicalPathId) {
  // `source.voice_plaud` -> catalog directory `voice-plaud`.
  return logicalPathId.replace(/^source\./u, "").replaceAll("_", "-");
}

function validRelPath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) return false;
  const segments = relPath.split("/");
  return segments.every((segment) => (
    SEGMENT.test(segment)
    && !WINDOWS_RESERVED.test(segment)
    && segment !== ".."
    && segment !== "."
    && !/[. ]$/u.test(segment)
  ));
}

export function planTargetMaterialization({
  registry_snapshot,
  approved_empty_materialization_root_ref,
} = {}) {
  const rootRef = approved_empty_materialization_root_ref;
  if (rootRef !== APPROVED_EMPTY_MATERIALIZATION_ROOT_REF
      || !REF.test(rootRef) || rootRef.startsWith("hold:")) {
    return hold("materialization_root_unapproved", "od-10_canary_root_decision_required");
  }
  // Consumer-side shape check only: the digest is carried as a label; the
  // registry core's WeakSet identity is the actual forgery guard, and any
  // later live wiring must fetch snapshots from the core, not from callers.
  if (registry_snapshot === null || typeof registry_snapshot !== "object"
      || registry_snapshot.schema !== PATH_REGISTRY_SCHEMA
      || typeof registry_snapshot.snapshot_digest !== "string"
      || !Array.isArray(registry_snapshot.rows)) {
    return hold("snapshot_invalid");
  }
  const directories = new Set(STATIC_TREE);
  const sourceRows = registry_snapshot.rows.filter((row) => row.row_kind === "source");
  if (sourceRows.length === 0) return hold("snapshot_missing_sources");
  const laneIds = new Set();
  for (const row of sourceRows) {
    const laneId = sourceLaneId(row.logical_path_id);
    // `_`->`-` mapping can collide two distinct registry rows; a silent
    // merge would break every-source-gets-a-lane coverage, so it holds.
    if (laneIds.has(laneId)) return hold("source_lane_collision", laneId);
    laneIds.add(laneId);
    const lane = `10_SOURCE_CAPTURE_CATALOG/${laneId}`;
    directories.add(lane);
    for (const dir of SOURCE_LANE_DIRS) directories.add(`${lane}/${dir}`);
    directories.add(`60_BACKUP_GENERATIONS/${laneId}`);
  }
  directories.add("60_BACKUP_GENERATIONS/projects");
  const sorted = [...directories].sort();
  for (const relPath of sorted) {
    if (!validRelPath(relPath)) return hold("rel_path_invalid", relPath);
    // Plaintext secret material is a forbidden materialization class; the
    // target tree may never grow a secret directory.
    if (relPath.toLowerCase().includes("secret")) return hold("secret_dir_forbidden", relPath);
  }
  const plan = deepFreeze({
    status: "planned",
    schema: TARGET_MATERIALIZER_SCHEMA,
    approved_empty_materialization_root_ref: rootRef,
    registry_snapshot_digest: registry_snapshot.snapshot_digest,
    directories: sorted,
  });
  trustedPlans.set(plan, Object.freeze({
    approved_root_ref: rootRef,
    registry_snapshot_digest: registry_snapshot.snapshot_digest,
    directories: Object.freeze([...sorted]),
  }));
  return plan;
}

function admitRoot(rootPath, containmentRoot) {
  try {
    return resolveKnowledgeRoot(rootPath, { containmentRoot });
  } catch (error) {
    if (error instanceof KnowledgeRootResolverError) {
      return hold("root_admission_rejected", error.code);
    }
    throw error;
  }
}

function statPlanned(absolute) {
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    return { present: false };
  }
  if (stat.isSymbolicLink()) return { present: true, safe: false, reason: "reparse_point" };
  if (!stat.isDirectory()) return { present: true, safe: false, reason: "occupied_by_file" };
  return { present: true, safe: true };
}

export function applyTargetMaterialization(plan, { root_path, containment_root, mode } = {}) {
  const planOutcome = trustedPlanFor(plan);
  if (planOutcome.error) return planOutcome.error;
  const { trusted: trustedPlan } = planOutcome;
  if (mode !== "dry-run" && mode !== "apply") return hold("mode_invalid");
  for (const relPath of trustedPlan.directories) {
    if (!validRelPath(relPath)) return hold("rel_path_invalid", relPath);
  }
  const admission = admitRoot(root_path, containment_root);
  if (admission.status === "hold") return admission;

  // The approved root must contain nothing but (previously materialized)
  // planned directories: any foreign top-level entry means this is not the
  // approved empty canary root and nothing proceeds.
  const topLevelPlanned = new Set(trustedPlan.directories.map((relPath) => relPath.split("/")[0]));
  let topLevel;
  try {
    topLevel = readdirSync(root_path);
  } catch {
    return hold("root_unavailable");
  }
  for (const entry of topLevel) {
    if (!topLevelPlanned.has(entry)) return hold("root_not_empty_foreign_payload", entry);
  }

  const created = [];
  const existing = [];
  const uncertainPaths = [];
  for (const relPath of trustedPlan.directories) {
    const absolute = join(root_path, ...relPath.split("/"));
    const status = statPlanned(absolute);
    if (status.present && !status.safe) {
      return holdWithRecovery("planned_path_occupied", `${relPath}:${status.reason}`, {
        mode, trustedPlan, admission, created, existing, uncertain_paths: uncertainPaths,
      });
    }
    if (status.present) {
      existing.push(relPath);
      continue;
    }
    if (mode === "apply") {
      // Parents sort before children, so non-recursive mkdir suffices and
      // cannot silently cross an unplanned boundary. Races and permission
      // failures surface as typed HOLDs, never raw throws.
      try {
        mkdirSync(absolute);
      } catch {
        // A failed mkdir can race with another creator. Preserve the path as
        // uncertain evidence but never grant rollback authority over it.
        if (statPlanned(absolute).present) uncertainPaths.push(relPath);
        return holdWithRecovery("mkdir_failed", relPath, {
          mode, trustedPlan, admission, created, existing, uncertain_paths: uncertainPaths,
        });
      }
      const verify = statPlanned(absolute);
      if (!verify.present || !verify.safe) {
        // mkdir returned, but a post-create race made ownership unsafe to
        // prove. It stays in recovery evidence and is never removed.
        uncertainPaths.push(relPath);
        return holdWithRecovery("planned_path_occupied", relPath, {
          mode, trustedPlan, admission, created, existing, uncertain_paths: uncertainPaths,
        });
      }
    }
    created.push(relPath);
  }
  if (mode === "dry-run") {
    return deepFreeze({
      status: "dry_run",
      schema: TARGET_MATERIALIZER_SCHEMA,
      approved_empty_materialization_root_ref: trustedPlan.approved_root_ref,
      registry_snapshot_digest: trustedPlan.registry_snapshot_digest,
      root_commitment: admission.local_path_commitment_sha256,
      planned_count: trustedPlan.directories.length,
      created,
      existing,
      payload_moved: 0,
    });
  }
  return issueReceipt({
    status: "applied",
    trustedPlan,
    admission,
    created,
    existing,
  });
}

export function rollbackTargetMaterialization(receipt, { root_path, containment_root } = {}) {
  const receiptOutcome = trustedReceiptFor(receipt);
  if (receiptOutcome.error) return receiptOutcome.error;
  const { trusted: trustedReceipt } = receiptOutcome;
  const admission = admitRoot(root_path, containment_root);
  if (admission.status === "hold") return admission;
  if (admission.local_path_commitment_sha256 !== trustedReceipt.root_commitment) {
    return hold("root_commitment_mismatch");
  }
  const removed = [];
  const retained = [];
  // Deepest-first, and only directories this receipt created and that are
  // still empty: rmdir refuses non-empty, so a foreign or later payload can
  // never be deleted by rollback.
  const ordered = [...trustedReceipt.created].sort().reverse();
  for (const relPath of ordered) {
    if (!validRelPath(relPath)) return hold("rel_path_invalid", relPath);
    const absolute = join(root_path, ...relPath.split("/"));
    const status = statPlanned(absolute);
    if (!status.present) continue;
    if (!status.safe) {
      retained.push(relPath);
      continue;
    }
    try {
      rmdirSync(absolute);
      removed.push(relPath);
    } catch {
      retained.push(relPath);
    }
  }
  return deepFreeze({
    status: "rolled_back",
    schema: TARGET_MATERIALIZER_SCHEMA,
    removed,
    retained,
    payload_moved: 0,
  });
}
