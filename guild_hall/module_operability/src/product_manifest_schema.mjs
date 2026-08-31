// Product-composition contract schema (PC1-PC3, check-only).
//
// This schema records a logical product over existing module owners.  It does
// not create a product-first source root, move source, produce a Pack, or
// declare a release.  Those states are deliberately pinned to HOLD until a
// later Owner-approved migration/release leaf supplies the needed evidence.

export const PRODUCT_MANIFEST_SCHEMA_VERSION = "soulforge.product_manifest.v0";
export const PRODUCT_MODULE_CLASSIFICATION_CATALOG_SCHEMA_VERSION = "soulforge.product_module_classification.v0";

export const PRODUCT_IDS = Object.freeze([
  "product.erp",
  "product.engine",
  "product.agent",
]);

export const PRODUCT_MANIFEST_FIELDS = Object.freeze([
  "schema_version",
  "product_id",
  "product_version",
  "composition_root",
  "composition_mode",
  "owned_module_pins",
  "shared_module_pins",
  "required_interface_pins",
  "unresolved_interface_pins",
  "source_refs",
  "entrypoint_refs",
  "validator_refs",
  "pack_state",
  "pack_refs",
  "release_state",
  "release_refs",
  "migration_state",
  "source_move",
  "source_copy",
  "rollback_state",
  "rollback_refs",
  "deprecation_state",
  "authority_notes",
]);

export const PRODUCT_MODULE_CLASSIFICATION_CATALOG_FIELDS = Object.freeze([
  "schema_version",
  "catalog_version",
  "product_manifest_refs",
  "migration_state",
  "source_move",
  "source_copy",
  "modules",
  "unresolved_interfaces",
  "authority_notes",
]);

export const PRODUCT_MODULE_PIN_FIELDS = Object.freeze([
  "module_id",
  "interface_version",
  "module_manifest_ref",
]);

export const PRODUCT_SOURCE_REF_FIELDS = Object.freeze(["ref", "purpose"]);
export const UNRESOLVED_INTERFACE_PIN_FIELDS = Object.freeze(["module_id", "interface_version", "reason"]);
export const PRODUCT_CLASSIFICATION_ROW_FIELDS = Object.freeze([
  "module_id",
  "interface_version",
  "module_manifest_ref",
  "implementation_owner",
  "classification",
  "product_id",
  "current_caller_module_ids",
  "rejected_duplicate_source_paths",
]);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MODULE_ID = /^[a-z][a-z0-9_]*$/;
const INTERFACE_VERSION = /^[a-z][a-z0-9_.-]*\.v\d+$/;
const SOURCE_PURPOSES = new Set(["composition_root", "owned_module_source", "source_ref_only"]);
const PRODUCT_COMPOSITION_MODES = new Set(["reference_only_no_move", "composition_only_no_runtime"]);
const CLASSIFICATIONS = new Set(["product_owned", "shared"]);

function add(problems, code) {
  problems.push(code);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value, fields, prefix, problems) {
  if (!isPlainObject(value)) {
    add(problems, `${prefix}_shape_invalid`);
    return false;
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) add(problems, `${prefix}_field_missing_${field}`);
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) add(problems, `${prefix}_field_unknown_${field}`);
  }
  return true;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function uniqueStrings(value, prefix, problems) {
  if (!Array.isArray(value) || !value.every(nonEmptyString)) {
    add(problems, `${prefix}_not_string_array`);
    return false;
  }
  if (new Set(value).size !== value.length) add(problems, `${prefix}_duplicate`);
  return true;
}

// `path.isAbsolute` alone is host-dependent.  Product contracts must reject
// POSIX, Windows-drive, UNC, backslash, and traversal forms on every host.
export function isRepoRelativeRef(value) {
  if (!nonEmptyString(value)) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value) || value.includes("://")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function repoRef(value, prefix, problems) {
  if (!isRepoRelativeRef(value)) add(problems, `${prefix}_repo_relative_ref_invalid`);
}

function validateModulePin(pin, prefix, problems) {
  if (!exactFields(pin, PRODUCT_MODULE_PIN_FIELDS, prefix, problems)) return;
  if (!MODULE_ID.test(pin.module_id ?? "")) add(problems, `${prefix}_module_id_invalid`);
  if (!INTERFACE_VERSION.test(pin.interface_version ?? "")) add(problems, `${prefix}_interface_version_invalid`);
  repoRef(pin.module_manifest_ref, `${prefix}_module_manifest`, problems);
  if (typeof pin.module_manifest_ref === "string" && !pin.module_manifest_ref.endsWith("/module.manifest.json")) {
    add(problems, `${prefix}_module_manifest_ref_invalid`);
  }
}

function validatePins(value, prefix, problems) {
  if (!Array.isArray(value)) {
    add(problems, `${prefix}_not_array`);
    return;
  }
  const moduleIds = new Set();
  const manifestRefs = new Set();
  value.forEach((pin, index) => {
    validateModulePin(pin, `${prefix}_${index}`, problems);
    if (isPlainObject(pin) && typeof pin.module_id === "string") {
      if (moduleIds.has(pin.module_id)) add(problems, `${prefix}_module_id_duplicate_${pin.module_id}`);
      moduleIds.add(pin.module_id);
    }
    if (isPlainObject(pin) && typeof pin.module_manifest_ref === "string") {
      if (manifestRefs.has(pin.module_manifest_ref)) add(problems, `${prefix}_module_manifest_ref_duplicate_${pin.module_manifest_ref}`);
      manifestRefs.add(pin.module_manifest_ref);
    }
  });
}

function validateSourceRefs(value, problems) {
  if (!Array.isArray(value)) {
    add(problems, "source_refs_not_array");
    return;
  }
  const refs = new Set();
  value.forEach((sourceRef, index) => {
    const prefix = `source_ref_${index}`;
    if (!exactFields(sourceRef, PRODUCT_SOURCE_REF_FIELDS, prefix, problems)) return;
    repoRef(sourceRef.ref, prefix, problems);
    if (!SOURCE_PURPOSES.has(sourceRef.purpose)) add(problems, `${prefix}_purpose_invalid`);
    if (typeof sourceRef.ref === "string") {
      if (refs.has(sourceRef.ref)) add(problems, `source_refs_duplicate_${sourceRef.ref}`);
      refs.add(sourceRef.ref);
    }
  });
}

function validateUnresolvedInterfacePins(value, prefix, problems) {
  if (!Array.isArray(value)) {
    add(problems, `${prefix}_not_array`);
    return;
  }
  const moduleIds = new Set();
  value.forEach((pin, index) => {
    const itemPrefix = `${prefix}_${index}`;
    if (!exactFields(pin, UNRESOLVED_INTERFACE_PIN_FIELDS, itemPrefix, problems)) return;
    if (!MODULE_ID.test(pin.module_id ?? "")) add(problems, `${itemPrefix}_module_id_invalid`);
    if (!INTERFACE_VERSION.test(pin.interface_version ?? "")) add(problems, `${itemPrefix}_interface_version_invalid`);
    if (!nonEmptyString(pin.reason)) add(problems, `${itemPrefix}_reason_invalid`);
    if (typeof pin.module_id === "string") {
      if (moduleIds.has(pin.module_id)) add(problems, `${prefix}_module_id_duplicate_${pin.module_id}`);
      moduleIds.add(pin.module_id);
    }
  });
}

function validatePathRefs(value, prefix, problems) {
  if (!uniqueStrings(value, prefix, problems)) return;
  for (const ref of value) repoRef(ref, prefix, problems);
}

export function validateProductManifest(candidate) {
  const problems = [];
  if (!exactFields(candidate, PRODUCT_MANIFEST_FIELDS, "product_manifest", problems)) {
    return { ok: false, problems };
  }
  if (candidate.schema_version !== PRODUCT_MANIFEST_SCHEMA_VERSION) add(problems, "schema_version_invalid");
  if (!PRODUCT_IDS.includes(candidate.product_id)) add(problems, "product_id_invalid");
  if (!SEMVER.test(candidate.product_version ?? "")) add(problems, "product_version_not_semver");
  repoRef(candidate.composition_root, "composition_root", problems);
  if (!PRODUCT_COMPOSITION_MODES.has(candidate.composition_mode)) add(problems, "composition_mode_invalid");

  validatePins(candidate.owned_module_pins, "owned_module_pins", problems);
  validatePins(candidate.shared_module_pins, "shared_module_pins", problems);
  validatePins(candidate.required_interface_pins, "required_interface_pins", problems);
  const allPins = [candidate.owned_module_pins, candidate.shared_module_pins, candidate.required_interface_pins]
    .filter(Array.isArray)
    .flat();
  const allPinIds = new Set();
  for (const pin of allPins) {
    if (isPlainObject(pin) && typeof pin.module_id === "string") {
      if (allPinIds.has(pin.module_id)) add(problems, `module_pin_duplicate_across_lists_${pin.module_id}`);
      allPinIds.add(pin.module_id);
    }
  }
  validateUnresolvedInterfacePins(candidate.unresolved_interface_pins, "unresolved_interface_pins", problems);
  validateSourceRefs(candidate.source_refs, problems);
  validatePathRefs(candidate.entrypoint_refs, "entrypoint_refs", problems);
  validatePathRefs(candidate.validator_refs, "validator_refs", problems);
  validatePathRefs(candidate.pack_refs, "pack_refs", problems);
  validatePathRefs(candidate.release_refs, "release_refs", problems);
  validatePathRefs(candidate.rollback_refs, "rollback_refs", problems);

  if (candidate.pack_state !== "HOLD") add(problems, "pack_state_must_hold");
  if (candidate.release_state !== "not_released") add(problems, "release_state_must_not_released");
  if (candidate.release_state === "not_released" && Array.isArray(candidate.release_refs) && candidate.release_refs.length > 0) {
    add(problems, "release_refs_forbidden_while_not_released");
  }
  if (candidate.migration_state !== "reference_in_place_no_move") add(problems, "migration_state_must_reference_in_place_no_move");
  if (candidate.source_move !== false) add(problems, "source_move_must_be_false");
  if (candidate.source_copy !== false) add(problems, "source_copy_must_be_false");
  if (candidate.rollback_state !== "HOLD") add(problems, "rollback_state_must_hold");
  if (candidate.deprecation_state !== "active_no_deprecation") add(problems, "deprecation_state_invalid");
  if (!nonEmptyString(candidate.authority_notes) || candidate.authority_notes.length < 40) {
    add(problems, "authority_notes_missing_or_too_short");
  }
  return { ok: problems.length === 0, problems };
}

function validateClassificationRow(row, index, problems) {
  const prefix = `classification_row_${index}`;
  if (!exactFields(row, PRODUCT_CLASSIFICATION_ROW_FIELDS, prefix, problems)) return;
  if (!MODULE_ID.test(row.module_id ?? "")) add(problems, `${prefix}_module_id_invalid`);
  if (!INTERFACE_VERSION.test(row.interface_version ?? "")) add(problems, `${prefix}_interface_version_invalid`);
  repoRef(row.module_manifest_ref, `${prefix}_module_manifest`, problems);
  if (typeof row.module_manifest_ref === "string" && !row.module_manifest_ref.endsWith("/module.manifest.json")) {
    add(problems, `${prefix}_module_manifest_ref_invalid`);
  }
  repoRef(row.implementation_owner, `${prefix}_implementation_owner`, problems);
  if (!CLASSIFICATIONS.has(row.classification)) add(problems, `${prefix}_classification_invalid`);
  if (row.classification === "product_owned" && !PRODUCT_IDS.includes(row.product_id)) add(problems, `${prefix}_product_owner_invalid`);
  if (row.classification === "shared" && row.product_id !== null) add(problems, `${prefix}_shared_product_id_must_null`);
  uniqueStrings(row.current_caller_module_ids, `${prefix}_current_caller_module_ids`, problems);
  if (Array.isArray(row.current_caller_module_ids)) {
    for (const caller of row.current_caller_module_ids) {
      if (!MODULE_ID.test(caller)) add(problems, `${prefix}_caller_module_id_invalid`);
    }
  }
  validatePathRefs(row.rejected_duplicate_source_paths, `${prefix}_rejected_duplicate_source_paths`, problems);
}

export function validateProductModuleClassificationCatalog(candidate) {
  const problems = [];
  if (!exactFields(candidate, PRODUCT_MODULE_CLASSIFICATION_CATALOG_FIELDS, "classification_catalog", problems)) {
    return { ok: false, problems };
  }
  if (candidate.schema_version !== PRODUCT_MODULE_CLASSIFICATION_CATALOG_SCHEMA_VERSION) add(problems, "catalog_schema_version_invalid");
  if (!SEMVER.test(candidate.catalog_version ?? "")) add(problems, "catalog_version_not_semver");
  validatePathRefs(candidate.product_manifest_refs, "product_manifest_refs", problems);
  if (candidate.migration_state !== "reference_in_place_no_move") add(problems, "catalog_migration_state_must_reference_in_place_no_move");
  if (candidate.source_move !== false) add(problems, "catalog_source_move_must_be_false");
  if (candidate.source_copy !== false) add(problems, "catalog_source_copy_must_be_false");
  if (!Array.isArray(candidate.modules)) {
    add(problems, "catalog_modules_not_array");
  } else {
    const moduleIds = new Set();
    candidate.modules.forEach((row, index) => {
      validateClassificationRow(row, index, problems);
      if (isPlainObject(row) && typeof row.module_id === "string") {
        if (moduleIds.has(row.module_id)) add(problems, `catalog_module_id_duplicate_${row.module_id}`);
        moduleIds.add(row.module_id);
      }
    });
  }
  validateUnresolvedInterfacePins(candidate.unresolved_interfaces, "catalog_unresolved_interfaces", problems);
  if (!nonEmptyString(candidate.authority_notes) || candidate.authority_notes.length < 40) {
    add(problems, "catalog_authority_notes_missing_or_too_short");
  }
  return { ok: problems.length === 0, problems };
}
