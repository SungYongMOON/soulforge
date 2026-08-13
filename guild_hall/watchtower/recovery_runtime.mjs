#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

export const RECOVERY_BINDING_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_binding.v1";
export const RECOVERY_CYCLE_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_cycle.v1";
export const DEFAULT_RECOVERY_INTERVAL_MS = 5 * 60 * 1_000;

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

async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, file);
}

function restartObservation(node) {
  const state = node?.health?.state;
  return {
    nodeId: node.id,
    owner: "watchtower_recovery_owner",
    escalationOwner: "watchtower_operator",
    lastCheck: new Date().toISOString(),
    nextCheck: new Date(Date.now() + 5 * 60 * 1_000).toISOString(),
    liveness: state === "down" ? "stopped" : "unknown",
    connection: "not_applicable",
    outcome: state === "stale" ? "failed" : "unknown",
    backlog: "unknown",
    repairAction: "restart_owned_task",
  };
}

function publicRecoveryReceipt(receipt) {
  return {
    node_id: receipt.node_id,
    reason: receipt.reason,
    repairability: receipt.repairability,
    repair_action: receipt.repair_action,
    attempt: receipt.attempt,
    verification: receipt.verification,
    escalation: receipt.escalation,
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

  let currentSnapshot = initialSnapshot;
  try { currentSnapshot = await runWatchtower(); } catch {}
  const candidates = Array.isArray(currentSnapshot?.nodes)
    ? currentSnapshot.nodes.filter((node) => ["stale", "down"].includes(node?.health?.state)
      && Object.hasOwn(validatedBinding.task_bindings, node.id))
    : [];

  const preState = new Map();
  const verifier = async ({ nodeId }) => {
    const row = validatedBinding.task_bindings[nodeId];
    if (row === undefined) return false;
    const task = await inspectTask(row.task_name);
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
      nodes: candidates.map(restartObservation),
    }, {
      allowlist: new Set(candidates.map((node) => `${node.id}:restart_owned_task`)),
      executor: { restart_owned_task: executor },
      verifier: { restart_owned_task: verifier },
    });

  const completedAt = now().toISOString();
  const cycle = {
    schema_version: RECOVERY_CYCLE_SCHEMA_VERSION,
    attempted_at: attemptedAt,
    completed_at: completedAt,
    mode: validatedBinding.mode,
    status: Object.values(evidenceReceipts).every((receipt) => receipt.status === "ok")
      && recovery.receipts.every((receipt) => receipt.attempt !== "failed"
        && receipt.verification !== "failed") ? "ok" : "attention",
    evidence: Object.fromEntries(Object.entries(evidenceReceipts).map(([lane, receipt]) => [lane, {
      status: receipt.status,
      validation_scope: receipt.validation_scope,
      validated_count: receipt.validated_count,
      error_codes: receipt.error_codes,
    }])),
    recovery: recovery.receipts.map(publicRecoveryReceipt),
  };
  await atomicJson(path.join(evidenceRoot, "recovery_cycle.json"), cycle);
  return cycle;
}

export function startRecoveryCompanion({
  repoRoot,
  projectRoot = repoRoot,
  bindingPath = path.join(projectRoot, "guild_hall", "state", "operations", "watchtower", "recovery.binding.json"),
  intervalMs = DEFAULT_RECOVERY_INTERVAL_MS,
  loadBinding = async () => validateRecoveryBinding(JSON.parse(await readFile(bindingPath, "utf8"))),
  runCycle = runRecoveryCycle,
} = {}) {
  let stopped = false;
  let inFlight = null;
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    inFlight = Promise.resolve(loadBinding())
      .then((binding) => runCycle({ repoRoot, projectRoot, binding }))
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
