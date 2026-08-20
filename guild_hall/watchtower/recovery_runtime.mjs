#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { reconcile } from "./health_recovery_coordinator.mjs";
import {
  persistLocalEvidenceReceipt,
  validateFiveFieldLedgerSet,
  validateWatchtowerExecution,
  validateWorkmetaStore,
} from "./local_evidence.mjs";
import {
  RECOVERY_NORMAL_CYCLE_MS,
  appendRecoveryHistory,
  applyAttemptOutcome,
  buildHistoryRow,
  classifyOwnedTaskGate,
  defaultSupervisionRow,
  persistRecoveryHistory,
  persistRecoverySupervisorReceipt,
  persistSupervisionState,
  planNodeAttempt,
  readRecoveryHistory,
  readSupervisionState,
  safeSupervisorErrorCode,
  writeAtomicJson,
} from "./recovery_supervision.mjs";

export const RECOVERY_BINDING_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_binding.v1";
// v3 adds explicit diagnostic_code, deduplicates shared tasks, requires fresh
// producer evidence for verification, and surfaces non-auto-repairable authority
// issues as owner_action_required. v1/v2 receipts fail closed.
export const RECOVERY_CYCLE_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_cycle.v3";
export const DEFAULT_RECOVERY_INTERVAL_MS = RECOVERY_NORMAL_CYCLE_MS;

const execFileAsync = promisify(execFile);
const SAFE_TASK = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,119}$/u;
const SAFE_NODE = /^[a-z][a-z0-9_]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const OWNER_ACTION_REASONS = /^(writer_authority_expired|.*(authority|credential|password|secret|token|cookie|login|account|permission).*)$/iu;
const RESTARTABLE_NODES = new Set([
  "ingress_supervisor",
  "store_mail_events",
  "store_voice_custody",
  "voice_label_worker",
  "local_activity",
  "store_activity_outbox",
  "usage_codex_collector",
  "usage_claude_collector",
  "usage_meter",
  "store_usage_ledger",
  "consumer_board",
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { args._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function validateRecoveryBinding(value) {
  if (!exactKeys(value, ["schema_version", "mode", "task_bindings"])
    || value.schema_version !== RECOVERY_BINDING_SCHEMA_VERSION
    || !["observe", "safe-repair"].includes(value.mode)
    || value.task_bindings === null || typeof value.task_bindings !== "object"
    || Array.isArray(value.task_bindings)) throw new TypeError("recovery_binding_invalid");
  const taskBindings = {};
  for (const [nodeId, row] of Object.entries(value.task_bindings)) {
    if (!RESTARTABLE_NODES.has(nodeId) || !SAFE_NODE.test(nodeId)
      || !exactKeys(row, ["task_name", "action_digest"])
      || !SAFE_TASK.test(row.task_name) || !SHA256.test(row.action_digest)) {
      throw new TypeError("recovery_binding_task_invalid");
    }
    taskBindings[nodeId] = { task_name: row.task_name, action_digest: row.action_digest };
  }
  return { schema_version: value.schema_version, mode: value.mode, task_bindings: taskBindings };
}

function powershellSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function systemPowerShellPath() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot)) {
    throw new TypeError("system_root_unavailable");
  }
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

async function defaultInspectTask(taskName) {
  if (!SAFE_TASK.test(taskName)) throw new TypeError("task_name_invalid");
  const quoted = powershellSingleQuoted(taskName);
  const script = [
    "$ErrorActionPreference='Stop'",
    `$n=${quoted}`,
    "$t=Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue",
    "if($null -eq $t){[pscustomobject]@{exists=$false;enabled=$false;state='missing';action_digest=$null;last_run_at=$null;last_task_result=$null}|ConvertTo-Json -Compress;exit 0}",
    "$a=@($t.Actions)",
    "$i=Get-ScheduledTaskInfo -TaskName $n -ErrorAction SilentlyContinue",
    "$d=$null",
    "if($a.Count -eq 1){$sha=[Security.Cryptography.SHA256]::Create();$bytes=[Text.Encoding]::UTF8.GetBytes(([string]$a[0].Execute)+[char]0+([string]$a[0].Arguments));$d=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}",
    "[pscustomobject]@{exists=$true;enabled=([bool]$t.Settings.Enabled);state=([string]$t.State).ToLowerInvariant();action_digest=$d;last_run_at=$(if($null -ne $i -and $i.LastRunTime -gt [datetime]::MinValue){$i.LastRunTime.ToUniversalTime().ToString('o')}else{$null});last_task_result=$(if($null -ne $i){$i.LastTaskResult}else{$null})}|ConvertTo-Json -Compress",
  ].join(";");
  const { stdout } = await execFileAsync(
    systemPowerShellPath(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, encoding: "utf8", timeout: 20_000, maxBuffer: 256 * 1024 },
  );
  return JSON.parse(String(stdout).trim());
}

async function defaultStartTask(taskName) {
  if (!SAFE_TASK.test(taskName)) throw new TypeError("task_name_invalid");
  const quoted = powershellSingleQuoted(taskName);
  const script = `$ErrorActionPreference='Stop';Start-ScheduledTask -TaskName ${quoted};[pscustomobject]@{ok=$true}|ConvertTo-Json -Compress`;
  const { stdout } = await execFileAsync(
    systemPowerShellPath(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, encoding: "utf8", timeout: 20_000, maxBuffer: 64 * 1024 },
  );
  return JSON.parse(String(stdout).trim());
}

function restartObservation(node, decidedAtMs) {
  const state = node?.health?.state;
  return {
    nodeId: node.id,
    owner: "watchtower_recovery_owner",
    escalationOwner: "watchtower_operator",
    lastCheck: new Date(decidedAtMs).toISOString(),
    nextCheck: new Date(decidedAtMs + RECOVERY_NORMAL_CYCLE_MS).toISOString(),
    liveness: state === "down" ? "stopped" : "unknown",
    connection: "not_applicable",
    outcome: state === "stale" ? "failed" : "unknown",
    backlog: "unknown",
    repairAction: "restart_owned_task",
  };
}

/**
 * Derive the supervision outcome for a node that reached the coordinator. The
 * coordinator never reports a repair as successful unless the independent
 * post-verifier passed, so no other branch may claim success.
 */
function executedOutcomeCode(receipt) {
  if (receipt.repairability === "forbidden") return "forbidden";
  if (receipt.attempt === "succeeded") {
    return receipt.verification === "passed" ? "verified_repair" : "postverify_failed";
  }
  if (receipt.attempt === "failed") return "execution_failed";
  if (receipt.attempt === "denied" && receipt.verification === "failed") return "precondition_unmet";
  return "not_eligible";
}

function publicRecoveryReceipt(receipt, outcomeCode, row, diagnosticCode = null) {
  let attempt = receipt.attempt;
  let verification = receipt.verification;
  let repairability = receipt.repairability;
  let repairAction = receipt.repair_action;
  if (outcomeCode === "verified_repair") {
    attempt = "succeeded";
    verification = "passed";
    repairability = "allowlisted";
  } else if (outcomeCode === "postverify_failed") {
    attempt = "succeeded";
    verification = "failed";
    repairability = "allowlisted";
  } else if (outcomeCode === "not_verified") {
    attempt = "succeeded";
    verification = "failed";
    repairability = "allowlisted";
  } else if (outcomeCode === "owner_action_required") {
    attempt = "denied";
    verification = "not_run";
    repairability = "forbidden";
    repairAction = "none";
  }
  return {
    node_id: receipt.node_id,
    reason: receipt.reason,
    diagnostic_code: diagnosticCode ?? receipt.diagnostic_code ?? null,
    repairability,
    repair_action: repairAction,
    attempt,
    verification,
    escalation: receipt.escalation,
    outcome_code: outcomeCode,
    circuit_state: row.circuit_state,
    consecutive_failures: row.consecutive_failures,
    last_attempt_at: row.last_attempt_at,
    last_verified_repair_at: row.last_verified_repair_at,
    next_retry_at: row.next_retry_at,
  };
}

export async function runRecoveryCycle({
  repoRoot,
  projectRoot = repoRoot,
  binding,
  evidenceRoot = path.join(projectRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence"),
  watchtowerPointerPath = path.join(projectRoot, "guild_hall", "state", "operations", "watchtower", "binding.pointer.json"),
  runWatchtower = async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(repoRoot, "guild_hall", "watchtower", "cli.mjs"),
      "probe", "--pointer", watchtowerPointerPath, "--json", "--no-write",
    ], { cwd: repoRoot, windowsHide: true, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  },
  inspectTask = defaultInspectTask,
  startTask = defaultStartTask,
  now = () => new Date(),
} = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(projectRoot ?? "")
    || !path.isAbsolute(evidenceRoot ?? "") || !path.isAbsolute(watchtowerPointerPath ?? "")) {
    throw new TypeError("recovery_root_invalid");
  }
  const validatedBinding = validateRecoveryBinding(binding);
  const attemptedAt = now().toISOString();
  let initialSnapshot = null;
  let watchtowerResult;
  try {
    initialSnapshot = await runWatchtower();
    watchtowerResult = validateWatchtowerExecution(initialSnapshot);
  } catch {
    watchtowerResult = { ok: false, error_codes: ["watchtower_execution_failed"], validated_count: 0 };
  }
  const [fiveFieldResult, workmetaResult] = await Promise.all([
    validateFiveFieldLedgerSet({ workmetaRoot: path.join(projectRoot, "_workmeta") }),
    validateWorkmetaStore({ repoRoot: projectRoot, workmetaRoot: path.join(projectRoot, "_workmeta") }),
  ]);
  const evidenceResults = {
    watchtower_self: watchtowerResult,
    gate_five_field: fiveFieldResult,
    store_workmeta: workmetaResult,
  };
  const evidenceReceipts = {};
  for (const [lane, result] of Object.entries(evidenceResults)) {
    evidenceReceipts[lane] = await persistLocalEvidenceReceipt({
      evidenceRoot, lane, result, attemptedAt, now,
    });
  }

  // Fresh Watchtower state is revalidated before any action. If the second
  // probe fails we do not fall back to the first snapshot and no repair runs.
  let currentSnapshot = null;
  let stateRevalidated = false;
  try {
    const candidateSnapshot = await runWatchtower();
    const candidateValidation = validateWatchtowerExecution(candidateSnapshot);
    if (candidateValidation.ok !== true) throw new TypeError("watchtower_snapshot_invalid");
    currentSnapshot = candidateSnapshot;
    stateRevalidated = true;
  } catch {
    stateRevalidated = false;
  }
  const decidedAt = now().toISOString();
  const decidedAtMs = Date.parse(decidedAt);

  const supervisionRead = await readSupervisionState({ evidenceRoot });
  const priorHistory = await readRecoveryHistory({ evidenceRoot });
  const supervisionRows = new Map(supervisionRead.rows.map((row) => [row.node_id, row]));

  // Group all bound nodes in the topology by their exact task_name + action_digest
  const taskGroups = new Map();
  for (const node of currentSnapshot?.nodes ?? []) {
    const bindingRow = validatedBinding.task_bindings[node.id];
    if (!bindingRow) continue;
    const taskKey = `${bindingRow.task_name}\0${bindingRow.action_digest}`;
    if (!taskGroups.has(taskKey)) {
      taskGroups.set(taskKey, {
        taskName: bindingRow.task_name,
        actionDigest: bindingRow.action_digest,
        boundNodes: [],
        ownerActionReason: null,
      });
    }
    const group = taskGroups.get(taskKey);
    group.boundNodes.push(node);
    const nodeReasons = Array.isArray(node?.health?.reasons) ? node.health.reasons : [];
    const reason = nodeReasons.find(
      (r) => typeof r === "string" && OWNER_ACTION_REASONS.test(r),
    );
    if (reason && !group.ownerActionReason) {
      group.ownerActionReason = reason;
    }
  }

  const candidateMap = new Map();
  if (stateRevalidated && Array.isArray(currentSnapshot?.nodes)) {
    for (const node of currentSnapshot.nodes) {
      if (!Object.hasOwn(validatedBinding.task_bindings, node.id)) continue;
      const isStaleOrDown = ["stale", "down"].includes(node?.health?.state);
      const nodeReasons = Array.isArray(node?.health?.reasons) ? node.health.reasons : [];
      const isOwnerActionDegraded = node?.health?.state === "degraded"
        && nodeReasons.some((r) => typeof r === "string" && OWNER_ACTION_REASONS.test(r));
      const isPendingVerification = supervisionRows.get(node.id)?.last_failure_code === "not_verified";
      if (isStaleOrDown || isOwnerActionDegraded || isPendingVerification) {
        candidateMap.set(node.id, node);
      }
    }
  }
  const candidates = [...candidateMap.values()];

  const plans = new Map();
  const taskCache = new Map();
  const CLOCK_TOLERANCE_MS = 5_000;

  for (const node of candidates) {
    const row = supervisionRows.get(node.id) ?? defaultSupervisionRow(node.id);
    const bindingRow = validatedBinding.task_bindings[node.id];
    const taskKey = `${bindingRow.task_name}\0${bindingRow.action_digest}`;
    const group = taskGroups.get(taskKey);

    if (!supervisionRead.ok || !priorHistory.ok) {
      plans.set(node.id, { row, outcomeCode: "supervision_unavailable", diagnosticCode: null });
      continue;
    }

    // P1-4: Safe non-auto-repairable diagnostic on ANY bound node in the task group gates the whole group
    if (group?.ownerActionReason) {
      plans.set(node.id, {
        row,
        outcomeCode: "owner_action_required",
        diagnosticCode: group.ownerActionReason,
      });
      continue;
    }

    if (validatedBinding.mode !== "safe-repair") {
      plans.set(node.id, { row, outcomeCode: "observe_only", diagnosticCode: null });
      continue;
    }

    // P1-3: Pending verification lifecycle resolution from previous cycle
    if (row.last_failure_code === "not_verified") {
      if (node?.health?.state === "ok") {
        // Causality check (P1-2)
        const snapshotObservedMs = Date.parse(currentSnapshot.observed_at);
        const ageSeconds = Number.isFinite(node.health.age_seconds) ? node.health.age_seconds : 0;
        const evidenceObservedMs = snapshotObservedMs - ageSeconds * 1000;
        const attemptMs = row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
        if (evidenceObservedMs >= attemptMs - CLOCK_TOLERANCE_MS) {
          plans.set(node.id, {
            row,
            outcomeCode: "verified_repair",
            diagnosticCode: null,
            resolvedPending: true,
          });
          continue;
        }
      } else {
        let pendingTask = null;
        try {
          pendingTask = await inspectTask(bindingRow.task_name);
        } catch {
          pendingTask = null;
        }
        if (pendingTask?.state === "running") {
          plans.set(node.id, {
            row,
            outcomeCode: "running_but_stale",
            diagnosticCode: null,
          });
          continue;
        }
        if (pendingTask?.state !== "running") {
          plans.set(node.id, {
            row,
            outcomeCode: "postverify_failed",
            diagnosticCode: null,
            resolvedPending: true,
          });
          continue;
        }
      }
    }

    if (node?.health?.state === "ok") {
      continue;
    }

    const plan = planNodeAttempt(row, decidedAtMs);
    if (!plan.eligible) {
      plans.set(node.id, {
        row,
        outcomeCode: plan.gate === "circuit_open" ? "suppressed_circuit_open" : "suppressed_backoff",
        diagnosticCode: null,
      });
      continue;
    }

    let task = null;
    try {
      task = await inspectTask(bindingRow.task_name);
    } catch {
      task = null;
    }
    const gate = classifyOwnedTaskGate(task, bindingRow.action_digest);
    plans.set(node.id, { row, outcomeCode: gate === "startable" ? null : gate, diagnosticCode: null });
    if (gate === "startable") taskCache.set(node.id, task);
  }

  const plannedCandidates = candidates.filter((node) => plans.has(node.id));
  const executable = plannedCandidates.filter((node) => plans.get(node.id).outcomeCode === null);

  const preState = new Map();
  const postTasks = new Map();
  let postWatchtowerSnapshot = null;
  let postWatchtowerEvaluated = false;
  const getPostWatchtowerSnapshot = async () => {
    if (!postWatchtowerEvaluated) {
      postWatchtowerEvaluated = true;
      try {
        const candidate = await runWatchtower();
        if (validateWatchtowerExecution(candidate).ok === true) {
          postWatchtowerSnapshot = candidate;
        }
      } catch {
        postWatchtowerSnapshot = null;
      }
    }
    return postWatchtowerSnapshot;
  };

  const executedTasks = new Map();
  const executor = async ({ nodeId }) => {
    const row = validatedBinding.task_bindings[nodeId];
    if (row === undefined) return false;
    const key = `${row.task_name}\0${row.action_digest}`;
    if (!executedTasks.has(key)) {
      try {
        const res = await startTask(row.task_name);
        executedTasks.set(key, res === true || Boolean(res && typeof res === "object" && res.ok === true));
      } catch {
        executedTasks.set(key, false);
      }
    }
    return executedTasks.get(key);
  };

  const verifier = async ({ nodeId }) => {
    const row = validatedBinding.task_bindings[nodeId];
    if (row === undefined) return false;
    if (!preState.has(nodeId)) {
      const task = taskCache.get(nodeId) ?? await inspectTask(row.task_name);
      if (task?.exists !== true || task.enabled !== true || task.action_digest !== row.action_digest) return false;
      if (!new Set(["ready", "queued"]).has(task.state)) return false;
      preState.set(nodeId, task.last_run_at ?? null);
      return true;
    }
    const key = `${row.task_name}\0${row.action_digest}`;
    let task = postTasks.get(key);
    if (task === undefined) {
      try {
        task = await inspectTask(row.task_name);
      } catch {
        task = null;
      }
      postTasks.set(key, task);
    }
    if (task?.exists !== true || task.enabled !== true || task.action_digest !== row.action_digest) return false;
    // P1-1: If task is running, nonzero last_task_result belongs to previous run.
    if (task.state !== "running" && task.last_task_result !== null && task.last_task_result !== undefined && task.last_task_result !== 0) {
      return false;
    }
    const postSnapshot = await getPostWatchtowerSnapshot();
    const postNode = postSnapshot?.nodes?.find((n) => n.id === nodeId);
    const isHealthy = postNode?.health?.state === "ok"
      && (!Array.isArray(postNode?.health?.reasons) || postNode.health.reasons.length === 0);
    if (!isHealthy) return false;

    // P1-2: Causality check
    const snapshotObservedMs = Date.parse(postSnapshot.observed_at);
    const ageSeconds = Number.isFinite(postNode.health.age_seconds) ? postNode.health.age_seconds : 0;
    const evidenceObservedMs = snapshotObservedMs - ageSeconds * 1000;
    if (evidenceObservedMs < decidedAtMs - CLOCK_TOLERANCE_MS) {
      return false;
    }
    return true;
  };

  const recovery = plannedCandidates.length === 0 ? { mode: validatedBinding.mode, status: "healthy", receipts: [] }
    : await reconcile({
      mode: validatedBinding.mode,
      nodes: plannedCandidates.map((node) => restartObservation(node, decidedAtMs)),
    }, {
      // Supervision suppression is expressed as an empty allowlist entry, so a
      // suppressed node is denied inside the coordinator instead of executed.
      allowlist: new Set(executable.map((node) => `${node.id}:restart_owned_task`)),
      executor: { restart_owned_task: executor },
      verifier: { restart_owned_task: verifier },
    });

  const recoveryRows = [];
  const historyCandidates = [];
  for (const receipt of recovery.receipts) {
    const plan = plans.get(receipt.node_id);
    if (plan === undefined) continue;
    let outcomeCode = plan.outcomeCode;
    if (outcomeCode === null) {
      if (receipt.repairability === "forbidden") outcomeCode = "forbidden";
      else if (receipt.attempt === "failed") outcomeCode = "execution_failed";
      else if (receipt.attempt === "denied" && receipt.verification === "failed") outcomeCode = "precondition_unmet";
      else if (receipt.attempt === "succeeded") {
        if (receipt.verification === "passed") {
          outcomeCode = "verified_repair";
        } else {
          const bindingRow = validatedBinding.task_bindings[receipt.node_id];
          const taskKey = bindingRow ? `${bindingRow.task_name}\0${bindingRow.action_digest}` : null;
          const postTask = taskKey ? postTasks.get(taskKey) : null;
          if (postTask?.state !== "running" && postTask?.last_task_result !== null && postTask?.last_task_result !== undefined && postTask?.last_task_result !== 0) {
            outcomeCode = "postverify_failed";
          } else {
            outcomeCode = "not_verified";
          }
        }
      } else {
        outcomeCode = "not_eligible";
      }
    }
    // A half-open probe is transient: its outcome resolves the circuit to
    // closed (verified) or open (failed) inside the same cycle.
    const nextRow = applyAttemptOutcome(plan.row, { outcomeCode, atMs: decidedAtMs });
    supervisionRows.set(receipt.node_id, nextRow);
    const pubReceipt = publicRecoveryReceipt(receipt, outcomeCode, nextRow, plan.diagnosticCode);
    recoveryRows.push(pubReceipt);
    historyCandidates.push(buildHistoryRow({
      at: decidedAt,
      nodeId: receipt.node_id,
      reason: receipt.reason,
      diagnosticCode: plan.diagnosticCode,
      action: pubReceipt.repair_action,
      attempt: pubReceipt.attempt,
      verification: pubReceipt.verification,
      row: nextRow,
      outcomeCode,
    }));
  }

  // A present-but-unreadable supervision file is left exactly as it is. Rewriting
  // it here would silently reset the retry memory to "no failures" and reopen
  // repairs on the next cycle; the owner clears the file instead.
  if (supervisionRead.ok) {
    await persistSupervisionState({
      evidenceRoot,
      rows: [...supervisionRows.values()],
      keepNodeIds: new Set(Object.keys(validatedBinding.task_bindings)),
      updatedAt: decidedAt,
    });
  }
  if (priorHistory.ok) {
    await persistRecoveryHistory({
      evidenceRoot,
      entries: appendRecoveryHistory(priorHistory.entries, historyCandidates),
      updatedAt: decidedAt,
    });
  }

  const completedAt = now().toISOString();
  const cycle = {
    schema_version: RECOVERY_CYCLE_SCHEMA_VERSION,
    attempted_at: attemptedAt,
    completed_at: completedAt,
    mode: validatedBinding.mode,
    status: Object.values(evidenceReceipts).every((receipt) => receipt.status === "ok")
      && stateRevalidated && supervisionRead.ok
      && priorHistory.ok
      && recoveryRows.every((row) => row.outcome_code === "verified_repair") ? "ok" : "attention",
    state_revalidated: stateRevalidated,
    evidence: Object.fromEntries(Object.entries(evidenceReceipts).map(([lane, receipt]) => [lane, {
      status: receipt.status,
      validation_scope: receipt.validation_scope,
      validated_count: receipt.validated_count,
      error_codes: receipt.error_codes,
    }])),
    recovery: recoveryRows,
  };
  await writeAtomicJson(path.join(evidenceRoot, "recovery_cycle.json"), cycle);
  return cycle;
}

export function startRecoveryCompanion({
  repoRoot,
  projectRoot = repoRoot,
  bindingPath = path.join(projectRoot, "guild_hall", "state", "operations", "watchtower", "recovery.binding.json"),
  evidenceRoot = path.join(projectRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence"),
  intervalMs = DEFAULT_RECOVERY_INTERVAL_MS,
  loadBinding = async () => validateRecoveryBinding(JSON.parse(await readFile(bindingPath, "utf8"))),
  runCycle = runRecoveryCycle,
  now = () => new Date(),
} = {}) {
  let stopped = false;
  let inFlight = null;
  // A failed cycle must not be silently invisible. The receipt records only a
  // safe error code, never raw exception text, and never rewrites the last-good
  // cycle, supervision state, or history files.
  const receipt = (attemptedAt, status, errorCode) => persistRecoverySupervisorReceipt({
    evidenceRoot, attemptedAt, status, errorCode, now,
  }).catch(() => null);
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    const attemptedAt = now().toISOString();
    inFlight = Promise.resolve(loadBinding())
      .then((binding) => runCycle({ repoRoot, projectRoot, binding }))
      .then(
        () => receipt(attemptedAt, "ok", null),
        (error) => receipt(attemptedAt, "error", safeSupervisorErrorCode(error)),
      )
      .catch(() => null)
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  void trigger();
  const timer = setInterval(() => { void trigger(); }, intervalMs);
  timer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight?.catch(() => {});
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args._[0] !== "run" || typeof args.binding !== "string"
    || typeof args["repo-root"] !== "string" || typeof args["project-root"] !== "string") {
    throw new Error("usage: run --binding <path> --repo-root <path> --project-root <path> [--json]");
  }
  const binding = validateRecoveryBinding(JSON.parse(await readFile(path.resolve(args.binding), "utf8")));
  const cycle = await runRecoveryCycle({
    repoRoot: path.resolve(args["repo-root"]),
    projectRoot: path.resolve(args["project-root"]),
    binding,
  });
  if (args.json === true) process.stdout.write(`${JSON.stringify(cycle)}\n`);
  else process.stdout.write(`watchtower recovery: ${cycle.status} mode=${cycle.mode}\n`);
  return cycle.status === "ok" ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then((code) => process.exit(code), (error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message ?? "recovery_failed" })}\n`);
    process.exit(1);
  });
}
