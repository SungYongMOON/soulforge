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
const dataReads = [
  ...listFiles(`${APP}/docs/contracts`, ".schema.json"),
  `${APP}/manual/manual_faq.json`,
  `${APP}/tools/project_history_copy_windows_path_lock.ps1`,
  `${APP}/ops/register-dev-erp-scheduled-task.ps1`,
  `${APP}/.gitignore`,
  `${APP}/docs/checklist_phase1.json`,
  "docs/architecture/workspace/examples/task_execution_core_poc/task_execution_core.synthetic.json",
].filter((rel) => existsSync(join(ROOT, ...rel.split("/"))));

// Installed-copy smoke exclusion ledger — every entry is EVIDENCE-BACKED
// (each file was run in a clean installed copy and its failure reason
// verified). Three structural gaps keep these dev-checkout-bound until
// their own leaves land:
//   npm deps: the pack ships no node_modules and dev-erp's manifest
//     declares none — ajv/yaml resolve from parent node_modules only in a
//     dev checkout (dependency delivery = package/sbom gate territory).
//   git: the dedicated worker attests its source state via git
//     (worker_source_commit_unavailable in a git-less copy).
const INSTALLED_SMOKE_EXCLUDED = [
  { path: "test/a8_synth_secure_access.test.mjs", reason: "npm_dependency_ajv_not_shipped" },
  { path: "test/task_engine_inventory.test.mjs", reason: "npm_dependency_ajv_not_shipped" },
  { path: "test/task_engine_inventory_c00b_binding_producer.test.mjs", reason: "npm_dependency_ajv_not_shipped" },
  { path: "test/task_engine_inventory_c00b_judge.test.mjs", reason: "npm_dependency_ajv_not_shipped" },
  { path: "test/adapter_snapshot.test.mjs", reason: "npm_dependency_yaml_not_shipped" },
  { path: "test/codex_payload_backup.test.mjs", reason: "npm_dependency_yaml_not_shipped" },
  { path: "test/core.test.mjs", reason: "npm_dependency_yaml_not_shipped" },
  { path: "test/mail_project_route_backfill.test.mjs", reason: "npm_dependency_yaml_not_shipped" },
  { path: "test/runtime_release_audit_worker.test.mjs", reason: "npm_dependency_yaml_not_shipped" },
  { path: "test/codex_dedicated_worker.test.mjs", reason: "requires_git_checkout_source_attestation" },
  { path: "test/codex_worker_server_integration.test.mjs", reason: "requires_git_checkout_source_attestation" },
];

const contentRoles = {
  // Server code plus the cross-root guild_hall modules it actually imports,
  // the static assets the server serves (validators read them too), and the
  // fs-read data closure above.
  server_modules: [...new Set([...appCode, ...sharedCode, ...listFilesRecursive(`${APP}/static`), ...dataReads])].sort(),
  control_data_plane_services: [
    "ui-workspace/apps/dev-erp/ops/run-dev-erp-background.ps1",
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
