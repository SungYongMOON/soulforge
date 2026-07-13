import { createHash } from "node:crypto";
import path from "node:path";

import {
  normalizeRepoRelativePath,
  normalizeSemanticSet,
  serializeCanonicalIdentity,
  validateTypedRef,
} from "../shared/temporal_identity.mjs";
import {
  COMMON_RAG_ROOT_REF,
  RAG_ASSET_KINDS,
  RagPathContractError,
  assertRagTargetMatchesOwner,
  inspectLegacyProjectRagRef,
  resolveRagAssetTarget,
} from "./project_rag_paths.mjs";

export const PROJECT_RAG_MIGRATION_DRY_RUN_SCHEMA_VERSION =
  "soulforge.project_rag_migration_dry_run.v2";

export const COMMON_KNOWLEDGE_SCOPE_REF = Object.freeze({
  entity_type: "knowledge_scope",
  owner_surface: "guild_hall",
  entity_id: "common",
});

export const RAG_MIGRATION_TARGET_OWNER_SURFACES = Object.freeze({
  project: "project_rag_payload",
  common: "common_rag_payload",
});

const ROW_FIELDS = Object.freeze([
  "legacy_asset_ref",
  "asset_kind",
  "observed_scope_ref",
  "classification",
  "project_ref",
  "source_revision_id",
  "content_id",
  "legacy_status",
  "current_owner_surface",
  "target_owner_surface",
  "target_name",
  "target_path_segments",
  "target_content_id",
  "inbound_consumers",
  "outbound_refs",
  "collision_state",
  "acl_state",
  "rollback_source_ref",
  "rollback_reader_ref",
  "evidence_refs",
  "decision_or_blocker",
  "claim_ceiling",
]);
const REQUIRED_ROW_FIELDS = Object.freeze(
  ROW_FIELDS.filter((field) => !["target_path_segments", "target_content_id"].includes(field)),
);

const CLASSIFICATIONS = new Set(["project", "common", "unresolved", "conflict"]);
const COLLISION_STATES = new Set(["clear", "unknown", "conflict"]);
const ACL_STATES = new Set(["approved", "unknown", "denied"]);
const CLAIM_CEILINGS = new Set([
  "observed",
  "source_supported",
  "validated_private",
  "canon_candidate",
  "canon_entry",
  "rejected_or_blocked",
  "unknown",
]);
const READY_LEGACY_STATES = new Set(["active", "readable"]);
const ASSET_KIND_SET = new Set(RAG_ASSET_KINDS);
const SOURCE_REVISION_PATTERN = /^sr_[0-9a-f]{32}$/u;
const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SYMBOL_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/u;
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._:@/+~-]*$/u;
const TYPED_REF_COMPONENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._:@+-]*$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:= ])/iu,
  /^(?:gh[pousr]_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})$/u,
  /^eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u,
  /^(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)[.:=_-]+[A-Za-z0-9+/=_-]{8,}$/iu,
]);
const EXPLICIT_PROJECT_TOKEN_PATTERN =
  /(?:^|[^A-Za-z0-9])(P[0-9]{2}-[0-9]{3})(?=$|[^A-Za-z0-9])/gu;
const FORBIDDEN_FIELD_PATTERN =
  /(?:^|_)(?:raw|body|chunk(?:_text|_body|_content)?|secret|password|token|private_path|absolute_path)(?:$|_)/iu;
const WINDOWS_FORBIDDEN_SEGMENT_PATTERN = /[<>:"|?*]/u;
const WINDOWS_RESERVED_BASENAME_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const MAX_ROWS = 10_000;
const MAX_ARRAY_ITEMS = 256;
const MAX_REF_LENGTH = 512;
const MAX_TARGET_NAME_LENGTH = 180;
const LEGACY_ASSET_COLLISION_BASIS = Symbol("legacy_asset_collision_basis");

export class ProjectRagMigrationDryRunError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProjectRagMigrationDryRunError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ProjectRagMigrationDryRunError(code, message, details);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("RAG_MIGRATION_INVALID_INPUT", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("RAG_MIGRATION_INVALID_INPUT", `${label} must be a plain object`);
  }
  return value;
}

function assertKnownFields(value, allowedFields, requiredFields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  const forbidden = unknown.filter((key) => FORBIDDEN_FIELD_PATTERN.test(key));
  if (forbidden.length > 0) {
    fail(
      "RAG_MIGRATION_FORBIDDEN_FIELD",
      `${label} contains raw, secret, chunk/body, or private-path field(s)`,
    );
  }
  if (unknown.length > 0) {
    fail(
      "RAG_MIGRATION_UNKNOWN_FIELD",
      `${label} has unknown field(s): ${unknown.join(", ")}`,
    );
  }
  const missing = requiredFields.filter(
    (field) => !Object.hasOwn(value, field) || value[field] === undefined,
  );
  if (missing.length > 0) {
    fail(
      "RAG_MIGRATION_MISSING_FIELD",
      `${label} is missing required field(s): ${missing.join(", ")}`,
    );
  }
}

function normalizeSafeString(
  value,
  label,
  maxLength = MAX_REF_LENGTH,
  allowTrailingWorkspaceSpace = false,
) {
  if (typeof value !== "string") {
    fail("RAG_MIGRATION_STRING_INVALID", `${label} must be a string`);
  }
  const normalized = value.normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    normalized !== (allowTrailingWorkspaceSpace ? normalized.trimStart() : normalized.trim()) ||
    CONTROL_PATTERN.test(normalized)
  ) {
    fail(
      "RAG_MIGRATION_STRING_INVALID",
      `${label} must be non-empty, bounded NFC metadata without forbidden surrounding whitespace or control characters`,
    );
  }
  if (
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    /^[A-Za-z]:/u.test(normalized) ||
    /^(?:file|data):/iu.test(normalized)
  ) {
    fail(
      "RAG_MIGRATION_ABSOLUTE_PATH_BLOCKED",
      `${label} must not contain an absolute, UNC, drive-qualified, or data path`,
    );
  }
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    fail("RAG_MIGRATION_SECRET_VALUE_BLOCKED", `${label} resembles secret-bearing content`);
  }
  return normalized;
}

function normalizeSymbol(value, label) {
  const normalized = normalizeSafeString(value, label, 128);
  if (!SYMBOL_PATTERN.test(normalized)) {
    fail("RAG_MIGRATION_SYMBOL_INVALID", `${label} must be a lowercase opaque symbol`);
  }
  return normalized;
}

function normalizeOpaqueRef(value, label) {
  const normalized = normalizeSafeString(value, label);
  if (!OPAQUE_REF_PATTERN.test(normalized)) {
    fail("RAG_MIGRATION_REF_INVALID", `${label} must be an opaque metadata ref`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail("RAG_MIGRATION_REF_INVALID", `${label} must not contain empty or dot path segments`);
  }
  return normalized;
}

function normalizeNullableRef(value, label) {
  if (value === null) return null;
  return normalizeOpaqueRef(value, label);
}

function normalizeRefSet(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) {
    fail(
      "RAG_MIGRATION_REF_SET_INVALID",
      `${label} must be an array with at most ${MAX_ARRAY_ITEMS} opaque refs`,
    );
  }
  return normalizeSemanticSet(
    value.map((entry, index) => normalizeOpaqueRef(entry, `${label}[${index}]`)),
  );
}

function extractExplicitProjectTokens(values) {
  const tokens = new Set();
  for (const value of values) {
    if (value === null) continue;
    for (const match of value.matchAll(EXPLICIT_PROJECT_TOKEN_PATTERN)) {
      tokens.add(match[1]);
    }
  }
  return [...tokens];
}

function validateRelationProjectRouting(row) {
  if (row.classification !== "project" && row.classification !== "common") return;
  const relationRefs = [
    ...row.inbound_consumers,
    ...row.outbound_refs,
    row.rollback_source_ref,
    row.rollback_reader_ref,
    ...row.evidence_refs,
    row.decision_or_blocker,
  ];
  const explicitProjectTokens = extractExplicitProjectTokens(relationRefs);
  if (row.classification === "common" && explicitProjectTokens.length > 0) {
    fail(
      "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
      "common migration refs must not contain an explicit project binding",
    );
  }
  if (
    row.classification === "project" &&
    explicitProjectTokens.some(
      (projectCode) => row.project_ref === null || projectCode !== row.project_ref.entity_id,
    )
  ) {
    fail(
      "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
      "project migration refs must not contain a foreign explicit project binding",
    );
  }
}

function normalizeTypedScopeRef(value, label) {
  assertPlainObject(value, label);
  for (const field of ["entity_type", "owner_surface", "entity_id"]) {
    if (Object.hasOwn(value, field)) {
      const component = normalizeSafeString(value[field], `${label}.${field}`, 256);
      if (!TYPED_REF_COMPONENT_PATTERN.test(component)) {
        fail(
          "RAG_MIGRATION_TYPED_REF_INVALID",
          `${label}.${field} must be an opaque metadata identifier, not payload text or a path`,
        );
      }
    }
  }
  try {
    return validateTypedRef(value);
  } catch (error) {
    fail("RAG_MIGRATION_TYPED_REF_INVALID", `${label} is invalid: ${error.message}`);
  }
}

function typedRefsEqual(left, right) {
  return serializeCanonicalIdentity(left) === serializeCanonicalIdentity(right);
}

function normalizeProjectRef(value) {
  if (value === null) return null;
  const projectRef = normalizeTypedScopeRef(value, "project_ref");
  if (projectRef.entity_type !== "project" || projectRef.owner_surface !== "dev_erp") {
    fail(
      "RAG_MIGRATION_PROJECT_REF_INVALID",
      "project_ref must be a project typed ref owned by dev_erp",
    );
  }
  return projectRef;
}

function normalizeTargetName(value, label = "target_name") {
  const normalized = normalizeSafeString(value, label, MAX_TARGET_NAME_LENGTH);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    /[ .]$/u.test(normalized) ||
    WINDOWS_FORBIDDEN_SEGMENT_PATTERN.test(normalized) ||
    WINDOWS_RESERVED_BASENAME_PATTERN.test(normalized)
  ) {
    fail("RAG_MIGRATION_TARGET_NAME_INVALID", `${label} must be one safe Windows path segment`);
  }
  return normalized;
}

function normalizeTargetPathSegments(value, targetName) {
  if (value === undefined) return [targetName];
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    fail(
      "RAG_MIGRATION_TARGET_PATH_INVALID",
      "target_path_segments must contain 1 to 16 safe path segments",
    );
  }
  const segments = value.map((segment, index) => (
    normalizeTargetName(segment, `target_path_segments[${index}]`)
  ));
  if (segments.at(-1) !== targetName) {
    fail(
      "RAG_MIGRATION_TARGET_PATH_MISMATCH",
      "target_path_segments must end with target_name",
    );
  }
  return segments;
}

function normalizeNullableContentId(value, label) {
  if (value === undefined || value === null) return null;
  const normalized = normalizeSafeString(value, label, 71);
  if (!CONTENT_ID_PATTERN.test(normalized)) {
    fail(
      "RAG_MIGRATION_CONTENT_ID_INVALID",
      `${label} must be null or sha256:<64 lowercase hex>`,
    );
  }
  return normalized;
}

function normalizeLegacyAssetRef(value) {
  const workspaceShaped =
    typeof value === "string" && value.normalize("NFC").startsWith("_workspaces/");
  const normalized = normalizeSafeString(
    value,
    "legacy_asset_ref",
    MAX_REF_LENGTH,
    workspaceShaped,
  );
  if (!normalized.startsWith("_workspaces/")) {
    return normalizeOpaqueRef(normalized, "legacy_asset_ref");
  }
  let repoRef;
  try {
    repoRef = normalizeRepoRelativePath(normalized);
  } catch (error) {
    fail("RAG_MIGRATION_LEGACY_PATH_INVALID", `legacy asset path is invalid: ${error.message}`);
  }
  if (repoRef !== normalized) {
    fail(
      "RAG_MIGRATION_LEGACY_PATH_INVALID",
      "legacy asset paths must already be canonical POSIX-style repo refs",
    );
  }
  return repoRef;
}

function normalizeEnum(value, allowed, label) {
  if (!allowed.has(value)) {
    fail(
      "RAG_MIGRATION_ENUM_INVALID",
      `${label} must be exactly one of: ${[...allowed].join(", ")}`,
    );
  }
  return value;
}

function wrapPathContract(action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof RagPathContractError || error?.code) {
      fail(
        "RAG_MIGRATION_PATH_REJECTED",
        "RAG path owner or containment validation rejected a migration row",
        { cause_code: error.code ?? "unknown" },
      );
    }
    throw error;
  }
}

function shapedLegacyAssetKind(legacyAssetRef) {
  if (!legacyAssetRef.startsWith("_workspaces/")) return null;
  const segments = legacyAssetRef.split("/");
  if (
    segments[0] === "_workspaces" &&
    segments[1] === "knowledge" &&
    segments[2] === "rag" &&
    segments.length >= 4
  ) {
    return segments[3];
  }
  if (
    segments[0] === "_workspaces" &&
    segments[2] === "reference_payloads" &&
    segments[3] === "rag" &&
    segments.length >= 5
  ) {
    return segments[4];
  }
  fail(
    "RAG_MIGRATION_LEGACY_PATH_INVALID",
    "workspace legacy_asset_ref must use a common or project RAG owner shape",
  );
}

function validateLegacyRoutingStrict(row) {
  const shapedKind = shapedLegacyAssetKind(row.legacy_asset_ref);
  if (shapedKind === null) return;
  if (!ASSET_KIND_SET.has(shapedKind) || shapedKind !== row.asset_kind) {
    fail(
      "RAG_MIGRATION_ASSET_KIND_MISMATCH",
      "legacy_asset_ref asset kind must exactly match asset_kind",
    );
  }
  if (row.classification === "project" && row.project_ref !== null) {
    if (row.legacy_asset_ref.startsWith(`${COMMON_RAG_ROOT_REF}/`)) {
      const inspected = wrapPathContract(() =>
        inspectLegacyProjectRagRef({
          owner_scope: "project",
          project_ref: row.project_ref,
          legacy_ref: row.legacy_asset_ref,
          intent: "dry_run",
        }),
      );
      if (inspected.asset_kind !== row.asset_kind) {
        fail("RAG_MIGRATION_ASSET_KIND_MISMATCH", "legacy project asset kind mismatch");
      }
      return;
    }
    const inspected = wrapPathContract(() =>
      assertRagTargetMatchesOwner({
        owner_scope: "project",
        project_ref: row.project_ref,
        target_ref: row.legacy_asset_ref,
      }),
    );
    if (inspected.asset_kind !== row.asset_kind) {
      fail("RAG_MIGRATION_ASSET_KIND_MISMATCH", "current project asset kind mismatch");
    }
    return;
  }
  if (row.classification === "common") {
    const inspected = wrapPathContract(() =>
      assertRagTargetMatchesOwner({ owner_scope: "common", target_ref: row.legacy_asset_ref }),
    );
    if (inspected.asset_kind !== row.asset_kind) {
      fail("RAG_MIGRATION_ASSET_KIND_MISMATCH", "common asset kind mismatch");
    }
  }
}

function validateLegacyRouting(row) {
  try {
    validateLegacyRoutingStrict(row);
    return [];
  } catch (error) {
    if (
      error instanceof ProjectRagMigrationDryRunError &&
      error.code === "RAG_MIGRATION_PATH_REJECTED" &&
      error.details?.cause_code === "RAG_PATH_WINDOWS_TRAILING_DOT_SPACE"
    ) {
      const matchesExpectedOwner =
        (row.classification === "project" &&
          row.project_ref !== null &&
          (row.legacy_asset_ref.startsWith(`${COMMON_RAG_ROOT_REF}/`) ||
            row.legacy_asset_ref.startsWith(
              `_workspaces/${row.project_ref.entity_id}/reference_payloads/rag/`,
            ))) ||
        (row.classification === "common" &&
          row.legacy_asset_ref.startsWith(`${COMMON_RAG_ROOT_REF}/`));
      if (!matchesExpectedOwner) throw error;
      return ["legacy_asset_ref_windows_unsafe"];
    }
    throw error;
  }
}

function normalizeRow(input, index) {
  assertKnownFields(input, ROW_FIELDS, REQUIRED_ROW_FIELDS, `rows[${index}]`);
  const classification = normalizeEnum(input.classification, CLASSIFICATIONS, "classification");
  const observedScopeRef = normalizeTypedScopeRef(input.observed_scope_ref, "observed_scope_ref");
  const projectRef = normalizeProjectRef(input.project_ref);
  const assetKind = normalizeEnum(input.asset_kind, ASSET_KIND_SET, "asset_kind");
  const sourceRevisionId =
    input.source_revision_id === null
      ? null
      : normalizeSafeString(input.source_revision_id, "source_revision_id", 35);
  if (sourceRevisionId !== null && !SOURCE_REVISION_PATTERN.test(sourceRevisionId)) {
    fail(
      "RAG_MIGRATION_SOURCE_REVISION_INVALID",
      "source_revision_id must be null or sr_<32 lowercase hex>",
    );
  }
  const contentId = normalizeNullableContentId(input.content_id, "content_id");
  const targetName = normalizeTargetName(input.target_name);
  const targetPathSegments = normalizeTargetPathSegments(
    input.target_path_segments,
    targetName,
  );
  const targetContentId = normalizeNullableContentId(
    input.target_content_id,
    "target_content_id",
  );
  if (classification === "common") {
    if (projectRef !== null) {
      fail("RAG_MIGRATION_SCOPE_MISMATCH", "common classification must have project_ref null");
    }
    if (!typedRefsEqual(observedScopeRef, COMMON_KNOWLEDGE_SCOPE_REF)) {
      fail(
        "RAG_MIGRATION_SCOPE_MISMATCH",
        "common classification must use the exact common knowledge scope ref",
      );
    }
  }
  if (classification === "project" && projectRef !== null) {
    if (!typedRefsEqual(observedScopeRef, projectRef)) {
      fail(
        "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
        "project classification observed_scope_ref must exactly equal project_ref",
      );
    }
  }
  if (
    classification !== "common" &&
    projectRef !== null &&
    observedScopeRef.entity_type === "project" &&
    !typedRefsEqual(observedScopeRef, projectRef)
  ) {
    fail(
      "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
      "observed project scope and project_ref must not disagree",
    );
  }

  const row = {
    legacy_asset_ref: normalizeLegacyAssetRef(input.legacy_asset_ref),
    asset_kind: assetKind,
    observed_scope_ref: observedScopeRef,
    classification,
    project_ref: projectRef,
    source_revision_id: sourceRevisionId,
    content_id: contentId,
    legacy_status: normalizeSymbol(input.legacy_status, "legacy_status"),
    current_owner_surface: normalizeSymbol(
      input.current_owner_surface,
      "current_owner_surface",
    ),
    target_owner_surface: normalizeSymbol(input.target_owner_surface, "target_owner_surface"),
    target_name: targetName,
    target_path_segments: targetPathSegments,
    target_content_id: targetContentId,
    inbound_consumers: normalizeRefSet(input.inbound_consumers, "inbound_consumers"),
    outbound_refs: normalizeRefSet(input.outbound_refs, "outbound_refs"),
    collision_state: normalizeEnum(input.collision_state, COLLISION_STATES, "collision_state"),
    acl_state: normalizeEnum(input.acl_state, ACL_STATES, "acl_state"),
    rollback_source_ref: normalizeNullableRef(input.rollback_source_ref, "rollback_source_ref"),
    rollback_reader_ref: normalizeNullableRef(input.rollback_reader_ref, "rollback_reader_ref"),
    evidence_refs: normalizeRefSet(input.evidence_refs, "evidence_refs"),
    decision_or_blocker: normalizeNullableRef(
      input.decision_or_blocker,
      "decision_or_blocker",
    ),
    claim_ceiling: normalizeEnum(input.claim_ceiling, CLAIM_CEILINGS, "claim_ceiling"),
  };
  validateRelationProjectRouting(row);
  const legacyHoldReasons = validateLegacyRouting(row);
  return { row, legacy_hold_reasons: legacyHoldReasons };
}

function resolveTargetRef(row) {
  if (row.classification === "project") {
    if (row.project_ref === null) return null;
    return wrapPathContract(
      () =>
        resolveRagAssetTarget({
          owner_scope: "project",
          project_ref: row.project_ref,
          asset_kind: row.asset_kind,
          path_segments: row.target_path_segments,
        }).target_ref,
    );
  }
  if (row.classification === "common") {
    return wrapPathContract(
      () =>
        resolveRagAssetTarget({
          owner_scope: "common",
          asset_kind: row.asset_kind,
          path_segments: row.target_path_segments,
        }).target_ref,
    );
  }
  return null;
}

function baselineHoldReasons(row, targetRef) {
  const reasons = [];
  if (row.classification === "unresolved") reasons.push("classification_unresolved");
  if (row.classification === "conflict") reasons.push("classification_conflict");
  if (row.classification === "project" && row.project_ref === null) {
    reasons.push("project_ref_missing");
  }
  if ((row.classification === "project" || row.classification === "common") && targetRef === null) {
    reasons.push("target_ref_unresolved");
  }
  const expectedTargetOwner = RAG_MIGRATION_TARGET_OWNER_SURFACES[row.classification];
  if (expectedTargetOwner !== undefined && row.target_owner_surface !== expectedTargetOwner) {
    reasons.push("target_owner_surface_mismatch");
  }
  if (row.source_revision_id === null) reasons.push("source_revision_id_missing");
  if (row.content_id === null) reasons.push("content_id_missing");
  if (row.outbound_refs.length === 0) reasons.push("lineage_refs_missing");
  if (row.inbound_consumers.length === 0) reasons.push("inbound_consumers_missing");
  if (row.evidence_refs.length === 0) reasons.push("evidence_refs_missing");
  if (row.rollback_source_ref === null) reasons.push("rollback_source_ref_missing");
  if (row.rollback_reader_ref === null) reasons.push("rollback_reader_ref_missing");
  if (row.collision_state === "unknown") reasons.push("collision_state_unknown");
  if (row.collision_state === "conflict") reasons.push("collision_state_conflict");
  if (row.acl_state === "unknown") reasons.push("acl_state_unknown");
  if (row.acl_state === "denied") reasons.push("acl_state_denied");
  if (!READY_LEGACY_STATES.has(row.legacy_status)) reasons.push("legacy_status_not_ready");
  if (row.claim_ceiling === "unknown") reasons.push("claim_ceiling_unknown");
  if (row.claim_ceiling === "rejected_or_blocked") reasons.push("claim_rejected_or_blocked");
  if (row.current_owner_surface === "unknown") reasons.push("current_owner_surface_unknown");
  if (row.decision_or_blocker !== null && /^blocker:/iu.test(row.decision_or_blocker)) {
    reasons.push("decision_blocker_present");
  }
  if (
    (row.classification === "unresolved" || row.classification === "conflict") &&
    row.decision_or_blocker === null
  ) {
    reasons.push("decision_or_blocker_missing");
  }
  return reasons;
}

function addLegacyAssetCollisionReasons(preparedRows) {
  const collisionMaps = [new Map(), new Map(), new Map()];
  for (const prepared of preparedRows) {
    if (!prepared.legacy_asset_ref.startsWith("_workspaces/")) continue;
    const nfc = prepared[LEGACY_ASSET_COLLISION_BASIS].normalize("NFC");
    const casefold = nfc.toLocaleLowerCase("und");
    const keys = [
      nfc,
      casefold,
      casefold
        .split("/")
        .map((segment) => segment.replace(/[ .]+$/u, ""))
        .join("/"),
    ];
    keys.forEach((key, mapIndex) => {
      const members = collisionMaps[mapIndex].get(key) ?? [];
      members.push(prepared);
      collisionMaps[mapIndex].set(key, members);
    });
  }
  for (const collisionMap of collisionMaps) {
    for (const members of collisionMap.values()) {
      if (members.length < 2) continue;
      for (const member of members) {
        member.hold_reasons.push("legacy_asset_ref_collision");
      }
    }
  }
}

function addTargetCollisionReasons(preparedRows) {
  const collisionMaps = [new Map(), new Map(), new Map()];
  for (const prepared of preparedRows) {
    if (prepared.target_ref === null) continue;
    const raw = prepared.target_ref;
    const keys = [
      raw.normalize("NFC"),
      raw.normalize("NFC").toLocaleLowerCase("und"),
      raw
        .normalize("NFC")
        .toLocaleLowerCase("und")
        .split("/")
        .map((segment) => segment.replace(/[ .]+$/u, ""))
        .join("/"),
    ];
    keys.forEach((key, mapIndex) => {
      const members = collisionMaps[mapIndex].get(key) ?? [];
      members.push(prepared);
      collisionMaps[mapIndex].set(key, members);
    });
  }
  for (const collisionMap of collisionMaps) {
    for (const members of collisionMap.values()) {
      if (members.length < 2) continue;
      for (const member of members) member.hold_reasons.push("target_ref_collision");
    }
  }
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function digestCanonical(value) {
  return `sha256:${createHash("sha256")
    .update(serializeCanonicalIdentity(value), "utf8")
    .digest("hex")}`;
}

export function buildProjectRagMigrationDryRun(input) {
  assertKnownFields(input, ["rows"], ["rows"], "migration dry-run input");
  if (!Array.isArray(input.rows) || input.rows.length > MAX_ROWS) {
    fail(
      "RAG_MIGRATION_ROWS_INVALID",
      `rows must be an array with at most ${MAX_ROWS} metadata-only rows`,
    );
  }

  const uniqueRows = new Map();
  for (let index = 0; index < input.rows.length; index += 1) {
    const { row, legacy_hold_reasons: legacyHoldReasons } = normalizeRow(
      input.rows[index],
      index,
    );
    const canonical = serializeCanonicalIdentity(row);
    const rawLegacyAssetRef = input.rows[index].legacy_asset_ref;
    const dedupeKey = row.legacy_asset_ref.startsWith("_workspaces/")
      ? rawLegacyAssetRef
      : row.legacy_asset_ref;
    const existing = uniqueRows.get(dedupeKey);
    if (existing === undefined) {
      uniqueRows.set(dedupeKey, {
        row,
        canonical,
        raw_legacy_asset_ref: rawLegacyAssetRef,
        legacy_hold_reasons: legacyHoldReasons,
      });
      continue;
    }
    if (existing.canonical !== canonical) {
      fail(
        "RAG_MIGRATION_DUPLICATE_CONFLICT",
        "the same legacy_asset_ref has different normalized migration rows",
      );
    }
  }

  const preparedRows = [...uniqueRows.values()]
    .map(({ row, raw_legacy_asset_ref: rawLegacyAssetRef, legacy_hold_reasons }) => {
      const targetRef = resolveTargetRef(row);
      const prepared = {
        ...row,
        target_ref: targetRef,
        hold_reasons: [...legacy_hold_reasons, ...baselineHoldReasons(row, targetRef)],
      };
      Object.defineProperty(prepared, LEGACY_ASSET_COLLISION_BASIS, {
        value: rawLegacyAssetRef,
      });
      return prepared;
    })
    .sort(
      (left, right) =>
        compareUtf8(left.legacy_asset_ref, right.legacy_asset_ref) ||
        compareUtf8(
          left[LEGACY_ASSET_COLLISION_BASIS],
          right[LEGACY_ASSET_COLLISION_BASIS],
        ),
    );

  addLegacyAssetCollisionReasons(preparedRows);
  addTargetCollisionReasons(preparedRows);
  const rows = preparedRows.map((row) => {
    const holdReasons = [...new Set(row.hold_reasons)].sort(compareUtf8);
    return {
      ...row,
      hold_reasons: holdReasons,
      verdict: holdReasons.length === 0 ? "ready" : "hold",
    };
  });

  const counts = {
    total: rows.length,
    project: rows.filter((row) => row.classification === "project").length,
    common: rows.filter((row) => row.classification === "common").length,
    unresolved: rows.filter((row) => row.classification === "unresolved").length,
    conflict: rows.filter((row) => row.classification === "conflict").length,
    ready: rows.filter((row) => row.verdict === "ready").length,
    hold: rows.filter((row) => row.verdict === "hold").length,
  };
  const planVerdict = rows.length > 0 && counts.hold === 0 ? "ready" : "hold";
  const planBasis = {
    schema_version: PROJECT_RAG_MIGRATION_DRY_RUN_SCHEMA_VERSION,
    mode: "dry_run",
    write_allowed: false,
    plan_verdict: planVerdict,
    counts,
    rows,
  };
  return {
    ...planBasis,
    plan_digest: digestCanonical(planBasis),
  };
}
