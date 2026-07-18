#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "ontology_canon_manifest.json";
const QUERY_VIEW_NAME = "ONTOLOGY_QUERY_VIEW.md";
const ALLOWED_EXTENSIONS = new Set([".csv", ".json", ".md", ".txt", ".yaml", ".yml"]);
const SECRET_FILENAME_RE = /(?:^|[._-])(?:\.env|credentials?|secrets?|tokens?|cookies?|sessions?)(?:[._-]|$)/i;
const WINDOWS_ABSOLUTE_PATH_RE = /\b[A-Za-z]:\\[^\r\n]*/;
const SECRET_ASSIGNMENT_RE = /\b(?:api[_-]?key|password|secret|token|cookie|credential)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+=]{8,}/i;

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

function normalizeRef(value) {
  return String(value).replaceAll("\\", "/");
}

export function digestInventory(inventory) {
  const canonical = [...inventory]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((item) => `${item.path}\t${item.bytes}\t${item.sha256}`)
    .join("\n");
  return sha256Buffer(Buffer.from(canonical, "utf8"));
}

function trackedKnowledgeFiles(repoRoot) {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--", ".registry/knowledge"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean).map(normalizeRef).sort();
}

function assertPublicSafeFile(filePath, repoRelativePath, denyContent = []) {
  const basename = path.basename(filePath);
  if (SECRET_FILENAME_RE.test(basename)) {
    throw new Error(`secret-like filename is not allowed: ${repoRelativePath}`);
  }
  if (!ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error(`unsupported package file type: ${repoRelativePath}`);
  }

  const content = readFileSync(filePath, "utf8");
  if (WINDOWS_ABSOLUTE_PATH_RE.test(content)) {
    throw new Error(`runtime absolute path found: ${repoRelativePath}`);
  }
  if (SECRET_ASSIGNMENT_RE.test(content)) {
    throw new Error(`secret-like assignment found: ${repoRelativePath}`);
  }
  for (const marker of denyContent) {
    if (marker && content.includes(marker)) {
      throw new Error(`blocked content marker ${JSON.stringify(marker)} found: ${repoRelativePath}`);
    }
  }
}

function isExcluded(repoRelativePath, excludePrefixes) {
  return excludePrefixes.some((prefix) => {
    const normalized = normalizeRef(prefix).replace(/\/$/, "");
    return repoRelativePath === normalized || repoRelativePath.startsWith(`${normalized}/`);
  });
}

function packageInventory(packageRoot) {
  const inventory = [];
  const visit = (currentRoot) => {
    for (const entry of readdirSync(currentRoot, { withFileTypes: true })) {
      const absolute = path.join(currentRoot, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      const relative = normalizeRef(path.relative(packageRoot, absolute));
      if (relative === MANIFEST_NAME) {
        continue;
      }
      inventory.push({
        path: relative,
        bytes: statSync(absolute).size,
        sha256: sha256File(absolute),
      });
    }
  };
  visit(packageRoot);
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

function renderQueryView({ releaseId, gitCommit, includedFiles, repoRoot }) {
  const sections = [
    "# Soulforge Ontology Canon Query View",
    "",
    `- Release ID: ${releaseId}`,
    `- Soulforge Git commit: ${gitCommit}`,
    "- Authority: derived query view over the approved ontology canon package",
    "- Claim boundary: NotebookLM answers remain advisory and must trace back to the package files below",
    "",
  ];
  for (const repoRelativePath of includedFiles) {
    sections.push(`## ${repoRelativePath}`, "", "```text");
    sections.push(readFileSync(path.join(repoRoot, repoRelativePath), "utf8").trimEnd());
    sections.push("```", "");
  }
  return `${sections.join("\n")}\n`;
}

export function createPackage(options) {
  const repoRoot = path.resolve(options.repoRoot);
  const packageRoot = path.resolve(options.outputRoot);
  if (existsSync(packageRoot) && readdirSync(packageRoot).length > 0) {
    throw new Error(`output root must be absent or empty: ${packageRoot}`);
  }
  mkdirSync(packageRoot, { recursive: true });

  const tracked = trackedKnowledgeFiles(repoRoot);
  const excluded = tracked.filter((item) => isExcluded(item, options.excludePrefixes ?? []));
  const included = tracked.filter((item) => !excluded.includes(item));
  if (included.length === 0) {
    throw new Error("ontology package would contain no tracked knowledge files");
  }

  for (const repoRelativePath of included) {
    const source = path.join(repoRoot, repoRelativePath);
    assertPublicSafeFile(source, repoRelativePath, options.denyContent ?? []);
    const destination = path.join(packageRoot, "projection", repoRelativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }

  writeFileSync(
    path.join(packageRoot, QUERY_VIEW_NAME),
    renderQueryView({
      releaseId: options.releaseId,
      gitCommit: options.gitCommit,
      includedFiles: included,
      repoRoot,
    }),
    "utf8",
  );

  const inventory = packageInventory(packageRoot);
  const manifest = {
    schema_version: "soulforge.ontology_canon_package.v0",
    release_id: options.releaseId,
    created_at: options.createdAt,
    scope: "Soulforge reusable public-safe knowledge ontology projection",
    source_projection: {
      owner_surface: ".registry/knowledge",
      soulforge_git_commit: options.gitCommit,
      reconciliation_rule: "review_diff_hash_and_impact_before_apply",
    },
    source_refs: [".registry/knowledge", options.ownerDecisionRef],
    approval: {
      status: "owner_approved",
      owner_decision_ref: options.ownerDecisionRef,
      review_status: "pending_post_development_review",
    },
    classification: {
      sensitivity: "public_safe",
      private_raw_secret_included: false,
    },
    notebooklm: {
      status: "pending_connection",
      notebook_id: null,
      notebook_url: null,
      source_membership: [],
    },
    previous_release_id: options.previousReleaseId ?? null,
    supersedes: [],
    recovery: {
      drive_to_soulforge: { status: "pending", verification_ref: null },
      nas_to_soulforge: {
        status: "blocked_owner_target_unconfirmed",
        target_ref: null,
        verification_ref: null,
      },
    },
    inventory,
    exclusions: excluded.map((item) => ({
      path: item,
      reason: "excluded_by_release_boundary",
    })),
    package_digest_sha256: digestInventory(inventory),
  };
  writeFileSync(path.join(packageRoot, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { packageRoot, manifestPath: path.join(packageRoot, MANIFEST_NAME), manifest };
}

function validateRequiredManifestFields(manifest, allowPending) {
  const requiredStrings = [
    ["schema_version", manifest.schema_version],
    ["release_id", manifest.release_id],
    ["created_at", manifest.created_at],
    ["source_projection.soulforge_git_commit", manifest.source_projection?.soulforge_git_commit],
    ["approval.owner_decision_ref", manifest.approval?.owner_decision_ref],
    ["classification.sensitivity", manifest.classification?.sensitivity],
  ];
  for (const [label, value] of requiredStrings) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`missing required manifest field: ${label}`);
    }
  }
  if (!Array.isArray(manifest.inventory) || manifest.inventory.length === 0) {
    throw new Error("manifest inventory must be a non-empty array");
  }
  if (!allowPending) {
    if (manifest.notebooklm?.status !== "connected" || !manifest.notebooklm?.notebook_id) {
      throw new Error("final manifest requires a connected NotebookLM notebook");
    }
    if (!Array.isArray(manifest.notebooklm?.source_membership) || manifest.notebooklm.source_membership.length === 0) {
      throw new Error("final manifest requires NotebookLM source membership");
    }
    if (manifest.recovery?.drive_to_soulforge?.status !== "pass") {
      throw new Error("final manifest requires Drive-to-Soulforge recovery verification");
    }
  }
}

export function verifyPackage(manifestPath, options = {}) {
  const absoluteManifest = path.resolve(manifestPath);
  const packageRoot = path.dirname(absoluteManifest);
  const manifest = JSON.parse(readFileSync(absoluteManifest, "utf8"));
  validateRequiredManifestFields(manifest, options.allowPending ?? false);

  const seen = new Set();
  for (const item of manifest.inventory) {
    if (!item.path || seen.has(item.path) || path.isAbsolute(item.path) || item.path.includes("..")) {
      throw new Error(`invalid or duplicate inventory path: ${item.path}`);
    }
    seen.add(item.path);
    const absolute = path.join(packageRoot, item.path);
    if (!existsSync(absolute)) {
      throw new Error(`missing package file: ${item.path}`);
    }
    const bytes = statSync(absolute).size;
    const hash = sha256File(absolute);
    if (bytes !== item.bytes || hash !== item.sha256) {
      throw new Error(`inventory mismatch: ${item.path}`);
    }
  }

  const actualDigest = digestInventory(manifest.inventory);
  if (actualDigest !== manifest.package_digest_sha256) {
    throw new Error("package digest mismatch");
  }
  return {
    status: "pass",
    release_id: manifest.release_id,
    inventory_count: manifest.inventory.length,
    package_digest_sha256: actualDigest,
  };
}

export function restoreAndVerify(manifestPath, restoreRoot, options = {}) {
  const sourceRoot = path.dirname(path.resolve(manifestPath));
  const destination = path.resolve(restoreRoot);
  if (existsSync(destination)) {
    throw new Error(`restore root must not already exist: ${destination}`);
  }
  mkdirSync(destination, { recursive: true });
  cpSync(sourceRoot, destination, { recursive: true, force: false, errorOnExist: true });
  const result = verifyPackage(path.join(destination, MANIFEST_NAME), options);
  return { ...result, restored_to: destination };
}

function parseArgs(argv) {
  const values = { excludePrefixes: [], denyContent: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (!values.command) values.command = token;
      continue;
    }
    const key = token.slice(2);
    if (key === "allow-pending") {
      values.allowPending = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`missing value for --${key}`);
    index += 1;
    if (key === "exclude-prefix") values.excludePrefixes.push(value);
    else if (key === "deny-content") values.denyContent.push(value);
    else values[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return values;
}

function requireArgs(values, keys) {
  for (const key of keys) {
    if (!values[key]) throw new Error(`missing required argument: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
}

function main() {
  const values = parseArgs(process.argv.slice(2));
  let result;
  if (values.command === "create") {
    requireArgs(values, ["repoRoot", "outputRoot", "releaseId", "gitCommit", "createdAt", "ownerDecisionRef"]);
    result = createPackage(values);
  } else if (values.command === "verify") {
    requireArgs(values, ["manifest"]);
    result = verifyPackage(values.manifest, { allowPending: values.allowPending });
  } else if (values.command === "restore-verify") {
    requireArgs(values, ["manifest", "restoreRoot"]);
    result = restoreAndVerify(values.manifest, values.restoreRoot, { allowPending: values.allowPending });
  } else {
    throw new Error("usage: ontology_canon_package.mjs <create|verify|restore-verify> [options]");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
