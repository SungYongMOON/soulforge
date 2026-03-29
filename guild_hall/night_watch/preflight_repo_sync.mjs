#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { appendJsonl, normalizeRepoPath, pathExistsSync, readJson, writeJson } from "../shared/io.mjs";

const AUTOMATION_ID = "soulforge-night-watch-pipeline";
const DEFAULT_SYNC_RETRY_WAITS_MS = [15000, 45000];
const DEFAULT_DOCTOR_RETRY_WAIT_MS = 30000;
const DEFAULT_DOCTOR_COMMAND = "npm run guild-hall:doctor -- --profile owner-with-state --remote";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localRoot = resolveRequiredPath(args, "local-root");
  const workmetaRoot = resolveRequiredPath(args, "workmeta-root");
  const privateStateRoot = resolveRequiredPath(args, "private-state-root");
  const activityRoot = args["activity-root"]
    ? path.resolve(args["activity-root"])
    : path.join(localRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const doctorCommand = args["doctor-command"] || DEFAULT_DOCTOR_COMMAND;
  const syncRetryWaitsMs = parseWaitList(args["sync-retry-waits-ms"], DEFAULT_SYNC_RETRY_WAITS_MS);
  const doctorRetryWaitMs = parseInteger(args["doctor-retry-wait-ms"], DEFAULT_DOCTOR_RETRY_WAIT_MS);

  const now = new Date();
  const repoTargets = [
    { id: "soulforge", label: "Soulforge", root: localRoot },
    { id: "workmeta", label: "_workmeta", root: workmetaRoot },
    { id: "private-state", label: "private-state", root: privateStateRoot },
  ];

  const repoResults = [];
  let failureClass = null;
  let failureDetail = null;

  for (const repo of repoTargets) {
    const inspected = inspectRepo(repo);
    repoResults.push(inspected);
    if (!inspected.ready) {
      failureClass = inspected.failure_class;
      failureDetail = `${repo.label}: ${inspected.detail}`;
      break;
    }
  }

  if (!failureClass) {
    for (const repoResult of repoResults) {
      const syncResult = await syncRepo(repoResult, syncRetryWaitsMs);
      Object.assign(repoResult, syncResult);
      if (!syncResult.sync_ok) {
        failureClass = syncResult.failure_class;
        failureDetail = `${repoResult.label}: ${syncResult.detail}`;
        break;
      }
    }
  }

  let doctor = {
    ok: false,
    attempts: 0,
    command: doctorCommand,
    failure_class: failureClass ? "preflight_blocked" : null,
    detail: failureClass ? "repo sync did not complete cleanly" : "not_started",
    stdout: "",
    stderr: "",
  };

  if (!failureClass) {
    doctor = await runDoctor(localRoot, doctorCommand, doctorRetryWaitMs);
    if (!doctor.ok) {
      failureClass = doctor.failure_class;
      failureDetail = doctor.detail;
    }
  }

  const ok = !failureClass && doctor.ok;
  const activity = await writeActivity({
    localRoot,
    activityRoot,
    now,
    repoResults,
    doctor,
    ok,
    failureClass,
    failureDetail,
  });

  const report = {
    automation_id: AUTOMATION_ID,
    run_at: now.toISOString(),
    ok,
    failure_class: failureClass,
    failure_detail: failureDetail,
    repo_results: repoResults,
    doctor,
    files: activity,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }

    args[key] = true;
  }

  return args;
}

function resolveRequiredPath(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return path.resolve(value);
}

function parseWaitList(value, fallback) {
  if (!value) {
    return [...fallback];
  }

  return value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function parseInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function inspectRepo(repo) {
  if (!pathExistsSync(repo.root)) {
    return {
      ...repo,
      ready: false,
      failure_class: "missing_repo",
      detail: "required repo root is missing",
      branch: null,
      clean: null,
      origin: null,
    };
  }

  const insideWorkTree = runCommand("git", ["rev-parse", "--is-inside-work-tree"], repo.root);
  if (!insideWorkTree.ok || insideWorkTree.stdout.trim() !== "true") {
    return {
      ...repo,
      ready: false,
      failure_class: "not_git_repo",
      detail: "path is not a git work tree",
      branch: null,
      clean: null,
      origin: null,
    };
  }

  const origin = runCommand("git", ["remote", "get-url", "origin"], repo.root);
  if (!origin.ok) {
    return {
      ...repo,
      ready: false,
      failure_class: "missing_origin",
      detail: "origin remote is missing",
      branch: null,
      clean: null,
      origin: null,
    };
  }

  const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], repo.root);
  const branchName = branch.stdout.trim();
  if (!branch.ok || branchName === "HEAD") {
    return {
      ...repo,
      ready: false,
      failure_class: "detached_head",
      detail: "repo is in detached HEAD state",
      branch: branchName || null,
      clean: null,
      origin: origin.stdout.trim(),
    };
  }

  if (branchName !== "main") {
    return {
      ...repo,
      ready: false,
      failure_class: "non_main_branch",
      detail: `expected branch main, got ${branchName}`,
      branch: branchName,
      clean: null,
      origin: origin.stdout.trim(),
    };
  }

  const status = runCommand("git", ["status", "--porcelain"], repo.root);
  const clean = status.ok && status.stdout.trim().length === 0;
  if (!clean) {
    return {
      ...repo,
      ready: false,
      failure_class: "dirty_worktree",
      detail: "repo worktree is not clean",
      branch: branchName,
      clean: false,
      origin: origin.stdout.trim(),
    };
  }

  return {
    ...repo,
    ready: true,
    failure_class: null,
    detail: "ready",
    branch: branchName,
    clean: true,
    origin: origin.stdout.trim(),
    sync_attempts: 0,
    fetch_status: null,
    pull_status: null,
    sync_ok: false,
  };
}

async function syncRepo(repo, waitsMs) {
  const maxAttempts = waitsMs.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const fetch = runCommand("git", ["fetch", "origin", "main"], repo.root);
    if (!fetch.ok) {
      const retryable = isRetryableGitFailure(`${fetch.stdout}\n${fetch.stderr}`);
      if (retryable && attempt < maxAttempts) {
        await delay(waitsMs[attempt - 1] ?? 0);
        continue;
      }

      return {
        sync_attempts: attempt,
        fetch_status: summarizeCommand(fetch),
        pull_status: null,
        sync_ok: false,
        failure_class: retryable ? "transient_network_exhausted" : "git_fetch_failed",
        detail: "git fetch origin main failed",
      };
    }

    const pull = runCommand("git", ["pull", "--ff-only", "origin", "main"], repo.root);
    if (!pull.ok) {
      const retryable = isRetryableGitFailure(`${pull.stdout}\n${pull.stderr}`);
      if (retryable && attempt < maxAttempts) {
        await delay(waitsMs[attempt - 1] ?? 0);
        continue;
      }

      return {
        sync_attempts: attempt,
        fetch_status: summarizeCommand(fetch),
        pull_status: summarizeCommand(pull),
        sync_ok: false,
        failure_class: retryable ? "transient_network_exhausted" : "git_pull_failed",
        detail: "git pull --ff-only origin main failed",
      };
    }

    return {
      sync_attempts: attempt,
      fetch_status: summarizeCommand(fetch),
      pull_status: summarizeCommand(pull),
      sync_ok: true,
      failure_class: null,
      detail: "synced cleanly",
    };
  }

  return {
    sync_attempts: maxAttempts,
    fetch_status: null,
    pull_status: null,
    sync_ok: false,
    failure_class: "transient_network_exhausted",
    detail: "sync attempts exhausted",
  };
}

async function runDoctor(cwd, command, retryWaitMs) {
  const firstAttempt = runShell(command, cwd);
  if (firstAttempt.ok) {
    return {
      ok: true,
      attempts: 1,
      command,
      failure_class: null,
      detail: "doctor passed",
      stdout: firstAttempt.stdout,
      stderr: firstAttempt.stderr,
    };
  }

  await delay(retryWaitMs);
  const secondAttempt = runShell(command, cwd);
  if (secondAttempt.ok) {
    return {
      ok: true,
      attempts: 2,
      command,
      failure_class: null,
      detail: "doctor passed on retry",
      stdout: secondAttempt.stdout,
      stderr: secondAttempt.stderr,
    };
  }

  return {
    ok: false,
    attempts: 2,
    command,
    failure_class: "doctor_failed",
    detail: "owner-with-state remote doctor failed after retry",
    stdout: secondAttempt.stdout,
    stderr: secondAttempt.stderr,
  };
}

async function writeActivity({ localRoot, activityRoot, now, repoResults, doctor, ok, failureClass, failureDetail }) {
  const stamps = buildDateStamps(now);
  const logDir = path.join(activityRoot, "log", stamps.year, stamps.date);
  const eventsDir = path.join(activityRoot, "events", stamps.year);
  const latestContextPath = path.join(activityRoot, "latest_context.json");
  const reportPath = path.join(logDir, `${stamps.time}-soulforge-preflight-sync.md`);
  const eventsPath = path.join(eventsDir, `${stamps.yearMonth}.jsonl`);
  const reportRef = normalizeRepoPath(path.relative(localRoot, reportPath));

  await fs.mkdir(logDir, { recursive: true });
  await fs.mkdir(eventsDir, { recursive: true });

  const summary = ok
    ? "night_watch preflight synced Soulforge, _workmeta, private-state and owner-with-state remote doctor passed."
    : `night_watch preflight blocked before Boundary Check: ${failureClass ?? "unknown_failure"}.`;
  const nextAction = ok
    ? "Continue to Boundary Check and use latest_context.json as the stage handoff surface."
    : "Resolve the Stage 0 blocker, then rerun the Night Watch pipeline.";
  const carryForward = !ok;
  const retriesUsed = repoResults.some((repo) => (repo.sync_attempts ?? 0) > 1) || (doctor.attempts ?? 0) > 1;
  const entryId = `${stamps.date}-${stamps.time}-preflight-sync`;

  const event = {
    entry_id: entryId,
    date: stamps.date,
    scope: "night_watch",
    project_code: "shared",
    action: "preflight_repo_sync",
    summary,
    refs: [reportRef],
    detail_owner: "guild_hall/night_watch + guild_hall/state/operations",
    next_action: nextAction,
    carry_forward: carryForward,
  };

  const recentEntry = {
    entry_id: event.entry_id,
    date: event.date,
    scope: event.scope,
    project_code: event.project_code,
    summary: event.summary,
    refs: event.refs,
    next_action: event.next_action,
    carry_forward: event.carry_forward,
  };

  const report = renderReport({
    runAt: now.toISOString(),
    ok,
    failureClass,
    failureDetail,
    retriesUsed,
    repoResults,
    doctor,
    summary,
    nextAction,
    carryForward,
    refs: [reportRef],
  });

  await fs.writeFile(reportPath, report, "utf8");
  await appendJsonl(eventsPath, event);
  await refreshLatestContext(latestContextPath, stamps.date, recentEntry);

  return {
    report_path: reportPath,
    events_path: eventsPath,
    latest_context_path: latestContextPath,
  };
}

async function refreshLatestContext(latestContextPath, updatedOn, entry) {
  let document = {
    version: "v0",
    updated_on: updatedOn,
    default_recent_count: 8,
    open_threads: [],
    recent_entries: [],
  };

  if (pathExistsSync(latestContextPath)) {
    try {
      document = await readJson(latestContextPath);
    } catch {
      document = {
        version: "v0",
        updated_on: updatedOn,
        default_recent_count: 8,
        open_threads: [],
        recent_entries: [],
      };
    }
  }

  const defaultRecentCount = Number.isFinite(document.default_recent_count)
    ? document.default_recent_count
    : 8;
  const recentEntries = Array.isArray(document.recent_entries) ? document.recent_entries : [];
  const mergedRecentEntries = [entry, ...recentEntries.filter((item) => item?.entry_id !== entry.entry_id)].slice(
    0,
    defaultRecentCount,
  );

  const nextDocument = {
    ...document,
    version: document.version || "v0",
    updated_on: updatedOn,
    default_recent_count: defaultRecentCount,
    open_threads: Array.isArray(document.open_threads) ? document.open_threads : [],
    recent_entries: mergedRecentEntries,
  };
  await writeJson(latestContextPath, nextDocument);
}

function renderReport({ runAt, ok, failureClass, failureDetail, retriesUsed, repoResults, doctor, summary, nextAction, carryForward, refs }) {
  const lines = [
    "# Soulforge Preflight Repo Sync",
    "",
    `- automation_id: ${AUTOMATION_ID}`,
    `- run_at: ${runAt}`,
    `- status: ${ok ? "pass" : "blocked"}`,
    `- failure_class: ${failureClass ?? "none"}`,
    `- retries_used: ${retriesUsed ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Repo Status",
    "",
  ];

  for (const repo of repoResults) {
    lines.push(`### ${repo.label}`);
    lines.push(`- path: ${repo.root}`);
    lines.push(`- branch: ${repo.branch ?? "(unknown)"}`);
    lines.push(`- clean: ${repo.clean === null ? "(unknown)" : repo.clean ? "yes" : "no"}`);
    lines.push(`- ready: ${repo.ready ? "yes" : "no"}`);
    lines.push(`- sync_ok: ${repo.sync_ok ? "yes" : "no"}`);
    lines.push(`- sync_attempts: ${repo.sync_attempts ?? 0}`);
    lines.push(`- failure_class: ${repo.failure_class ?? "none"}`);
    lines.push(`- detail: ${repo.detail}`);
    if (repo.fetch_status) {
      lines.push(`- fetch: ${repo.fetch_status}`);
    }
    if (repo.pull_status) {
      lines.push(`- pull: ${repo.pull_status}`);
    }
    lines.push("");
  }

  lines.push("## Doctor");
  lines.push("");
  lines.push(`- command: ${doctor.command}`);
  lines.push(`- ok: ${doctor.ok ? "yes" : "no"}`);
  lines.push(`- attempts: ${doctor.attempts}`);
  lines.push(`- failure_class: ${doctor.failure_class ?? "none"}`);
  lines.push(`- detail: ${doctor.detail}`);
  lines.push("");
  lines.push("## Next Action");
  lines.push("");
  lines.push(nextAction);
  lines.push("");
  lines.push("## Carry Forward");
  lines.push("");
  lines.push(`- carry_forward: ${carryForward ? "true" : "false"}`);
  lines.push("");
  lines.push("## Refs");
  lines.push("");
  for (const ref of refs) {
    lines.push(`- ${ref}`);
  }

  if (failureDetail) {
    lines.push("");
    lines.push("## Failure Detail");
    lines.push("");
    lines.push(`- ${failureDetail}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildDateStamps(value) {
  const year = `${value.getFullYear()}`;
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");

  return {
    year,
    date: `${year}-${month}-${day}`,
    yearMonth: `${year}-${month}`,
    time: `${hour}${minute}`,
  };
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runShell(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function summarizeCommand(result) {
  const text = `${result.stdout}\n${result.stderr}`.trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : "ok";
}

function isRetryableGitFailure(text) {
  const normalized = text.toLowerCase();
  return [
    "dns resolution failure",
    "temporary name resolution failure",
    "could not resolve host",
    "timeout",
    "timed out",
    "connection reset",
    "tls handshake timeout",
    "network unreachable",
    "502",
    "503",
    "504",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
  ].some((pattern) => normalized.includes(pattern));
}

async function delay(ms) {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHuman(report) {
  const lines = [
    "Soulforge Night Watch Preflight",
    `ok: ${report.ok ? "yes" : "no"}`,
    `failure_class: ${report.failure_class ?? "none"}`,
    `report: ${report.files.report_path}`,
    `latest_context: ${report.files.latest_context_path}`,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
