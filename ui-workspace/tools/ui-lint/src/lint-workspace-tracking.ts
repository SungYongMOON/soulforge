import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { addIssue, canonicalRoot, repoRoot, type LintResult } from "./shared";

const ALLOWED_TRACKED_WORKSPACE_PATHS = new Set(["_workspaces/README.md"]);

function lintRoot() {
  return canonicalRoot ?? repoRoot;
}

export function runWorkspaceTrackingLint() {
  const issues = [];
  const root = lintRoot();
  const workspacesReadme = path.resolve(root, "_workspaces/README.md");

  if (!existsSync(workspacesReadme)) {
    return {
      name: "workspace tracking lint",
      issues
    } satisfies LintResult;
  }

  const gitignorePath = path.resolve(root, ".gitignore");
  if (!existsSync(gitignorePath)) {
    addIssue(issues, "workspace-gitignore-missing", ".gitignore", "missing .gitignore for _workspaces tracking policy");
  } else {
    const gitignoreText = readFileSync(gitignorePath, "utf-8");
    if (!gitignoreText.includes("_workspaces/**")) {
      addIssue(issues, "workspace-ignore-policy", ".gitignore", "missing `_workspaces/**` ignore rule");
    }
    if (!gitignoreText.includes("!_workspaces/README.md")) {
      addIssue(issues, "workspace-ignore-policy", ".gitignore", "missing `!_workspaces/README.md` allow rule");
    }
  }

  let trackedEntries: string[] = [];
  try {
    const raw = execFileSync("git", ["ls-files", "_workspaces"], {
      cwd: root,
      encoding: "utf8"
    }).trim();
    trackedEntries = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
  } catch (error) {
    addIssue(
      issues,
      "workspace-git-ls-files",
      "_workspaces",
      `failed to read tracked _workspaces entries: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      name: "workspace tracking lint",
      issues
    } satisfies LintResult;
  }

  for (const entry of trackedEntries) {
    if (!ALLOWED_TRACKED_WORKSPACE_PATHS.has(entry)) {
      addIssue(
        issues,
        "tracked-workspace-entry",
        entry,
        "public repo must not track _workspaces content other than _workspaces/README.md"
      );
    }
  }

  return {
    name: "workspace tracking lint",
    issues
  } satisfies LintResult;
}
