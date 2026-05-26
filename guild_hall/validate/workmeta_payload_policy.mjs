#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.workmeta_payload_policy.v0";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.root ?? defaultRepoRoot);
  const workmetaRoot = path.resolve(repoRoot, args["workmeta-root"] ?? "_workmeta");
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
    violation_count: scan.violations.length,
    violations: scan.violations,
  };
}

async function scanWorkmetaTree({ repoRoot, workmetaRoot }) {
  const violations = [];
  let filesScanned = 0;

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativeToWorkmeta = path.relative(workmetaRoot, absolutePath);
      const relativeParts = relativeToWorkmeta.split(path.sep);
      if (relativeParts[0] === ".git") {
        continue;
      }
      if (entry.isSymbolicLink()) {
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
      const extension = path.extname(entry.name).toLowerCase();
      if (blockedWorkmetaPayloadExtensions.has(extension)) {
        violations.push({
          id: "blocked_payload_extension_in_workmeta",
          path: displayPath(repoRoot, absolutePath),
          extension,
        });
      }
    }
  }

  await visit(workmetaRoot);
  violations.sort((left, right) => left.path.localeCompare(right.path));
  return { filesScanned, violations };
}

function printHuman(report) {
  process.stdout.write("Soulforge Workmeta Payload Policy\n");
  process.stdout.write(`ok: ${report.ok ? "yes" : "no"}\n`);
  process.stdout.write(`present: ${report.present ? "yes" : "no"}\n`);
  process.stdout.write(`workmeta_root: ${report.workmeta_root}\n`);
  process.stdout.write(`files_scanned: ${report.files_scanned}\n`);
  process.stdout.write(`violations: ${report.violation_count}\n`);
  for (const violation of report.violations.slice(0, 20)) {
    process.stdout.write(`- ${violation.path} (${violation.extension})\n`);
  }
  if (report.violations.length > 20) {
    process.stdout.write(`... ${report.violations.length - 20} more\n`);
  }
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
