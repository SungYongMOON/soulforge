// Product-composition consistency check (PC1-PC3, check-only).
//
// The check reads the current enrolled module-manifest set and rejects a
// catalog that is incomplete, stale, duplicated, relocative, or released.
// It intentionally has no writer path: physical source relocation and Pack
// or release activation remain later, separately authorized leaves.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCT_IDS,
  isRepoRelativeRef,
  validateProductManifest,
  validateProductModuleClassificationCatalog,
} from "./product_manifest_schema.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const PRODUCT_MANIFEST_REFS = Object.freeze([
  "ui-workspace/apps/dev-erp/product.manifest.json",
  "guild_hall/engineering_engine/product.manifest.json",
  "guild_hall/agent_platform/product.manifest.json",
]);

export const PRODUCT_MODULE_CLASSIFICATION_CATALOG_REF = "guild_hall/module_operability/catalogs/product_module_classification.v0.json";

export const PRODUCT_COMPOSITION_ROOTS = Object.freeze({
  "product.erp": "ui-workspace/apps/dev-erp",
  "product.engine": "guild_hall/engineering_engine",
  "product.agent": "guild_hall/agent_platform",
});

// These are the Owner-directed product-specific modules.  Any other
// discovered enrolled module is Shared by construction, so a newly enrolled
// module (for example authority_taxonomy) is never silently unclassified.
export const OWNED_MODULE_IDS_BY_PRODUCT = Object.freeze({
  "product.erp": Object.freeze([
    "dev_erp_task_execution_surface",
    "vault_artifact_revision_core",
  ]),
  "product.engine": Object.freeze([
    "engineering_engine",
  ]),
  "product.agent": Object.freeze([
    "agent_observation",
    "ai_usage_meter",
    "codex_work_directory",
    "tool_workshop_core",
    "universal_client",
  ]),
});

const ENROLLED_APP_MANIFEST_REFS = Object.freeze([
  "ui-workspace/apps/dev-erp/module.manifest.json",
  "ui-workspace/apps/team-ops-board/module.manifest.json",
  "ui-workspace/apps/soulforge-universal-client/module.manifest.json",
]);
const DEV_ERP_MCP_SOURCE_REF = "ui-workspace/apps/dev-erp-mcp";
const AGENT_PLATFORM_ALLOWED_ENTRIES = new Set(["README.md", "product.manifest.json"]);

function add(problems, code) {
  problems.push(code);
}

function sorted(values) {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function setEquals(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function repoPath(root, ref) {
  return join(root, ...ref.split("/"));
}

function readJson(root, ref, problems, kind) {
  try {
    return JSON.parse(readFileSync(repoPath(root, ref), "utf8"));
  } catch {
    add(problems, `${kind}_unreadable:${ref}`);
    return null;
  }
}

export function discoverProductModuleManifestRefs(root = ROOT) {
  const refs = [];
  const guildHall = join(root, "guild_hall");
  if (existsSync(guildHall)) {
    for (const name of readdirSync(guildHall).sort()) {
      const moduleDir = join(guildHall, name);
      const manifestPath = join(moduleDir, "module.manifest.json");
      if (statSync(moduleDir, { throwIfNoEntry: false })?.isDirectory() && existsSync(manifestPath)) {
        refs.push(`guild_hall/${name}/module.manifest.json`);
      }
    }
  }
  for (const ref of ENROLLED_APP_MANIFEST_REFS) {
    if (existsSync(repoPath(root, ref))) refs.push(ref);
  }
  return refs;
}

export function loadProductCompositionInputs(root = ROOT) {
  const loadProblems = [];
  const moduleRecords = discoverProductModuleManifestRefs(root).map((manifest_ref) => ({
    manifest_ref,
    manifest: readJson(root, manifest_ref, loadProblems, "module_manifest"),
  }));
  const productManifestRecords = PRODUCT_MANIFEST_REFS.map((manifest_ref) => ({
    manifest_ref,
    manifest: existsSync(repoPath(root, manifest_ref))
      ? readJson(root, manifest_ref, loadProblems, "product_manifest")
      : null,
  }));
  const catalog = existsSync(repoPath(root, PRODUCT_MODULE_CLASSIFICATION_CATALOG_REF))
    ? readJson(root, PRODUCT_MODULE_CLASSIFICATION_CATALOG_REF, loadProblems, "classification_catalog")
    : null;
  if (catalog === null && !loadProblems.includes(`classification_catalog_unreadable:${PRODUCT_MODULE_CLASSIFICATION_CATALOG_REF}`)) {
    add(loadProblems, `classification_catalog_missing:${PRODUCT_MODULE_CLASSIFICATION_CATALOG_REF}`);
  }
  return { moduleRecords, productManifestRecords, catalog, loadProblems };
}

function moduleRecordMap(records, problems) {
  const byId = new Map();
  for (const record of records) {
    const manifest = record?.manifest;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      add(problems, `module_manifest_shape_invalid:${record?.manifest_ref ?? "unknown"}`);
      continue;
    }
    if (typeof manifest.module_id !== "string" || manifest.module_id.length === 0) {
      add(problems, `module_manifest_id_invalid:${record.manifest_ref}`);
      continue;
    }
    if (byId.has(manifest.module_id)) {
      add(problems, `discovered_module_id_duplicate:${manifest.module_id}`);
      continue;
    }
    byId.set(manifest.module_id, record);
  }
  return byId;
}

function productManifestMap(records, problems) {
  const byProductId = new Map();
  for (const record of records) {
    if (!record?.manifest) {
      add(problems, `product_manifest_missing:${record?.manifest_ref ?? "unknown"}`);
      continue;
    }
    const verdict = validateProductManifest(record.manifest);
    for (const problem of verdict.problems) add(problems, `product_manifest:${record.manifest_ref}:${problem}`);
    const productId = record.manifest.product_id;
    if (typeof productId !== "string") continue;
    if (byProductId.has(productId)) {
      add(problems, `product_manifest_product_id_duplicate:${productId}`);
      continue;
    }
    byProductId.set(productId, record);
  }
  for (const productId of PRODUCT_IDS) {
    if (!byProductId.has(productId)) add(problems, `product_manifest_required_product_missing:${productId}`);
  }
  for (const productId of byProductId.keys()) {
    if (!PRODUCT_IDS.includes(productId)) add(problems, `product_manifest_product_unexpected:${productId}`);
  }
  return byProductId;
}

function pinMap(pins) {
  const result = new Map();
  if (!Array.isArray(pins)) return result;
  for (const pin of pins) {
    if (pin && typeof pin.module_id === "string" && !result.has(pin.module_id)) result.set(pin.module_id, pin);
  }
  return result;
}

function validatePinAgainstModule(pin, moduleById, prefix, problems) {
  const record = moduleById.get(pin.module_id);
  if (!record) {
    add(problems, `${prefix}_module_unknown:${pin.module_id}`);
    return;
  }
  if (pin.interface_version !== record.manifest.interface_version) {
    add(problems, `${prefix}_interface_version_mismatch:${pin.module_id}`);
  }
  if (pin.module_manifest_ref !== record.manifest_ref) {
    add(problems, `${prefix}_module_manifest_ref_mismatch:${pin.module_id}`);
  }
}

function validateExactPins(pins, expectedModuleIds, moduleById, prefix, problems) {
  const actual = pinMap(pins);
  const expected = new Set(expectedModuleIds);
  for (const moduleId of expected) {
    if (!actual.has(moduleId)) add(problems, `${prefix}_missing:${moduleId}`);
  }
  for (const moduleId of actual.keys()) {
    if (!expected.has(moduleId)) add(problems, `${prefix}_unexpected:${moduleId}`);
  }
  for (const pin of actual.values()) validatePinAgainstModule(pin, moduleById, prefix, problems);
}

function validatePathRefsExist(root, refs, prefix, problems) {
  if (!Array.isArray(refs)) return;
  for (const ref of refs) {
    if (isRepoRelativeRef(ref) && !existsSync(repoPath(root, ref))) add(problems, `${prefix}_missing:${ref}`);
  }
}

function validateProductSourceRefs(root, productManifest, productId, ownedModuleIds, moduleById, problems) {
  const sourceRefs = Array.isArray(productManifest.source_refs) ? productManifest.source_refs : [];
  const sourceRefMap = new Map(sourceRefs
    .filter((entry) => entry && typeof entry.ref === "string")
    .map((entry) => [entry.ref, entry]));
  const expectedRoot = PRODUCT_COMPOSITION_ROOTS[productId];
  if (productManifest.composition_root !== expectedRoot) add(problems, `product_composition_root_mismatch:${productId}`);
  if (!sourceRefMap.has(expectedRoot)) add(problems, `product_source_ref_missing_composition_root:${productId}`);
  for (const entry of sourceRefs) {
    if (entry && isRepoRelativeRef(entry.ref) && !existsSync(repoPath(root, entry.ref))) {
      add(problems, `product_source_ref_missing:${productId}:${entry.ref}`);
    }
  }
  for (const moduleId of ownedModuleIds) {
    const record = moduleById.get(moduleId);
    if (record?.manifest?.owner && !sourceRefMap.has(record.manifest.owner)) {
      add(problems, `product_owned_source_ref_missing:${productId}:${record.manifest.owner}`);
    }
  }
}

function validateDevErpMcpSourceReference(productManifest, problems) {
  const refs = Array.isArray(productManifest.source_refs) ? productManifest.source_refs : [];
  const mcpRefs = refs.filter((entry) => entry?.ref === DEV_ERP_MCP_SOURCE_REF);
  if (mcpRefs.length !== 1 || mcpRefs[0].purpose !== "source_ref_only") {
    add(problems, "dev_erp_mcp_must_be_one_source_ref_only");
  }
  const allPins = [
    ...(Array.isArray(productManifest.owned_module_pins) ? productManifest.owned_module_pins : []),
    ...(Array.isArray(productManifest.shared_module_pins) ? productManifest.shared_module_pins : []),
    ...(Array.isArray(productManifest.required_interface_pins) ? productManifest.required_interface_pins : []),
  ];
  if (allPins.some((pin) => pin?.module_manifest_ref === `${DEV_ERP_MCP_SOURCE_REF}/module.manifest.json`)) {
    add(problems, "dev_erp_mcp_must_not_be_module_pin");
  }
}

export function inspectAgentPlatformCompositionOnly(root = ROOT) {
  const problems = [];
  const agentPlatformPath = repoPath(root, PRODUCT_COMPOSITION_ROOTS["product.agent"]);
  if (!existsSync(agentPlatformPath)) return ["agent_platform_composition_root_missing"];
  for (const entry of readdirSync(agentPlatformPath).sort()) {
    if (!AGENT_PLATFORM_ALLOWED_ENTRIES.has(entry)) add(problems, `agent_platform_not_composition_only:${entry}`);
  }
  if (existsSync(join(agentPlatformPath, "module.manifest.json"))) add(problems, "agent_platform_must_not_be_enrolled_module");
  return problems;
}

function expectedCallersByModule(moduleById) {
  const callers = new Map([...moduleById.keys()].map((moduleId) => [moduleId, new Set()]));
  for (const [callerId, record] of moduleById) {
    const dependencies = Array.isArray(record.manifest.required_dependencies) ? record.manifest.required_dependencies : [];
    for (const dependencyId of dependencies) {
      if (callers.has(dependencyId)) callers.get(dependencyId).add(callerId);
    }
  }
  return callers;
}

function classificationForModule(moduleId) {
  for (const [productId, moduleIds] of Object.entries(OWNED_MODULE_IDS_BY_PRODUCT)) {
    if (moduleIds.includes(moduleId)) return { classification: "product_owned", product_id: productId };
  }
  return { classification: "shared", product_id: null };
}

function validateCatalogAgainstDiscovered(catalog, moduleById, problems) {
  if (!catalog || !Array.isArray(catalog.modules)) return new Map();
  const rowsById = new Map();
  for (const row of catalog.modules) {
    if (!row || typeof row.module_id !== "string") continue;
    if (!rowsById.has(row.module_id)) rowsById.set(row.module_id, row);
  }
  for (const moduleId of moduleById.keys()) {
    if (!rowsById.has(moduleId)) add(problems, `catalog_module_missing:${moduleId}`);
  }
  for (const moduleId of rowsById.keys()) {
    if (!moduleById.has(moduleId)) add(problems, `catalog_module_unknown:${moduleId}`);
  }
  const expectedCallers = expectedCallersByModule(moduleById);
  for (const [moduleId, record] of moduleById) {
    const row = rowsById.get(moduleId);
    if (!row) continue;
    if (row.interface_version !== record.manifest.interface_version) add(problems, `catalog_interface_pin_mismatch:${moduleId}`);
    if (row.module_manifest_ref !== record.manifest_ref) add(problems, `catalog_module_manifest_ref_mismatch:${moduleId}`);
    if (row.implementation_owner !== record.manifest.owner) add(problems, `catalog_implementation_owner_mismatch:${moduleId}`);
    const expectedClassification = classificationForModule(moduleId);
    if (row.classification !== expectedClassification.classification || row.product_id !== expectedClassification.product_id) {
      add(problems, `catalog_classification_mismatch:${moduleId}`);
    }
    const actualCallers = new Set(Array.isArray(row.current_caller_module_ids) ? row.current_caller_module_ids : []);
    if (!setEquals(actualCallers, expectedCallers.get(moduleId) ?? new Set())) add(problems, `catalog_callers_mismatch:${moduleId}`);
  }
  return rowsById;
}

function directExternalDependencies(productId, ownedModuleIds, moduleById, catalogRowsById, problems) {
  const shared = new Set();
  const otherProducts = new Set();
  const owned = new Set(ownedModuleIds);
  for (const moduleId of ownedModuleIds) {
    const record = moduleById.get(moduleId);
    const dependencies = Array.isArray(record?.manifest?.required_dependencies) ? record.manifest.required_dependencies : [];
    for (const dependencyId of dependencies) {
      if (owned.has(dependencyId)) continue;
      const dependency = moduleById.get(dependencyId);
      if (!dependency) {
        add(problems, `product_required_dependency_unresolved:${productId}:${moduleId}:${dependencyId}`);
        continue;
      }
      const classification = catalogRowsById.get(dependencyId);
      if (!classification) continue;
      if (classification.classification === "shared") shared.add(dependencyId);
      else if (classification.product_id !== productId) otherProducts.add(dependencyId);
    }
  }
  return { shared, otherProducts };
}

function validateProductRecords(root, productById, moduleById, catalogRowsById, problems) {
  for (const productId of PRODUCT_IDS) {
    const record = productById.get(productId);
    if (!record?.manifest) continue;
    const manifest = record.manifest;
    const expectedOwned = OWNED_MODULE_IDS_BY_PRODUCT[productId];
    for (const moduleId of expectedOwned) {
      if (!moduleById.has(moduleId)) add(problems, `expected_owned_module_missing_from_discovered:${productId}:${moduleId}`);
    }
    validateExactPins(manifest.owned_module_pins, expectedOwned, moduleById, `product_owned_module_pins:${productId}`, problems);
    validateProductSourceRefs(root, manifest, productId, expectedOwned, moduleById, problems);
    validatePathRefsExist(root, manifest.entrypoint_refs, `product_entrypoint_ref:${productId}`, problems);
    validatePathRefsExist(root, manifest.validator_refs, `product_validator_ref:${productId}`, problems);
    validatePathRefsExist(root, manifest.pack_refs, `product_pack_ref:${productId}`, problems);
    validatePathRefsExist(root, manifest.rollback_refs, `product_rollback_ref:${productId}`, problems);

    const external = directExternalDependencies(productId, expectedOwned, moduleById, catalogRowsById, problems);
    validateExactPins(manifest.shared_module_pins, external.shared, moduleById, `product_shared_module_pins:${productId}`, problems);
    validateExactPins(manifest.required_interface_pins, external.otherProducts, moduleById, `product_required_interface_pins:${productId}`, problems);
    if (Array.isArray(manifest.unresolved_interface_pins) && manifest.unresolved_interface_pins.length > 0) {
      add(problems, `product_unresolved_interfaces_present:${productId}`);
    }
  }
  const erpManifest = productById.get("product.erp")?.manifest;
  if (erpManifest) validateDevErpMcpSourceReference(erpManifest, problems);
  const agentManifest = productById.get("product.agent")?.manifest;
  if (agentManifest?.composition_mode !== "composition_only_no_runtime") add(problems, "agent_platform_composition_mode_invalid");
  for (const problem of inspectAgentPlatformCompositionOnly(root)) add(problems, problem);
}

export function validateProductComposition({
  root = ROOT,
  moduleRecords,
  productManifestRecords,
  catalog,
  loadProblems,
} = {}) {
  const loaded = moduleRecords && productManifestRecords
    ? { moduleRecords, productManifestRecords, catalog, loadProblems: loadProblems ?? [] }
    : loadProductCompositionInputs(root);
  const problems = [...loaded.loadProblems];
  const moduleById = moduleRecordMap(loaded.moduleRecords, problems);
  const productById = productManifestMap(loaded.productManifestRecords, problems);

  const catalogVerdict = validateProductModuleClassificationCatalog(loaded.catalog);
  for (const problem of catalogVerdict.problems) add(problems, `classification_catalog:${problem}`);
  const expectedCatalogProductManifestRefs = new Set(PRODUCT_MANIFEST_REFS);
  const actualCatalogProductManifestRefs = new Set(Array.isArray(loaded.catalog?.product_manifest_refs) ? loaded.catalog.product_manifest_refs : []);
  if (!setEquals(expectedCatalogProductManifestRefs, actualCatalogProductManifestRefs)) add(problems, "classification_catalog_product_manifest_refs_mismatch");
  validatePathRefsExist(root, loaded.catalog?.product_manifest_refs, "classification_catalog_product_manifest_ref", problems);
  if (Array.isArray(loaded.catalog?.unresolved_interfaces) && loaded.catalog.unresolved_interfaces.length > 0) {
    add(problems, "classification_catalog_unresolved_interfaces_present");
  }

  const catalogRowsById = validateCatalogAgainstDiscovered(loaded.catalog, moduleById, problems);
  validateProductRecords(root, productById, moduleById, catalogRowsById, problems);

  const sharedModuleCount = [...moduleById.keys()]
    .filter((moduleId) => classificationForModule(moduleId).classification === "shared").length;
  const unresolvedInterfaceCount = (Array.isArray(loaded.catalog?.unresolved_interfaces) ? loaded.catalog.unresolved_interfaces.length : 0)
    + [...productById.values()].reduce((count, record) => count + (Array.isArray(record.manifest?.unresolved_interface_pins) ? record.manifest.unresolved_interface_pins.length : 0), 0);
  return {
    ok: problems.length === 0,
    problems: sorted(problems),
    product_count: productById.size,
    module_count: moduleById.size,
    shared_module_count: sharedModuleCount,
    unresolved_interface_count: unresolvedInterfaceCount,
    products: PRODUCT_IDS.map((productId) => ({
      product_id: productId,
      owned_module_count: OWNED_MODULE_IDS_BY_PRODUCT[productId].length,
    })),
  };
}

export function runProductPreflight(options = {}) {
  return validateProductComposition(options);
}
