// Module manifest completeness schema (module-operability gate, leaf 2).
//
// Pins the EXACT field set of soulforge.module_manifest.v0 and the rules a
// manifest must satisfy to count as operable: completeness (no missing, no
// unknown fields), typed nullability, non-empty validators and authority
// notes, a lifecycle rule (a runtime-ish default_state demands declared
// health/readiness probes), and the release-digest rule (a non-null
// release_digest must equal the module's computed source digest — a stamped
// digest that no longer matches is a stale release claim and fails closed).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const MODULE_MANIFEST_SCHEMA_VERSION = "soulforge.module_manifest.v0";

// Exact field order/agreement with the seven existing program manifests.
export const MANIFEST_FIELDS = Object.freeze([
  "schema_version", "module_id", "module_version", "interface_version",
  "schema_versions", "owner", "capabilities_provided", "capabilities_required",
  "required_dependencies", "optional_dependencies", "compatible_version_ranges",
  "startup_order", "feature_flag", "default_state", "health_probe",
  "readiness_probe", "config_refs", "secret_refs", "data_owner", "backup_class",
  "migration_version", "rollback_version", "validators", "release_digest",
  "deprecation_state", "authority_notes",
]);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEX64 = /^[a-f0-9]{64}$/;
// A default_state that names one of these is NOT a live runtime surface and
// needs no probes; anything else is runtime-ish and must declare them.
// `synthetic` counts: an in-memory synthetic core is by definition not a
// live runtime (the program's established manifest vocabulary).
const NON_RUNTIME_STATE = /contract|test_only|source_only|no_runtime|no_server|default_off|no_service|synthetic/i;

function problem(list, code) {
  list.push(code);
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0
    && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

export function validateModuleManifest(candidate, { computedReleaseDigest } = {}) {
  const problems = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, problems: ["manifest_shape_invalid"] };
  }
  for (const field of MANIFEST_FIELDS) {
    if (!Object.hasOwn(candidate, field)) problem(problems, `field_missing_${field}`);
  }
  for (const key of Object.keys(candidate)) {
    if (!MANIFEST_FIELDS.includes(key)) problem(problems, `field_unknown_${key}`);
  }
  if (candidate.schema_version !== MODULE_MANIFEST_SCHEMA_VERSION) problem(problems, "schema_version_invalid");
  if (typeof candidate.module_id !== "string" || candidate.module_id.length === 0) problem(problems, "module_id_invalid");
  if (typeof candidate.module_version !== "string" || !SEMVER.test(candidate.module_version)) problem(problems, "module_version_not_semver");
  if (typeof candidate.owner !== "string" || candidate.owner.length === 0) problem(problems, "owner_invalid");
  for (const field of ["schema_versions", "capabilities_provided", "capabilities_required", "required_dependencies", "optional_dependencies", "config_refs", "secret_refs"]) {
    if (Object.hasOwn(candidate, field) && !(Array.isArray(candidate[field]) && candidate[field].every((entry) => typeof entry === "string"))) {
      problem(problems, `${field}_not_string_array`);
    }
  }
  if (Object.hasOwn(candidate, "validators") && !stringArray(candidate.validators)) problem(problems, "validators_missing_or_empty");
  if (Object.hasOwn(candidate, "authority_notes") && (typeof candidate.authority_notes !== "string" || candidate.authority_notes.length < 20)) {
    problem(problems, "authority_notes_missing_or_too_short");
  }
  if (Object.hasOwn(candidate, "startup_order") && candidate.startup_order !== null && !Number.isSafeInteger(candidate.startup_order)) {
    problem(problems, "startup_order_invalid");
  }
  for (const field of ["feature_flag", "health_probe", "readiness_probe", "migration_version"]) {
    if (Object.hasOwn(candidate, field) && candidate[field] !== null && typeof candidate[field] !== "string") {
      problem(problems, `${field}_invalid`);
    }
  }
  // Lifecycle: runtime-ish modules must declare startup/shutdown observability.
  // default_state itself must be a non-empty string - a null/typed-out state
  // must not silently exempt a module from the probe rule.
  if (Object.hasOwn(candidate, "default_state") && (typeof candidate.default_state !== "string" || candidate.default_state.length === 0)) {
    problem(problems, "default_state_invalid");
  }
  if (typeof candidate.default_state === "string" && !NON_RUNTIME_STATE.test(candidate.default_state)) {
    if (candidate.health_probe === null || candidate.readiness_probe === null) {
      problem(problems, "runtime_state_requires_probes");
    }
  }
  // Release evidence: a stamped digest must still match the sources.
  if (Object.hasOwn(candidate, "release_digest") && candidate.release_digest !== null) {
    if (typeof candidate.release_digest !== "string" || !HEX64.test(candidate.release_digest)) {
      problem(problems, "release_digest_invalid");
    } else if (computedReleaseDigest !== undefined && candidate.release_digest !== computedReleaseDigest) {
      problem(problems, "release_digest_stale");
    }
  }
  return { ok: problems.length === 0, problems };
}

// Deterministic module source digest: sha256 over the codepoint-sorted list
// of (relative path, content sha256) for every file under the module dir,
// excluding transient dirs. The manifest itself is excluded so stamping the
// digest does not invalidate it.
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git"]);

export function computeModuleReleaseDigest(moduleDir) {
  const entries = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir).sort()) {
      if (EXCLUDED_DIRS.has(name)) continue;
      const child = join(dir, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(child).isDirectory()) walk(child, relative);
      else if (relative !== "module.manifest.json") {
        entries.push({ path: relative, sha256: createHash("sha256").update(readFileSync(child)).digest("hex") });
      }
    }
  };
  walk(moduleDir, "");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex");
}
