import { findLineMatches, walkFiles, type LintResult } from "./shared";

const CODE_FILES = [
  ...walkFiles("apps/renderer-web", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
  ...walkFiles("apps/skin-lab-storybook", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
  ...walkFiles("packages/renderer-core", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
  ...walkFiles("packages/renderer-react", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
  ...walkFiles("packages/theme-contract", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
  ...walkFiles("packages/theme-adventurers-desk", (repoPath) => /\.(ts|tsx)$/.test(repoPath))
];

const CANONICAL_PATTERN = /(?:\.agent\/|\.agent_class\/|_workspaces\/)/;
const DIRECT_READ_PATTERN = /\b(import|from|readFile|readFileSync|fs\.|spawn|spawnSync|exec|fetch)\b/;

function isAllowedReference(file: string, line: string) {
  return file.startsWith("tools/legacy-python-viewer/") && line.includes(".agent_class/tools/local_cli/ui_sync/ui_sync.py");
}

export function runReadOnlyBoundaryLint() {
  const issues = [];

  for (const file of CODE_FILES) {
    for (const match of findLineMatches(file, CANONICAL_PATTERN)) {
      if (!DIRECT_READ_PATTERN.test(match.line)) {
        continue;
      }

      if (isAllowedReference(file, match.line)) {
        continue;
      }

      issues.push({
        rule: "canonical-read",
        file,
        message: `line ${match.lineNumber} references canonical tree directly: ${match.line.trim()}`
      });
    }
  }

  return {
    name: "read-only boundary lint",
    issues
  } satisfies LintResult;
}
