// Path Registry contract, resolver, and operation-aware write guard — pure
// module (program plan 17, leaf R1).
//
// This pins the whole-estate physical-organization registry contract: the
// ten-value physical-root-class enum, the multi-axis record schema (logical
// owner vs physical containment vs product/portfolio vs five owner refs),
// the no-fallback resolver (every failure is a stable typed HOLD, never a
// legacy/default/environment fallback), and operation-aware write
// authorization bound to exact registry revision, binding epoch, and writer
// identity. It touches no filesystem, owns no bytes, and registers no live
// writer. Every binding and grant in tests is a caller-asserted synthetic
// fact.
//
// OD-10 fails-closed line: while any of the four registry authorities
// (registry schema owner, private binding writer, resolver runtime owner,
// write-policy owner) is a `hold:od-10.*` sentinel, every mutating
// authorization returns HOLD and no readiness claim is possible. The tracked
// seed registry ships with all four sentinels set.

import { createHash } from "node:crypto";

export const PATH_REGISTRY_SCHEMA = "soulforge.path_registry.v0";

export const PHYSICAL_ROOT_CLASSES = Object.freeze([
  "source_checkout", "runtime_root", "data_root", "control_root",
  "project_work_root", "tool_root", "recovery_root", "external_runtime_root",
  "external_owner_store", "secret_owner_root",
]);

export const ROW_KINDS = Object.freeze([
  "root", "canonical_root", "nested_plane", "source", "asset_class",
]);

export const SOURCE_CLASSES = Object.freeze([
  "external_saas", "external_runtime", "source_repository", "nas_store",
  "internal_capture",
]);

export const WRITE_POLICIES = Object.freeze([
  "sole_writer", "append_create_only", "read_only", "rebuild_only", "forbidden",
]);

export const BACKUP_CLASSES = Object.freeze([
  "authoritative", "rebuildable", "runtime_local", "forbidden",
]);

export const CURRENT_STATES = Object.freeze([
  "current", "target", "reference_in_place", "migrating", "deprecated",
  "held", "unknown",
]);

export const SENSITIVITY_CLASSES = Object.freeze([
  "public", "internal", "protected", "secret_ref_only",
]);

export const OPERATIONS = Object.freeze([
  "read", "create", "append", "overwrite", "delete", "move",
]);

export const AUTHORITY_ROLES = Object.freeze([
  "registry_schema_owner", "private_binding_writer",
  "resolver_runtime_owner", "write_policy_owner",
]);

export const OWNER_REF_ROLES = Object.freeze([
  "logical", "byte", "revision", "acceptance", "backup_restore",
]);

export const BINDING_ROLES = Object.freeze(["current", "target"]);

export const OD10_HOLD_PREFIX = "hold:od-10.";

const REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function hold(holdCode, detail) {
  return Object.freeze({
    status: "hold",
    hold_code: holdCode,
    ...(detail === undefined ? {} : { detail }),
  });
}

function isHoldRef(value) {
  return typeof value === "string" && value.startsWith("hold:");
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertRefOrNull(value, field) {
  if (value === null) return null;
  return assertRef(value, field);
}

function parseClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("clock_invalid", field);
  // Date.parse normalizes impossible calendar dates (for example, February
  // 30) instead of rejecting every one. Compare the normalized instant back
  // to the supplied ISO form so expiry and authorization never consume a
  // silently repaired or NaN clock.
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u, (_match, fractional) => (
    `.${(fractional ?? "").padEnd(3, "0")}Z`
  ));
  if (new Date(timestamp).toISOString() !== normalized) fail("clock_invalid", field);
  return timestamp;
}

function assertClock(value, field) {
  parseClock(value, field);
  return value;
}

function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) fail("enum_invalid", field);
  return value;
}

// A registry record is caller-facing metadata; a host-local absolute path in
// any string leaf would leak private binding truth into public rows.
function assertNoAbsolutePath(value, field) {
  if (typeof value !== "string") return value;
  if (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\")) {
    fail("absolute_path_forbidden", field);
  }
  return value;
}

function scanForAbsolutePaths(value, field) {
  if (typeof value === "string") {
    assertNoAbsolutePath(value, field);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForAbsolutePaths(entry, `${field}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) scanForAbsolutePaths(value[key], `${field}.${key}`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateBinding(binding, field) {
  if (binding === null || typeof binding !== "object" || Array.isArray(binding)) {
    fail("binding_invalid", field);
  }
  assertRef(binding.binding_ref, `${field}.binding_ref`);
  assertRef(binding.node_ref, `${field}.node_ref`);
  assertEnum(binding.role, BINDING_ROLES, `${field}.role`);
  if (!Number.isInteger(binding.binding_revision) || binding.binding_revision < 1) {
    fail("binding_invalid", `${field}.binding_revision`);
  }
  if (!Number.isInteger(binding.binding_epoch) || binding.binding_epoch < 1) {
    fail("binding_invalid", `${field}.binding_epoch`);
  }
  if (binding.expires_at !== null) assertClock(binding.expires_at, `${field}.expires_at`);
  assertRef(binding.registered_by, `${field}.registered_by`);
  return {
    binding_ref: binding.binding_ref,
    node_ref: binding.node_ref,
    role: binding.role,
    binding_revision: binding.binding_revision,
    binding_epoch: binding.binding_epoch,
    expires_at: binding.expires_at,
    registered_by: binding.registered_by,
  };
}

export function validateRecord(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    fail("record_invalid", "record");
  }
  const id = assertRef(record.logical_path_id, "logical_path_id");
  scanForAbsolutePaths(record, `record(${id})`);
  assertEnum(record.row_kind, ROW_KINDS, "row_kind");
  assertEnum(record.physical_root_class, PHYSICAL_ROOT_CLASSES, "physical_root_class");
  assertRef(record.logical_owner_class, "logical_owner_class");
  assertRefOrNull(record.parent_binding_ref, "parent_binding_ref");
  if (!Array.isArray(record.product_refs) || record.product_refs.length === 0) {
    fail("record_invalid", "product_refs");
  }
  record.product_refs.forEach((ref, i) => assertRef(ref, `product_refs[${i}]`));
  if (!Array.isArray(record.portfolio_refs) || record.portfolio_refs.length === 0) {
    fail("record_invalid", "portfolio_refs");
  }
  record.portfolio_refs.forEach((ref, i) => assertRef(ref, `portfolio_refs[${i}]`));
  assertRef(record.module_owner_ref, "module_owner_ref");
  assertRef(record.asset_or_source_class, "asset_or_source_class");
  if (record.row_kind === "source") {
    assertEnum(record.source_class, SOURCE_CLASSES, "source_class");
  } else if (record.source_class !== null) {
    fail("record_invalid", "source_class_only_for_sources");
  }
  assertRef(record.project_or_org_scope_ref, "project_or_org_scope_ref");
  // Existing stable 4192 federated-topology identity this row RESOLVES TO
  // (e.g. `watchtower::src_slack`). The registry never mints a topology
  // node: an empty list means no stable topology identity exists yet and the
  // row appears only through this registry contract (Linear today). One
  // topology node can be claimed by at most one registry row (checked at
  // registry construction), so duplicate source identity is unrepresentable.
  if (!Array.isArray(record.topology_node_refs)) {
    fail("record_invalid", "topology_node_refs");
  }
  record.topology_node_refs.forEach((ref, i) => assertRef(ref, `topology_node_refs[${i}]`));
  if (new Set(record.topology_node_refs).size !== record.topology_node_refs.length) {
    fail("duplicate_topology_identity", record.logical_path_id);
  }
  if (!Array.isArray(record.binding_refs)) fail("record_invalid", "binding_refs");
  // Two current bindings on one node stay representable here on purpose:
  // ambiguity is a resolver-level HOLD, not a silently repaired record.
  const bindings = record.binding_refs.map((b, i) => validateBinding(b, `binding_refs[${i}]`));
  if (record.owner_refs === null || typeof record.owner_refs !== "object") {
    fail("record_invalid", "owner_refs");
  }
  const ownerRefs = {};
  for (const role of OWNER_REF_ROLES) {
    ownerRefs[role] = assertRef(record.owner_refs[role], `owner_refs.${role}`);
  }
  assertEnum(record.sensitivity, SENSITIVITY_CLASSES, "sensitivity");
  assertRef(record.acl_policy_ref, "acl_policy_ref");
  assertEnum(record.write_policy, WRITE_POLICIES, "write_policy");
  assertRefOrNull(record.sole_writer_ref, "sole_writer_ref");
  if (!Array.isArray(record.authorized_writer_refs)) {
    fail("record_invalid", "authorized_writer_refs");
  }
  record.authorized_writer_refs.forEach((ref, i) => assertRef(ref, `authorized_writer_refs[${i}]`));
  if (record.write_policy === "sole_writer" && record.sole_writer_ref === null) {
    fail("record_invalid", "sole_writer_requires_sole_writer_ref");
  }
  assertEnum(record.backup_class, BACKUP_CLASSES, "backup_class");
  assertRef(record.retention_policy_ref, "retention_policy_ref");
  assertEnum(record.current_state, CURRENT_STATES, "current_state");
  assertRefOrNull(record.manifest_ref, "manifest_ref");
  assertRefOrNull(record.latest_receipt_ref, "latest_receipt_ref");
  assertRefOrNull(record.migration_ref, "migration_ref");
  assertRefOrNull(record.rollback_ref, "rollback_ref");
  if (record.applicability !== "applicable" && record.applicability !== "not_applicable") {
    fail("record_invalid", "applicability");
  }

  // Plaintext secret material is a forbidden materialization class: the
  // registry stores secret_ref pointers only and can never authorize a write
  // or a backup copy for the secret owner root.
  if (record.physical_root_class === "secret_owner_root") {
    if (record.write_policy !== "forbidden" || record.backup_class !== "forbidden"
        || record.sensitivity !== "secret_ref_only") {
      fail("secret_root_contract_violation", id);
    }
  }

  return deepFreeze({
    logical_path_id: id,
    row_kind: record.row_kind,
    physical_root_class: record.physical_root_class,
    logical_owner_class: record.logical_owner_class,
    parent_binding_ref: record.parent_binding_ref,
    product_refs: [...record.product_refs],
    portfolio_refs: [...record.portfolio_refs],
    module_owner_ref: record.module_owner_ref,
    asset_or_source_class: record.asset_or_source_class,
    source_class: record.row_kind === "source" ? record.source_class : null,
    project_or_org_scope_ref: record.project_or_org_scope_ref,
    topology_node_refs: [...record.topology_node_refs],
    binding_refs: bindings,
    owner_refs: ownerRefs,
    sensitivity: record.sensitivity,
    acl_policy_ref: record.acl_policy_ref,
    write_policy: record.write_policy,
    sole_writer_ref: record.sole_writer_ref,
    authorized_writer_refs: [...record.authorized_writer_refs],
    backup_class: record.backup_class,
    retention_policy_ref: record.retention_policy_ref,
    current_state: record.current_state,
    manifest_ref: record.manifest_ref,
    latest_receipt_ref: record.latest_receipt_ref,
    migration_ref: record.migration_ref,
    rollback_ref: record.rollback_ref,
    applicability: record.applicability,
  });
}

function validateAuthority(authority) {
  if (authority === null || typeof authority !== "object") {
    fail("authority_invalid", "authority");
  }
  const result = {};
  for (const role of AUTHORITY_ROLES) {
    result[role] = assertRef(authority[role], `authority.${role}`);
  }
  return deepFreeze(result);
}

function validateRecords(rows) {
  if (!Array.isArray(rows)) fail("rows_invalid", "rows");
  const records = new Map();
  const claimedTopologyNodes = new Map();
  for (const row of rows) {
    const record = validateRecord(row);
    if (records.has(record.logical_path_id)) {
      fail("duplicate_logical_path_id", record.logical_path_id);
    }
    for (const nodeRef of record.topology_node_refs) {
      const claimant = claimedTopologyNodes.get(nodeRef);
      if (claimant !== undefined) {
        fail("duplicate_topology_identity", `${nodeRef}:${claimant}+${record.logical_path_id}`);
      }
      claimedTopologyNodes.set(nodeRef, record.logical_path_id);
    }
    records.set(record.logical_path_id, record);
  }
  return records;
}

function snapshotBody(registryRevision, authority, records) {
  return {
    schema: PATH_REGISTRY_SCHEMA,
    registry_revision: registryRevision,
    authority,
    rows: [...records.values()]
      .sort((a, b) => (a.logical_path_id < b.logical_path_id ? -1 : 1)),
  };
}

function snapshotDigest(body) {
  return `sha256:${createHash("sha256")
    .update("soulforge.path_registry.snapshot.v0\0")
    .update(canonicalStringify(body))
    .digest("hex")}`;
}

const registryIdentities = new WeakSet();

export function createPathRegistry({ authority, rows }) {
  const validatedAuthority = validateAuthority(authority);
  const records = validateRecords(rows);
  const registry = Object.freeze({
    schema: PATH_REGISTRY_SCHEMA,
    registry_revision: 1,
    authority: validatedAuthority,
    records,
  });
  registryIdentities.add(registry);
  return registry;
}

function nextRegistry(previous, records) {
  const registry = Object.freeze({
    schema: PATH_REGISTRY_SCHEMA,
    registry_revision: previous.registry_revision + 1,
    authority: previous.authority,
    records,
  });
  registryIdentities.add(registry);
  return registry;
}

function authenticRegistry(registry) {
  if (!registryIdentities.has(registry)) return null;
  return registry;
}

export function authorityHolds(registry) {
  return AUTHORITY_ROLES.filter((role) => isHoldRef(registry.authority[role]));
}

// Immutable update: binding registration produces a NEW registry revision so
// stale-revision assertions in write authorization actually fence.
export function registerBinding(registry, logicalPathId, binding, { writer_identity } = {}) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  if (isHoldRef(registry.authority.private_binding_writer)) {
    return hold("authority_unresolved_od10", "private_binding_writer");
  }
  if (writer_identity !== registry.authority.private_binding_writer) {
    return hold("binding_writer_unauthorized");
  }
  const record = registry.records.get(logicalPathId);
  if (record === undefined) return hold("unregistered_path");
  const validated = validateBinding(
    { ...binding, registered_by: writer_identity },
    "binding",
  );
  if (validated.role === "current") {
    const clash = record.binding_refs.some(
      (existing) => existing.role === "current" && existing.node_ref === validated.node_ref,
    );
    if (clash) return hold("ambiguous_binding", "current_binding_exists_for_node");
  }
  const updated = deepFreeze({
    ...record,
    binding_refs: Object.freeze([...record.binding_refs, deepFreeze(validated)]),
  });
  const records = new Map(registry.records);
  records.set(logicalPathId, updated);
  return nextRegistry(registry, records);
}

// Record mutation is itself an authorized surface: it fails closed while any
// OD-10 authority is unresolved, only the write-policy owner may patch, and
// bindings can never enter through this door (registerBinding owns them).
export function updateRecord(registry, logicalPathId, patch, { writer_identity } = {}) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  const unresolved = authorityHolds(registry);
  if (unresolved.length > 0) {
    return hold("authority_unresolved_od10", unresolved.join(","));
  }
  if (writer_identity !== registry.authority.write_policy_owner) {
    return hold("record_writer_unauthorized");
  }
  if (patch === null || typeof patch !== "object" || "binding_refs" in patch) {
    return hold("patch_invalid", "binding_refs_only_via_registerBinding");
  }
  const record = registry.records.get(logicalPathId);
  if (record === undefined) return hold("unregistered_path");
  const updated = validateRecord({ ...record, ...patch });
  if (updated.logical_path_id !== logicalPathId) {
    return hold("record_id_immutable");
  }
  const records = new Map(registry.records);
  records.set(logicalPathId, updated);
  return nextRegistry(registry, records);
}

// No-fallback resolution. Every non-resolved outcome is a stable typed HOLD;
// there is no legacy path, default binding, or environment fallback.
export function resolvePath(registry, logicalPathId, actorContext) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  if (registry.schema !== PATH_REGISTRY_SCHEMA) return hold("schema_incompatible");
  if (actorContext === null || typeof actorContext !== "object") {
    return hold("actor_context_invalid");
  }
  const { node_ref, project_scope_ref, evaluation_time } = actorContext;
  try {
    assertRef(node_ref, "actor.node_ref");
    assertRef(project_scope_ref, "actor.project_scope_ref");
    parseClock(evaluation_time, "actor.evaluation_time");
  } catch {
    return hold("actor_context_invalid");
  }
  const record = registry.records.get(logicalPathId);
  if (record === undefined) return hold("unregistered_path");
  if (record.current_state === "held" || record.current_state === "unknown"
      || record.current_state === "deprecated") {
    return hold("record_held", record.current_state);
  }
  // `scope_mismatch` is distinguishable from `unregistered_path` on purpose:
  // registry rows are public-safe metadata, so row existence is not a secret
  // here. Query surfaces with existence policies (OD-03 style) must add their
  // own uniform-denial adapter instead of relying on this resolver.
  if (record.project_or_org_scope_ref !== project_scope_ref) {
    return hold("scope_mismatch");
  }
  const candidates = record.binding_refs.filter(
    (binding) => binding.role === "current" && binding.node_ref === node_ref,
  );
  if (candidates.length === 0) return hold("binding_unbound");
  if (candidates.length > 1) return hold("ambiguous_binding");
  const [binding] = candidates;
  // Numeric comparison: lexicographic ISO ordering breaks on optional
  // fractional seconds ("…00.5Z" sorts before "…00Z").
  if (binding.expires_at !== null
      && parseClock(binding.expires_at, "binding.expires_at")
        <= parseClock(evaluation_time, "actor.evaluation_time")) {
    return hold("binding_expired");
  }
  return Object.freeze({
    status: "resolved",
    logical_path_id: record.logical_path_id,
    physical_root_class: record.physical_root_class,
    binding_ref: binding.binding_ref,
    binding_epoch: binding.binding_epoch,
    binding_role: binding.role,
    write_policy: record.write_policy,
    sensitivity: record.sensitivity,
    registry_revision: registry.registry_revision,
  });
}

// Operation-aware authorization bound to exact registry revision, binding
// epoch, and writer identity. Denials happen before any filesystem access
// (this module has none). Delete and move are globally gated in v0: the
// no-move contract forbids them until their exact R7 migration leaf passes.
export function authorizeOperation(registry, request) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  if (request === null || typeof request !== "object") return hold("request_invalid");
  const {
    logical_path_id, operation, actor,
    asserted_registry_revision, asserted_binding_epoch,
  } = request;
  if (!OPERATIONS.includes(operation)) return hold("operation_invalid");
  if (actor === null || typeof actor !== "object") return hold("actor_context_invalid");

  const record = registry.records.get(logical_path_id);
  if (record === undefined) return hold("unregistered_path");

  if (operation === "read") {
    if (record.sensitivity === "secret_ref_only") return hold("secret_boundary");
    const resolution = resolvePath(registry, logical_path_id, actor);
    if (resolution.status !== "resolved") return resolution;
    return Object.freeze({ status: "allowed", operation, resolution });
  }

  // Mutating path: OD-10 fails-closed line first.
  const unresolved = authorityHolds(registry);
  if (unresolved.length > 0) {
    return hold("authority_unresolved_od10", unresolved.join(","));
  }
  if (asserted_registry_revision !== registry.registry_revision) {
    return hold("stale_registry_revision");
  }
  if (operation === "delete" || operation === "move") {
    return hold("destructive_operation_gated", "r7_migration_leaf_required");
  }
  if (record.current_state === "target") return hold("target_not_writable");
  const resolution = resolvePath(registry, logical_path_id, actor);
  if (resolution.status !== "resolved") return resolution;
  if (resolution.binding_role !== "current") return hold("current_target_fence");
  if (asserted_binding_epoch !== resolution.binding_epoch) {
    return hold("stale_binding_epoch");
  }

  switch (record.write_policy) {
    case "forbidden":
      return hold("write_policy_forbidden");
    case "read_only":
      return hold("write_policy_read_only");
    case "rebuild_only": {
      if (operation !== "create" && operation !== "overwrite") {
        return hold("rebuild_only_operation", operation);
      }
      if (actor.writer_identity !== record.sole_writer_ref) {
        return hold("wrong_sole_writer");
      }
      return Object.freeze({ status: "allowed", operation, resolution });
    }
    case "sole_writer": {
      if (actor.writer_identity !== record.sole_writer_ref) {
        return hold("wrong_sole_writer");
      }
      return Object.freeze({ status: "allowed", operation, resolution });
    }
    case "append_create_only": {
      if (operation === "overwrite") return hold("append_only_violation");
      if (!record.authorized_writer_refs.includes(actor.writer_identity)) {
        return hold("writer_unauthorized");
      }
      return Object.freeze({ status: "allowed", operation, resolution });
    }
    default:
      return hold("write_policy_unknown");
  }
}

export function registrySnapshot(registry) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  const body = snapshotBody(registry.registry_revision, registry.authority, registry.records);
  return deepFreeze({
    ...body,
    snapshot_digest: snapshotDigest(body),
  });
}

// Consumer-facing verification: snapshots are transferable plain data, so a
// consumer must reconstruct the validated body and recompute its digest rather
// than treating a present digest string as evidence of integrity.
export function verifyRegistrySnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== "object"
      || snapshot.schema !== PATH_REGISTRY_SCHEMA
      || !Number.isInteger(snapshot.registry_revision) || snapshot.registry_revision < 1
      || typeof snapshot.snapshot_digest !== "string") {
    return hold("snapshot_invalid");
  }
  try {
    const authority = validateAuthority(snapshot.authority);
    const records = validateRecords(snapshot.rows);
    const body = snapshotBody(snapshot.registry_revision, authority, records);
    const computedDigest = snapshotDigest(body);
    if (snapshot.snapshot_digest !== computedDigest) {
      return hold("snapshot_digest_mismatch");
    }
    return deepFreeze({ ...body, snapshot_digest: computedDigest });
  } catch {
    return hold("snapshot_invalid");
  }
}

// Readiness is a claim gate, not a health probe: while any authority role or
// any row owner ref is a hold sentinel, the registry cannot support an
// acceptance/readiness claim and R3 must render HOLD for the affected rows.
export function registryReadiness(registry) {
  if (authenticRegistry(registry) === null) return hold("registry_unavailable");
  const reasons = [];
  for (const role of authorityHolds(registry)) {
    reasons.push(`authority:${role}`);
  }
  // Any hold sentinel anywhere in a record blocks readiness — owner refs,
  // module owner, ACL/retention policy refs alike. A sentinel that survives
  // to a readiness claim is a leak, not a pass.
  const scanHoldRefs = (value, path, record) => {
    if (typeof value === "string") {
      if (isHoldRef(value)) reasons.push(`hold_ref:${record.logical_path_id}:${path}`);
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => scanHoldRefs(entry, `${path}[${index}]`, record));
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) scanHoldRefs(value[key], `${path}.${key}`, record);
    }
  };
  for (const record of registry.records.values()) {
    scanHoldRefs(record, "record", record);
    if (record.current_state === "unknown") {
      reasons.push(`current_state:${record.logical_path_id}`);
    }
  }
  if (reasons.length > 0) {
    return Object.freeze({
      status: "hold",
      hold_code: "readiness_blocked",
      reasons: Object.freeze(reasons.sort()),
    });
  }
  return Object.freeze({ status: "ready_candidate" });
}
