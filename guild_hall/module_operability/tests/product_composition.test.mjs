import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  isRepoRelativeRef,
  validateProductManifest,
  validateProductModuleClassificationCatalog,
} from "../src/product_manifest_schema.mjs";
import {
  OWNED_MODULE_IDS_BY_PRODUCT,
  ROOT,
  discoverProductModuleManifestRefs,
  inspectAgentPlatformCompositionOnly,
  loadProductCompositionInputs,
  validateProductComposition,
} from "../src/product_composition_check.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(TEST_DIR, "..", "tools", "product_preflight.mjs");

function clone(value) {
  return structuredClone(value);
}

function rowFor(catalog, moduleId) {
  const row = catalog.modules.find((candidate) => candidate.module_id === moduleId);
  assert.ok(row, `missing catalog row for ${moduleId}`);
  return row;
}

function loaded() {
  return loadProductCompositionInputs(ROOT);
}

function validateWith(loadedInputs, catalog = loadedInputs.catalog, productManifestRecords = loadedInputs.productManifestRecords) {
  return validateProductComposition({
    root: ROOT,
    moduleRecords: loadedInputs.moduleRecords,
    productManifestRecords,
    catalog,
    loadProblems: [],
  });
}

test("the no-move catalog exactly classifies the dynamically discovered enrolled Module set", () => {
  const inputs = loaded();
  const receipt = validateWith(inputs);
  assert.equal(receipt.ok, true, receipt.problems.join("\n"));
  assert.equal(receipt.product_count, 3);
  assert.equal(receipt.module_count, discoverProductModuleManifestRefs(ROOT).length);
  assert.equal(inputs.catalog.modules.length, receipt.module_count);
  assert.equal(receipt.shared_module_count, receipt.module_count - 8);
  assert.equal(receipt.unresolved_interface_count, 0);
  assert.deepEqual(inspectAgentPlatformCompositionOnly(ROOT), []);

  for (const [productId, moduleIds] of Object.entries(OWNED_MODULE_IDS_BY_PRODUCT)) {
    for (const moduleId of moduleIds) {
      const row = rowFor(inputs.catalog, moduleId);
      assert.equal(row.classification, "product_owned", moduleId);
      assert.equal(row.product_id, productId, moduleId);
    }
  }
  // The OD-11 contract was added concurrently.  It is dynamically discovered,
  // explicitly cataloged, and Shared rather than inferred as an Agent product
  // implementation merely because it concerns authority.
  const authority = rowFor(inputs.catalog, "authority_taxonomy_contract");
  assert.equal(authority.classification, "shared");
  assert.equal(authority.product_id, null);
  assert.equal(inputs.catalog.modules.some((row) => row.module_manifest_ref.includes("dev-erp-mcp")), false);
});

test("product manifest schema fails closed on traversal, absolute refs, duplicate pins, move, release, and implicit unresolved interfaces", () => {
  const inputs = loaded();
  const erp = clone(inputs.productManifestRecords.find((record) => record.manifest.product_id === "product.erp").manifest);

  assert.equal(isRepoRelativeRef("guild_hall/module_operability"), true);
  for (const badRef of ["../outside", "/" + "tmp/outside", "C:" + "/outside", "\\\\" + "host\\share", "guild_hall\\module"]) {
    assert.equal(isRepoRelativeRef(badRef), false, badRef);
  }

  const absolute = clone(erp);
  absolute.composition_root = "C:" + "/outside";
  assert.equal(validateProductManifest(absolute).problems.includes("composition_root_repo_relative_ref_invalid"), true);

  const traversal = clone(erp);
  traversal.source_refs[0].ref = "guild_hall/../outside";
  assert.equal(validateProductManifest(traversal).problems.some((problem) => problem.includes("source_ref_0_repo_relative_ref_invalid")), true);

  const duplicate = clone(erp);
  duplicate.owned_module_pins.push(clone(duplicate.owned_module_pins[0]));
  assert.equal(validateProductManifest(duplicate).problems.some((problem) => problem.startsWith("owned_module_pins_module_id_duplicate_")), true);

  const moving = clone(erp);
  moving.source_move = true;
  assert.equal(validateProductManifest(moving).problems.includes("source_move_must_be_false"), true);

  const released = clone(erp);
  released.release_state = "released";
  assert.equal(validateProductManifest(released).problems.includes("release_state_must_not_released"), true);

  const implicitUnresolved = clone(erp);
  delete implicitUnresolved.unresolved_interface_pins;
  assert.equal(validateProductManifest(implicitUnresolved).problems.includes("product_manifest_field_missing_unresolved_interface_pins"), true);
});

test("composition check rejects stale interface/caller pins, duplicate rows, missing enrolled modules, and a non-Shared unowned module", () => {
  const inputs = loaded();

  const staleInterface = clone(inputs.catalog);
  rowFor(staleInterface, "authority_taxonomy_contract").interface_version = "authority_taxonomy.v99";
  assert.equal(validateWith(inputs, staleInterface).problems.includes("catalog_interface_pin_mismatch:authority_taxonomy_contract"), true);

  const staleCallers = clone(inputs.catalog);
  rowFor(staleCallers, "agent_observation").current_caller_module_ids = [];
  assert.equal(validateWith(inputs, staleCallers).problems.includes("catalog_callers_mismatch:agent_observation"), true);

  const duplicate = clone(inputs.catalog);
  duplicate.modules.push(clone(duplicate.modules[0]));
  assert.equal(validateProductModuleClassificationCatalog(duplicate).problems.some((problem) => problem.startsWith("catalog_module_id_duplicate_")), true);

  const missing = clone(inputs.catalog);
  missing.modules = missing.modules.filter((row) => row.module_id !== "authority_taxonomy_contract");
  assert.equal(validateWith(inputs, missing).problems.includes("catalog_module_missing:authority_taxonomy_contract"), true);

  const wrongClass = clone(inputs.catalog);
  rowFor(wrongClass, "authority_taxonomy_contract").classification = "product_owned";
  rowFor(wrongClass, "authority_taxonomy_contract").product_id = "product.agent";
  assert.equal(validateWith(inputs, wrongClass).problems.includes("catalog_classification_mismatch:authority_taxonomy_contract"), true);
});

test("Agent Platform stays a composition-only directory and the preflight emits machine-readable exact-set counts", () => {
  const syntheticRoot = mkdtempSync(join(tmpdir(), "soulforge-agent-platform-"));
  const syntheticAgentDir = join(syntheticRoot, "guild_hall", "agent_platform");
  mkdirSync(syntheticAgentDir, { recursive: true });
  writeFileSync(join(syntheticAgentDir, "README.md"), "composition only\n");
  writeFileSync(join(syntheticAgentDir, "product.manifest.json"), "{}\n");
  assert.deepEqual(inspectAgentPlatformCompositionOnly(syntheticRoot), []);
  writeFileSync(join(syntheticAgentDir, "runtime.mjs"), "export const forbidden = true;\n");
  assert.equal(inspectAgentPlatformCompositionOnly(syntheticRoot).includes("agent_platform_not_composition_only:runtime.mjs"), true);

  const child = spawnSync(process.execPath, [CLI, "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  const receipt = JSON.parse(child.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.module_count, discoverProductModuleManifestRefs(ROOT).length);
  assert.equal(receipt.shared_module_count, receipt.module_count - 8);
  assert.equal(receipt.unresolved_interface_count, 0);
  // Ensure the test never accidentally hard-codes the earlier 29-manifest audit.
  assert.equal(receipt.module_count > 29, true);
});
