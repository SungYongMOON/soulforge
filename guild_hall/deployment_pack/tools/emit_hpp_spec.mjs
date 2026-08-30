// Emits packs/hpp_server_pack.spec.json from the live dev-erp tree:
// enumerates the packed file set deterministically and re-pins the
// content-scan review ledger (path + current sha256 for every file whose
// content hits the secret regex). Run it after reviewing that the hits are
// identifiers/synthetic fixtures only — emitting the spec IS recording that
// review, so never run it blind.
//
//   node guild_hall/deployment_pack/tools/emit_hpp_spec.mjs [--check]
//
// --check: recompute and diff against the tracked spec; exit 1 on drift.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECRET_MATERIAL } from "./build_pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP = "ui-workspace/apps/dev-erp";
const SPEC_PATH = join(ROOT, "guild_hall", "deployment_pack", "packs", "hpp_server_pack.spec.json");

function listFiles(relDir, suffix) {
  const absolute = join(ROOT, ...relDir.split("/"));
  return readdirSync(absolute)
    .filter((name) => statSync(join(absolute, name)).isFile() && name.endsWith(suffix))
    .map((name) => `${relDir}/${name}`)
    .sort();
}

function listFilesRecursive(relDir) {
  const absolute = join(ROOT, ...relDir.split("/"));
  const out = [];
  for (const name of readdirSync(absolute)) {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) out.push(...listFilesRecursive(`${relDir}/${name}`));
    else out.push(`${relDir}/${name}`);
  }
  return out.sort();
}

// Relative-import closure walker: the server is NOT self-contained inside
// its app directory — src/tests/tools import guild_hall shared modules —
// so the packed file set is the ACTUAL module graph, computed, not assumed.
// Regex-based specifier extraction is adequate for this codebase's plain
// static/dynamic import style; only RELATIVE specifiers are followed
// (node: builtins and bare names have no files to pack).
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.\.?\/[^"']+)["']/g;

function toPosix(relPath) {
  return relPath.split("\\").join("/");
}

function moduleClosure(entryRelPaths) {
  const visited = new Set();
  const queue = [...entryRelPaths];
  while (queue.length > 0) {
    const rel = toPosix(queue.pop());
    if (visited.has(rel)) continue;
    visited.add(rel);
    if (!/\.(mjs|cjs|js)$/.test(rel)) continue;
    const source = readFileSync(join(ROOT, ...rel.split("/")), "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = toPosix(
        join(dirname(rel), match[1]).split("\\").join("/"),
      );
      const absolute = join(ROOT, ...resolved.split("/"));
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return [...visited].sort();
}

const appEntrypoints = [
  `${APP}/server.mjs`,
  ...listFiles(`${APP}/src`, ".mjs"),
  ...listFiles(`${APP}/src`, ".cjs"),
  ...listFiles(`${APP}/tools`, ".mjs"),
  ...listFiles(`${APP}/test`, ".test.mjs"),
];
const closure = moduleClosure(appEntrypoints);
const appCode = closure.filter((rel) => rel.startsWith(`${APP}/`) && !rel.startsWith(`${APP}/test/`));
const sharedCode = closure.filter((rel) => !rel.startsWith(`${APP}/`));

// fs-READ data closure: files the packed code and validators read at
// runtime that the import walker cannot see. Enumerated explicitly — the
// first two smoke rounds in a clean installed copy taught that both the
// module closure AND the data closure must travel with the pack.
// Vendored npm closure: the suite's bare specifiers (yaml; ajv/dist/2020)
// plus ajv's runtime dependencies, packed under node_modules/ at the PAYLOAD
// ROOT so both guild_hall and ui-workspace consumers resolve them without
// escaping the installed copy. Exact files, hash-pinned like everything
// else; scan-regex hits inside vendored files are third-party npm artifacts
// (upstream-published, hash-pinned), not project secrets. package-lock keeps
// the local node_modules bytes reproducible; the per-file sha256 map below makes
// --check byte-exact for vendored content (node_modules is git-ignored,
// so these hashes are its only byte pin).
const VENDORED_PACKAGE_ROOTS = [
  "node_modules/yaml",
  "node_modules/ajv",
  "node_modules/fast-deep-equal",
  "node_modules/fast-uri",
  "node_modules/json-schema-traverse",
  "node_modules/require-from-string",
];
const VENDOR_JUNK_DIRS = new Set([".github", ".vscode", "test", "tests", "docs", "examples", "benchmark", "spec", "browser"]);

function listVendoredFiles(relRoot) {
  const absolute = join(ROOT, ...relRoot.split("/"));
  const out = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (VENDOR_JUNK_DIRS.has(name)) continue;
      const child = join(dir, name);
      if (statSync(child).isDirectory()) walk(child, `${prefix}/${name}`);
      else out.push(`${prefix}/${name}`);
    }
  };
  walk(absolute, relRoot);
  return out.sort();
}

const vendoredFiles = VENDORED_PACKAGE_ROOTS.flatMap(listVendoredFiles);
// Per-file sha256 for every vendored file: node_modules is git-ignored, so
// these hashes are the ONLY byte pin vendored content has — with them the
// --check re-emit is byte-exact for vendored files too (a hand-edited or
// corrupted vendored file at unchanged version fails --check instead of
// flowing silently into a new pack digest). This is the substantive
// sbom-precursor step, not just metadata.
const vendoredFileHashes = Object.fromEntries(vendoredFiles.map((rel) => [
  rel, createHash("sha256").update(readFileSync(join(ROOT, ...rel.split("/")))).digest("hex"),
]));
const vendoredPackages = VENDORED_PACKAGE_ROOTS.map((relRoot) => {
  const meta = JSON.parse(readFileSync(join(ROOT, ...relRoot.split("/"), "package.json"), "utf8"));
  return { name: meta.name, version: meta.version, license: meta.license ?? "UNKNOWN", root: relRoot };
});

const dataReads = [
  ...listFiles(`${APP}/docs/contracts`, ".schema.json"),
  `${APP}/manual/manual_faq.json`,
  `${APP}/tools/project_history_copy_windows_path_lock.ps1`,
  `${APP}/ops/register-dev-erp-scheduled-task.ps1`,
  `${APP}/.gitignore`,
  `${APP}/docs/checklist_phase1.json`,
  "docs/architecture/workspace/examples/task_execution_core_poc/task_execution_core.synthetic.json",
  `${APP}/docs/CHATBOT_LLM_SETUP.md`,
  `${APP}/docs/REMOTE_PC_RUNBOOK.md`,
  `${APP}/docs/RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`,
  `${APP}/docs/RUNTIME_OPERATING_CONTRACT_20260617.md`,
  `${APP}/start-tailscale-windows.bat`,
  // Party monster-type reverse index: the server loads the canonical
  // .party/*/party.yaml roster from the repo root.
  ...readdirSync(join(ROOT, ".party")).map((name) => `.party/${name}/party.yaml`),
].filter((rel) => existsSync(join(ROOT, ...rel.split("/"))));

// Installed-copy smoke exclusion ledger — EMPTY as of the git-free
// attestation leaf: the dedicated worker now falls back to pack-manifest
// source identity (full boot-verify against the delivered manifest,
// pack_digest as the 64-hex source identity), so the last two
// git-checkout-bound tests run in a clean installed copy. The ledger and
// its partition rule stay in force for any future exclusion.
const INSTALLED_SMOKE_EXCLUDED = [];

const contentRoles = {
  // Server code plus the cross-root guild_hall modules it actually imports,
  // the static assets the server serves (validators read them too), and the
  // fs-read data closure above.
  server_modules: [...new Set([...appCode, ...sharedCode, ...listFilesRecursive(`${APP}/static`), ...dataReads])].sort(),
  control_data_plane_services: [
    "ui-workspace/apps/dev-erp/ops/run-dev-erp-background.ps1",
    "ui-workspace/apps/dev-erp/ops/dev-erp-watchdog.ps1",
    "ui-workspace/apps/dev-erp/ops/install-dev-erp-nssm.ps1",
    "ui-workspace/apps/dev-erp/ops/configure-dev-erp-codex-nssm.ps1",
    "ui-workspace/apps/dev-erp/start-windows.bat",
  ],
  manifests: ["ui-workspace/apps/dev-erp/package.json"],
  operator_docs: [
    "ui-workspace/apps/dev-erp/README.md",
    // The verify gate's docs_present check demands these two.
    "ui-workspace/apps/dev-erp/docs/DESIGN.md",
    "ui-workspace/apps/dev-erp/docs/BROWSER_QA_PROCEDURE.md",
  ],
  validators: listFiles(`${APP}/test`, ".test.mjs"),
  vendored_dependencies: vendoredFiles,
};

const reviewed = [];
for (const rolePaths of Object.values(contentRoles)) {
  for (const relPath of rolePaths) {
    const bytes = readFileSync(join(ROOT, ...relPath.split("/")));
    if (SECRET_MATERIAL.test(bytes.toString("utf8"))) {
      reviewed.push({ path: relPath, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
reviewed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const spec = {
  schema: "soulforge.deployment_pack_spec.v0",
  pack_id: "hpp_server_pack",
  version: "0.1.0",
  content_roles: contentRoles,
  // dev-erp's suite assumes its app directory as cwd; entries are explicit
  // files relative to it (node --test does not discover positional dirs).
  test_cwd: "ui-workspace/apps/dev-erp",
  // dev-erp's suite is engineered for --test-concurrency=4 (its own npm
  // test); wider per-CPU defaults collide its port/db fixtures.
  test_concurrency: 4,
  smoke_test_entries: contentRoles.validators.map((entry) => entry.replace("ui-workspace/apps/dev-erp/", "")),
  installed_smoke_entries: contentRoles.validators
    .map((entry) => entry.replace("ui-workspace/apps/dev-erp/", ""))
    .filter((entry) => !INSTALLED_SMOKE_EXCLUDED.some((exclusion) => exclusion.path === entry)),
  installed_smoke_excluded: INSTALLED_SMOKE_EXCLUDED,
  release_notes_ref: "release_notes.hpp_server_pack.v0_1_0",
  install_manual_ref: "manual.install.hpp_server_pack",
  upgrade_manual_ref: "manual.upgrade.hpp_server_pack",
  rollback_manual_ref: "manual.rollback.hpp_server_pack",
  support_owner_ref: "owner.platform_support",
  secret_refs: [],
  vendored_packages: vendoredPackages,
  vendored_file_sha256: vendoredFileHashes,
  content_scan_reviewed_files: reviewed,
};

const emitted = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const tracked = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
  if (tracked !== emitted) {
    process.stderr.write("hpp_server_pack.spec.json drifts from the live tree (file set or scan pins). Re-review and re-emit.\n");
    process.exit(1);
  }
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`spec check ok: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
} else {
  writeFileSync(SPEC_PATH, emitted);
  process.stdout.write(`emitted ${SPEC_PATH}: ${reviewed.length} reviewed pins\n`);
}
