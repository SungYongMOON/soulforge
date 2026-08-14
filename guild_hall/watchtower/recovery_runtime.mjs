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
// v2 adds per-node retry supervision fields and the fresh-state revalidation
// flag. v1 receipts are not reinterpreted as v2; readers fail closed.
export const RECOVERY_CYCLE_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_cycle.v2";
export const DEFAULT_RECOVERY_INTERVAL_MS = RECOVERY_NORMAL_CYCLE_MS;

const execFileAsync = promisify(execFile);
const SAFE_TASK = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,119}$/u;
const SAFE_NODE = /^[a-z][a-z0-9_]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
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
    "if($null -eq $t){[pscustomobject]@{exists=$false;enabled=$false;state='missing';action_digest=$null;last_run_at=$null}|ConvertTo-Json -Compress;exit 0}",
    "$a=@($t.Actions)",
    "$i=Get-ScheduledTaskInfo -TaskName $n -ErrorAction SilentlyContinue",
    "$d=$null",
    "if($a.Count -eq 1){$sha=[Security.Cryptography.SHA256]::Create();$bytes=[Text.Encoding]::UTF8.GetBytes(([string]$a[0].Execute)+[char]0+([string]$a[0].Arguments));$d=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}",
    "[pscustomobject]@{exists=$true;enabled=([bool]$t.Settings.Enabled);state=([string]$t.State).ToLowerInvariant();action_digest=$d;last_run_at=$(if($null -ne $i -and $i.LastRunTime -gt [datetime]::MinValue){$i.LastRunTime.ToUniversalTime().ToString('o')}else{$null})}|ConvertTo-Json -Compress",
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

function publicRecoveryReceipt(receipt, outcomeCode, row) {
  return {
    node_id: receipt.node_id,
    reason: receipt.reason,
    repairability: receipt.repairability,
    repair_action: receipt.repair_action,
    attempt: receipt.attempt,
    verification: receipt.verification,
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
  const candidates = stateRevalidated && Array.isArray(currentSnapshot?.nodes)
    ? currentSnapshot.nodes.filter((node) => ["stale", "down"].includes(node?.health?.state)
      && Object.hasOwn(validatedBinding.task_bindings, node.id))
    : [];

  const supervisionRead = await readSupervisionState({ evidenceRoot });
  const priorHistory = await readRecoveryHistory({ evidenceRoot });
  const supervisionRows = new Map(supervisionRead.rows.map((row) => [row.node_id, row]));
  const plans = new Map();
  // The gate-classification fetch below is also the verifier's pre-start
  // snapshot; it is cached and reused instead of re-inspecting the task, so an
  // owned task cannot be observed to change state between gate and verifier.
  const taskCache = new Map();
  for (const node of candidates) {
    const row = supervisionRows.get(node.id) ?? defaultSupervisionRow(node.id);
    if (!supervisionRead.ok || !priorHistory.ok) {
      plans.set(node.id, { row, outcomeCode: "supervision_unavailable" });
      continue;
    }
    if (validatedBinding.mode !== "safe-repair") {
      plans.set(node.id, { row, outcomeCode: "observe_only" });
      continue;
    }
    const plan = planNodeAttempt(row, decidedAtMs);
    if (!plan.eligible) {
      plans.set(node.id, {
        row,
        outcomeCode: plan.gate === "circuit_open" ? "suppressed_circuit_open" : "suppressed_backoff",
      });
      continue;
    }
    let task = null;
    try {
      task = await inspectTask(validatedBinding.task_bindings[node.id].task_name);
    } catch {
      task = null;
    }
    const gate = classifyOwnedTaskGate(task, validatedBinding.task_bindings[node.id].action_digest);
    plans.set(node.id, { row, outcomeCode: gate === "startable" ? null : gate });
    if (gate === "startable") taskCache.set(node.id, task);
  }
  const executable = candidates.filter((node) => plans.get(node.id).outcomeCode === null);

  const preState = new Map();
  const verifier = async ({ nodeId }) => {
    const row = validatedBinding.task_bindings[nodeId];
    if (row === undefined) return false;
    const task = preState.has(nodeId) ? await inspectTask(row.task_name)
      : taskCache.get(nodeId) ?? await inspectTask(row.task_name);
    if (task?.exists !== true || task.enabled !== true || task.action_digest !== row.action_digest) return false;
    if (!preState.has(nodeId)) {
      if (!new Set(["ready", "queued"]).has(task.state)) return false;
      preState.set(nodeId, task.last_run_at ?? null);
      return true;
    }
    return task.state === "running" || (task.last_run_at ?? null) !== preState.get(nodeId);
  };
  const executor = async ({ nodeId }) => {
    const row = validatedBinding.task_bindings[nodeId];
    if (row === undefined) return false;
    return startTask(row.task_name);
  };
  const recovery = candidates.length === 0 ? { mode: validatedBinding.mode, status: "healthy", receipts: [] }
    : await reconcile({
      mode: validatedBinding.mode,
      nodes: candidates.map((node) => restartObservation(node, decidedAtMs)),
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
    const outcomeCode = plan.outcomeCode ?? executedOutcomeCode(receipt);
    // A half-open probe is transient: its outcome resolves the circuit to
    // closed (verified) or open (failed) inside the same cycle.
    const nextRow = applyAttemptOutcome(plan.row, { outcomeCode, atMs: decidedAtMs });
    supervisionRows.set(receipt.node_id, nextRow);
    recoveryRows.push(publicRecoveryReceipt(receipt, outcomeCode, nextRow));
    historyCandidates.push(buildHistoryRow({
      at: decidedAt,
      nodeId: receipt.node_id,
      reason: receipt.reason,
      action: receipt.repair_action,
      attempt: receipt.attempt,
      verification: receipt.verification,
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
