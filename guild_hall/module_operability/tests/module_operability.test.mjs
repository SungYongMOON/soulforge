import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MANIFEST_FIELDS, computeModuleReleaseDigest, validateModuleManifest } from "../src/manifest_schema.mjs";
import { checkDeclaredDependencies } from "../src/dependency_check.mjs";
import { findImportCycles } from "../src/import_cycle_check.mjs";
import { discoverManifestPaths, listUnenrolledGuildHallDirs, runPreflight } from "../tools/operability_preflight.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function loadManifest(relPath) {
  return JSON.parse(readFileSync(join(ROOT, ...relPath.split("/")), "utf8"));
}

function syntheticManifest(overrides = {}) {
  const base = {};
  for (const field of MANIFEST_FIELDS) base[field] = null;
  return {
    ...base,
    schema_version: "soulforge.module_manifest.v0",
    module_id: "demo_module",
    module_version: "0.1.0",
    interface_version: "demo.v0",
    schema_versions: ["demo.schema.v0"],
    owner: "guild_hall/demo",
    capabilities_provided: ["demo.capability.v0"],
    capabilities_required: [],
    required_dependencies: [],
    optional_dependencies: [],
    compatible_version_ranges: { node: ">=20" },
    default_state: "contract_only_no_runtime",
    config_refs: [],
    secret_refs: [],
    data_owner: "none_tracked_source_only",
    backup_class: "versioned_source",
    rollback_version: "git_revert_of_this_module_only",
    validators: ["node --test guild_hall/demo/tests/demo.test.mjs"],
    deprecation_state: "active_draft",
    authority_notes: "Synthetic manifest for schema tests; grants nothing and owns nothing.",
    ...overrides,
  };
}

test("every enrolled real manifest passes the completeness schema, and the discovery set is the declared nine", () => {
  const paths = discoverManifestPaths();
  assert.equal(paths.length, 9, paths.join(","));
  assert.equal(paths.includes("ui-workspace/apps/team-ops-board/module.manifest.json"), true, "the Board is enrolled");
  for (const relPath of paths) {
    const verdict = validateModuleManifest(loadManifest(relPath));
    assert.deepEqual(verdict.problems, [], relPath);
  }
});

test("manifest schema fails closed: missing/unknown fields, bad semver, runtime state without probes, stale digest", () => {
  assert.equal(validateModuleManifest(null).ok, false);
  const missing = syntheticManifest();
  delete missing.rollback_version;
  assert.equal(validateModuleManifest(missing).problems.includes("field_missing_rollback_version"), true);
  assert.equal(validateModuleManifest(syntheticManifest({ surprise: 1 })).problems.includes("field_unknown_surprise"), true);
  assert.equal(validateModuleManifest(syntheticManifest({ module_version: "1.0" })).problems.includes("module_version_not_semver"), true);
  assert.equal(validateModuleManifest(syntheticManifest({ validators: [] })).problems.includes("validators_missing_or_empty"), true);
  // Runtime-ish default_state demands declared probes; synthetic/contract states do not.
  const runtime = syntheticManifest({ default_state: "live_collector_service" });
  assert.equal(validateModuleManifest(runtime).problems.includes("runtime_state_requires_probes"), true);
  assert.equal(validateModuleManifest(syntheticManifest({ default_state: "in_memory_synthetic_only" })).ok, true);
  // A stamped release digest that no longer matches the sources is stale.
  const stale = syntheticManifest({ release_digest: "a".repeat(64) });
  assert.equal(validateModuleManifest(stale, { computedReleaseDigest: "b".repeat(64) }).problems.includes("release_digest_stale"), true);
  assert.equal(validateModuleManifest(stale, { computedReleaseDigest: "a".repeat(64) }).ok, true);
  assert.equal(validateModuleManifest(syntheticManifest({ release_digest: "not-hex" })).problems.includes("release_digest_invalid"), true);
});

test("declared dependencies resolve: the Board requires the watch contract, ports are exempt, ambiguity fails", () => {
  const real = discoverManifestPaths().map(loadManifest);
  const verdict = checkDeclaredDependencies(real);
  assert.deepEqual(verdict.problems, []);
  const board = real.find((manifest) => manifest.module_id === "team_ops_board");
  assert.equal(board.capabilities_required.includes("watch.coarse_panel_contract.v0"), true, "Board→Watch is explicit data");
  assert.equal(board.required_dependencies.includes("watch_panel_contract"), true);
  // Unprovided capability fails; caller-injected ports are exempt by the port: convention.
  const broken = checkDeclaredDependencies([
    syntheticManifest({ module_id: "a", capabilities_required: ["ghost.capability.v0", "port:executor"] }),
  ]);
  assert.deepEqual(broken.problems, ["capability_unprovided:a:ghost.capability.v0"]);
  // Two providers of one capability is ambiguous.
  const ambiguous = checkDeclaredDependencies([
    syntheticManifest({ module_id: "a" }),
    syntheticManifest({ module_id: "b" }),
  ]);
  assert.equal(ambiguous.problems.some((code) => code.startsWith("capability_provider_ambiguous:demo.capability.v0")), true);
});

test("the repo import graph has ZERO cycles (pins the pcb_compliance evaluator/adapter cut), and the detector catches A<->B", () => {
  const repo = findImportCycles(ROOT, ["guild_hall", "ui-workspace/apps/team-ops-board/src"]);
  assert.deepEqual(repo.cycles, [], "an import cycle regressed into the scanned roots");
  assert.equal(repo.moduleCount > 1000, true);
  // Synthetic A<->B: one leg export-from, one leg a BARE side-effect import
  // (the two forms naive walkers miss - both bit this repo's tools).
  const dir = mkdtempSync(join(tmpdir(), "soulforge-cycle-"));
  mkdirSync(join(dir, "mod"));
  writeFileSync(join(dir, "mod", "a.mjs"), "export { b } from \"./b.mjs\";\nexport const a = 1;\n");
  writeFileSync(join(dir, "mod", "b.mjs"), "import \"./a.mjs\";\nexport const b = 1;\n");
  const synthetic = findImportCycles(dir, ["mod"]);
  assert.equal(synthetic.cycles.length, 1);
  assert.equal(synthetic.cycles[0].join(",").includes("mod/a.mjs"), true);
  assert.equal(synthetic.cycles[0].join(",").includes("mod/b.mjs"), true);
});

test("release digest is deterministic, manifest-exclusive, and content-sensitive", () => {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-digest-"));
  writeFileSync(join(dir, "core.mjs"), "export const x = 1;\n");
  writeFileSync(join(dir, "module.manifest.json"), "{}");
  const first = computeModuleReleaseDigest(dir);
  const second = computeModuleReleaseDigest(dir);
  assert.equal(first, second);
  // Stamping the manifest must not invalidate the digest it stamps.
  writeFileSync(join(dir, "module.manifest.json"), JSON.stringify({ release_digest: first }));
  assert.equal(computeModuleReleaseDigest(dir), first, "the manifest is excluded from its own digest");
  writeFileSync(join(dir, "core.mjs"), "export const x = 2;\n");
  assert.notEqual(computeModuleReleaseDigest(dir), first, "source edits change the digest");
});

test("the aggregate preflight is green on the current repository", () => {
  const receipt = runPreflight();
  assert.deepEqual(receipt.problems, []);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.manifest_count, 9);
  assert.equal(receipt.scanned_modules > 1000, true);
  // Absence is visible, not silent: unenrolled legacy guild_hall modules are
  // counted in the receipt (enrolling them is deliberate follow-on work).
  assert.equal(receipt.unenrolled_guild_hall_dirs > 10, true);
  assert.equal(listUnenrolledGuildHallDirs().includes("guild_hall/module_operability"), false, "the gate module is enrolled under its own gate");
});
