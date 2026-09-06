#!/usr/bin/env node
// Read-only drift detector for the Bellows-driven runtime lanes of a Windows
// Main Node: does each scheduled task's ACTION string point at the same
// generation as the processes that are actually resident for that lane?
//
// Why this exists (observed 2026-09-06 during the 0.1.9 cutover; receipt under
// the untracked local-recovery/ folder): a task advertised
// `install/server-pack/0.1.6/payload` in its action string while the
// powershell.exe + node.exe pair doing the work had been started from
// `install/server-pack/0.1.2/payload` five days earlier, and the task kept
// reporting LastTaskResult=0 every 15 minutes. The launcher is a singleton: it
// takes an exclusive `<state>/supervisor.instance.lock` and a named
// `Threading.Mutex`, and when the lease is already held it prints
// "duplicate launch ignored" and exits 0. Re-registering such a task to a newer
// pack therefore changes the advertised string and nothing else, and rc=0 is a
// false green. The same pattern exists in the continuous ingress supervisor.
//
// What it proves:
//   1. For every scheduled task whose name starts with the prefix (default
//      `Soulforge-`), the generation its action string points at —
//      `install/server-pack/<x.y.z>/payload` or `install/source-lanes/<lane>-vN`.
//      Read from Get-ScheduledTask objects, never from `schtasks /query` text
//      (its CSV/LIST output is unreliable on this host).
//   2. The generation of every LIVE process that belongs to the same lane:
//      Win32_Process.CommandLine contains the launcher's module root (for
//      example `guild_hall/voice_capture/`), or the process descends from such a
//      process (creation time guarded so a reused PID is never adopted).
//   3. Whether the two disagree (`drift`), and whether the launcher is a
//      singleton (its source contains `instance.lock`, `Threading.Mutex` or
//      "duplicate launch ignored") — in which case LastTaskResult=0 must not be
//      read as proof of work.
//
// What it does NOT do: it never stops, starts, registers, unregisters, kills,
// or writes anything. Its only host calls are one PowerShell query
// (Get-ScheduledTask + Get-ScheduledTaskInfo + Get-CimInstance Win32_Process)
// and read-only reads of the launcher SCRIPTS it discovers — never bindings,
// never credential files (non-script extensions are refused). A verdict is an
// observation; the rebind or stop decision stays an Owner step and belongs to
// the lane runbook.
//
//   node guild_hall/deployment_pack/tools/detect_runtime_lane_drift.mjs \
//        [--json] [--task-prefix Soulforge-] [--observation <file>]
//
//   --observation replays a previously saved `--json` report (or its
//   `observation` object) instead of querying the host, so a finding can be
//   re-evaluated later or on a non-Windows machine.
//   exit 0 = no drift observed · 2 = drift observed · 1 = query/platform failure

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const RUNTIME_LANE_DRIFT_SCHEMA = "soulforge.deployment_pack.runtime_lane_drift.v0";
export const DEFAULT_TASK_PREFIX = "Soulforge-";
export const LEASE_MARKERS = Object.freeze(["instance.lock", "Threading.Mutex", "duplicate launch ignored"]);
export const VERDICTS = Object.freeze(["drift", "consistent", "no_resident", "unknown"]);
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

const MAX_QUERY_BYTES = 16 * 1024 * 1024;
const TASK_PREFIX_RE = /^[A-Za-z][A-Za-z0-9 _.-]{0,39}$/;
// A generation token ends at a separator, whitespace, a quote, or the end of
// the text: `-RuntimeRoot <root>\payload -RepoRoot ...` is the normal shape.
const PACK_RE = /[\\/]install[\\/]server-pack[\\/](\d+\.\d+\.\d+)[\\/]payload(?=[\\/\s"']|$)/gi;
const LANE_RE = /[\\/]install[\\/]source-lanes[\\/]([a-z0-9][a-z0-9-]*?)-v(\d+)([^\\/\s"']*)(?=[\\/\s"']|$)/gi;
const SCRIPT_EXT_RE = /\.(?:ps1|mjs|cjs|js|py|vbs|cmd|bat)$/i;
const DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const SHA256_RE = /\b[0-9a-f]{64}\b/gi;
const LOCK_NAME_RE = /[A-Za-z0-9_.-]*\.instance\.lock/g;
const MUTEX_NAME_RE = /(?:Local|Global)\\[A-Za-z0-9_.-]+/g;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function uniq(values) {
  return [...new Set(values)];
}

function asArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Generation parsing
// ---------------------------------------------------------------------------

// Every pack / lane generation token in `text`, in order of appearance.
//   `.../install/server-pack/0.1.6/payload/...` -> server-pack 0.1.6
//   `.../install/source-lanes/operations-lane-v4/...` -> source-lane operations-lane-v4
// A superseded lane copy (`linear-collect-v1.superseded-<id>`) keeps its suffix
// in the generation so it can never compare equal to the live `v1`.
export function parseGenerationTokens(text) {
  const tokens = [];
  if (typeof text !== "string" || text.length === 0) return tokens;
  for (const match of text.matchAll(PACK_RE)) {
    tokens.push({
      train: "server-pack",
      lane: null,
      generation: match[1],
      label: `server-pack ${match[1]}`,
      index: match.index,
    });
  }
  for (const match of text.matchAll(LANE_RE)) {
    const generation = `v${match[2]}${match[3]}`;
    tokens.push({
      train: "source-lane",
      lane: match[1],
      generation,
      label: `source-lane ${match[1]}-${generation}`,
      index: match.index,
    });
  }
  tokens.sort((a, b) => a.index - b.index);
  return tokens;
}

export function generationOf(text) {
  const [first] = parseGenerationTokens(text);
  return first ?? null;
}

// ---------------------------------------------------------------------------
// Script path discovery and lane identity
// ---------------------------------------------------------------------------

// Drive-letter-rooted script paths (ending in .ps1, .mjs, .cjs, .js, .py, .vbs,
// .cmd or .bat) found in an action string or a process command line. Tokenized
// on whitespace and quotes, so a script path that itself contains a space is
// not recognized — none of the tracked launchers do, and a missed launcher
// surfaces as `launcher_unknown` rather than as a wrong attribution.
export function extractScriptPaths(text) {
  if (typeof text !== "string") return [];
  const found = [];
  for (const raw of text.split(/["'\s]+/u)) {
    const token = raw.replace(/[,;)]+$/u, "");
    if (DRIVE_PATH_RE.test(token) && SCRIPT_EXT_RE.test(token) && !found.includes(token)) found.push(token);
  }
  return found;
}

// The launcher is the first non-`.vbs` script (the hidden-window `.vbs` is a
// wrapper that lives beside the real launcher), else the first script at all.
export function pickLauncher(scriptPaths) {
  return scriptPaths.find((candidate) => !/\.vbs$/iu.test(candidate)) ?? scriptPaths[0] ?? null;
}

// The module a launcher belongs to, as a lowercase `/`-separated prefix with a
// trailing slash so `ui-workspace/apps/dev-erp/` never matches `dev-erp-mcp/`:
//   guild_hall/<owner>/            guild_hall/gateway/<owner>/
//   ui-workspace/apps/<app>/       .workflow/<workflow>/
// Anchored roots are matched as `/<root>` inside any generation copy. Without an
// anchor the script's own directory (minus a trailing `ops`) is used verbatim.
export function moduleRootOf(scriptPath) {
  const parts = String(scriptPath).replace(/\\/gu, "/").split("/").filter((part) => part.length > 0);
  const lower = parts.map((part) => part.toLowerCase());
  const at = lower.findIndex((part) => part === "guild_hall" || part === "ui-workspace" || part === ".workflow");
  if (at >= 0) {
    let take = 2;
    if (lower[at] === "guild_hall" && lower[at + 1] === "gateway") take = 3;
    if (lower[at] === "ui-workspace" && lower[at + 1] === "apps") take = 3;
    const segments = lower.slice(at, at + take);
    if (segments.length === take && !SCRIPT_EXT_RE.test(segments[segments.length - 1])) {
      return { module_root: `${segments.join("/")}/`, anchored: true };
    }
  }
  const directory = lower.slice(0, -1);
  if (directory[directory.length - 1] === "ops") directory.pop();
  return { module_root: `${directory.join("/")}/`, anchored: false };
}

export function normalizeCommandLine(commandLine) {
  return String(commandLine ?? "").replace(/\\/gu, "/").toLowerCase();
}

function createdNotBefore(child, parent) {
  const childAt = Date.parse(child.created_at ?? "");
  const parentAt = Date.parse(parent.created_at ?? "");
  if (Number.isNaN(childAt) || Number.isNaN(parentAt)) return false;
  return childAt >= parentAt;
}

// Processes that belong to a lane: direct matches (command line contains the
// module root) plus their descendants. A descendant is adopted only if it was
// created no earlier than its parent — a dead parent's PID can be reused by an
// unrelated process, and an older "child" is exactly that case.
export function attributeProcesses(processes, moduleRoot, { anchored = true, selfPid = null } = {}) {
  const needle = anchored ? `/${moduleRoot}` : moduleRoot;
  const children = new Map();
  for (const entry of processes) {
    if (!children.has(entry.ppid)) children.set(entry.ppid, []);
    children.get(entry.ppid).push(entry);
  }
  const matched = new Map();
  const queue = [];
  for (const entry of processes) {
    if (selfPid !== null && entry.pid === selfPid) continue;
    if (normalizeCommandLine(entry.command_line).includes(needle)) {
      matched.set(entry.pid, { process: entry, match: "direct" });
      queue.push(entry);
    }
  }
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const child of children.get(parent.pid) ?? []) {
      if (matched.has(child.pid)) continue;
      if (selfPid !== null && child.pid === selfPid) continue;
      if (!createdNotBefore(child, parent)) continue;
      matched.set(child.pid, { process: child, match: "descendant" });
      queue.push(child);
    }
  }
  return [...matched.values()].sort((a, b) => a.process.pid - b.process.pid);
}

// ---------------------------------------------------------------------------
// Singleton (lease) detection
// ---------------------------------------------------------------------------

export function scanLauncherForLease(source) {
  const text = String(source ?? "");
  const markers = LEASE_MARKERS.filter((marker) => text.includes(marker));
  return {
    is_singleton: markers.length > 0,
    markers,
    lock_names: uniq(text.match(LOCK_NAME_RE) ?? []),
    mutex_names: uniq(text.match(MUTEX_NAME_RE) ?? []),
  };
}

export function isScriptPath(candidate) {
  return typeof candidate === "string" && SCRIPT_EXT_RE.test(candidate);
}

function defaultReadTextFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function scanLauncherFile(filePath, role, readTextFile) {
  // Only script files are ever opened: a binding or credential path can never
  // reach this reader even if a task action names one.
  if (!isScriptPath(filePath)) {
    return { role, path: filePath, readable: false, refused: "not_a_script", is_singleton: null, markers: [], lock_names: [], mutex_names: [] };
  }
  const source = readTextFile(filePath);
  if (typeof source !== "string") {
    return { role, path: filePath, readable: false, refused: null, is_singleton: null, markers: [], lock_names: [], mutex_names: [] };
  }
  return { role, path: filePath, readable: true, refused: null, ...scanLauncherForLease(source) };
}

// ---------------------------------------------------------------------------
// Observation normalization (PowerShell JSON or a saved report)
// ---------------------------------------------------------------------------

function normalizeTask(raw) {
  if (!isPlainObject(raw) || typeof raw.name !== "string" || raw.name.trim().length === 0) fail("observation_task_malformed");
  const actions = asArray(raw.actions).map((action) => {
    if (!isPlainObject(action)) fail("observation_task_malformed", raw.name);
    return {
      execute: typeof action.execute === "string" ? action.execute : "",
      arguments: typeof action.arguments === "string" ? action.arguments : "",
      working_directory: typeof action.working_directory === "string" ? action.working_directory : "",
    };
  });
  const lastResult = raw.last_result;
  return {
    name: raw.name.trim(),
    path: typeof raw.path === "string" ? raw.path : "\\",
    state: typeof raw.state === "string" && raw.state.length > 0 ? raw.state : "Unknown",
    enabled: raw.enabled === true,
    multiple_instances: typeof raw.multiple_instances === "string" ? raw.multiple_instances : null,
    last_result: typeof lastResult === "number" && Number.isFinite(lastResult) ? lastResult : null,
    last_run_at: typeof raw.last_run_at === "string" ? raw.last_run_at : null,
    next_run_at: typeof raw.next_run_at === "string" ? raw.next_run_at : null,
    actions,
  };
}

function normalizeProcess(raw) {
  if (!isPlainObject(raw) || !Number.isSafeInteger(raw.pid) || !Number.isSafeInteger(raw.ppid)) fail("observation_process_malformed");
  return {
    pid: raw.pid,
    ppid: raw.ppid,
    name: typeof raw.name === "string" ? raw.name : "",
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    command_line: typeof raw.command_line === "string" ? raw.command_line : "",
  };
}

export function normalizeObservation(raw) {
  const source = isPlainObject(raw) && isPlainObject(raw.observation) ? raw.observation : raw;
  if (!isPlainObject(source)) fail("observation_malformed");
  return {
    observed_at: typeof source.observed_at === "string" ? source.observed_at : null,
    host_platform: typeof source.host_platform === "string" ? source.host_platform : null,
    task_prefix: typeof source.task_prefix === "string" ? source.task_prefix : null,
    tasks: asArray(source.tasks).map(normalizeTask),
    processes: asArray(source.processes).map(normalizeProcess),
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function digestsIn(text) {
  return uniq((String(text ?? "").match(SHA256_RE) ?? []).map((digest) => digest.toLowerCase())).sort();
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function scriptBasename(filePath) {
  return String(filePath).replace(/\\/gu, "/").split("/").pop().toLowerCase();
}

function evaluateLane(task, processes, { readTextFile, selfPid }) {
  const actionText = task.actions
    .map((action) => `${action.execute} ${action.arguments} ${action.working_directory}`)
    .join(" ");
  const scripts = extractScriptPaths(actionText);
  const launcher = pickLauncher(scripts);
  const advertisedTokens = parseGenerationTokens(actionText);
  const advertised = launcher ? generationOf(launcher) ?? advertisedTokens[0] ?? null : advertisedTokens[0] ?? null;
  const advertisedLabels = uniq(advertisedTokens.map((token) => token.label));
  const identity = launcher ? moduleRootOf(launcher) : null;
  const attributed = identity
    ? attributeProcesses(processes, identity.module_root, { anchored: identity.anchored, selfPid })
    : [];

  const flags = [];
  const notes = [];
  const residentProcesses = attributed.map(({ process: entry, match }) => {
    const generation = generationOf(entry.command_line);
    const script = extractScriptPaths(entry.command_line)[0] ?? null;
    return {
      pid: entry.pid,
      ppid: entry.ppid,
      name: entry.name,
      created_at: entry.created_at,
      match,
      generation_label: generation ? generation.label : null,
      script: script ? scriptBasename(script) : null,
    };
  });
  const residentLabels = uniq(residentProcesses.map((entry) => entry.generation_label).filter((label) => label !== null)).sort();
  const unversioned = residentProcesses.filter((entry) => entry.generation_label === null);

  // Singleton scan: the advertised launcher plus every resident copy of the
  // same launcher file name (they may live in different generations).
  const launcherScans = [];
  if (launcher) {
    launcherScans.push(scanLauncherFile(launcher, "advertised", readTextFile));
    const wanted = scriptBasename(launcher);
    const residentLaunchers = uniq(attributed
      .filter(({ match }) => match === "direct")
      .flatMap(({ process: entry }) => extractScriptPaths(entry.command_line))
      .filter((candidate) => scriptBasename(candidate) === wanted && candidate !== launcher));
    for (const candidate of residentLaunchers) launcherScans.push(scanLauncherFile(candidate, "resident", readTextFile));
  }
  const readableScans = launcherScans.filter((scan) => scan.readable);
  const isSingleton = readableScans.length === 0 ? null : readableScans.some((scan) => scan.is_singleton);
  if (launcherScans.some((scan) => !scan.readable)) flags.push("launcher_unreadable");

  // Digest evidence: the direct host process for this launcher should carry
  // the same sha256 tokens (binding, profile, ASR pins) as the action string.
  const advertisedDigests = digestsIn(actionText);
  const hostProcesses = launcher
    ? attributed.filter(({ match, process: entry }) => match === "direct"
        && extractScriptPaths(entry.command_line).some((candidate) => scriptBasename(candidate) === scriptBasename(launcher)))
    : [];
  const residentDigests = uniq(hostProcesses.flatMap(({ process: entry }) => digestsIn(entry.command_line))).sort();
  if (hostProcesses.length > 0 && !sameSet(advertisedDigests, residentDigests)) flags.push("resident_digest_set_differs");

  let verdict;
  if (!launcher) {
    flags.push("launcher_unknown");
  }
  if (advertised === null) {
    flags.push("advertised_unversioned");
    verdict = "unknown";
  } else if (residentLabels.length === 0) {
    verdict = residentProcesses.length === 0 ? "no_resident" : "unknown";
  } else if (residentLabels.some((label) => label !== advertised.label)) {
    verdict = "drift";
  } else {
    verdict = "consistent";
  }
  if (advertisedLabels.length > 1) flags.push("advertised_mixed_generations");
  if (residentLabels.length > 1) flags.push("resident_mixed_generations");
  if (unversioned.length > 0) flags.push("resident_unversioned_process");
  if (isSingleton === true) flags.push("singleton_launcher");
  if (residentProcesses.length > 0 && task.state !== "Running") flags.push("resident_while_task_not_running");

  if (isSingleton === true) {
    notes.push("singleton launcher: a trigger that finds the lease held exits 0 without doing work, so LastTaskResult=0 is not proof of work and not proof of the advertised generation");
  }
  if (verdict === "drift") {
    notes.push(`advertised ${advertised.label} but resident ${residentLabels.join(" | ")}; the task action string is not evidence of which code runs`);
  }
  // A launcher that hands off to a resident child and exits leaves processes
  // behind by design; the flag is always recorded, but it is only worth a
  // human-readable note when the launcher is a singleton (lease-held pattern)
  // or the generation already drifted.
  if (flags.includes("resident_while_task_not_running") && (isSingleton === true || verdict === "drift")) {
    notes.push(`resident processes exist while the task state is ${task.state}: ${residentProcesses.map((entry) => `pid ${entry.pid} ${entry.name}`).join(", ")}`);
  }
  if (unversioned.length > 0) {
    notes.push(`${unversioned.length} process(es) from this module run outside any versioned pack or lane root: ${unversioned.map((entry) => `pid ${entry.pid} ${entry.name}${entry.script ? ` ${entry.script}` : ""}`).join(", ")}`);
  }
  if (flags.includes("advertised_mixed_generations")) {
    notes.push(`the action string names more than one generation: ${advertisedLabels.join(" | ")}`);
  }
  if (flags.includes("resident_digest_set_differs")) {
    notes.push("the resident host process carries a different set of sha256 pins than the action string (binding/profile drift, not only a version drift)");
  }
  if (flags.includes("launcher_unreadable")) {
    notes.push(`launcher source could not be read for: ${launcherScans.filter((scan) => !scan.readable).map((scan) => scan.role).join(", ")}`);
  }

  return {
    task_name: task.name,
    task_path: task.path,
    state: task.state,
    enabled: task.enabled,
    multiple_instances: task.multiple_instances,
    last_result: task.last_result,
    last_run_at: task.last_run_at,
    next_run_at: task.next_run_at,
    launcher: launcher ? { path: launcher, basename: scriptBasename(launcher), module_root: identity.module_root, anchored: identity.anchored } : null,
    advertised: advertised ? { label: advertised.label, train: advertised.train, lane: advertised.lane, generation: advertised.generation, all_labels: advertisedLabels } : { label: null, train: null, lane: null, generation: null, all_labels: advertisedLabels },
    resident: {
      labels: residentLabels,
      process_count: residentProcesses.length,
      since: residentProcesses.map((entry) => entry.created_at).filter((value) => typeof value === "string").sort()[0] ?? null,
      processes: residentProcesses,
    },
    singleton: { is_singleton: isSingleton, launchers: launcherScans },
    digests: { advertised: advertisedDigests, resident_host: residentDigests },
    verdict,
    flags,
    notes,
  };
}

export function detectRuntimeLaneDrift(rawObservation, {
  taskPrefix = DEFAULT_TASK_PREFIX,
  readTextFile = defaultReadTextFile,
  selfPid = null,
  now = () => new Date().toISOString(),
} = {}) {
  if (!TASK_PREFIX_RE.test(taskPrefix)) fail("task_prefix_invalid");
  const observation = normalizeObservation(rawObservation);
  const tasks = observation.tasks
    .filter((task) => task.name.toLowerCase().startsWith(taskPrefix.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const processes = observation.processes.filter((entry) => selfPid === null || entry.pid !== selfPid);
  const lanes = tasks.map((task) => evaluateLane(task, processes, { readTextFile, selfPid }));

  const attributedPids = new Set(lanes.flatMap((lane) => lane.resident.processes.map((entry) => entry.pid)));
  const unattributed = processes
    .filter((entry) => !attributedPids.has(entry.pid))
    .map((entry) => ({ entry, generation: generationOf(entry.command_line) }))
    .filter(({ generation }) => generation !== null)
    .map(({ entry, generation }) => ({
      pid: entry.pid,
      ppid: entry.ppid,
      name: entry.name,
      created_at: entry.created_at,
      generation_label: generation.label,
      script: extractScriptPaths(entry.command_line).map(scriptBasename)[0] ?? null,
    }))
    .sort((a, b) => a.pid - b.pid);

  const count = (verdict) => lanes.filter((lane) => lane.verdict === verdict).length;
  return {
    schema_version: RUNTIME_LANE_DRIFT_SCHEMA,
    evaluated_at: now(),
    observed_at: observation.observed_at,
    host_platform: observation.host_platform,
    task_prefix: taskPrefix,
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
    summary: {
      tasks: lanes.length,
      processes_observed: processes.length,
      processes_attributed: attributedPids.size,
      drift: count("drift"),
      consistent: count("consistent"),
      no_resident: count("no_resident"),
      unknown: count("unknown"),
      singleton_lanes: lanes.filter((lane) => lane.singleton.is_singleton === true).length,
      unattributed_versioned_processes: unattributed.length,
    },
    lanes,
    unattributed_versioned_processes: unattributed,
    observation,
  };
}

// ---------------------------------------------------------------------------
// Host observation (Windows only, read-only)
// ---------------------------------------------------------------------------

function powershellSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function systemPowerShellPath(env = process.env) {
  const systemRoot = env.SystemRoot || env.WINDIR;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot)) fail("system_root_unavailable");
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

// Named properties from Get-ScheduledTask objects and Win32_Process rows only —
// no console text is parsed. LastTaskResult is widened to int64 because
// NTSTATUS-shaped results (0xC000013A) overflow int32. The query excludes its
// own PowerShell process; the Node side excludes its own PID as well.
export function buildObservationScript(taskPrefix) {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$prefix = ${powershellSingleQuoted(taskPrefix)}`,
    "$self = $PID",
    "$tasks = @(Get-ScheduledTask | Where-Object { $_.TaskName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })",
    "$taskRows = @(foreach ($t in $tasks) {",
    "  $i = $null",
    "  try { $i = $t | Get-ScheduledTaskInfo } catch { $i = $null }",
    "  $lr = if ($null -ne $i) { $i.LastRunTime } else { $null }",
    "  $nr = if ($null -ne $i) { $i.NextRunTime } else { $null }",
    "  [pscustomobject]@{",
    "    name = [string]$t.TaskName",
    "    path = [string]$t.TaskPath",
    "    state = [string]$t.State",
    "    enabled = [bool]$t.Settings.Enabled",
    "    multiple_instances = [string]$t.Settings.MultipleInstances",
    "    last_result = $(if ($null -ne $i) { [int64]$i.LastTaskResult } else { $null })",
    "    last_run_at = $(if ($lr -and $lr.Year -gt 1601) { $lr.ToUniversalTime().ToString('o') } else { $null })",
    "    next_run_at = $(if ($nr -and $nr.Year -gt 1601) { $nr.ToUniversalTime().ToString('o') } else { $null })",
    "    actions = @($t.Actions | ForEach-Object { [pscustomobject]@{ execute = [string]$_.Execute; arguments = [string]$_.Arguments; working_directory = [string]$_.WorkingDirectory } })",
    "  }",
    "})",
    "$procRows = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and ($_.CommandLine -match 'server-pack|source-lanes|Soulforge') } | ForEach-Object {",
    "  [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; created_at = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }); command_line = [string]$_.CommandLine }",
    "})",
    "[pscustomobject]@{ observed_at = [DateTime]::UtcNow.ToString('o'); host_platform = 'win32'; task_prefix = $prefix; tasks = $taskRows; processes = $procRows } | ConvertTo-Json -Depth 6 -Compress",
  ].join("\n");
}

// Console output may follow the console code page (cp949 on a Korean host);
// UTF-8 is tried first with fatal decoding, then euc-kr, then latin1.
export function decodeConsoleOutput(buffer) {
  for (const encoding of ["utf-8", "euc-kr"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      // next candidate
    }
  }
  return Buffer.from(buffer).toString("latin1");
}

export async function observeWindowsRuntime({
  taskPrefix = DEFAULT_TASK_PREFIX,
  platform = process.platform,
  execFileImpl = execFileAsync,
  powershellPath = null,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
} = {}) {
  if (!TASK_PREFIX_RE.test(taskPrefix)) fail("task_prefix_invalid");
  if (platform !== "win32") fail("platform_unsupported", "windows only; pass --observation <file> to replay a saved report");
  const executable = powershellPath ?? systemPowerShellPath();
  let stdout;
  try {
    ({ stdout } = await execFileImpl(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", buildObservationScript(taskPrefix)],
      { windowsHide: true, encoding: "buffer", timeout: timeoutMs, maxBuffer: MAX_QUERY_BYTES },
    ));
  } catch (error) {
    fail("observation_query_failed", error?.code ?? error?.message ?? "unknown");
  }
  const text = decodeConsoleOutput(stdout).trim();
  if (text.length === 0) fail("observation_query_empty");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("observation_query_malformed");
  }
  return normalizeObservation(parsed);
}

// ---------------------------------------------------------------------------
// Rendering and CLI
// ---------------------------------------------------------------------------

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? `${text}  ` : text + " ".repeat(width - text.length);
}

function residentSummary(lane) {
  if (lane.resident.process_count === 0) return "none";
  const parts = lane.resident.labels.map((label) => {
    const n = lane.resident.processes.filter((entry) => entry.generation_label === label).length;
    return `${label} x${n}`;
  });
  const unversioned = lane.resident.processes.filter((entry) => entry.generation_label === null).length;
  if (unversioned > 0) parts.push(`unversioned x${unversioned}`);
  return parts.join(" | ");
}

export function renderHuman(report) {
  const lines = [];
  lines.push(`runtime lane drift (read-only) · observed ${report.observed_at ?? "unknown"} · prefix ${report.task_prefix} · tasks ${report.summary.tasks} · processes ${report.summary.processes_observed} (attributed ${report.summary.processes_attributed})`);
  lines.push("");
  lines.push(`${pad("task", 44)}${pad("state", 9)}${pad("advertised", 34)}${pad("resident", 40)}verdict`);
  for (const lane of report.lanes) {
    lines.push(`${pad(lane.task_name, 44)}${pad(lane.state, 9)}${pad(lane.advertised.label ?? "unversioned", 34)}${pad(residentSummary(lane), 40)}${lane.verdict.toUpperCase()}`);
    if (lane.singleton.is_singleton === true) {
      const scan = lane.singleton.launchers.find((entry) => entry.readable && entry.is_singleton);
      const names = [...scan.lock_names, ...scan.mutex_names].join(", ");
      lines.push(`  singleton launcher${names ? ` (${names})` : ""} · last_result=${lane.last_result ?? "n/a"} · multiple_instances=${lane.multiple_instances ?? "n/a"}`);
    }
    if (lane.resident.since) lines.push(`  resident since ${lane.resident.since}`);
    for (const note of lane.notes) lines.push(`  ! ${note}`);
  }
  lines.push("");
  if (report.unattributed_versioned_processes.length === 0) {
    lines.push("versioned processes not attributed to any task: none");
  } else {
    lines.push("versioned processes not attributed to any task:");
    for (const entry of report.unattributed_versioned_processes) {
      lines.push(`  pid ${entry.pid} ${entry.name} ${entry.generation_label}${entry.script ? ` ${entry.script}` : ""} (since ${entry.created_at ?? "unknown"})`);
    }
  }
  const s = report.summary;
  lines.push(`summary: drift ${s.drift} · consistent ${s.consistent} · no_resident ${s.no_resident} · unknown ${s.unknown} · singleton lanes ${s.singleton_lanes}`);
  return `${lines.join("\n")}\n`;
}

export function exitCodeFor(report) {
  return report.summary.drift > 0 ? 2 : 0;
}

function parseCliArgs(argv) {
  const options = { json: false, taskPrefix: DEFAULT_TASK_PREFIX, observationPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--task-prefix") {
      options.taskPrefix = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--observation") {
      options.observationPath = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail("cli_argument_unknown", arg);
    }
  }
  return options;
}

const USAGE = "usage: node detect_runtime_lane_drift.mjs [--json] [--task-prefix Soulforge-] [--observation <file>]\n";

async function cliMain() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exit(1);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  try {
    const observation = options.observationPath
      ? JSON.parse(readFileSync(path.resolve(options.observationPath), "utf8"))
      : await observeWindowsRuntime({ taskPrefix: options.taskPrefix });
    const report = detectRuntimeLaneDrift(observation, { taskPrefix: options.taskPrefix, selfPid: process.pid });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
    process.exit(exitCodeFor(report));
  } catch (error) {
    process.stderr.write(`runtime lane drift FAILED: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
