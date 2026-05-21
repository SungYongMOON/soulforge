import { spawnSync } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import path from "node:path";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_SNAPSHOT_MAX_AGE_MS = DAY_MS;
const DEFAULT_MAP_MAX_AGE_MS = 6 * HOUR_MS;
const DEFAULT_REPORT_MAX_AGE_MS = DAY_MS + HOUR_MS;
const OUTPUT_MAX_CHARS = 2000;
const OUTPUT_MAX_LINES = 30;
const POSIX_SEP_RE = "\\/";
const MAC_USER_HOME_RE = new RegExp(`${POSIX_SEP_RE}Users${POSIX_SEP_RE}[^${POSIX_SEP_RE}\\s"']+`, "gu");
const REDACTED_MAC_USER_HOME = ["", "Users", "<user>"].join("/");

const SECRET_NAME_RE =
  /(^|[/._ -])(\.env|id_rsa|id_dsa|id_ecdsa|id_ed25519|token|password|passwd|secret|credential|credentials|cookie|session|authorization|auth)([/._ -]|$)/iu;
const SECRET_ASSIGNMENT_RE =
  /\b(token|password|passwd|secret|credential|credentials|cookie|session|authorization|auth)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const RAW_OR_PRIVATE_SEGMENT_RE =
  /(^|\/)(_workspaces|_workmeta|private-state|attachments?|mailbox|raw|payloads?)(\/|$)|\.(eml|mbox)$/iu;
const STRAY_DEVELOPMENT_FILE_RE =
  /(^|\/)(NIGHT_WORK_HANDOFF\.md|WORKLOG\.md|(?:scratch|todo|notes?)(?:[._ -][^/]*)?)$|\.(tmp|bak|orig|rej|patch|diff)$/iu;

const DEFAULT_STRAY_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "_workmeta",
  "_workspaces",
  "private-state",
  "guild_hall/state",
  "ui-workspace/node_modules",
]);

export async function runAlwaysOnChecks(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const fs = options.fs ?? nodeFs;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const clock = buildClock(options);
  const context = {
    ...options,
    repoRoot,
    fs,
    runCommand,
    clock,
  };

  const checks = [];
  checks.push(await checkLatestSnapshotMapFreshness(context));
  checks.push(await checkAutomationLiveness(context));
  checks.push(await checkStrayDevelopmentFilePlacement(context));
  checks.push(await checkReportFreshness(context));
  checks.push(await checkRepoSync(context));
  checks.push(await checkSecretRawLeakGuard(context));
  checks.push(await checkRestoreReadiness(context));
  return checks;
}

async function checkLatestSnapshotMapFreshness(context) {
  const { repoRoot, fs, runCommand, clock } = context;
  const snapshotPath = path.resolve(
    repoRoot,
    context.snapshotPath ?? "guild_hall/state/snapshot/soulforge_snapshot.json",
  );
  const mapPath = path.resolve(
    repoRoot,
    context.mapPath ?? "guild_hall/state/operations/soulforge_activity/latest_context.json",
  );
  const maxSnapshotAgeMs = context.maxSnapshotAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS;
  const maxMapAgeMs = context.maxMapAgeMs ?? DEFAULT_MAP_MAX_AGE_MS;

  const commandCheck = await runCommandCheck({
    id: "latest_snapshot_map_freshness",
    command: "npm",
    args: ["run", "guild-hall:snapshot:check-fresh"],
    cwd: repoRoot,
    repoRoot,
    runCommand,
    clock,
    assess: assessPlainCommand("snapshot freshness command"),
  });

  const now = clock();
  const snapshot = await inspectFreshness(fs, snapshotPath, now, maxSnapshotAgeMs);
  const map = await inspectFreshness(fs, mapPath, now, maxMapAgeMs);
  const metadataStatus = worstStatus([
    snapshot.exists ? (snapshot.stale ? "warn" : "passed") : "failed",
    map.exists ? (map.stale ? "warn" : "passed") : "warn",
  ]);
  const status = worstStatus([commandCheck.status, metadataStatus]);
  const metadataLines = [
    formatFreshnessLine("snapshot", repoRoot, snapshotPath, snapshot),
    formatFreshnessLine("map", repoRoot, mapPath, map),
  ];

  return {
    ...commandCheck,
    status,
    source: `${relativeToRepo(repoRoot, snapshotPath)}, ${relativeToRepo(repoRoot, mapPath)}`,
    summary: summarizeSnapshotMap(commandCheck.status, snapshot, map),
    output_tail: sanitizeOutput([commandCheck.output_tail, ...metadataLines].filter(Boolean).join("\n"), repoRoot),
  };
}

async function checkAutomationLiveness(context) {
  const { repoRoot, runCommand, clock } = context;
  return runCommandCheck({
    id: "automation_liveness",
    command: "npm",
    args: [
      "run",
      "guild-hall:always-on:verify",
      "--",
      "--local-root",
      repoRoot,
      "--check-launchctl",
      "--json",
    ],
    cwd: repoRoot,
    repoRoot,
    runCommand,
    clock,
    assess: assessAutomationVerify,
  });
}

async function checkStrayDevelopmentFilePlacement(context) {
  const { repoRoot, fs, clock } = context;
  const startedAt = clock();
  const scanRoots = context.strayScanRoots ?? ["."];
  const maxDepth = context.strayScanMaxDepth ?? 2;
  const candidates = [];

  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = path.resolve(repoRoot, scanRoot);
    const exists = await pathExists(fs, absoluteScanRoot);
    if (!exists) {
      continue;
    }
    const found = await collectStrayDevelopmentFiles({
      fs,
      repoRoot,
      currentDir: absoluteScanRoot,
      depth: 0,
      maxDepth,
      candidates,
      limit: context.strayCandidateLimit ?? 50,
    });
    if (found.length >= (context.strayCandidateLimit ?? 50)) {
      break;
    }
  }

  const endedAt = clock();
  const status = candidates.length > 0 ? "warn" : "passed";
  const outputTail =
    candidates.length > 0
      ? candidates
          .slice(0, 20)
          .map((candidate) => `stray candidate: ${sanitizePathForOutput(candidate)}`)
          .join("\n")
      : "no stray development-file candidates found in metadata scan";

  return buildMetadataCheck({
    id: "stray_development_file_placement",
    source: `filesystem metadata: ${scanRoots.join(", ")}`,
    status,
    summary:
      candidates.length > 0
        ? `${candidates.length} development-file placement candidate(s) found`
        : "no development-file placement candidates found",
    output_tail: outputTail,
    startedAt,
    endedAt,
    repoRoot,
  });
}

async function checkReportFreshness(context) {
  const { repoRoot, fs, clock } = context;
  const startedAt = clock();
  const now = clock();
  const maxReportAgeMs = context.maxReportAgeMs ?? DEFAULT_REPORT_MAX_AGE_MS;
  const latestContextPath = path.resolve(
    repoRoot,
    context.latestContextPath ?? "guild_hall/state/operations/soulforge_activity/latest_context.json",
  );
  const reportLogRoot = path.resolve(
    repoRoot,
    context.reportLogRoot ?? "guild_hall/state/operations/soulforge_activity/log",
  );
  const latestContext = await inspectFreshness(fs, latestContextPath, now, maxReportAgeMs);
  const latestReport = await findNewestFile(fs, reportLogRoot, {
    suffix: ".md",
    maxDepth: 4,
    limit: 2000,
  });
  const latestReportFreshness = latestReport
    ? freshnessFromStat(latestReport.stat, now, maxReportAgeMs)
    : { exists: false, stale: false, ageMs: null, mtime: null };
  const status = worstStatus([
    latestContext.exists ? (latestContext.stale ? "warn" : "passed") : "warn",
    latestReport ? (latestReportFreshness.stale ? "warn" : "passed") : "warn",
  ]);
  const endedAt = clock();
  const reportRef = latestReport ? relativeToRepo(repoRoot, latestReport.path) : relativeToRepo(repoRoot, reportLogRoot);

  return buildMetadataCheck({
    id: "report_freshness",
    source: `${relativeToRepo(repoRoot, latestContextPath)}, ${relativeToRepo(repoRoot, reportLogRoot)}`,
    status,
    summary: summarizeReportFreshness(latestContext, latestReportFreshness, Boolean(latestReport)),
    output_tail: [
      formatFreshnessLine("latest_context", repoRoot, latestContextPath, latestContext),
      latestReport
        ? formatFreshnessLine("latest_report", repoRoot, latestReport.path, latestReportFreshness)
        : `latest_report: missing under ${reportRef}`,
    ].join("\n"),
    startedAt,
    endedAt,
    repoRoot,
  });
}

async function checkRepoSync(context) {
  const { repoRoot, fs, runCommand, clock } = context;
  const startedAt = clock();
  const repoTargets =
    context.repoTargets ??
    [
      { id: "soulforge", root: repoRoot, required: true },
      { id: "workmeta", root: path.join(repoRoot, "_workmeta"), required: false },
      { id: "private-state", root: path.join(repoRoot, "private-state"), required: false },
    ];
  const results = [];

  for (const target of repoTargets) {
    const root = path.resolve(target.root);
    if (!(await pathExists(fs, root))) {
      results.push({
        id: target.id,
        status: target.required ? "failed" : "skipped",
        summary: target.required ? "repo root missing" : "optional repo root missing",
      });
      continue;
    }

    try {
      const result = await runCommand({
        command: "git",
        args: ["status", "--short", "--branch"],
        cwd: root,
      });
      const output = sanitizeOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`, repoRoot);
      results.push({
        id: target.id,
        ...assessGitStatus(result, output),
      });
    } catch (error) {
      results.push({
        id: target.id,
        status: "failed",
        summary: `git status failed: ${errorMessage(error)}`,
      });
    }
  }

  const endedAt = clock();
  const relevant = results.filter((result) => result.status !== "skipped");
  const status = relevant.length > 0 ? worstStatus(relevant.map((result) => result.status)) : "skipped";
  const summary =
    status === "passed"
      ? `${relevant.length} repo(s) clean and on main`
      : results.map((result) => `${result.id}: ${result.summary}`).join("; ");

  return {
    id: "repo_sync",
    command: "git status --short --branch",
    source: repoTargets.map((target) => target.id).join(", "),
    status,
    exit_code: results.some((result) => result.status === "failed") ? 1 : 0,
    summary,
    output_tail: sanitizeOutput(
      results.map((result) => `${result.id}: ${result.status} - ${result.summary}`).join("\n"),
      repoRoot,
    ),
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: durationMs(startedAt, endedAt),
  };
}

async function checkSecretRawLeakGuard(context) {
  const { repoRoot, runCommand, clock } = context;
  return runCommandCheck({
    id: "secret_raw_leak_guard",
    command: "git",
    args: ["status", "--porcelain=v1", "--untracked-files=all"],
    cwd: repoRoot,
    repoRoot,
    runCommand,
    clock,
    assess: assessSecretRawLeak,
  });
}

async function checkRestoreReadiness(context) {
  const { repoRoot, fs, clock } = context;
  const startedAt = clock();
  const requiredPaths =
    context.restoreReadinessPaths ??
    [
      {
        id: "workmeta_git",
        path: path.join(repoRoot, "_workmeta/.git"),
        required: true,
      },
      {
        id: "private_state_git",
        path: path.join(repoRoot, "private-state/.git"),
        required: true,
      },
      {
        id: "active_activity_latest_context",
        path: path.join(repoRoot, "guild_hall/state/operations/soulforge_activity/latest_context.json"),
        required: true,
      },
      {
        id: "private_activity_latest_context",
        path: path.join(repoRoot, "private-state/guild_hall/state/operations/soulforge_activity/latest_context.json"),
        required: false,
      },
      {
        id: "night_work_handoff",
        path: path.join(repoRoot, "_workmeta/system/NIGHT_WORK_HANDOFF.md"),
        required: false,
      },
    ];
  const observations = [];

  for (const item of requiredPaths) {
    const absolutePath = path.resolve(item.path);
    const exists = await pathExists(fs, absolutePath);
    observations.push({
      id: item.id,
      required: item.required === true,
      exists,
      ref: relativeToRepo(repoRoot, absolutePath),
    });
  }

  const endedAt = clock();
  const missingRequired = observations.filter((item) => item.required && !item.exists);
  const missingOptional = observations.filter((item) => !item.required && !item.exists);
  const status = missingRequired.length > 0 ? "failed" : missingOptional.length > 0 ? "warn" : "passed";
  const presentCount = observations.filter((item) => item.exists).length;

  return buildMetadataCheck({
    id: "restore_readiness",
    source: observations.map((item) => item.ref).join(", "),
    status,
    summary:
      status === "passed"
        ? "restore metadata surfaces are present"
        : `${presentCount}/${observations.length} restore metadata surface(s) present`,
    output_tail: observations
      .map((item) => `${item.id}: ${item.exists ? "present" : "missing"} (${item.ref})`)
      .join("\n"),
    startedAt,
    endedAt,
    repoRoot,
  });
}

async function runCommandCheck({ id, command, args, cwd, repoRoot, runCommand, clock, assess }) {
  const startedAt = clock();
  let result;
  try {
    result = await runCommand({ command, args, cwd });
  } catch (error) {
    result = {
      status: 1,
      stdout: "",
      stderr: errorMessage(error),
    };
  }
  const endedAt = clock();
  const rawOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const output = sanitizeOutput(rawOutput, repoRoot);
  const assessment = typeof assess === "function" ? assess(result, rawOutput, repoRoot, output) : null;
  const status = assessment?.status ?? (result.status === 0 ? "passed" : "failed");
  const outputTail = sanitizeOutput(assessment?.output_tail ?? output, repoRoot);

  return {
    id,
    command: formatCommand(command, args, repoRoot),
    status,
    exit_code: result.status ?? null,
    summary: assessment?.summary ?? summarizeOutput(output),
    output_tail: outputTail,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: durationMs(startedAt, endedAt),
  };
}

function buildMetadataCheck({ id, source, status, summary, output_tail, startedAt, endedAt, repoRoot }) {
  return {
    id,
    source,
    command: null,
    status,
    exit_code: null,
    summary,
    output_tail: sanitizeOutput(output_tail, repoRoot),
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: durationMs(startedAt, endedAt),
  };
}

function assessPlainCommand(label) {
  return (result, _rawOutput, _repoRoot, output) => {
    if (result.status !== 0) {
      return {
        status: "failed",
        summary: `${label} failed`,
      };
    }
    return {
      status: "passed",
      summary: summarizeOutput(output),
    };
  };
}

function assessAutomationVerify(result, output) {
  if (result.status !== 0) {
    return {
      status: "failed",
      summary: "always-on verify command failed",
    };
  }

  const payload = parseJsonObjectFromOutput(output);
  if (!payload || !Array.isArray(payload.files)) {
    return {
      status: "failed",
      summary: "always-on verify output did not include files",
    };
  }

  const missing = payload.files.filter((file) => file.exists !== true);
  const unloaded = payload.files.filter((file) => file.loaded === false);
  const launchctlChecked = payload.launchctl_checked === true;

  if (missing.length > 0 || unloaded.length > 0) {
    return {
      status: "failed",
      summary: `${missing.length} launchd file(s) missing, ${unloaded.length} launchd label(s) unloaded`,
      output_tail: [
        `missing_files: ${missing.length}`,
        `unloaded_labels: ${unloaded.length}`,
        ...missing.map((file) => `missing: ${safeLabel(file.label)}`),
        ...unloaded.map((file) => `unloaded: ${safeLabel(file.label)}`),
      ].join("\n"),
    };
  }

  if (!launchctlChecked) {
    return {
      status: "warn",
      summary: `${payload.files.length} launchd file(s) installed; launchctl liveness not checked`,
      output_tail: `launchd_files_checked: ${payload.files.length}\nlaunchctl_checked: false`,
    };
  }

  return {
    status: "passed",
    summary: `${payload.files.length} launchd job(s) installed and loaded`,
    output_tail: `launchd_files_checked: ${payload.files.length}\nlaunchctl_checked: true`,
  };
}

function assessGitStatus(result, output) {
  if (result.status !== 0) {
    return {
      status: "failed",
      summary: "git status command failed",
    };
  }

  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("##")) ?? "";
  const changeLines = lines.filter((line) => !line.startsWith("##"));
  const branchWarn = !/^## main(\.\.\.|$)/u.test(branchLine);
  const behindOrAhead = /\[(?:ahead|behind|gone|diverged)[^\]]*\]/iu.test(branchLine);
  const conflicted = changeLines.some((line) => /^(UU|AA|DD|AU|UA|DU|UD)\b/u.test(line));

  if (conflicted) {
    return {
      status: "failed",
      summary: "repo has conflicted index entries",
    };
  }
  if (branchWarn || behindOrAhead || changeLines.length > 0) {
    const reasons = [];
    if (branchWarn) {
      reasons.push("not clean main branch metadata");
    }
    if (behindOrAhead) {
      reasons.push("upstream delta reported");
    }
    if (changeLines.length > 0) {
      reasons.push(`${changeLines.length} worktree change(s)`);
    }
    return {
      status: "warn",
      summary: reasons.join(", "),
    };
  }

  return {
    status: "passed",
    summary: "main branch clean with no upstream delta in status metadata",
  };
}

function assessSecretRawLeak(result, output) {
  if (result.status !== 0) {
    return {
      status: "failed",
      summary: "git changed-file inventory command failed",
    };
  }

  const lines = output.split(/\r?\n/u).map((line) => line.trimEnd()).filter(Boolean);
  const changedPaths = lines.flatMap(extractGitStatusPath);
  const candidates = [];
  for (const line of changedPaths) {
    const normalized = normalizeRepoPath(line);
    if (isAllowedSensitivePath(normalized)) {
      continue;
    }
    const reason = classifySensitivePath(normalized);
    if (reason) {
      candidates.push({ path: normalized, reason });
    }
  }

  if (candidates.length === 0) {
    return {
      status: "passed",
      summary: "no secret/raw/private path candidates in changed-file inventory",
      output_tail: "no secret/raw/private path candidates found",
    };
  }

  const byReason = new Map();
  for (const candidate of candidates) {
    byReason.set(candidate.reason, (byReason.get(candidate.reason) ?? 0) + 1);
  }
  return {
    status: "failed",
    summary: `${candidates.length} secret/raw/private path candidate(s) found`,
    output_tail: [
      ...[...byReason.entries()].map(([reason, count]) => `${reason}: ${count}`),
      ...candidates.slice(0, 20).map((candidate) => `${candidate.reason}: ${sanitizePathForOutput(candidate.path)}`),
    ].join("\n"),
  };
}

function classifySensitivePath(relativePath) {
  if (SECRET_NAME_RE.test(relativePath)) {
    return "secret_like_path";
  }
  if (RAW_OR_PRIVATE_SEGMENT_RE.test(relativePath)) {
    return "raw_or_private_path";
  }
  if (/^guild_hall\/state\/gateway\//iu.test(relativePath)) {
    return "gateway_runtime_path";
  }
  return null;
}

function extractGitStatusPath(line) {
  const text = String(line ?? "").trimEnd();
  if (text.length < 4) {
    return [];
  }
  const rawPath = text.slice(3).trim();
  if (!rawPath) {
    return [];
  }
  if (rawPath.includes(" -> ")) {
    return [unquoteGitPath(rawPath.split(" -> ").pop())];
  }
  return [unquoteGitPath(rawPath)];
}

function unquoteGitPath(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}

function isAllowedSensitivePath(relativePath) {
  return relativePath.startsWith("docs/architecture/workspace/examples/");
}

async function collectStrayDevelopmentFiles({ fs, repoRoot, currentDir, depth, maxDepth, candidates, limit }) {
  if (candidates.length >= limit || depth > maxDepth) {
    return candidates;
  }

  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return candidates;
  }

  for (const entry of entries) {
    if (candidates.length >= limit) {
      break;
    }
    const absolute = path.join(currentDir, entry.name);
    const relative = relativeToRepo(repoRoot, absolute);
    if (shouldSkipStrayPath(relative)) {
      continue;
    }
    if (entry.isFile?.() && STRAY_DEVELOPMENT_FILE_RE.test(relative)) {
      candidates.push(relative);
      continue;
    }
    if (entry.isDirectory?.() && depth < maxDepth) {
      await collectStrayDevelopmentFiles({
        fs,
        repoRoot,
        currentDir: absolute,
        depth: depth + 1,
        maxDepth,
        candidates,
        limit,
      });
    }
  }

  return candidates;
}

function shouldSkipStrayPath(relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  if (normalized === ".") {
    return false;
  }
  for (const skipDir of DEFAULT_STRAY_SKIP_DIRS) {
    if (normalized === skipDir || normalized.startsWith(`${skipDir}/`)) {
      return true;
    }
  }
  return false;
}

async function inspectFreshness(fs, filePath, now, maxAgeMs) {
  try {
    const stat = await fs.stat(filePath);
    return freshnessFromStat(stat, now, maxAgeMs);
  } catch {
    return {
      exists: false,
      stale: false,
      ageMs: null,
      mtime: null,
    };
  }
}

function freshnessFromStat(stat, now, maxAgeMs) {
  const mtimeMs = Number(stat.mtimeMs ?? stat.mtime?.getTime?.() ?? 0);
  const ageMs = Math.max(0, now.getTime() - mtimeMs);
  return {
    exists: true,
    stale: ageMs > maxAgeMs,
    ageMs,
    mtime: new Date(mtimeMs).toISOString(),
  };
}

async function findNewestFile(fs, root, options) {
  const exists = await pathExists(fs, root);
  if (!exists) {
    return null;
  }
  const newest = { value: null, visited: 0 };
  await walkNewest(fs, root, options, 0, newest);
  return newest.value;
}

async function walkNewest(fs, currentDir, options, depth, newest) {
  if (depth > options.maxDepth || newest.visited >= options.limit) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (newest.visited >= options.limit) {
      break;
    }
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory?.()) {
      await walkNewest(fs, absolute, options, depth + 1, newest);
      continue;
    }
    if (!entry.isFile?.() || (options.suffix && !entry.name.endsWith(options.suffix))) {
      continue;
    }
    newest.visited += 1;
    let stat;
    try {
      stat = await fs.stat(absolute);
    } catch {
      continue;
    }
    if (!newest.value || stat.mtimeMs > newest.value.stat.mtimeMs) {
      newest.value = { path: absolute, stat };
    }
  }
}

async function pathExists(fs, filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultRunCommand({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function buildClock(options) {
  if (typeof options.nowProvider === "function") {
    return () => toDate(options.nowProvider());
  }
  if (options.now instanceof Date || typeof options.now === "string" || typeof options.now === "number") {
    const fixed = toDate(options.now);
    return () => new Date(fixed.getTime());
  }
  return () => new Date();
}

function toDate(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function summarizeSnapshotMap(commandStatus, snapshot, map) {
  if (commandStatus === "failed") {
    return "snapshot freshness command failed";
  }
  if (!snapshot.exists) {
    return "stored snapshot is missing";
  }
  if (snapshot.stale || map.stale) {
    return "snapshot/map metadata is stale";
  }
  if (!map.exists) {
    return "snapshot is fresh; latest context map is missing";
  }
  return "snapshot command passed and metadata surfaces are fresh";
}

function summarizeReportFreshness(latestContext, latestReport, hasLatestReport) {
  if (!latestContext.exists && !hasLatestReport) {
    return "activity latest_context and report log are missing";
  }
  if (latestContext.stale || latestReport.stale) {
    return "activity report metadata is stale";
  }
  if (!hasLatestReport) {
    return "latest_context is present; report log is missing";
  }
  if (!latestContext.exists) {
    return "report log is present; latest_context is missing";
  }
  return "activity latest_context and report log are fresh";
}

function formatFreshnessLine(label, repoRoot, filePath, freshness) {
  const ref = relativeToRepo(repoRoot, filePath);
  if (!freshness.exists) {
    return `${label}: missing (${ref})`;
  }
  return `${label}: ${freshness.stale ? "stale" : "fresh"} age=${formatAge(freshness.ageMs)} mtime=${freshness.mtime} (${ref})`;
}

function worstStatus(statuses) {
  const rank = { failed: 3, warn: 2, skipped: 1, passed: 0 };
  const normalized = statuses.filter(Boolean);
  if (normalized.length === 0) {
    return "skipped";
  }
  return normalized.reduce((worst, status) => (rank[status] > rank[worst] ? status : worst), "passed");
}

function summarizeOutput(value) {
  const lines = String(value ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "ok";
  }
  return lines[lines.length - 1].slice(0, 240);
}

function sanitizeOutput(value, repoRoot) {
  const repoPrefix = repoRoot ? normalizeRepoPath(repoRoot) : "";
  return String(value ?? "")
    .replace(SECRET_ASSIGNMENT_RE, "$1=<redacted>")
    .replace(MAC_USER_HOME_RE, REDACTED_MAC_USER_HOME)
    .split(/\r?\n/u)
    .map((line) => {
      let sanitized = line.trimEnd();
      if (repoPrefix) {
        sanitized = normalizeRepoPath(sanitized).split(repoPrefix).join("<repo_root>");
      }
      return sanitized;
    })
    .filter(Boolean)
    .slice(-OUTPUT_MAX_LINES)
    .join("\n")
    .slice(-OUTPUT_MAX_CHARS);
}

function sanitizePathForOutput(value) {
  const normalized = normalizeRepoPath(value);
  if (SECRET_NAME_RE.test(normalized)) {
    return "<redacted secret-like path>";
  }
  if (RAW_OR_PRIVATE_SEGMENT_RE.test(normalized)) {
    return "<redacted raw/private path>";
  }
  return normalized;
}

function formatCommand(command, args, repoRoot) {
  return [command, ...args.map((arg) => formatCommandArg(arg, repoRoot))].join(" ");
}

function formatCommandArg(value, repoRoot) {
  const text = String(value);
  const normalizedText = normalizeRepoPath(text);
  const normalizedRoot = normalizeRepoPath(repoRoot);
  if (normalizedText === normalizedRoot) {
    return "<repo_root>";
  }
  if (normalizedText.startsWith(`${normalizedRoot}/`)) {
    return `<repo_root>/${normalizedText.slice(normalizedRoot.length + 1)}`;
  }
  return /\s/u.test(text) ? JSON.stringify(text) : text;
}

function parseJsonObjectFromOutput(output) {
  const text = String(output ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function relativeToRepo(repoRoot, filePath) {
  return normalizeRepoPath(path.relative(repoRoot, filePath) || ".");
}

function normalizeRepoPath(value) {
  return String(value).replace(/\\/gu, "/").split(path.sep).join("/");
}

function durationMs(startedAt, endedAt) {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

function formatAge(ageMs) {
  if (ageMs === null || ageMs === undefined) {
    return "unknown";
  }
  if (ageMs < HOUR_MS) {
    return `${Math.round(ageMs / 60000)}m`;
  }
  if (ageMs < DAY_MS) {
    return `${Math.round(ageMs / HOUR_MS)}h`;
  }
  return `${Math.round(ageMs / DAY_MS)}d`;
}

function safeLabel(value) {
  return String(value ?? "(unknown)").replace(/[^\w.-]/gu, "_").slice(0, 120);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
