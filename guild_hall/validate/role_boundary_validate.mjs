#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.role_boundary.validate.v0";

const protectedPublicContractPaths = [
  "AGENTS.md",
  "README.md",
  "docs/architecture/foundation/",
  "docs/architecture/bootstrap/",
  "docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport();

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

async function buildReport() {
  const identityPath = path.join(repoRoot, "guild_hall/state/local/node_identity.yaml");
  const identity = await readIdentity(identityPath);
  const changedFiles = listChangedFiles();
  const protectedChangedFiles = changedFiles.filter(isProtectedPublicContractPath);
  const publicRepoWriter = identity?.primary_writer?.public_repo === true;
  const override = process.env.SOULFORGE_ALLOW_PUBLIC_CONTRACT_EDIT === "1";
  const skipped = !identity;
  const errors = [];
  const warnings = [];

  if (skipped) {
    warnings.push({
      id: "node_identity_missing",
      detail: "guild_hall/state/local/node_identity.yaml is missing; role-boundary validation is advisory only.",
    });
  }

  if (!skipped && !publicRepoWriter && protectedChangedFiles.length > 0 && !override) {
    errors.push({
      id: "protected_public_contract_changed_by_non_primary_node",
      node_role: identity.node_role ?? "(missing)",
      public_repo_primary: identity.primary_writer?.public_repo ?? "(missing)",
      files: protectedChangedFiles,
      detail:
        "This node is not the public repo primary writer. Move the change to the public primary PC or set SOULFORGE_ALLOW_PUBLIC_CONTRACT_EDIT=1 only after explicit owner approval.",
    });
  }

  if (!skipped && !publicRepoWriter && protectedChangedFiles.length > 0 && override) {
    warnings.push({
      id: "protected_public_contract_override",
      node_role: identity.node_role ?? "(missing)",
      files: protectedChangedFiles,
      detail: "SOULFORGE_ALLOW_PUBLIC_CONTRACT_EDIT=1 allowed protected public contract edits on a non-primary public repo node.",
    });
  }

  return {
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    ok: errors.length === 0,
    identity_present: Boolean(identity),
    node_id: identity?.node_id ?? null,
    node_role: identity?.node_role ?? null,
    public_repo_primary: identity?.primary_writer?.public_repo ?? null,
    protected_paths: protectedPublicContractPaths,
    changed_files: changedFiles,
    protected_changed_files: protectedChangedFiles,
    errors,
    warnings,
  };
}

async function readIdentity(identityPath) {
  try {
    const raw = await fs.readFile(identityPath, "utf8");
    return YAML.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function listChangedFiles() {
  const branch = hasGitRef("origin/main") ? runGit(["diff", "--name-only", "origin/main...HEAD", "--"]) : [];
  const tracked = runGit(["diff", "--name-only", "HEAD", "--"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...branch, ...tracked, ...untracked].filter(Boolean))].sort();
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`;
    throw new Error(detail);
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasGitRef(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

function isProtectedPublicContractPath(filePath) {
  return protectedPublicContractPaths.some((protectedPath) => {
    if (protectedPath.endsWith("/")) {
      return filePath.startsWith(protectedPath);
    }
    return filePath === protectedPath;
  });
}

function parseArgs(argv) {
  const flags = {};

  for (const token of argv) {
    if (token.startsWith("--")) {
      flags[token.slice(2)] = true;
    }
  }

  return flags;
}

function printHuman(report) {
  const lines = [
    "Soulforge Role Boundary Validate",
    `ok: ${report.ok ? "yes" : "no"}`,
    `identity_present: ${report.identity_present ? "yes" : "no"}`,
    `node_role: ${report.node_role ?? "(unknown)"}`,
    `public_repo_primary: ${String(report.public_repo_primary)}`,
    `protected_changed: ${report.protected_changed_files.length}`,
    `errors: ${report.errors.length}`,
    `warnings: ${report.warnings.length}`,
  ];

  if (report.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of report.errors) {
      lines.push(`- ${error.id}: ${error.detail}`);
      for (const file of error.files ?? []) {
        lines.push(`  - ${file}`);
      }
    }
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.id}: ${warning.detail}`);
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
