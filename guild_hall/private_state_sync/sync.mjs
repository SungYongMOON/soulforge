import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeRepoPath, pathExists } from "../shared/io.mjs";

export const PRIVATE_STATE_SYNC_RESULT_VERSION = "soulforge.private_state_sync.result.v1";
export const PRIVATE_STATE_SYNC_ID = "soulforge-private-state-sync-v0";
export const DEFAULT_MAX_GITHUB_FILE_BYTES = 95 * 1024 * 1024;

export const PRIVATE_STATE_ALLOWLIST_REFS = [
  "guild_hall/state/gateway/intake_inbox",
  "guild_hall/state/gateway/log/monster_events",
  "guild_hall/state/gateway/mailbox/company",
  "guild_hall/state/gateway/mailbox/personal",
  "guild_hall/state/gateway/mailbox/outbound",
  "guild_hall/state/gateway/log/mail_fetch",
  "guild_hall/state/gateway/log/mail_send",
  "guild_hall/state/operations/soulforge_activity",
];

const DENY_PATH_RE = /(^|\/)(?:[^/]*\.env|[^/]*token[^/]*|[^/]*cookie[^/]*|[^/]*\.session|[^/]*\.key)$/iu;
const DENY_REF_PREFIXES = [
  "guild_hall/state/gateway/mailbox/state",
  "guild_hall/state/town_crier",
];

export function defaultPrivateStateRoot(repoRoot) {
  return path.join(repoRoot, "private-state");
}

export async function syncPrivateStateRepo(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const privateStateRoot = path.resolve(options.privateStateRoot ?? defaultPrivateStateRoot(repoRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const runCommand = options.runCommand ?? defaultRunCommand;
  const maxFileBytes = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : DEFAULT_MAX_GITHUB_FILE_BYTES;
  const steps = [];
  const rootValidation = validatePrivateStateRoot(repoRoot, privateStateRoot);

  if (!rootValidation.ok) {
    return buildResult({ status: "blocked", reason: rootValidation.reason, repoRoot, privateStateRoot, now, steps });
  }

  if (!(await pathExists(path.join(privateStateRoot, ".git")))) {
    return buildResult({ status: "blocked", reason: "private_state_git_missing", repoRoot, privateStateRoot, now, steps });
  }

  const statusBefore = await runGit(privateStateRoot, statusArgs(), runCommand);
  steps.push(toStep("private_state_status_before", statusBefore));
  if (!statusBefore.ok) {
    return buildResult({ status: "blocked", reason: "private_state_status_failed", repoRoot, privateStateRoot, now, steps });
  }
  const dirtyBefore = parseStatusPaths(statusBefore.stdout);
  const dirtyBeforeReview = reviewStatusPaths(dirtyBefore);
  if (!dirtyBeforeReview.ok) {
    return buildResult({
      status: "blocked",
      reason: dirtyBeforeReview.reason,
      repoRoot,
      privateStateRoot,
      now,
      steps,
      dirtyBeforeReview,
    });
  }

  const branch = await runGit(privateStateRoot, ["branch", "--show-current"], runCommand);
  steps.push(toStep("private_state_branch", branch));
  if (!branch.ok || branch.stdout.trim() !== "main") {
    return buildResult({ status: "blocked", reason: "private_state_branch_not_main", repoRoot, privateStateRoot, now, steps });
  }

  const remote = await runGit(privateStateRoot, ["remote"], runCommand);
  steps.push(toStep("private_state_origin", remote));
  const remotes = remote.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!remote.ok || !remotes.includes("origin")) {
    return buildResult({ status: "blocked", reason: "private_state_origin_missing", repoRoot, privateStateRoot, now, steps });
  }

  if (options.skipFetch !== true) {
    const fetch = await runGit(privateStateRoot, ["fetch", "origin", "main"], runCommand);
    steps.push(toStep("private_state_fetch", fetch));
    if (!fetch.ok) {
      return buildResult({ status: "blocked", reason: "private_state_fetch_failed", repoRoot, privateStateRoot, now, steps });
    }
  }

  const divergenceBefore = await runGit(privateStateRoot, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], runCommand);
  steps.push(toStep("private_state_divergence_before", divergenceBefore));
  if (!divergenceBefore.ok) {
    return buildResult({ status: "blocked", reason: "private_state_divergence_failed", repoRoot, privateStateRoot, now, steps });
  }
  const parsedDivergenceBefore = parseDivergence(divergenceBefore.stdout);
  if (parsedDivergenceBefore.behind > 0 && dirtyBefore.length > 0) {
    return buildResult({
      status: "blocked",
      reason: "private_state_dirty_and_behind",
      repoRoot,
      privateStateRoot,
      now,
      steps,
      divergenceBefore: parsedDivergenceBefore,
      dirtyBeforeReview,
    });
  }

  if (parsedDivergenceBefore.behind > 0 && options.skipPull !== true) {
    const pull = await runGit(privateStateRoot, ["pull", "--ff-only", "origin", "main"], runCommand);
    steps.push(toStep("private_state_pull", pull));
    if (!pull.ok) {
      return buildResult({
        status: "blocked",
        reason: "private_state_pull_failed",
        repoRoot,
        privateStateRoot,
        now,
        steps,
        divergenceBefore: parsedDivergenceBefore,
      });
    }
  }

  const mirror = options.skipMirror === true
    ? emptyMirrorReport()
    : await mirrorAllowlist({ repoRoot, privateStateRoot, maxFileBytes });
  steps.push({
    id: "private_state_mirror_allowlist",
    status: "completed",
    summary: `copied ${mirror.copied_files} files, skipped ${mirror.skipped_unchanged_files} unchanged, skipped ${mirror.skipped_large_files.length} large, blocked ${mirror.denied_files.length} denied`,
  });

  const statusAfter = await runGit(privateStateRoot, statusArgs(), runCommand);
  steps.push(toStep("private_state_status_after_mirror", statusAfter));
  if (!statusAfter.ok) {
    return buildResult({
      status: "blocked",
      reason: "private_state_status_after_mirror_failed",
      repoRoot,
      privateStateRoot,
      now,
      steps,
      divergenceBefore: parsedDivergenceBefore,
      mirror,
    });
  }

  const dirtyAfter = parseStatusPaths(statusAfter.stdout);
  const dirtyAfterReview = reviewStatusPaths(dirtyAfter);
  if (!dirtyAfterReview.ok) {
    return buildResult({
      status: "blocked",
      reason: dirtyAfterReview.reason,
      repoRoot,
      privateStateRoot,
      now,
      steps,
      divergenceBefore: parsedDivergenceBefore,
      mirror,
      dirtyAfterReview,
    });
  }

  let committed = false;
  let pushed = false;
  let commitOid = null;

  if (dirtyAfter.length > 0) {
    if (options.skipCommit === true) {
      return buildResult({
        status: "blocked",
        reason: "private_state_dirty_after_mirror_skip_commit",
        repoRoot,
        privateStateRoot,
        now,
        steps,
        divergenceBefore: parsedDivergenceBefore,
        mirror,
        dirtyAfterReview,
      });
    }

    const add = await runGit(privateStateRoot, ["add", ...PRIVATE_STATE_ALLOWLIST_REFS], runCommand);
    steps.push(toStep("private_state_add_allowlist", add));
    if (!add.ok) {
      return buildResult({
        status: "blocked",
        reason: "private_state_add_failed",
        repoRoot,
        privateStateRoot,
        now,
        steps,
        divergenceBefore: parsedDivergenceBefore,
        mirror,
      });
    }

    const commit = await runGit(
      privateStateRoot,
      ["commit", "-m", options.commitMessage ?? "chore: sync gateway private state"],
      runCommand,
    );
    steps.push(toStep("private_state_commit", commit));
    if (!commit.ok) {
      return buildResult({
        status: "blocked",
        reason: "private_state_commit_failed",
        repoRoot,
        privateStateRoot,
        now,
        steps,
        divergenceBefore: parsedDivergenceBefore,
        mirror,
      });
    }
    committed = true;

    const head = await runGit(privateStateRoot, ["rev-parse", "HEAD"], runCommand);
    steps.push(toStep("private_state_head", head));
    if (head.ok) {
      commitOid = head.stdout.trim() || null;
    }
  }

  const divergenceAfter = await runGit(privateStateRoot, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], runCommand);
  steps.push(toStep("private_state_divergence_after", divergenceAfter));
  if (!divergenceAfter.ok) {
    return buildResult({
      status: "blocked",
      reason: "private_state_divergence_after_failed",
      repoRoot,
      privateStateRoot,
      now,
      steps,
      divergenceBefore: parsedDivergenceBefore,
      mirror,
      committed,
      commitOid,
    });
  }
  const parsedDivergenceAfter = parseDivergence(divergenceAfter.stdout);

  if (parsedDivergenceAfter.ahead > 0 && options.skipPush !== true) {
    const push = await runGit(privateStateRoot, ["push", "origin", "HEAD:main"], runCommand);
    steps.push(toStep("private_state_push", push));
    if (!push.ok) {
      return buildResult({
        status: "blocked",
        reason: "private_state_push_failed",
        repoRoot,
        privateStateRoot,
        now,
        steps,
        divergenceBefore: parsedDivergenceBefore,
        divergenceAfter: parsedDivergenceAfter,
        mirror,
        committed,
        commitOid,
      });
    }
    pushed = true;
  }

  return buildResult({
    status: "completed",
    reason: committed || pushed ? "private_state_synced" : "private_state_already_current",
    repoRoot,
    privateStateRoot,
    now,
    steps,
    divergenceBefore: parsedDivergenceBefore,
    divergenceAfter: parsedDivergenceAfter,
    mirror,
    committed,
    pushed,
    commitOid,
  });
}

export async function mirrorAllowlist({ repoRoot, privateStateRoot, maxFileBytes = DEFAULT_MAX_GITHUB_FILE_BYTES }) {
  const report = emptyMirrorReport();
  for (const ref of PRIVATE_STATE_ALLOWLIST_REFS) {
    const source = path.join(repoRoot, ref);
    const target = path.join(privateStateRoot, ref);
    if (!(await pathExists(source))) {
      report.missing_source_refs.push(ref);
      continue;
    }
    await copyTree({ source, target, sourceRoot: source, ref, report, maxFileBytes });
  }
  return report;
}

function emptyMirrorReport() {
  return {
    allowlist_refs: [...PRIVATE_STATE_ALLOWLIST_REFS],
    missing_source_refs: [],
    discovered_files: 0,
    copied_files: 0,
    skipped_unchanged_files: 0,
    skipped_symlinks: 0,
    skipped_large_files: [],
    denied_files: [],
  };
}

async function copyTree({ source, target, sourceRoot, ref, report, maxFileBytes }) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    report.skipped_symlinks += 1;
    return;
  }
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyTree({
        source: path.join(source, entry.name),
        target: path.join(target, entry.name),
        sourceRoot,
        ref,
        report,
        maxFileBytes,
      });
    }
    return;
  }
  if (!stat.isFile()) {
    return;
  }

  report.discovered_files += 1;
  const relative = normalizeRepoPath(path.relative(sourceRoot, source));
  const repoRelative = normalizeRepoPath(path.join(ref, relative));
  if (isDeniedRepoPath(repoRelative)) {
    report.denied_files.push(repoRelative);
    return;
  }
  if (stat.size > maxFileBytes) {
    report.skipped_large_files.push({
      path: repoRelative,
      size_bytes: stat.size,
      max_bytes: maxFileBytes,
    });
    return;
  }

  if (await isCopyCurrent(target, stat)) {
    report.skipped_unchanged_files += 1;
    return;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  await fs.chmod(target, stat.mode);
  report.copied_files += 1;
}

async function isCopyCurrent(target, sourceStat) {
  try {
    const targetStat = await fs.lstat(target);
    return targetStat.isFile()
      && targetStat.size === sourceStat.size
      && Math.floor(targetStat.mtimeMs) >= Math.floor(sourceStat.mtimeMs);
  } catch {
    return false;
  }
}

function validatePrivateStateRoot(repoRoot, privateStateRoot) {
  const relative = normalizeRepoPath(path.relative(repoRoot, privateStateRoot));
  if (relative !== "private-state") {
    return { ok: false, reason: "private_state_root_outside_nested_repo" };
  }
  return { ok: true, reason: null };
}

function reviewStatusPaths(paths) {
  const outside_allowlist = [];
  const denied_paths = [];
  for (const statusPath of paths) {
    if (isDeniedRepoPath(statusPath)) {
      denied_paths.push(statusPath);
      continue;
    }
    if (!isAllowlistedRepoPath(statusPath)) {
      outside_allowlist.push(statusPath);
    }
  }

  if (denied_paths.length > 0) {
    return { ok: false, reason: "private_state_status_contains_denied_path", outside_allowlist, denied_paths };
  }
  if (outside_allowlist.length > 0) {
    return { ok: false, reason: "private_state_dirty_outside_allowlist", outside_allowlist, denied_paths };
  }
  return { ok: true, reason: null, outside_allowlist, denied_paths };
}

function isAllowlistedRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return PRIVATE_STATE_ALLOWLIST_REFS.some((ref) => normalized === ref || normalized.startsWith(`${ref}/`));
}

function isDeniedRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return DENY_REF_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
    || DENY_PATH_RE.test(normalized);
}

function parseStatusPaths(statusText) {
  return statusText
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .flatMap((line) => {
      const rawPath = line.slice(3).trim();
      if (rawPath.includes(" -> ")) {
        return rawPath.split(" -> ").map(cleanStatusPath);
      }
      return [cleanStatusPath(rawPath)];
    })
    .filter(Boolean);
}

function cleanStatusPath(value) {
  return normalizeRepoPath(String(value).replace(/^"|"$/gu, ""));
}

function statusArgs() {
  return ["-c", "core.quotepath=false", "status", "--porcelain"];
}

async function runGit(cwd, args, runCommand) {
  const result = await runCommand({ command: "git", args, cwd });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
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

function parseDivergence(value) {
  const [aheadRaw = "0", behindRaw = "0"] = String(value).trim().split(/\s+/u);
  return {
    ahead: Number.parseInt(aheadRaw, 10) || 0,
    behind: Number.parseInt(behindRaw, 10) || 0,
  };
}

function toStep(id, result) {
  return {
    id,
    status: result.ok ? "completed" : "failed",
    exit_code: result.status,
    summary: summarizeGitOutput(result),
  };
}

function summarizeGitOutput(result) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-5)
    .join(" ");

  return text || "ok";
}

function buildResult({
  status,
  reason,
  repoRoot,
  privateStateRoot,
  now,
  steps,
  divergenceBefore = null,
  divergenceAfter = null,
  mirror = emptyMirrorReport(),
  dirtyBeforeReview = null,
  dirtyAfterReview = null,
  committed = false,
  pushed = false,
  commitOid = null,
}) {
  return {
    schema_version: PRIVATE_STATE_SYNC_RESULT_VERSION,
    sync_id: PRIVATE_STATE_SYNC_ID,
    status,
    reason,
    synced_at: now.toISOString(),
    roots: {
      repo: ".",
      private_state: normalizeRepoPath(path.relative(repoRoot, privateStateRoot) || "private-state"),
    },
    private_state: {
      changed: committed || pushed,
      committed,
      pushed,
      commit_oid: commitOid,
      divergence_before: divergenceBefore,
      divergence_after: divergenceAfter,
    },
    mirror,
    dirty_reviews: {
      before: dirtyBeforeReview,
      after: dirtyAfterReview,
    },
    steps,
    safety: {
      secret_read: false,
      raw_mail_body_read: false,
      attachment_content_inspected: false,
      public_repo_written: false,
    },
  };
}
