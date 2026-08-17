#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { classifyPath } from "./path_length_policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.workmeta_payload_policy.v0";
const execFileAsync = promisify(execFile);

export const blockedWorkmetaPayloadExtensions = new Set([
  ".7z",
  ".doc",
  ".docx",
  ".egg",
  ".eml",
  ".hwp",
  ".hwpx",
  ".mbox",
  ".msg",
  ".ost",
  ".pdf",
  ".ppt",
  ".pptx",
  ".pst",
  ".rar",
  ".xls",
  ".xlsm",
  ".xlsx",
  ".zip",
]);

export const allowedWorkmetaMetadataExtensions = new Set([
  ".csv",
  ".example",
  ".ini",
  ".json",
  ".jsonl",
  ".md",
  ".sample",
  ".sha256",
  ".toml",
  ".tsv",
  ".yaml",
  ".yml",
]);

const generatedDirectoryPatterns = [
  /^\.git$/i,
  /^__pycache__$/i,
  /^artifact_run$/i,
  /^local_replay/i,
  /^lo_profile/i,
  /^node_modules$/i,
  /^renders?(?:_|$)/i,
  /^rendered$/i,
  /^screenshots?$/i,
  /^temp$/i,
  /^tmp$/i,
  /^uno_packages$/i,
  /^visual_qa/i,
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.root ?? defaultRepoRoot);
  const workmetaRoot = path.resolve(repoRoot, args["workmeta-root"] ?? "_workmeta");
  if (args["assert-write-target"]) {
    const report = validateWorkmetaWriteTarget({
      repoRoot,
      workmetaRoot,
      targetPath: args["assert-write-target"],
      targetKind: args["target-kind"] ?? "file",
    });
    if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else printWriteTargetHuman(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const report = await validateWorkmetaPayloadPolicy({ repoRoot, workmetaRoot });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

export function validateWorkmetaWriteTarget({
  repoRoot = defaultRepoRoot,
  workmetaRoot = null,
  targetPath,
  targetKind = "file",
} = {}) {
  if (!targetPath) throw new Error("targetPath is required");
  if (!new Set(["file", "directory"]).has(targetKind)) throw new Error(`unsupported targetKind: ${targetKind}`);

  const root = path.resolve(repoRoot);
  const workmeta = path.resolve(workmetaRoot ?? path.join(root, "_workmeta"));
  const target = path.resolve(root, targetPath);
  const relative = path.relative(workmeta, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      schema_version: schemaVersion,
      ok: true,
      applies: false,
      target: displayPath(root, target),
      target_kind: targetKind,
      violations: [],
    };
  }

  const violations = classifyWorkmetaTarget(relative, targetKind);
  // Path budget (owner decision 2026-08-18: long paths stay off; every new _workmeta path fits
  // 200 chars total, 60 per segment, no slug repetition, hashes <= 16 hex).
  const budget = classifyPath(path.relative(root, target), { kind: targetKind });
  for (const v of budget.violations) violations.push({ id: "path_budget_" + v.id, ...v });
  return {
    schema_version: schemaVersion,
    ok: violations.length === 0,
    applies: true,
    target: displayPath(root, target),
    target_kind: targetKind,
    violations,
  };
}

export async function validateWorkmetaPayloadPolicy({ repoRoot = defaultRepoRoot, workmetaRoot = null } = {}) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(workmetaRoot ?? path.join(root, "_workmeta"));

  if (!(await pathExists(target))) {
    return {
      schema_version: schemaVersion,
      ok: true,
      present: false,
      workmeta_root: displayPath(root, target),
      files_scanned: 0,
      violation_count: 0,
      violations: [],
    };
  }

  const scan = await scanWorkmetaTree({ repoRoot: root, workmetaRoot: target });
  return {
    schema_version: schemaVersion,
    ok: scan.violations.length === 0,
    present: true,
    workmeta_root: displayPath(root, target),
    files_scanned: scan.filesScanned,
    legacy_grandfathered_count: scan.legacyGrandfatheredCount,
    violation_count: scan.violations.length,
    violations: scan.violations,
  };
}

async function scanWorkmetaTree({ repoRoot, workmetaRoot }) {
  const violations = [];
  let filesScanned = 0;
  let legacyGrandfatheredCount = 0;
  const headTrackedPaths = await readHeadTrackedPaths(workmetaRoot);

  async function visit(directory) {
    if (directory !== workmetaRoot && (await pathExists(path.join(directory, ".git")))) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativeToWorkmeta = path.relative(workmetaRoot, absolutePath);
      const relativeParts = relativeToWorkmeta.split(path.sep);
      if (relativeParts[0] === ".git") {
        continue;
      }
      if (entry.isSymbolicLink()) {
        recordTargetViolations(absolutePath, relativeToWorkmeta, "file");
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      filesScanned += 1;
      recordTargetViolations(absolutePath, relativeToWorkmeta, "file");
    }
  }

  function recordTargetViolations(absolutePath, relativeToWorkmeta, targetKind) {
    const normalized = relativeToWorkmeta.split(path.sep).join(path.posix.sep);
    const targetViolations = classifyWorkmetaTarget(relativeToWorkmeta, targetKind);
    if (!targetViolations.length) return;
    if (headTrackedPaths.has(normalized)) {
      legacyGrandfatheredCount += 1;
      return;
    }
    for (const violation of targetViolations) {
      violations.push({
        ...violation,
        path: displayPath(repoRoot, absolutePath),
      });
    }
  }

  await visit(workmetaRoot);
  violations.sort((left, right) => left.path.localeCompare(right.path));
  return { filesScanned, violations, legacyGrandfatheredCount };
}

function classifyWorkmetaTarget(relativeToWorkmeta, targetKind) {
  const parts = relativeToWorkmeta.split(/[\\/]+/).filter(Boolean);
  const violations = [];
  if (parts.some((part) => generatedDirectoryPatterns.some((pattern) => pattern.test(part)))) {
    violations.push({ id: "generated_runtime_path_in_workmeta" });
  }
  if (targetKind === "file") {
    const basename = parts.at(-1) ?? "";
    const extension = path.extname(basename).toLowerCase();
    if (blockedWorkmetaPayloadExtensions.has(extension)) {
      violations.push({ id: "blocked_payload_extension_in_workmeta", extension });
    } else if (!allowedWorkmetaMetadataExtensions.has(extension) && basename !== ".gitignore") {
      violations.push({ id: "non_metadata_file_type_in_workmeta", extension: extension || "<none>" });
    }
  }
  return violations;
}

async function readHeadTrackedPaths(workmetaRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workmetaRoot, "ls-tree", "-r", "--name-only", "-z", "HEAD"], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(stdout.toString("utf8").split("\0").filter(Boolean));
  } catch {
    return new Set();
  }
}

function printHuman(report) {
  process.stdout.write("Soulforge Workmeta Payload Policy\n");
  process.stdout.write(`ok: ${report.ok ? "yes" : "no"}\n`);
  process.stdout.write(`present: ${report.present ? "yes" : "no"}\n`);
  process.stdout.write(`workmeta_root: ${report.workmeta_root}\n`);
  process.stdout.write(`files_scanned: ${report.files_scanned}\n`);
  process.stdout.write(`violations: ${report.violation_count}\n`);
  for (const violation of report.violations.slice(0, 20)) {
    const extension = violation.extension ? ` (${violation.extension})` : "";
    process.stdout.write(`- ${violation.path} [${violation.id}]${extension}\n`);
  }
  if (report.violations.length > 20) {
    process.stdout.write(`... ${report.violations.length - 20} more\n`);
  }
}

function printWriteTargetHuman(report) {
  process.stdout.write("Soulforge Workmeta Write Target Guard\n");
  process.stdout.write(`ok: ${report.ok ? "yes" : "no"}\n`);
  process.stdout.write(`applies: ${report.applies ? "yes" : "no"}\n`);
  process.stdout.write(`target: ${report.target}\n`);
  for (const violation of report.violations) process.stdout.write(`- ${violation.id}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
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

function displayPath(repoRoot, targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return targetPath;
  }
  return relative.split(path.sep).join(path.posix.sep);
}

function isDirectCliInvocation() {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

if (isDirectCliInvocation()) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
