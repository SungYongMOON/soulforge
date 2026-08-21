import { lstat, realpath, mkdtemp, rm } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, isAbsolute, resolve, normalize } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function createImmutableAllowlist(items) {
  const arr = [...items];
  Object.defineProperty(arr, "has", {
    value: function (val) { return arr.includes(val); },
    writable: false,
    configurable: false,
    enumerable: false
  });
  Object.defineProperty(arr, "size", {
    get: function () { return arr.length; },
    configurable: false,
    enumerable: false
  });
  return Object.freeze(arr);
}

export const HELD_PRODUCTION_GIT_CANARY_ADAPTER = Object.freeze({
  adapter_kind: "held_production_git_canary_adapter",
  feature_state: "off",
  removeCleanWorktree() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production Git worktree removal is feature-OFF and forbidden"
    };
  },
  performRestoreProbe() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production Git restore probe is feature-OFF and forbidden"
    };
  }
});

export const HELD_PRODUCTION_ARCHIVE_OBSERVER = Object.freeze({
  adapter_kind: "held_production_archive_observer",
  feature_state: "off",
  observeTaskArchive() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production task archive observation is feature-OFF and forbidden"
    };
  }
});

export const ALLOWED_MAIN_REFS = createImmutableAllowlist([
  "origin/main",
  "refs/remotes/origin/main",
  "main"
]);

function comparePaths(pathA, pathB) {
  const normA = normalize(resolve(pathA));
  const normB = normalize(resolve(pathB));
  if (process.platform === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

function isBroadSystemDirectory(pathStr) {
  const norm = normalize(resolve(pathStr)).toLowerCase().replace(/[\\/]+$/u, "");
  if (/^[a-z]:$/iu.test(norm) || /^[a-z]:\\$/iu.test(norm) || norm === "" || norm === "/") return true;
  if (/^[a-z]:[\\/](?:users|windows|program files|program files \(x86\)|programdata)$/iu.test(norm)) return true;
  const broadPosix = ["/tmp", "/var", "/usr", "/home", "/etc", "/root"];
  return broadPosix.includes(norm);
}

export function parseGitWorktreePorcelain(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return [];
  const entries = stdout.trim().split(/\r?\n\r?\n/u);
  const records = [];
  for (const entry of entries) {
    const lines = entry.split(/\r?\n/u);
    const rec = {
      directory: null,
      HEAD: null,
      branch: null,
      bare: false,
      detached: false,
      locked: false,
      prunable: false
    };
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        rec.directory = line.slice(9).trim();
      } else if (line.startsWith("HEAD ")) {
        rec.HEAD = line.slice(5).trim();
      } else if (line.startsWith("branch ")) {
        rec.branch = line.slice(7).trim();
      } else if (line === "bare") {
        rec.bare = true;
      } else if (line === "detached") {
        rec.detached = true;
      } else if (line.startsWith("locked")) {
        rec.locked = true;
      } else if (line.startsWith("prunable")) {
        rec.prunable = true;
      }
    }
    if (rec.directory) records.push(rec);
  }
  return records;
}

export function createRealGitCanaryAdapter({
  repoRoot,
  runGit = async (cwd, args) => {
    try {
      const res = await execFile("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
      });
      return { code: 0, stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
    } catch (err) {
      return {
        code: Number.isInteger(err?.code) ? err.code : 2,
        stdout: String(err?.stdout ?? ""),
        stderr: String(err?.stderr ?? "")
      };
    }
  },
  lstatFn = lstat,
  realpathFn = realpath,
  mkdtempFn = mkdtemp,
  rmFn = rm
} = {}) {
  const root = resolve(repoRoot);

  return {
    adapter_kind: "real_git_canary_adapter",
    feature_state: "armed",

    async removeCleanWorktree(candidateId, packet, options = {}) {
      const worktreePath = options?.worktreePath;
      const targetCommitSha = packet?.target_commit_sha;
      const approvedMainSha = packet?.approved_main_sha;
      const approvedMainRef = packet?.approved_main_ref;

      // 1. Validate SHAs & ref strictly before any Git call
      if (typeof targetCommitSha !== "string" || !/^[0-9a-f]{40}$/u.test(targetCommitSha)) {
        return { success: false, error_code: "COMMIT_SHA_INVALID" };
      }
      if (typeof approvedMainSha !== "string" || !/^[0-9a-f]{40}$/u.test(approvedMainSha)) {
        return { success: false, error_code: "MAIN_SHA_INVALID" };
      }
      if (typeof approvedMainRef !== "string" || !ALLOWED_MAIN_REFS.has(approvedMainRef) || approvedMainRef.startsWith("-")) {
        return { success: false, error_code: "MAIN_REF_INVALID" };
      }

      // 2. Validate worktree path presence & safety
      if (typeof worktreePath !== "string" || !worktreePath || !isAbsolute(worktreePath)) {
        return { success: false, error_code: "WORKTREE_PATH_UNSAFE" };
      }

      const resolvedPath = resolve(worktreePath);

      if (comparePaths(resolvedPath, root)) {
        return { success: false, error_code: "REPO_ROOT_REMOVAL_FORBIDDEN" };
      }

      if (isBroadSystemDirectory(resolvedPath)) {
        return { success: false, error_code: "BROAD_DIRECTORY_REMOVAL_FORBIDDEN" };
      }

      // 3. Symlink & reparse point check
      try {
        const st = await lstatFn(resolvedPath);
        if (st.isSymbolicLink()) {
          return { success: false, error_code: "SYMLINK_REPARSE_AMBIGUITY" };
        }
        const real = await realpathFn(resolvedPath);
        if (!comparePaths(real, resolvedPath)) {
          return { success: false, error_code: "SYMLINK_REPARSE_AMBIGUITY" };
        }
      } catch {
        return { success: false, error_code: "WORKTREE_PATH_UNSAFE" };
      }

      // 4. Resolve approvedMainRef and verify equality to approvedMainSha
      const revParseRefRes = await runGit(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        `${approvedMainRef}^{commit}`
      ]);
      if (revParseRefRes.code !== 0 || revParseRefRes.stdout.trim().toLowerCase() !== approvedMainSha.toLowerCase()) {
        return { success: false, error_code: "MAIN_REF_MISMATCH" };
      }

      // 5. Ancestry check: git merge-base --is-ancestor targetCommitSha approvedMainSha
      const ancestorRes = await runGit(root, ["merge-base", "--is-ancestor", targetCommitSha, approvedMainSha]);
      if (ancestorRes.code !== 0) {
        return { success: false, error_code: "MAIN_ANCESTRY_NOT_CONTAINED" };
      }

      // 6. Observe zero unique commits: git rev-list --count approvedMainSha..targetCommitSha
      const revListRes = await runGit(root, ["rev-list", "--count", `${approvedMainSha}..${targetCommitSha}`]);
      if (revListRes.code !== 0 || revListRes.stdout.trim() !== "0") {
        return { success: false, error_code: "UNIQUE_COMMITS_PRESENT" };
      }

      // 7. Git worktree porcelain list check & exact HEAD match
      const listRes = await runGit(root, ["worktree", "list", "--porcelain"]);
      if (listRes.code !== 0) {
        return { success: false, error_code: "WORKTREE_NOT_IN_PORCELAIN" };
      }

      const records = parseGitWorktreePorcelain(listRes.stdout);
      if (records.length === 0) {
        return { success: false, error_code: "WORKTREE_NOT_IN_PORCELAIN" };
      }

      // First record is main repo root
      if (records[0]?.directory && comparePaths(records[0].directory, resolvedPath)) {
        return { success: false, error_code: "REPO_ROOT_REMOVAL_FORBIDDEN" };
      }

      const match = records.find((rec) => rec.directory && comparePaths(rec.directory, resolvedPath));
      if (!match) {
        return { success: false, error_code: "WORKTREE_NOT_IN_PORCELAIN" };
      }

      if (!match.HEAD || match.HEAD.trim().toLowerCase() !== targetCommitSha.toLowerCase()) {
        return { success: false, error_code: "WORKTREE_HEAD_MISMATCH" };
      }
      if (match.locked) return { success: false, error_code: "WORKTREE_LOCKED" };
      if (match.prunable) return { success: false, error_code: "WORKTREE_PRUNABLE_HOLD" };

      // Re-read rev-parse HEAD inside the worktree
      const worktreeHeadRes = await runGit(resolvedPath, ["rev-parse", "HEAD"]);
      if (worktreeHeadRes.code !== 0 || worktreeHeadRes.stdout.trim().toLowerCase() !== targetCommitSha.toLowerCase()) {
        return { success: false, error_code: "WORKTREE_HEAD_MISMATCH" };
      }

      // 8. Cleanliness verification (fixed argv)
      const [unstaged, staged, untracked] = await Promise.all([
        runGit(resolvedPath, ["diff", "--quiet"]),
        runGit(resolvedPath, ["diff", "--cached", "--quiet"]),
        runGit(resolvedPath, ["ls-files", "--others", "--exclude-standard", "-z"])
      ]);

      if (unstaged.code !== 0 || staged.code !== 0 || untracked.stdout.length > 0) {
        return { success: false, error_code: "WORKTREE_NOT_CLEAN" };
      }

      // 9. Execute exact clean worktree removal with FIXED argv (NO --force!)
      const removeRes = await runGit(root, ["worktree", "remove", resolvedPath]);
      if (removeRes.code !== 0) {
        return { success: false, error_code: "WORKTREE_REMOVAL_FAILED" };
      }

      return {
        success: true,
        removed_path: resolvedPath,
        removal_count: 1,
        observed_evidence: Object.freeze([
          "git_ref_resolved",
          "git_ancestry_verified",
          "git_rev_list_zero_verified",
          "git_porcelain_verified",
          "git_head_matched",
          "git_clean_verified",
          "git_worktree_removed"
        ])
      };
    },

    async performRestoreProbe(candidateId, packet, options = {}) {
      const targetCommit = packet?.target_commit_sha;
      if (typeof targetCommit !== "string" || !/^[0-9a-f]{40}$/u.test(targetCommit)) {
        return { success: false, error_code: "RESTORE_PROBE_HEAD_MISMATCH", probe_cleanup_verified: true };
      }

      let tempProbeDir = null;
      let probeVerified = false;
      let probeErrorCode = "RESTORE_PROBE_FAILED";
      let cleanupOk = false;

      try {
        const rawTemp = await mkdtempFn(join(tmpdir(), "sf_probe_canary_"));
        try {
          tempProbeDir = await realpathFn(rawTemp);
        } catch {
          tempProbeDir = resolve(rawTemp);
        }

        const addRes = await runGit(root, ["worktree", "add", "--detach", tempProbeDir, targetCommit]);
        if (addRes.code !== 0) {
          probeErrorCode = "RESTORE_PROBE_FAILED";
          probeVerified = false;
        } else {
          const headRes = await runGit(tempProbeDir, ["rev-parse", "HEAD"]);
          if (headRes.code !== 0 || headRes.stdout.trim().toLowerCase() !== targetCommit.toLowerCase()) {
            probeErrorCode = "RESTORE_PROBE_HEAD_MISMATCH";
            probeVerified = false;
          } else {
            const statusRes = await runGit(tempProbeDir, ["status", "--porcelain"]);
            if (statusRes.code !== 0 || statusRes.stdout.trim().length > 0) {
              probeErrorCode = "RESTORE_PROBE_DIRTY";
              probeVerified = false;
            } else {
              probeVerified = true;
            }
          }
        }
      } catch {
        probeVerified = false;
      } finally {
        if (tempProbeDir) {
          cleanupOk = true;
          // Cleanup probe worktree WITHOUT --force!
          try {
            const rmWorktreeRes = await runGit(root, ["worktree", "remove", tempProbeDir]);
            if (rmWorktreeRes.code !== 0) {
              await rmFn(tempProbeDir, { recursive: true, force: true });
            }
          } catch {
            try {
              await rmFn(tempProbeDir, { recursive: true, force: true });
            } catch {
              cleanupOk = false;
            }
          }

          // Re-list porcelain
          try {
            const checkListRes = await runGit(root, ["worktree", "list", "--porcelain"]);
            if (checkListRes.code !== 0) {
              cleanupOk = false;
            } else {
              const checkRecords = parseGitWorktreePorcelain(checkListRes.stdout);
              if (checkRecords.some((rec) => rec.directory && comparePaths(rec.directory, tempProbeDir))) {
                cleanupOk = false;
              }
            }
          } catch {
            cleanupOk = false;
          }

          // lstat tempProbeDir check: require ENOENT!
          try {
            await lstatFn(tempProbeDir);
            cleanupOk = false; // Still present
          } catch (stErr) {
            if (stErr?.code !== "ENOENT") {
              cleanupOk = false;
            }
          }
        } else {
          cleanupOk = true;
        }
      }

      if (!probeVerified) {
        return { success: false, error_code: probeErrorCode, probe_cleanup_verified: cleanupOk };
      }
      if (!cleanupOk) {
        return { success: false, error_code: "RESTORE_PROBE_CLEANUP_FAILED", probe_cleanup_verified: false };
      }

      return {
        success: true,
        probe_verified: true,
        probe_cleanup_verified: true,
        probe_count: 1,
        observed_evidence: Object.freeze([
          "git_probe_added",
          "git_probe_head_verified",
          "git_probe_clean_verified",
          "git_probe_removed",
          "git_probe_porcelain_cleared"
        ])
      };
    }
  };
}

export function createSyntheticGitCanaryAdapter(options = {}) {
  let removeCalls = 0;
  let restoreCalls = 0;
  const failRemoveWith = options.failRemoveWith ?? null;
  const failRestoreWith = options.failRestoreWith ?? null;
  const removedCandidates = new Set();

  return {
    adapter_kind: "synthetic_git_canary_adapter",
    feature_state: "off",
    removeCleanWorktree(candidateId, packet, opt = {}) {
      removeCalls += 1;
      if (failRemoveWith) {
        if (typeof failRemoveWith === "string") return { success: false, error_code: failRemoveWith };
        throw failRemoveWith;
      }
      removedCandidates.add(candidateId);
      return {
        success: true,
        candidate_id: candidateId,
        removal_count: 1,
        observed_evidence: Object.freeze(["synthetic_worktree_removed"])
      };
    },
    performRestoreProbe(candidateId, packet, opt = {}) {
      restoreCalls += 1;
      if (failRestoreWith) {
        if (typeof failRestoreWith === "string") return { success: false, error_code: failRestoreWith };
        throw failRestoreWith;
      }
      return {
        success: true,
        probe_verified: true,
        probe_cleanup_verified: true,
        probe_count: 1,
        observed_evidence: Object.freeze(["synthetic_probe_verified"])
      };
    },
    getRemoveCalls() { return removeCalls; },
    getRestoreCalls() { return restoreCalls; },
    getRemovedCandidates() { return removedCandidates; }
  };
}

/**
 * Codex App Manager Archive Observer Adapter Contract
 *
 * Interface:
 *   observeTaskArchive(candidateId: string, packetDigest: string): Promise<ArchiveObservationResult>
 *
 * Result Shape:
 *   {
 *     schema_version: "soulforge.codex_thread_manager.retention_archive_observation.v1",
 *     success: true,
 *     archive_verified: true,
 *     candidate_id: string,
 *     packet_digest: string,
 *     status: "archived",
 *     observer_kind: "codex_app_manager",
 *     observed_at: string (ISO UTC),
 *     observed_evidence: string[] (Allowlisted tokens from SAFE_EVIDENCE_TOKENS)
 *   }
 */
export function createManagerCodexArchiveObserverAdapter({ observeManagerTaskArchive } = {}) {
  if (typeof observeManagerTaskArchive !== "function") {
    throw new Error("OBSERVE_MANAGER_TASK_ARCHIVE_FUNCTION_REQUIRED");
  }
  return {
    adapter_kind: "real_codex_archive_observer_adapter",
    feature_state: "armed",
    async observeTaskArchive(candidateId, packetDigest) {
      return await observeManagerTaskArchive(candidateId, packetDigest);
    }
  };
}

export function createSyntheticArchiveObserverAdapter(options = {}) {
  let observeCalls = 0;
  const failObserveWith = options.failObserveWith ?? null;
  const archivedTasks = options.archivedTasks ?? new Map();

  return {
    adapter_kind: "synthetic_archive_observer_adapter",
    feature_state: "off",
    observeTaskArchive(candidateId, packetDigest) {
      observeCalls += 1;
      if (failObserveWith) {
        if (typeof failObserveWith === "string") return { success: false, error_code: failObserveWith };
        throw failObserveWith;
      }
      const obs = archivedTasks.get(candidateId);
      if (
        obs
        && obs.schema_version === "soulforge.codex_thread_manager.retention_archive_observation.v1"
        && obs.candidate_id === candidateId
        && obs.packet_digest === packetDigest
        && obs.status === "archived"
        && obs.archive_verified === true
        && obs.observer_kind === "codex_app_manager"
      ) {
        return {
          schema_version: "soulforge.codex_thread_manager.retention_archive_observation.v1",
          success: true,
          archive_verified: true,
          candidate_id: candidateId,
          packet_digest: packetDigest,
          status: "archived",
          observer_kind: "codex_app_manager",
          observed_at: obs.observed_at,
          observed_evidence: obs.observed_evidence ?? Object.freeze(["synthetic_archive_verified"])
        };
      }
      return { success: false, archive_verified: false, error_code: "ARCHIVE_NOT_VERIFIED" };
    },
    getObserveCalls() { return observeCalls; }
  };
}
