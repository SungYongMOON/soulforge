import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
export const DEVICE_CAPABILITY_PROBE_SCHEMA_VERSION = "soulforge.device_capability_probe.v0";

const SUPPORTED_NODE_ROLES = new Set([
  "work_pc",
  "tool_pc",
  "portable_dev_pc",
  "dev_worker_pc",
  "always_on_node",
]);
const SUPPORTED_BOOTSTRAP_PROFILES = new Set(["public-only", "operator", "owner-with-state"]);
const DEFAULT_NAS_TIMEOUT_MS = 1500;
const DEFAULT_WORKSPACE_AUDIT_TIMEOUT_MS = 2000;
const DEFAULT_RECEIPT_MAX_AGE_HOURS = 24;
const OLLAMA_HEALTH_URL = "http://127.0.0.1:11434/api/version";
const DEV_ERP_HEALTH_URL = "http://127.0.0.1:4300/api/health";

export async function buildDeviceCapabilityProbe(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const now = normalizeDate(options.now);
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const exists = options.exists ?? existsSync;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const fetcher = options.fetcher ?? globalThis.fetch;
  const identityResult = readLocalIdentity({
    identity: options.identity,
    identityPath: options.identityPath,
    exists,
    readFile: options.readFile ?? readFileSync,
  });
  const identity = identityResult.identity;
  const profile = resolveCapabilityProfile(options.profile, identityResult);
  const privateBindingChecksExecuted = profile === "owner-with-state";
  const capabilityConfig = privateBindingChecksExecuted
    ? normalizeCapabilityConfig(identity?.capability_probe)
    : normalizeCapabilityConfig(null);

  const workspaceLinks = privateBindingChecksExecuted
    ? collectWorkspaceLinkAggregate({
      repoRoot,
      workspaceAudit: options.workspaceAudit,
      runCommand,
      timeoutMs: options.workspaceAuditTimeoutMs ?? DEFAULT_WORKSPACE_AUDIT_TIMEOUT_MS,
    })
    : emptyAggregate("skipped", "workspace_audit_not_in_profile");
  const cloudApps = collectCloudApps({
    platform,
    env,
    homeDir,
    exists,
    runCommand,
    cloudRoots: capabilityConfig.cloudRoots,
  });
  const repository = collectRepositoryState({ repoRoot, runCommand, env });
  const ollama = await collectOllama({ runCommand, fetcher, timeoutMs: options.loopbackTimeoutMs });
  const devErp = capabilityConfig.devErpLoopback
    ? await collectDevErp({ fetcher, timeoutMs: options.loopbackTimeoutMs })
    : { status: "not_configured", checked: false };
  const pathProbe = options.pathProbe ?? ((target) => defaultPathProbe(target, {
    platform,
    timeoutMs: options.nasTimeoutMs ?? DEFAULT_NAS_TIMEOUT_MS,
    runCommand,
  }));
  const receiptProbe = options.receiptProbe ?? ((target) => defaultReceiptProbe(target, {
    platform,
    timeoutMs: options.nasTimeoutMs ?? DEFAULT_NAS_TIMEOUT_MS,
    runCommand,
  }));
  const nas = collectNasAggregate(capabilityConfig.nasTargets, { pathProbe });
  const syncReceipts = collectReceiptAggregate(capabilityConfig.syncReceipts, {
    receiptProbe,
    now,
  });

  return {
    schema_version: DEVICE_CAPABILITY_PROBE_SCHEMA_VERSION,
    kind: "device_capability_probe",
    mode: "advisory",
    generated_at: now.toISOString(),
    boundary: buildBoundary({ privateBindingChecksExecuted }),
    node: {
      identity_status: identityResult.status,
      identity_schema: identity?.schema_version === "soulforge.local_node.v0" ? "soulforge.local_node.v0" : "unknown",
      role: SUPPORTED_NODE_ROLES.has(identity?.node_role) ? identity.node_role : "unknown",
      profile,
      platform: normalizePlatform(platform),
      arch: normalizeArch(arch),
    },
    workspace_links: workspaceLinks,
    cloud_apps: cloudApps,
    repository,
    ollama,
    dev_erp_loopback: devErp,
    nas,
    sync_receipts: syncReceipts,
  };
}

export function buildDeviceCapabilityProbeFailure() {
  return {
    schema_version: DEVICE_CAPABILITY_PROBE_SCHEMA_VERSION,
    kind: "device_capability_probe",
    mode: "advisory",
    status: "unknown",
    reason_code: "probe_internal_error",
    boundary: buildBoundary(),
  };
}

export function printDeviceCapabilityProbeHuman(report, writer = process.stdout) {
  const lines = [
    "Soulforge Device Capability Probe (advisory, read-only)",
    `node: ${report.node?.role ?? "unknown"} profile=${report.node?.profile ?? "public-only"} ${report.node?.platform ?? "unknown"}/${report.node?.arch ?? "unknown"}`,
    `workspace links: ${report.workspace_links?.status ?? "unknown"}`,
    `repository: head=${report.repository?.head ?? "unknown"} dirty=${report.repository?.dirty_count ?? "unknown"}`,
    `ollama: ${report.ollama?.status ?? "unknown"}`,
    `dev-ERP loopback: ${report.dev_erp_loopback?.status ?? "unknown"}`,
    `NAS: ${report.nas?.status ?? "unknown"}`,
    `sync receipts: ${report.sync_receipts?.status ?? "unknown"}`,
  ];
  writer.write(`${lines.join("\n")}\n`);
}

function buildBoundary({ privateBindingChecksExecuted = false } = {}) {
  return {
    advisory_only: true,
    read_only: true,
    readiness_evaluated: false,
    checklist_loaded: false,
    status_file_written: false,
    remote_checks_executed: false,
    live_checks_executed: false,
    private_binding_checks_executed: privateBindingChecksExecuted,
    secrets_read: false,
    payloads_read: false,
    payloads_included: false,
    absolute_paths_included: false,
    account_identifiers_included: false,
    workspace_aliases_included: false,
    target_tails_included: false,
    filenames_included: false,
    raw_errors_included: false,
  };
}

function resolveCapabilityProfile(requestedProfile, identityResult) {
  if (requestedProfile !== undefined) {
    return SUPPORTED_BOOTSTRAP_PROFILES.has(requestedProfile) ? requestedProfile : "public-only";
  }
  const identity = identityResult?.identity;
  const validIdentity = identityResult?.status === "present"
    && identity?.schema_version === "soulforge.local_node.v0"
    && SUPPORTED_NODE_ROLES.has(identity?.node_role)
    && SUPPORTED_BOOTSTRAP_PROFILES.has(identity?.bootstrap_profile);
  if (validIdentity) return identity.bootstrap_profile;
  return "public-only";
}

function readLocalIdentity({ identity, identityPath, exists, readFile }) {
  if (identity !== undefined) {
    return isPlainObject(identity)
      ? { status: "present", identity }
      : { status: "invalid", identity: null };
  }
  if (!identityPath || !safeExists(identityPath, exists)) {
    return { status: "not_configured", identity: null };
  }
  try {
    const parsed = parseYaml(readFile(identityPath, "utf8"));
    return isPlainObject(parsed)
      ? { status: "present", identity: parsed }
      : { status: "invalid", identity: null };
  } catch {
    return { status: "invalid", identity: null };
  }
}

function normalizeCapabilityConfig(value) {
  if (!isPlainObject(value)) {
    return { cloudRoots: {}, devErpLoopback: false, nasTargets: [], syncReceipts: [] };
  }
  const cloudRoots = isPlainObject(value.cloud_roots) ? value.cloud_roots : {};
  return {
    cloudRoots: {
      onedrive: readConfiguredPath(cloudRoots.onedrive),
      google_drive: readConfiguredPath(cloudRoots.google_drive),
    },
    devErpLoopback: value.dev_erp_loopback === true || value.dev_erp_loopback?.enabled === true,
    nasTargets: normalizePathList(value.nas_targets),
    syncReceipts: normalizeReceiptList(value.sync_receipts),
  };
}

function normalizePathList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readConfiguredPath(isPlainObject(item) ? item.path : item))
    .filter(Boolean);
}

function normalizeReceiptList(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const target = readConfiguredPath(isPlainObject(item) ? item.path : item);
    if (!target) return [];
    const rawHours = isPlainObject(item) ? Number(item.max_age_hours) : DEFAULT_RECEIPT_MAX_AGE_HOURS;
    const maxAgeHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : DEFAULT_RECEIPT_MAX_AGE_HOURS;
    return [{ path: target, maxAgeHours }];
  });
}

function collectWorkspaceLinkAggregate({ repoRoot, workspaceAudit, runCommand, timeoutMs }) {
  try {
    const audit = workspaceAudit
      ? workspaceAudit({ repoRoot })
      : runWorkspaceAuditCommand({ repoRoot, runCommand, timeoutMs });
    if (audit?.status === "timeout") {
      return emptyAggregate("timeout", "workspace_audit_timeout");
    }
    if (!audit || audit.status === "blocked") {
      return emptyAggregate("not_configured", "workspace_binding_not_configured");
    }
    const checked = safeCount(audit.checked_count ?? audit.rows?.length);
    const gapCount = safeCount(audit.problems?.length);
    return {
      status: gapCount === 0 ? "passed" : "gaps_found",
      configured_count: safeCount(audit.declared_active_count),
      checked_count: checked,
      healthy_count: Math.max(0, checked - gapCount),
      gap_count: gapCount,
    };
  } catch {
    return emptyAggregate("unknown", "workspace_audit_unavailable");
  }
}

function runWorkspaceAuditCommand({ repoRoot, runCommand, timeoutMs }) {
  const execution = safeRun(
    runCommand,
    process.execPath,
    ["guild_hall/workspace_junction/cli.mjs", "audit", "--json", "--repo-root", repoRoot],
    {
      cwd: repoRoot,
      timeout: positiveTimeout(timeoutMs),
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  if (execution?.error?.code === "ETIMEDOUT" || execution?.signal) {
    return { status: "timeout" };
  }
  if (![0, 1].includes(execution?.status)) {
    return null;
  }
  try {
    return JSON.parse(String(execution.stdout ?? ""));
  } catch {
    return null;
  }
}

function collectCloudApps({ platform, env, homeDir, exists, runCommand, cloudRoots }) {
  const candidates = cloudCandidates(platform, env, homeDir);
  return {
    onedrive: collectCloudApp(candidates.onedrive, {
      platform,
      exists,
      runCommand,
      rootConfigured: Boolean(cloudRoots.onedrive),
    }),
    google_drive: collectCloudApp(candidates.google_drive, {
      platform,
      exists,
      runCommand,
      rootConfigured: Boolean(cloudRoots.google_drive),
    }),
  };
}

function collectCloudApp(candidates, { platform, exists, runCommand, rootConfigured }) {
  if (!candidates) {
    return { status: "unknown", installed: "unknown", running: "unknown", root_configured: rootConfigured };
  }
  const installed = candidates.install.some((candidate) => safeExists(candidate, exists));
  const running = candidates.process.some((processName) => processIsRunning(processName, { platform, runCommand }));
  return {
    status: running ? "running" : installed ? "installed" : "not_detected",
    installed,
    running,
    root_configured: rootConfigured,
  };
}

function cloudCandidates(platform, env, homeDir) {
  if (platform === "darwin") {
    return {
      onedrive: {
        install: ["/Applications/OneDrive.app", path.join(homeDir, "Applications", "OneDrive.app")],
        process: ["OneDrive"],
      },
      google_drive: {
        install: ["/Applications/Google Drive.app", path.join(homeDir, "Applications", "Google Drive.app")],
        process: ["Google Drive", "GoogleDriveFS"],
      },
    };
  }
  if (platform === "win32") {
    const programFiles = [env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean);
    return {
      onedrive: {
        install: [
          ...programFiles.map((root) => path.win32.join(root, "Microsoft OneDrive", "OneDrive.exe")),
          env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Microsoft", "OneDrive", "OneDrive.exe") : null,
        ].filter(Boolean),
        process: ["OneDrive.exe"],
      },
      google_drive: {
        install: [
          ...programFiles.map((root) => path.win32.join(root, "Google", "Drive File Stream", "GoogleDriveFS.exe")),
          env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Google", "DriveFS", "GoogleDriveFS.exe") : null,
        ].filter(Boolean),
        process: ["GoogleDriveFS.exe"],
      },
    };
  }
  return { onedrive: null, google_drive: null };
}

function processIsRunning(processName, { platform, runCommand }) {
  try {
    if (platform === "win32") {
      const result = runCommand("tasklist.exe", ["/FI", `IMAGENAME eq ${processName}`, "/NH"], { timeout: 1000 });
      return result?.status === 0 && String(result.stdout ?? "").toLowerCase().includes(processName.toLowerCase());
    }
    const result = runCommand("pgrep", ["-x", processName], { timeout: 1000 });
    return result?.status === 0;
  } catch {
    return false;
  }
}

function collectRepositoryState({ repoRoot, runCommand, env }) {
  const gitEnv = { ...env, GIT_OPTIONAL_LOCKS: "0" };
  const headResult = safeRun(runCommand, "git", ["-C", repoRoot, "rev-parse", "HEAD"], { timeout: 2000, env: gitEnv });
  const dirtyResult = safeRun(runCommand, "git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], { timeout: 3000, env: gitEnv });
  const rawHead = String(headResult?.stdout ?? "").trim();
  const head = headResult?.status === 0 && /^[0-9a-f]{40,64}$/iu.test(rawHead) ? rawHead.toLowerCase() : null;
  const dirtyCount = dirtyResult?.status === 0
    ? String(dirtyResult.stdout ?? "").split(/\r?\n/u).filter(Boolean).length
    : null;
  return {
    status: head && dirtyCount !== null ? "observed" : "unknown",
    head,
    dirty_count: dirtyCount,
  };
}

async function collectOllama({ runCommand, fetcher, timeoutMs = 1000 }) {
  const command = safeRun(runCommand, "ollama", ["--version"], { timeout: 1000 });
  const installed = command?.status === 0;
  const running = await probeLoopback(OLLAMA_HEALTH_URL, { fetcher, timeoutMs });
  return {
    status: running ? "available" : installed ? "installed_not_running" : "not_detected",
    installed,
    running,
  };
}

async function collectDevErp({ fetcher, timeoutMs = 1000 }) {
  const healthy = await probeLoopback(DEV_ERP_HEALTH_URL, { fetcher, timeoutMs });
  return {
    status: healthy ? "healthy" : "unavailable",
    checked: true,
  };
}

async function probeLoopback(url, { fetcher, timeoutMs }) {
  if (typeof fetcher !== "function") return false;
  const controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      fetcher(url, { method: "GET", signal: controller.signal }),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, positiveTimeout(timeoutMs));
      }),
    ]);
    return response?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function collectNasAggregate(targets, { pathProbe }) {
  if (targets.length === 0) return emptyAggregate("not_configured", "nas_targets_not_configured");
  const counts = { reachable: 0, missing: 0, timeout: 0, unknown: 0 };
  for (const target of targets) {
    const status = safeProbe(pathProbe, target);
    if (Object.hasOwn(counts, status)) counts[status] += 1;
    else counts.unknown += 1;
  }
  return {
    status: "observed",
    configured_count: targets.length,
    reachable_count: counts.reachable,
    missing_count: counts.missing,
    timeout_count: counts.timeout,
    unknown_count: counts.unknown,
  };
}

function collectReceiptAggregate(receipts, { receiptProbe, now }) {
  if (receipts.length === 0) return emptyAggregate("not_configured", "sync_receipts_not_configured");
  const counts = { fresh: 0, stale: 0, missing: 0, timeout: 0, unknown: 0 };
  for (const receipt of receipts) {
    const observed = safeReceiptProbe(receiptProbe, receipt.path);
    if (observed.status !== "present") {
      const key = Object.hasOwn(counts, observed.status) ? observed.status : "unknown";
      counts[key] += 1;
      continue;
    }
    const ageMs = now.getTime() - observed.mtimeMs;
    const freshness = ageMs >= 0 && ageMs <= receipt.maxAgeHours * 60 * 60 * 1000 ? "fresh" : "stale";
    counts[freshness] += 1;
  }
  return {
    status: "observed",
    configured_count: receipts.length,
    fresh_count: counts.fresh,
    stale_count: counts.stale,
    missing_count: counts.missing,
    timeout_count: counts.timeout,
    unknown_count: counts.unknown,
  };
}

function defaultPathProbe(target, { platform, timeoutMs, runCommand }) {
  if (platform === "win32") {
    const script = "$p=$args[0]; if (Test-Path -LiteralPath $p) { exit 0 } else { exit 2 }";
    return mapPathExecution(safeRun(runCommand, "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, target], { timeout: positiveTimeout(timeoutMs) }));
  }
  return mapPathExecution(safeRun(runCommand, "/usr/bin/test", ["-e", target], { timeout: positiveTimeout(timeoutMs) }));
}

function defaultReceiptProbe(target, { platform, timeoutMs, runCommand }) {
  let execution;
  if (platform === "win32") {
    const script = "$p=$args[0]; if (-not (Test-Path -LiteralPath $p)) { exit 2 }; $item=Get-Item -LiteralPath $p; ([DateTimeOffset]$item.LastWriteTimeUtc).ToUnixTimeMilliseconds()";
    execution = safeRun(runCommand, "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, target], { timeout: positiveTimeout(timeoutMs) });
  } else if (platform === "darwin") {
    execution = safeRun(runCommand, "/usr/bin/stat", ["-f", "%m", target], { timeout: positiveTimeout(timeoutMs) });
  } else {
    execution = safeRun(runCommand, "/usr/bin/stat", ["-c", "%Y", target], { timeout: positiveTimeout(timeoutMs) });
  }
  if (execution?.error?.code === "ETIMEDOUT" || execution?.signal) return { status: "timeout" };
  if (execution?.status === 2 || execution?.status === 1) return { status: "missing" };
  if (execution?.status !== 0) return { status: "unknown" };
  const raw = Number(String(execution.stdout ?? "").trim());
  if (!Number.isFinite(raw)) return { status: "unknown" };
  return { status: "present", mtimeMs: platform === "win32" ? raw : raw * 1000 };
}

function mapPathExecution(execution) {
  if (execution?.error?.code === "ETIMEDOUT" || execution?.signal) return "timeout";
  if (execution?.status === 0) return "reachable";
  if (execution?.status === 1 || execution?.status === 2) return "missing";
  return "unknown";
}

function defaultRunCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function safeRun(runCommand, command, args, options) {
  try {
    return runCommand(command, args, options);
  } catch {
    return null;
  }
}

function safeExists(candidate, exists) {
  try {
    return Boolean(exists(candidate));
  } catch {
    return false;
  }
}

function safeProbe(pathProbe, target) {
  try {
    return pathProbe(target);
  } catch {
    return "unknown";
  }
}

function safeReceiptProbe(receiptProbe, target) {
  try {
    const result = receiptProbe(target);
    if (result?.status === "present" && Number.isFinite(result.mtimeMs)) return result;
    return { status: result?.status ?? "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

function emptyAggregate(status, reasonCode) {
  return { status, reason_code: reasonCode, configured_count: 0 };
}

function readConfiguredPath(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function normalizePlatform(value) {
  return ["darwin", "win32", "linux"].includes(value) ? value : "unknown";
}

function normalizeArch(value) {
  return ["arm64", "x64", "ia32", "arm"].includes(value) ? value : "unknown";
}

function safeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function positiveTimeout(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1000;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
