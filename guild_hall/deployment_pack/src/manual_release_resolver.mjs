// Manual-as-release resolver — pure catalog validation and release-gate lookup.
//
// This leaf deliberately has no filesystem, pack-builder, installer, or writer
// dependency.  A caller explicitly supplies a public-safe catalog and a pack
// procedure request; unresolved or unverified manuals stay HOLD.

import { PACK_CATALOG, RUNBOOK_CATALOG } from "./deployment_pack_contract.mjs";

export const MANUAL_RELEASE_CATALOG_SCHEMA = "soulforge.deployment_pack.manual_release_catalog.v0";
export const MANUAL_RELEASE_CATALOG_STATES = Object.freeze(["ready", "release_hold"]);
export const MANUAL_STATES = Object.freeze(["ready", "candidate", "hold"]);
export const MANUAL_STALE_STATES = Object.freeze(["current", "stale", "manual_absent"]);
export const MANUAL_PROCEDURE_FIELDS = Object.freeze([
  "install_manual_ref",
  "upgrade_manual_ref",
  "rollback_manual_ref",
]);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const OPAQUE_REF = /^[a-z][a-z0-9_.:-]{1,160}$/u;
const RANGE_TERM = /^(>=|>|<=|<)?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u;
const PUBLIC_SECRET_MATERIAL = /password|passwd|api[_-]?key|token_value|secret_value|private[_ ]key|BEGIN [A-Z ]+KEY/iu;
const LOCAL_PATH = /[A-Za-z]:[\\/]|\/(?:Users|home)\//u;
const PROCEDURE_KINDS = new Set(["install", "upgrade", "rollback"]);
const PACK_IDS = new Set(PACK_CATALOG.map((entry) => entry.pack_id));
const ROLE_IDS = new Set(RUNBOOK_CATALOG);

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addProblem(problems, code) {
  if (!problems.includes(code)) problems.push(code);
}

function hasOnlyFields(value, allowed, problems, code) {
  if (!record(value)) return false;
  if (Object.keys(value).some((key) => !allowed.includes(key))) addProblem(problems, code);
  return true;
}

function validOpaqueRef(value) {
  return typeof value === "string" && OPAQUE_REF.test(value);
}

export function isSemanticVersion(value) {
  return typeof value === "string" && SEMVER.test(value);
}

export function isContentDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function parseCompatibilityRange(range) {
  if (range === "*") return [];
  if (typeof range !== "string" || range.trim() === "") return null;
  const terms = range.trim().split(/\s+/u);
  const parsed = [];
  for (const term of terms) {
    const match = RANGE_TERM.exec(term);
    if (!match) return null;
    parsed.push({ operator: match[1] || "=", version: match[2] });
  }
  return parsed;
}

export function isValidCompatibilityRange(range) {
  return parseCompatibilityRange(range) !== null;
}

export function isReleaseVersionCompatible(releaseVersion, compatibilityRange) {
  if (!isSemanticVersion(releaseVersion)) return false;
  const terms = parseCompatibilityRange(compatibilityRange);
  if (terms === null) return false;
  return terms.every(({ operator, version }) => {
    const comparison = compareVersions(releaseVersion, version);
    if (operator === ">") return comparison > 0;
    if (operator === ">=") return comparison >= 0;
    if (operator === "<") return comparison < 0;
    if (operator === "<=") return comparison <= 0;
    return comparison === 0;
  });
}

export const isReleaseCompatible = isReleaseVersionCompatible;

function publicSafetyProblems(catalog, problems) {
  let text;
  try {
    text = JSON.stringify(catalog);
  } catch {
    addProblem(problems, "catalog_shape_invalid");
    return;
  }
  if (typeof text !== "string") {
    addProblem(problems, "catalog_shape_invalid");
    return;
  }
  if (PUBLIC_SECRET_MATERIAL.test(text)) addProblem(problems, "catalog_public_material_forbidden");
  if (LOCAL_PATH.test(text)) addProblem(problems, "catalog_local_path_forbidden");
}

function validateCoverage(coverage, problems) {
  const allowed = ["pack_ids", "procedure_refs"];
  if (!hasOnlyFields(coverage, allowed, problems, "manual_coverage_invalid")) {
    addProblem(problems, "manual_coverage_invalid");
    return;
  }
  for (const field of allowed) {
    const entries = coverage[field];
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
      addProblem(problems, "manual_coverage_invalid");
      continue;
    }
    if (new Set(entries).size !== entries.length) addProblem(problems, "manual_coverage_invalid");
  }
  if (Array.isArray(coverage.pack_ids) && coverage.pack_ids.some((packId) => !PACK_IDS.has(packId))) {
    addProblem(problems, "manual_coverage_invalid");
  }
  if (Array.isArray(coverage.procedure_refs) && coverage.procedure_refs.some((ref) => !validOpaqueRef(ref))) {
    addProblem(problems, "manual_coverage_invalid");
  }
}

function validateManualRow(manual, problems) {
  const fields = [
    "semantic_role",
    "state",
    "artifact_ref",
    "content_digest",
    "compatibility_range",
    "last_verified_release",
    "stale_state",
    "coverage",
    "exercise_receipt_ref",
  ];
  if (!hasOnlyFields(manual, fields, problems, "manual_field_unknown")) {
    addProblem(problems, "manual_shape_invalid");
    return;
  }
  if (!ROLE_IDS.has(manual.semantic_role)) addProblem(problems, "manual_role_invalid");
  if (!MANUAL_STATES.includes(manual.state)) addProblem(problems, "manual_state_invalid");
  if (!MANUAL_STALE_STATES.includes(manual.stale_state)) addProblem(problems, "manual_stale_state_invalid");

  if (manual.artifact_ref !== null && !validOpaqueRef(manual.artifact_ref)) {
    addProblem(problems, "manual_artifact_ref_invalid");
  }
  if (manual.content_digest !== null && !isContentDigest(manual.content_digest)) {
    addProblem(problems, "manual_content_digest_invalid");
  }
  if (manual.compatibility_range !== null && !isValidCompatibilityRange(manual.compatibility_range)) {
    addProblem(problems, "manual_compatibility_invalid");
  }
  if (manual.last_verified_release !== null && !isSemanticVersion(manual.last_verified_release)) {
    addProblem(problems, "manual_last_verified_release_invalid");
  }
  if (manual.exercise_receipt_ref !== null && !validOpaqueRef(manual.exercise_receipt_ref)) {
    addProblem(problems, "manual_exercise_receipt_invalid");
  }
  validateCoverage(manual.coverage, problems);

  if (["ready", "candidate"].includes(manual.state)) {
    if (!validOpaqueRef(manual.artifact_ref)) addProblem(problems, "manual_artifact_ref_invalid");
    if (!isContentDigest(manual.content_digest)) addProblem(problems, "manual_content_digest_invalid");
    if (!isValidCompatibilityRange(manual.compatibility_range)) addProblem(problems, "manual_compatibility_invalid");
  }
  if (manual.state === "candidate" && manual.stale_state !== "current") {
    addProblem(problems, "manual_candidate_not_current");
  }
}

function manualRowsByRole(catalog) {
  return new Map(catalog.manuals
    .filter(record)
    .map((manual) => [manual.semantic_role, manual]));
}

function validateProcedureMappings(catalog, manualRows, problems) {
  if (!Array.isArray(catalog.procedure_mappings)) {
    addProblem(problems, "procedure_mappings_invalid");
    return;
  }
  const seen = new Set();
  for (const mapping of catalog.procedure_mappings) {
    const fields = ["pack_id", "procedure_ref", "procedure_kind", "semantic_role"];
    if (!hasOnlyFields(mapping, fields, problems, "procedure_mapping_field_unknown")) {
      addProblem(problems, "procedure_mapping_invalid");
      continue;
    }
    if (!PACK_IDS.has(mapping.pack_id)) addProblem(problems, "procedure_mapping_unknown_pack");
    if (!validOpaqueRef(mapping.procedure_ref)) addProblem(problems, "procedure_mapping_invalid");
    if (!PROCEDURE_KINDS.has(mapping.procedure_kind)) addProblem(problems, "procedure_mapping_invalid");
    if (!ROLE_IDS.has(mapping.semantic_role)) addProblem(problems, "procedure_mapping_role_invalid");
    const key = `${mapping.pack_id}\u0000${mapping.procedure_ref}`;
    if (seen.has(key)) addProblem(problems, "procedure_mapping_duplicate");
    seen.add(key);

    const manual = manualRows.get(mapping.semantic_role);
    if (manual && record(manual.coverage)
      && Array.isArray(manual.coverage.procedure_refs)
      && !manual.coverage.procedure_refs.includes(mapping.procedure_ref)) {
      addProblem(problems, "procedure_mapping_coverage_missing");
    }
  }
}

function validatePackRequirements(catalog, manualRows, problems) {
  if (!Array.isArray(catalog.pack_requirements)) {
    addProblem(problems, "pack_requirements_invalid");
    return;
  }
  const seen = new Set();
  for (const requirement of catalog.pack_requirements) {
    const fields = ["pack_id", "required_roles"];
    if (!hasOnlyFields(requirement, fields, problems, "pack_requirement_field_unknown")) {
      addProblem(problems, "pack_requirements_invalid");
      continue;
    }
    if (!PACK_IDS.has(requirement.pack_id)) addProblem(problems, "pack_requirements_invalid");
    if (seen.has(requirement.pack_id)) addProblem(problems, "pack_requirement_duplicate");
    seen.add(requirement.pack_id);
    if (!Array.isArray(requirement.required_roles) || requirement.required_roles.length === 0
      || requirement.required_roles.some((role) => !ROLE_IDS.has(role))
      || new Set(requirement.required_roles).size !== requirement.required_roles.length) {
      addProblem(problems, "pack_requirements_invalid");
      continue;
    }
    for (const role of requirement.required_roles) {
      const manual = manualRows.get(role);
      if (manual && record(manual.coverage) && Array.isArray(manual.coverage.pack_ids)
        && !manual.coverage.pack_ids.includes(requirement.pack_id)) {
        addProblem(problems, "pack_requirement_coverage_missing");
      }
    }
  }
  for (const packId of PACK_IDS) {
    if (!seen.has(packId)) addProblem(problems, "pack_requirement_missing");
  }
}

// HOLD rows say the semantic role has no artifact. Candidate rows bind a
// current, digested artifact but still require verified release and exercise
// acceptance before any release claim is allowed.
export function validateManualReleaseCatalog(catalog) {
  const problems = [];
  if (!record(catalog)) return { ok: false, problems: ["catalog_shape_invalid"] };

  const rootFields = ["schema", "catalog_version", "catalog_state", "manuals", "pack_requirements", "procedure_mappings"];
  hasOnlyFields(catalog, rootFields, problems, "catalog_field_unknown");
  if (catalog.schema !== MANUAL_RELEASE_CATALOG_SCHEMA) addProblem(problems, "catalog_schema_invalid");
  if (!isSemanticVersion(catalog.catalog_version)) addProblem(problems, "catalog_version_invalid");
  if (!MANUAL_RELEASE_CATALOG_STATES.includes(catalog.catalog_state)) addProblem(problems, "catalog_state_invalid");
  publicSafetyProblems(catalog, problems);

  if (!Array.isArray(catalog.manuals)) {
    addProblem(problems, "catalog_manuals_invalid");
    return { ok: false, problems };
  }
  const roleCounts = new Map();
  for (const manual of catalog.manuals) {
    validateManualRow(manual, problems);
    if (record(manual) && typeof manual.semantic_role === "string") {
      roleCounts.set(manual.semantic_role, (roleCounts.get(manual.semantic_role) ?? 0) + 1);
    }
  }
  for (const role of RUNBOOK_CATALOG) {
    if (!roleCounts.has(role)) addProblem(problems, "manual_role_missing");
    if ((roleCounts.get(role) ?? 0) > 1) addProblem(problems, "manual_role_duplicate");
  }
  for (const role of roleCounts.keys()) {
    if (!ROLE_IDS.has(role)) addProblem(problems, "manual_role_invalid");
  }

  const manualRows = manualRowsByRole(catalog);
  validateProcedureMappings(catalog, manualRows, problems);
  validatePackRequirements(catalog, manualRows, problems);
  return { ok: problems.length === 0, problems };
}

function procedureRefsFrom(request, problems) {
  const refs = [];
  if (Object.hasOwn(request, "procedure_refs")) {
    if (!Array.isArray(request.procedure_refs) || request.procedure_refs.some((ref) => typeof ref !== "string")) {
      addProblem(problems, "procedure_refs_invalid");
    } else {
      refs.push(...request.procedure_refs);
    }
  }
  for (const field of MANUAL_PROCEDURE_FIELDS) {
    if (Object.hasOwn(request, field)) refs.push(request[field]);
  }
  if (refs.length === 0) addProblem(problems, "procedure_refs_missing");
  if (refs.some((ref) => !validOpaqueRef(ref))) addProblem(problems, "procedure_ref_invalid");
  return [...new Set(refs)];
}

function requestedReleaseVersion(request, problems) {
  const version = request.release_version ?? request.version;
  if (request.release_version !== undefined && request.version !== undefined
    && request.release_version !== request.version) {
    addProblem(problems, "release_version_invalid");
  }
  if (!isSemanticVersion(version)) addProblem(problems, "release_version_invalid");
  return version;
}

function requiredRolesFrom(catalog, request, packId, problems) {
  let roles;
  if (Object.hasOwn(request, "required_roles")) {
    roles = request.required_roles;
  } else {
    roles = catalog.pack_requirements.find((entry) => entry.pack_id === packId)?.required_roles;
  }
  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => !ROLE_IDS.has(role))) {
    addProblem(problems, "required_role_unresolved");
    return [];
  }
  return [...new Set(roles)];
}

function resolutionFor(procedureRef, mapping, manual) {
  return {
    procedure_ref: procedureRef,
    semantic_role: mapping?.semantic_role ?? null,
    artifact_ref: manual?.artifact_ref ?? null,
    content_digest: manual?.content_digest ?? null,
    compatibility_range: manual?.compatibility_range ?? null,
    last_verified_release: manual?.last_verified_release ?? null,
    stale_state: manual?.stale_state ?? null,
    manual_state: manual?.state ?? null,
    coverage: manual?.coverage
      ? {
        pack_ids: [...manual.coverage.pack_ids],
        procedure_refs: [...manual.coverage.procedure_refs],
      }
      : null,
    exercise_receipt_ref: manual?.exercise_receipt_ref ?? null,
  };
}

function evaluateManual(manual, { packId, procedureRef, releaseVersion }, problems) {
  if (!manual || manual.state === "hold" || manual.stale_state === "manual_absent"
    || manual.artifact_ref === null || manual.content_digest === null) {
    addProblem(problems, "manual_absent");
    return;
  }
  if (manual.state === "candidate") addProblem(problems, "manual_candidate_unexercised");
  if (manual.stale_state !== "current") addProblem(problems, "manual_stale");
  if (!isSemanticVersion(manual.last_verified_release)) {
    addProblem(problems, "manual_last_verified_release_missing");
  } else if (manual.last_verified_release !== releaseVersion) {
    addProblem(problems, "manual_last_verified_release_mismatch");
  }
  if (!isReleaseVersionCompatible(releaseVersion, manual.compatibility_range)) {
    addProblem(problems, "release_incompatible");
  }
  if (!validOpaqueRef(manual.exercise_receipt_ref)) addProblem(problems, "manual_exercise_missing");
  if (!manual.coverage.pack_ids.includes(packId) || !manual.coverage.procedure_refs.includes(procedureRef)) {
    addProblem(problems, "manual_coverage_missing");
  }
}

function holdResult({ catalog, packId = null, releaseVersion = null, requiredRoles = [], problems, resolutions = [] }) {
  return {
    ok: problems.length === 0,
    status: problems.length === 0 ? "ready" : "hold",
    catalog_version: record(catalog) ? catalog.catalog_version ?? null : null,
    pack_id: packId,
    release_version: releaseVersion,
    required_roles: requiredRoles,
    resolutions,
    problems,
  };
}

// Resolves only explicit request input.  It never changes the existing pack
// manifest validator or upgrades a draft manifest into a release claim.
export function resolveManualRelease(catalog, request) {
  const catalogVerdict = validateManualReleaseCatalog(catalog);
  if (!catalogVerdict.ok) return holdResult({ catalog, problems: [...catalogVerdict.problems] });

  const problems = [];
  if (!record(request)) {
    return holdResult({ catalog, problems: ["manual_release_request_invalid"] });
  }
  const packId = request.pack_id;
  if (!PACK_IDS.has(packId)) addProblem(problems, "pack_id_unknown");
  const releaseVersion = requestedReleaseVersion(request, problems);
  const procedureRefs = procedureRefsFrom(request, problems);
  const requiredRoles = requiredRolesFrom(catalog, request, packId, problems);
  if (catalog.catalog_state !== "ready") addProblem(problems, "catalog_release_hold");

  const mappings = new Map(catalog.procedure_mappings.map((mapping) => [
    `${mapping.pack_id}\u0000${mapping.procedure_ref}`,
    mapping,
  ]));
  const manualRows = manualRowsByRole(catalog);
  const resolvedRoles = new Set();
  const resolutions = [];

  for (const procedureRef of procedureRefs) {
    const mapping = mappings.get(`${packId}\u0000${procedureRef}`);
    if (!mapping) {
      addProblem(problems, "procedure_mapping_missing");
      resolutions.push(resolutionFor(procedureRef, null, null));
      continue;
    }
    resolvedRoles.add(mapping.semantic_role);
    const manual = manualRows.get(mapping.semantic_role);
    resolutions.push(resolutionFor(procedureRef, mapping, manual));
    evaluateManual(manual, { packId, procedureRef, releaseVersion }, problems);
  }
  for (const role of requiredRoles) {
    if (!resolvedRoles.has(role) || !manualRows.has(role)) addProblem(problems, "required_role_unresolved");
  }
  return holdResult({ catalog, packId, releaseVersion, requiredRoles, problems, resolutions });
}

export const resolveManualReleaseCatalog = resolveManualRelease;
