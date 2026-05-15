#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  appendActivityEvent,
  buildDateStamps,
  defaultActivityRoot,
} from "../activity/activity_log.mjs";
import { normalizeRepoPath, pathExistsSync } from "../shared/io.mjs";

const AUTOMATION_ID = "soulforge-dev-worker";
const DEFAULT_SYNC_RETRY_WAITS_MS = [15000, 45000];
const DEFAULT_DOCTOR_RETRY_WAIT_MS = 30000;
export const DEFAULT_DOCTOR_COMMAND = "npm run guild-hall:doctor -- --profile public-only --remote";

export async function runPreflight(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : null;
  const privateStateRoot = options.privateStateRoot ? path.resolve(options.privateStateRoot) : null;
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(localRoot));
  const skipPull = options.skipPull === true;
  const skipDoctor = options.skipDoctor === true;
  const doctorCommand = options.doctorCommand || DEFAULT_DOCTOR_COMMAND;
  const syncRetryWaitsMs = options.syncRetryWaitsMs ?? DEFAULT_SYNC_RETRY_WAITS_MS;
  const doctorRetryWaitMs = options.doctorRetryWaitMs ?? DEFAULT_DOCTOR_RETRY_WAIT_MS;
  const now = options.now instanceof Date ? options.now : new Date();
  const repoTargets = [
    { id: "soulforge", label: "Soulforge", root: localRoot, required: true },
    ...(workmetaRoot ? [{ id: "workmeta", label: "_workmeta", root: workmetaRoot, required: true }] : []),
    ...(privateStateRoot ? [{ id: "private-state", label: "private-state", root: privateStateRoot, required: true }] : []),
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
      const syncResult = skipPull
        ? {
            sync_attempts: 0,
            fetch_status: "skipped",
            pull_status: "skipped",
            sync_ok: true,
            failure_class: null,
            detail: "sync skipped by request",
          }
        : await syncRepo(repoResult, syncRetryWaitsMs);
      Object.assign(repoResult, syncResult);
      if (!syncResult.sync_ok) {
        failureClass = syncResult.failure_class;
        failureDetail = `${repoResult.label}: ${syncResult.detail}`;
        break;
      }
    }
  }

  let doctor = {
    ok: skipDoctor,
    attempts: 0,
    command: doctorCommand,
    failure_class: skipDoctor ? null : failureClass ? "preflight_blocked" : null,
    detail: skipDoctor ? "doctor skipped by request" : failureClass ? "repo sync did not complete cleanly" : "not_started",
    stdout: "",
    stderr: "",
  };

  if (!failureClass && !skipDoctor) {
    doctor = await runDoctor(localRoot, doctorCommand, doctorRetryWaitMs);
    if (!doctor.ok) {
      failureClass = doctor.failure_class;
      failureDetail = doctor.detail;
    }
  }

  const ok = !failureClass && doctor.ok;
  const files = await writeReportAndActivity({
    localRoot,
    activityRoot,
    now,
    repoResults,
    doctor,
    ok,
    failureClass,
    failureDetail,
  });

  return {
    automation_id: AUTOMATION_ID,
    run_at: now.toISOString(),
    ok,
    failure_class: failureClass,
    failure_detail: failureDetail,
    repo_results: repoResults,
    doctor,
    files,
  };
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

async function writeReportAndActivity({ localRoot, activityRoot, now, repoResults, doctor, ok, failureClass, failureDetail }) {
  const stamps = buildDateStamps(now);
  const logDir = path.join(activityRoot, "log", stamps.year, stamps.date);
  const reportPath = path.join(logDir, `${stamps.time}-soulforge-dev-worker-preflight.md`);
  const reportRef = normalizeRepoPath(path.relative(localRoot, reportPath));
  const summary = ok
    ? "dev_worker preflight synced required repos and doctor passed."
    : `dev_worker preflight blocked before task claim: ${failureClass ?? "unknown_failure"}.`;
  const nextAction = ok
    ? "Run dev_worker task claim and process at most one selected packet."
    : "Resolve the preflight blocker before running dev_worker claim.";

  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(reportPath, renderReport({
    runAt: now.toISOString(),
    ok,
    failureClass,
    failureDetail,
    repoResults,
    doctor,
    summary,
    nextAction,
  }), "utf8");

  const activity = await appendActivityEvent({
    repoRoot: localRoot,
    activityRoot,
    now,
    input: {
      scope: "dev_worker",
      project_code: "shared",
      action: "preflight_repo_sync",
      result: ok ? "passed" : "blocked",
      summary,
      refs: [reportRef],
      detail_owner: "guild_hall/dev_worker + guild_hall/state/operations",
      next_action: nextAction,
      carry_forward: !ok,
    },
  });

  return {
    report_path: reportPath,
    events_path: activity.events_path,
    latest_context_path: activity.latest_context_path,
  };
}

function renderReport({ runAt, ok, failureClass, failureDetail, repoResults, doctor, summary, nextAction }) {
  const lines = [
    "# Soulforge Dev Worker Preflight",
    "",
    `- automation_id: ${AUTOMATION_ID}`,
    `- run_at: ${runAt}`,
    `- status: ${ok ? "pass" : "blocked"}`,
    `- failure_class: ${failureClass ?? "none"}`,
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

  if (failureDetail) {
    lines.push("");
    lines.push("## Failure Detail");
    lines.push("");
    lines.push(`- ${failureDetail}`);
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const raw = token.slice(2);
    const separatorIndex = raw.indexOf("=");
    const key = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1);
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);
    if (inlineValue === undefined && value === next) {
      index += 1;
    }
    args[key] = value;
  }

  return args;
}

function parseWaitList(value, fallback) {
  if (!value) {
    return [...fallback];
  }

  return String(value)
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
  process.stdout.write([
    "Soulforge Dev Worker Preflight",
    `ok: ${report.ok ? "yes" : "no"}`,
    `failure_class: ${report.failure_class ?? "none"}`,
    `report: ${report.files.report_path}`,
    `latest_context: ${report.files.latest_context_path}`,
  ].join("\n"));
  process.stdout.write("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localRoot = path.resolve(args["local-root"] ?? process.cwd());
  const report = await runPreflight({
    localRoot,
    workmetaRoot: args["workmeta-root"] ? path.resolve(args["workmeta-root"]) : null,
    privateStateRoot: args["private-state-root"] ? path.resolve(args["private-state-root"]) : null,
    activityRoot: args["activity-root"] ? path.resolve(args["activity-root"]) : null,
    skipPull: args["skip-pull"] === true || args["skip-pull"] === "true",
    skipDoctor: args["skip-doctor"] === true || args["skip-doctor"] === "true",
    doctorCommand: args["doctor-command"] || DEFAULT_DOCTOR_COMMAND,
    syncRetryWaitsMs: parseWaitList(args["sync-retry-waits-ms"], DEFAULT_SYNC_RETRY_WAITS_MS),
    doctorRetryWaitMs: parseInteger(args["doctor-retry-wait-ms"], DEFAULT_DOCTOR_RETRY_WAIT_MS),
  });

  if (args.json === true || args.json === "true") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
