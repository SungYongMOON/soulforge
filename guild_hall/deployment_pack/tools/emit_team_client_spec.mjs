// Emits packs/team_client_pack.spec.json from the live team-ops-board tree:
// enumerates the packed file set deterministically and re-pins the
// content-scan review ledger (path + current sha256 for every file whose
// content hits the secret regex). Run it after reviewing that the hits are
// identifiers/synthetic fixtures only — emitting the spec IS recording that
// review, so never run it blind.
//
//   node guild_hall/deployment_pack/tools/emit_team_client_spec.mjs [--check]
//
// --check: recompute and diff against the tracked spec; exit 1 on drift.
//
// Pack shape (a SOURCE pack): the Board's runnable .mjs graph (core/server/
// scripts/ops plus the guild_hall shared modules it imports cross-root),
// the full UI source tree (tsx/css/assets — the boundary tests fs-read
// App.tsx, so the ui role is also the data closure), the launcher helper,
// docs, manifests, and the validators. The suite is plain `node --test`
// (no vite, no bare npm imports in the runnable graph), so the installed
// smoke can run the FULL suite; building the UI itself needs `npm install`
// and belongs to the package/sbom gates, which this spec does not claim.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECRET_MATERIAL } from "./build_pack.mjs";
import { listFiles as libListFiles, listFilesRecursive as libListFilesRecursive, moduleClosure as libModuleClosure } from "./spec_closure_lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP = "ui-workspace/apps/team-ops-board";
const SPEC_PATH = join(ROOT, "guild_hall", "deployment_pack", "packs", "team_client_pack.spec.json");

const listFiles = (relDir, suffix) => libListFiles(ROOT, relDir, suffix);
const listFilesRecursive = (relDir) => libListFilesRecursive(ROOT, relDir);
const moduleClosure = (entryRelPaths) => libModuleClosure(ROOT, entryRelPaths);

const entrypoints = [
  ...listFiles(`${APP}/src/core`, ".mjs"),
  ...listFiles(`${APP}/src/server`, ".mjs"),
  ...listFiles(`${APP}/src/scripts`, ".mjs"),
  ...listFiles(`${APP}/ops`, ".mjs"),
];
const closure = moduleClosure(entrypoints);
const inApp = (rel) => rel.startsWith(`${APP}/`);
const isTest = (rel) => /\.test\.mjs$/.test(rel);

const validators = closure.filter((rel) => inApp(rel) && isTest(rel));
// FULL-suite guard: every *.test.mjs anywhere under the app must be a
// declared validator — a future test in a NESTED src subdirectory would
// otherwise drift into the ui role and silently rot the "installed smoke
// = full suite" property (review finding; fail loudly instead).
const allAppTests = [
  ...libListFilesRecursive(ROOT, `${APP}/src`).filter((rel) => isTest(rel)),
  ...listFiles(`${APP}/ops`, ".test.mjs"),
].sort();
const declaredTests = new Set(validators);
const undeclaredTests = allAppTests.filter((rel) => !declaredTests.has(rel));
if (undeclaredTests.length > 0) {
  process.stderr.write(`test files outside the smoke closure (add their dir to the entrypoints): ${undeclaredTests.join(", ")}\n`);
  process.exit(1);
}
// fs-READ data closure the import walker cannot see: the topology view
// tests load the tracked federation oracle artifacts (the L-RED-02 single
// topology pin) from their fixed repo-relative path.
const sharedDataReads = [
  "guild_hall/watchtower/topology/federated_topology.v1.json",
  "guild_hall/watchtower/topology/federated_topology.v1.contract.json",
].filter((rel) => existsSync(join(ROOT, ...rel.split("/"))));
const sharedModules = [...new Set([...closure.filter((rel) => !inApp(rel)), ...sharedDataReads])].sort();
const appRunnable = closure.filter((rel) => inApp(rel) && !isTest(rel));

// ui = the whole src tree (minus what the runnable/validator roles already
// carry — roles must be DISJOINT for the builder) plus the app shell files.
const claimed = new Set([...validators, ...appRunnable]);
const uiFiles = [
  ...listFilesRecursive(`${APP}/src`).filter((rel) => !claimed.has(rel)),
  `${APP}/index.html`,
  `${APP}/vite.config.ts`,
  `${APP}/tsconfig.json`,
].sort();

const contentRoles = {
  ui: [...new Set([...uiFiles, ...appRunnable.filter((rel) => rel.startsWith(`${APP}/src/`))])].sort(),
  shared_modules: sharedModules,
  local_helper_outbox: [
    ...appRunnable.filter((rel) => rel.startsWith(`${APP}/ops/`)),
    `${APP}/ops/team-ops-board-hidden-launcher.vbs`,
  ].sort(),
  learning_material: [`${APP}/README.md`, `${APP}/design-qa.md`],
  manifests: [`${APP}/package.json`, `${APP}/module.manifest.json`],
  validators,
};

// Installed-copy smoke exclusion ledger — starts EMPTY; any exclusion must
// carry an evidence-backed reason and survives loader partition checks.
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
  pack_id: "team_client_pack",
  version: "0.1.0",
  content_roles: contentRoles,
  // The Board suite assumes its app directory as cwd; entries are explicit
  // files relative to it (node --test does not discover positional dirs).
  test_cwd: APP,
  // Port/adapter fixtures are engineered for bounded parallelism; wide
  // per-CPU defaults collide them (the dev-erp lesson, applied here).
  test_concurrency: 4,
  smoke_test_entries: validators.map((entry) => entry.replace(`${APP}/`, "")),
  installed_smoke_entries: validators
    .map((entry) => entry.replace(`${APP}/`, ""))
    .filter((entry) => !INSTALLED_SMOKE_EXCLUDED.some((exclusion) => exclusion.path === entry)),
  installed_smoke_excluded: INSTALLED_SMOKE_EXCLUDED,
  release_notes_ref: "release_notes.team_client_pack.v0_1_0",
  install_manual_ref: "manual.install.team_client_pack",
  upgrade_manual_ref: "manual.upgrade.team_client_pack",
  rollback_manual_ref: "manual.rollback.team_client_pack",
  support_owner_ref: "owner.platform_support",
  secret_refs: [],
  content_scan_reviewed_files: reviewed,
};

const emitted = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const tracked = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
  if (tracked !== emitted) {
    process.stderr.write("team_client_pack.spec.json drifts from the live tree (file set or scan pins). Re-review and re-emit.\n");
    process.exit(1);
  }
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`spec check ok: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
} else {
  writeFileSync(SPEC_PATH, emitted);
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`emitted ${SPEC_PATH}: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
}
