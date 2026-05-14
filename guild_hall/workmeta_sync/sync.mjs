import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathExists } from "../shared/io.mjs";

export const WORKMETA_SYNC_RESULT_VERSION = "soulforge.workmeta_sync.result.v1";
export const WORKMETA_SYNC_ID = "soulforge-workmeta-sync-v0";

export function defaultWorkmetaRoot(repoRoot) {
  return path.join(repoRoot, "_workmeta");
}

export async function syncWorkmetaRepo(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? defaultWorkmetaRoot(repoRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const runCommand = options.runCommand ?? defaultRunCommand;
  const steps = [];
  const rootValidation = validateWorkmetaRoot(repoRoot, workmetaRoot);

  if (!rootValidation.ok) {
    return buildResult({
      status: "blocked",
      reason: rootValidation.reason,
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  if (!(await pathExists(path.join(workmetaRoot, ".git")))) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_git_missing",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const beforeStatus = await runGit(workmetaRoot, ["status", "--porcelain"], runCommand);
  steps.push(toStep("workmeta_status_before", beforeStatus));
  if (!beforeStatus.ok) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_status_failed",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const dirtyBefore = Boolean(beforeStatus.stdout.trim());

  const branch = await runGit(workmetaRoot, ["branch", "--show-current"], runCommand);
  steps.push(toStep("workmeta_branch", branch));
  if (!branch.ok || branch.stdout.trim() !== "main") {
    return buildResult({
      status: "blocked",
      reason: "workmeta_branch_not_main",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const remote = await runGit(workmetaRoot, ["remote"], runCommand);
  steps.push(toStep("workmeta_origin", remote));
  const remotes = remote.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!remote.ok || !remotes.includes("origin")) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_origin_missing",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const fetch = await runGit(workmetaRoot, ["fetch", "origin", "main"], runCommand);
  steps.push(toStep("workmeta_fetch", fetch));
  if (!fetch.ok) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_fetch_failed",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const divergenceBefore = await runGit(workmetaRoot, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], runCommand);
  steps.push(toStep("workmeta_divergence_before", divergenceBefore));
  if (!divergenceBefore.ok) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_divergence_failed",
      repoRoot,
      workmetaRoot,
      now,
      steps,
    });
  }

  const { ahead: aheadBefore, behind: behindBefore } = parseDivergence(divergenceBefore.stdout);

  if (behindBefore > 0 && dirtyBefore && options.allowDirtyPull !== true) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_dirty_and_behind",
      repoRoot,
      workmetaRoot,
      now,
      steps,
      divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
    });
  }

  if (behindBefore > 0 && options.skipPull !== true) {
    const pull = await runGit(workmetaRoot, ["pull", "--ff-only", "origin", "main"], runCommand);
    steps.push(toStep("workmeta_pull", pull));
    if (!pull.ok) {
      return buildResult({
        status: "blocked",
        reason: "workmeta_pull_failed",
        repoRoot,
        workmetaRoot,
        now,
        steps,
        divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
      });
    }
  }

  const statusAfterPull = await runGit(workmetaRoot, ["status", "--porcelain"], runCommand);
  steps.push(toStep("workmeta_status_after_pull", statusAfterPull));
  if (!statusAfterPull.ok) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_status_after_pull_failed",
      repoRoot,
      workmetaRoot,
      now,
      steps,
      divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
    });
  }

  const dirtyAfterPull = Boolean(statusAfterPull.stdout.trim());
  let committed = false;
  let pushed = false;
  let commitOid = null;

  if (dirtyAfterPull && options.skipCommit !== true) {
    const add = await runGit(workmetaRoot, ["add", "-A"], runCommand);
    steps.push(toStep("workmeta_add", add));
    if (!add.ok) {
      return buildResult({
        status: "blocked",
        reason: "workmeta_add_failed",
        repoRoot,
        workmetaRoot,
        now,
        steps,
        divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
      });
    }

    const commit = await runGit(workmetaRoot, ["commit", "-m", options.commitMessage ?? "chore: sync workmeta metadata"], runCommand);
    steps.push(toStep("workmeta_commit", commit));
    if (!commit.ok) {
      return buildResult({
        status: "blocked",
        reason: "workmeta_commit_failed",
        repoRoot,
        workmetaRoot,
        now,
        steps,
        divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
      });
    }
    committed = true;

    const head = await runGit(workmetaRoot, ["rev-parse", "HEAD"], runCommand);
    steps.push(toStep("workmeta_head", head));
    if (head.ok) {
      commitOid = head.stdout.trim() || null;
    }
  }

  const divergenceAfter = await runGit(workmetaRoot, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], runCommand);
  steps.push(toStep("workmeta_divergence_after", divergenceAfter));
  if (!divergenceAfter.ok) {
    return buildResult({
      status: "blocked",
      reason: "workmeta_divergence_after_failed",
      repoRoot,
      workmetaRoot,
      now,
      steps,
      committed,
      commitOid,
      divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
    });
  }

  const { ahead: aheadAfter, behind: behindAfter } = parseDivergence(divergenceAfter.stdout);

  if ((committed || aheadAfter > 0) && options.skipPush !== true) {
    const push = await runGit(workmetaRoot, ["push", "origin", "HEAD:main"], runCommand);
    steps.push(toStep("workmeta_push", push));
    if (!push.ok) {
      return buildResult({
        status: "blocked",
        reason: "workmeta_push_failed",
        repoRoot,
        workmetaRoot,
        now,
        steps,
        committed,
        commitOid,
        divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
        divergenceAfter: { ahead: aheadAfter, behind: behindAfter },
      });
    }
    pushed = true;
  }

  return buildResult({
    status: "completed",
    reason: committed || pushed ? "workmeta_synced" : "workmeta_already_current",
    repoRoot,
    workmetaRoot,
    now,
    steps,
    committed,
    pushed,
    commitOid,
    divergenceBefore: { ahead: aheadBefore, behind: behindBefore },
    divergenceAfter: { ahead: aheadAfter, behind: behindAfter },
  });
}

function validateWorkmetaRoot(repoRoot, workmetaRoot) {
  const relative = path.relative(repoRoot, workmetaRoot).split(path.sep).join("/");
  if (relative !== "_workmeta") {
    return { ok: false, reason: "workmeta_root_outside_nested_repo" };
  }
  return { ok: true, reason: null };
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
  workmetaRoot,
  now,
  steps,
  committed = false,
  pushed = false,
  commitOid = null,
  divergenceBefore = null,
  divergenceAfter = null,
}) {
  return {
    schema_version: WORKMETA_SYNC_RESULT_VERSION,
    sync_id: WORKMETA_SYNC_ID,
    status,
    reason,
    synced_at: now.toISOString(),
    roots: {
      repo: ".",
      workmeta: path.relative(repoRoot, workmetaRoot).split(path.sep).join("/") || "_workmeta",
    },
    workmeta: {
      changed: committed || pushed,
      committed,
      pushed,
      commit_oid: commitOid,
      divergence_before: divergenceBefore,
      divergence_after: divergenceAfter,
    },
    steps,
    safety: {
      secret_read: false,
      raw_mail_body_read: false,
      attachment_read: false,
    },
  };
}
