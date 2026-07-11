#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.local_absolute_path_policy.v0";

const WINDOWS_PATH_RE = /(^|[^A-Za-z0-9_:/.-])([A-Za-z]:(?:[\\/]|\\\\)[^\s"'<>),\]}]*)/g;
const POSIX_PATH_RE = /(^|[^A-Za-z0-9_:/.-])(\/(?:Users|Volumes|home|tmp|var\/folders|private\/var|mnt)\/[^\s"'<>),\]}]*)/g;
const FILE_URI_RE = /(file:\/\/\/[^\s"'<>),\]}]*)/g;
const redactedViolationValue = "<redacted>";
const fileUriPrefix = `${"file:"}${"///"}`;

const binaryExtensions = new Set([
  ".7z",
  ".bin",
  ".bmp",
  ".doc",
  ".docx",
  ".dsn",
  ".gif",
  ".gz",
  ".heic",
  ".hwpx",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".opj",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".sqlite",
  ".tgz",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
]);

const secretNameRe = /(^|[\\/])[^\\/]*(?:secret|token|credential|cookie|session|password)[^\\/]*($|[\\/])/i;
const envNameRe = /(^|[\\/])\.?env(?:\.[^\\/]*)?$/i;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root ?? defaultRepoRoot);
  const scope = args.scope ?? "changed";
  const includeNested = args["include-nested"] === true;
  const repoTargets = buildRepoTargets(root, includeNested);
  const reports = [];

  for (const repo of repoTargets) {
    reports.push(await scanGitRepo(repo, { scope }));
  }

  const report = buildReport({ scope, repoTargets: reports });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
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

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[rawKey] = next;
      index += 1;
      continue;
    }

    args[rawKey] = true;
  }

  return args;
}

function buildRepoTargets(root, includeNested) {
  const repos = [{ id: "soulforge", root }];
  if (includeNested) {
    repos.push(
      { id: "workmeta", root: path.join(root, "_workmeta"), optional: true },
      { id: "private-state", root: path.join(root, "private-state"), optional: true },
    );
  }
  return repos;
}

async function scanGitRepo(repo, { scope }) {
  if (!(await pathExists(repo.root))) {
    return repo.optional
      ? { ...repo, present: false, ok: true, files_scanned: 0, violations: [], skipped: [] }
      : {
          ...repo,
          present: false,
          ok: false,
          files_scanned: 0,
          violations: [],
          skipped: [{ reason: "missing_repo_root", path: repo.root }],
        };
  }

  const inside = runGit(repo.root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return repo.optional
      ? { ...repo, present: true, ok: true, files_scanned: 0, violations: [], skipped: [] }
      : {
          ...repo,
          present: true,
          ok: false,
          files_scanned: 0,
          violations: [],
          skipped: [{ reason: "not_git_repo", path: repo.root }],
        };
  }

  const listing = listFilesForScope(repo.root, scope);
  const files = listing.files;
  const violations = [];
  const skipped = [];
  let filesScanned = 0;

  // fail-closed(#S3-8): git 목록 실패를 빈 목록으로 삼키면 위반 0·ok:true 로 조용히 통과한다 —
  // 확인 못 하면 FAIL. tracked 스코프에서 목록 0건(비-optional)도 동일하게 실패로 승격.
  for (const failure of listing.failures) {
    skipped.push({ reason: failure });
  }
  const trackedScopeEmpty = scope === "tracked" && !repo.optional && listing.failures.length === 0 && files.length === 0;
  if (trackedScopeEmpty) {
    skipped.push({ reason: "tracked_scope_empty" });
  }

  for (const relativePath of files) {
    const skipReason = skipReasonForPath(relativePath);
    if (skipReason) {
      skipped.push({ path: relativePath, reason: skipReason });
      continue;
    }

    const absolutePath = path.join(repo.root, relativePath);
    let entryStats;
    try {
      entryStats = await fs.lstat(absolutePath);
    } catch (error) {
      skipped.push({ path: relativePath, reason: `read_failed:${error.code ?? "unknown"}` });
      continue;
    }

    if (entryStats.isSymbolicLink()) {
      skipped.push({ path: relativePath, reason: "symlink_file" });
      continue;
    }

    let raw;
    try {
      raw = await fs.readFile(absolutePath);
    } catch (error) {
      skipped.push({ path: relativePath, reason: `read_failed:${error.code ?? "unknown"}` });
      continue;
    }

    if (raw.includes(0)) {
      skipped.push({ path: relativePath, reason: "binary_content" });
      continue;
    }

    filesScanned += 1;
    const text = raw.toString("utf8");
    violations.push(...findLocalAbsolutePathViolations(text, relativePath));
  }

  return {
    ...repo,
    present: true,
    ok: violations.length === 0 && listing.failures.length === 0 && !trackedScopeEmpty,
    scope,
    files_considered: files.length,
    files_scanned: filesScanned,
    violations,
    skipped,
  };
}

function listFilesForScope(repoRoot, scope) {
  if (scope === "tracked") {
    const tracked = gitList(repoRoot, ["ls-files", "-z"]);
    return { files: tracked.files, failures: tracked.ok ? [] : [`git_list_failed:${tracked.subcommand}`] };
  }

  if (scope === "changed") {
    const lists = [];
    // HEAD 없는 신규 repo(커밋 0)는 diff 대상이 없다 — others 목록만 사용(오류 아님).
    const hasHead = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", "HEAD"]).ok;
    if (hasHead) {
      lists.push(gitList(repoRoot, ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"]));
      lists.push(gitList(repoRoot, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRTUXB", "--"]));
    }
    lists.push(gitList(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]));
    return {
      files: uniqueSorted(lists.flatMap((list) => list.files)),
      failures: lists.filter((list) => !list.ok).map((list) => `git_list_failed:${list.subcommand}`),
    };
  }

  throw new Error(`Unsupported scope: ${scope}`);
}

function gitList(repoRoot, args) {
  const result = runGit(repoRoot, args);
  if (!result.ok) {
    return { ok: false, subcommand: args[0], files: [] };
  }
  const files = (result.stdout ?? "")
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
  return { ok: true, subcommand: args[0], files };
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function skipReasonForPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const extension = path.extname(normalized).toLowerCase();
  if (binaryExtensions.has(extension)) {
    return "binary_extension";
  }
  if (secretNameRe.test(normalized)) {
    return "secret_like_path";
  }
  if (envNameRe.test(normalized) && !normalized.endsWith(".env.example")) {
    return "env_like_path";
  }
  return null;
}

export function findLocalAbsolutePathViolations(text, file) {
  const violations = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    collectMatches({ regex: WINDOWS_PATH_RE, line, lineNumber: index + 1, file, pattern: "windows_local_absolute_path", violations });
    collectMatches({ regex: POSIX_PATH_RE, line, lineNumber: index + 1, file, pattern: "posix_local_absolute_path", violations });
    collectMatches({ regex: FILE_URI_RE, line, lineNumber: index + 1, file, pattern: "file_uri_absolute_path", violations });
  }

  return violations;
}

function collectMatches({ regex, line, lineNumber, file, pattern, violations }) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const value = match[2] ?? match[1];
    const column = match.index + match[0].indexOf(value) + 1;
    violations.push({
      id: pattern,
      reason: reasonForPattern(pattern),
      file,
      line: lineNumber,
      column,
      ...redactViolationValue(value),
      detail: "Use a repo-relative path, placeholder token, or machine-local runtime input instead of a concrete local absolute path.",
    });
  }
}

function redactViolationValue(value) {
  return {
    value: redactedViolationValue,
    value_length: value.length,
    value_fingerprint: fingerprintValue(value),
  };
}

function redactPathField(fieldName, value) {
  return {
    [fieldName]: redactedViolationValue,
    [`${fieldName}_length`]: value.length,
    [`${fieldName}_fingerprint`]: fingerprintValue(value),
  };
}

function fingerprintValue(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function reasonForPattern(pattern) {
  if (pattern === "windows_local_absolute_path") {
    return "concrete_windows_local_absolute_path";
  }
  if (pattern === "posix_local_absolute_path") {
    return "concrete_posix_local_absolute_path";
  }
  if (pattern === "file_uri_absolute_path") {
    return "concrete_file_uri_absolute_path";
  }
  return "concrete_local_absolute_path";
}

function buildReport({ scope, repoTargets }) {
  const violations = repoTargets.flatMap((repo) =>
    repo.violations.map((violation) => ({
      repo: repo.id,
      ...violation,
    })),
  );
  const skipped = repoTargets.flatMap((repo) =>
    repo.skipped.map((item) => ({
      repo: repo.id,
      ...redactSkippedPath(item),
    })),
  );
  return {
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    ok: violations.length === 0 && repoTargets.every((repo) => repo.ok),
    scope,
    summary: {
      repo_count: repoTargets.length,
      files_considered: sum(repoTargets, "files_considered"),
      files_scanned: sum(repoTargets, "files_scanned"),
      violations_total: violations.length,
      skipped_total: skipped.length,
    },
    repos: repoTargets.map((repo) => ({
      id: repo.id,
      ...redactPathField("root", repo.root),
      present: repo.present,
      ok: repo.ok,
      files_considered: repo.files_considered ?? 0,
      files_scanned: repo.files_scanned ?? 0,
      violations_total: repo.violations.length,
      skipped_total: repo.skipped.length,
    })),
    violations,
    skipped,
  };
}

function redactSkippedPath(item) {
  if (!item.path || !isUnsafeReportPath(item.path)) {
    return item;
  }
  return {
    ...item,
    ...redactPathField("path", item.path),
  };
}

function isUnsafeReportPath(value) {
  return value.startsWith(fileUriPrefix) || path.isAbsolute(value) || /^[A-Za-z]:(?:[\\/]|\\\\)/.test(value);
}

function printHuman(report) {
  const lines = [
    "Soulforge Local Absolute Path Policy",
    `ok: ${report.ok ? "yes" : "no"}`,
    `scope: ${report.scope}`,
    `repos: ${report.summary.repo_count}`,
    `files considered: ${report.summary.files_considered}`,
    `files scanned: ${report.summary.files_scanned}`,
    `violations: ${report.summary.violations_total}`,
  ];

  if (report.violations.length > 0) {
    lines.push("");
    lines.push("Violations:");
    for (const violation of report.violations.slice(0, 100)) {
      lines.push(`- ${violation.repo}:${violation.file}:${violation.line}:${violation.column}`);
      lines.push(
        `  ${violation.id}: ${violation.value} length=${violation.value_length} fingerprint=${violation.value_fingerprint}`,
      );
    }
    if (report.violations.length > 100) {
      lines.push(`- ... ${report.violations.length - 100} more`);
    }
  }

  if (report.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped: ${report.skipped.length} files; use --json for details.`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function sum(reports, key) {
  return reports.reduce((total, report) => total + (report[key] ?? 0), 0);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
