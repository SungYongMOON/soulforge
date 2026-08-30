// Emits packs/backup_recovery_extension.spec.json from the live
// guild_hall/backup_controller tree: enumerates the packed file set
// deterministically and re-pins the content-scan review ledger. Run it
// after reviewing that the hits are identifiers/synthetic fixtures only —
// emitting the spec IS recording that review, so never run it blind.
//
//   node guild_hall/deployment_pack/tools/emit_backup_recovery_spec.mjs [--check]
//
// Pack shape: the backup_controller module (recovery policy adapter code +
// schemas + README + its freshly enrolled manifest), the cross-root
// modules its closure imports (shared_modules), and its full test suite as
// validators. Everything here is feature-OFF composition code — packing it
// activates nothing, and the initial gate ("capture + isolated restore +
// human restore acceptance") is NOT claimed by this spec.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECRET_MATERIAL } from "./build_pack.mjs";
import { listFiles as libListFiles, listFilesRecursive as libListFilesRecursive, moduleClosure as libModuleClosure } from "./spec_closure_lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MODULE = "guild_hall/backup_controller";
const SPEC_PATH = join(ROOT, "guild_hall", "deployment_pack", "packs", "backup_recovery_extension.spec.json");

const listFiles = (relDir, suffix) => libListFiles(ROOT, relDir, suffix);
const moduleClosure = (entryRelPaths) => libModuleClosure(ROOT, entryRelPaths);

const entrypoints = listFiles(MODULE, ".mjs");
const closure = moduleClosure(entrypoints);
const inModule = (rel) => rel.startsWith(`${MODULE}/`);
const isTest = (rel) => /\.test\.mjs$/.test(rel);

const validators = closure.filter((rel) => inModule(rel) && isTest(rel));
// FULL-suite guard (the team_client lesson): every module test must be a
// declared validator.
const allTests = libListFilesRecursive(ROOT, MODULE).filter((rel) => isTest(rel)).sort();
const declaredTests = new Set(validators);
const undeclared = allTests.filter((rel) => !declaredTests.has(rel));
if (undeclared.length > 0) {
  process.stderr.write(`test files outside the smoke closure: ${undeclared.join(", ")}\n`);
  process.exit(1);
}
const sharedModules = closure.filter((rel) => !inModule(rel));
const moduleRunnable = closure.filter((rel) => inModule(rel) && !isTest(rel));
const adapterFiles = [...new Set([
  ...moduleRunnable,
  // Non-mjs module files the import walker cannot see: schemas, docs, and
  // the Windows task bridge ps1 that writer_quiesce references as an
  // INSTALLED SIBLING (review finding: it must travel, or the installed
  // default adapter path dangles).
  ...libListFilesRecursive(ROOT, MODULE).filter((rel) => /\.(schema\.json|md|json|ps1|vbs|bat)$/.test(rel) && !rel.endsWith("module.manifest.json")),
])].sort();

const contentRoles = {
  recovery_policy_adapter: adapterFiles,
  shared_modules: sharedModules,
  manifests: [`${MODULE}/module.manifest.json`],
  validators,
};

// COVERAGE guard (review finding): every tracked file in the module dir
// must land in exactly one role or in this explicit exclusion ledger — a
// future file of an unswept extension fails loudly instead of silently
// falling out of the pack.
const EXCLUDED_MODULE_FILES = [];
const packedSet = new Set(Object.values(contentRoles).flat());
const unpacked = libListFilesRecursive(ROOT, MODULE)
  .filter((rel) => !packedSet.has(rel) && !EXCLUDED_MODULE_FILES.includes(rel));
if (unpacked.length > 0) {
  process.stderr.write(`module files silently outside the pack (add a role sweep or an explicit exclusion): ${unpacked.join(", ")}\n`);
  process.exit(1);
}

const INSTALLED_SMOKE_EXCLUDED = [];

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
  pack_id: "backup_recovery_extension",
  version: "0.1.0",
  content_roles: contentRoles,
  // Tests run from the repo root (they resolve module files via their own
  // import.meta paths); bounded parallelism as everywhere.
  test_concurrency: 4,
  smoke_test_entries: validators,
  installed_smoke_entries: validators
    .filter((entry) => !INSTALLED_SMOKE_EXCLUDED.some((exclusion) => exclusion.path === entry)),
  installed_smoke_excluded: INSTALLED_SMOKE_EXCLUDED,
  release_notes_ref: "release_notes.backup_recovery_extension.v0_1_0",
  install_manual_ref: "manual.install.backup_recovery_extension",
  upgrade_manual_ref: "manual.upgrade.backup_recovery_extension",
  rollback_manual_ref: "manual.rollback.backup_recovery_extension",
  support_owner_ref: "owner.platform_support",
  secret_refs: [],
  content_scan_reviewed_files: reviewed,
};

const emitted = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const tracked = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
  if (tracked !== emitted) {
    process.stderr.write("backup_recovery_extension.spec.json drifts from the live tree (file set or scan pins). Re-review and re-emit.\n");
    process.exit(1);
  }
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`spec check ok: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
} else {
  writeFileSync(SPEC_PATH, emitted);
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`emitted ${SPEC_PATH}: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
}
