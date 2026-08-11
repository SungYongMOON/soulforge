import { createHash } from "node:crypto";

export const AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION = "soulforge.ax_topology.provider.v1";
export const AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION = "soulforge.ax_topology.federation.v1";
export const AX_TOPOLOGY_RECONCILIATION_SCHEMA_VERSION = "soulforge.ax_topology.reconciliation.v1";

const PROVIDER_KEYS = new Set([
  "schema_version", "provider_id", "provider_kind", "label", "source",
  "declared_status", "validation", "capabilities", "authority_boundary",
  "claim_ceiling", "runtime_state", "payload_state", "blocker_codes", "nodes", "edges",
]);
const SOURCE_KEYS = new Set(["source_id", "schema_version", "revision", "digest"]);
const VALIDATION_KEYS = new Set(["validator_id", "state", "evidence_ref", "source_commit"]);
const CAPABILITY_KEYS = new Set(["observe", "diagnose", "propose_repair", "execute_repair"]);
const AUTHORITY_KEYS = new Set(["source_truth", "answer_authority", "owner_approval_authority", "runtime_mutation"]);
const NODE_KEYS = new Set(["id", "label", "kind", "layer", "parent_id", "group", "diagnostic_state", "repair_state"]);
const EDGE_KEYS = new Set(["id", "from", "to", "label", "relation", "layer", "evidence_mode"]);

const PROVIDER_KINDS = new Set(["platform", "domain_engine", "knowledge", "workflow", "advisory_workbench"]);
const DECLARED_STATES = new Set(["active", "candidate", "planned", "hold"]);
const VALIDATION_STATES = new Set(["not_run", "passed", "failed", "unknown"]);
const CLAIM_CEILINGS = new Set(["observed", "source_supported", "validated_private", "canon_candidate", "canon_entry", "rejected_or_blocked"]);
const RUNTIME_STATES = new Set(["unknown", "not_applicable"]);
const PAYLOAD_STATES = new Set(["none", "metadata_only", "public_safe_contract"]);
const NODE_KINDS = new Set(["external", "supervisor", "worker", "store", "gate", "consumer", "provider", "domain_engine", "module", "operation", "knowledge", "workbench"]);
const LAYERS = new Set(["system", "subsystem", "module", "operation", "runtime"]);
const DIAGNOSTIC_STATES = new Set(["structural", "validator_backed", "unknown"]);
const REPAIR_STATES = new Set(["none", "candidate_only", "owner_approval_required"]);
const RELATIONS = new Set(["data", "control", "contains", "imports", "projects", "advises", "validates", "observes"]);
const EVIDENCE_MODES = new Set(["structural_only", "receipt_required"]);

const ID_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ABSOLUTE_PATH_PATTERN = /(?:^|[^a-z0-9])(?:[a-z]:[\\/]|\\\\|\/(?:users|home|mnt|var|etc|opt|tmp|root|volumes)(?:[\\/]|$)|file:)/i;
const PROJECT_CODE_PATTERN = /(?:^|[^a-z0-9])[a-z]\d{2}[-_]\d{3}(?:[^a-z0-9]|$)/i;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const SECRET_ASSIGNMENT_PATTERN = /(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+/i;
const FORBIDDEN_KEYS = new Set([
  "source_text", "chunk_text", "answer_body", "raw_payload", "private_payload",
  "notebook_id", "account_id", "session_id", "credential", "credential_ref",
  "absolute_path", "runtime_path", "health", "delivery", "delivery_state",
]);

export class TopologyFederationError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "TopologyFederationError";
    this.code = code;
  }
}

function fail(code, detail = "") {
  throw new TopologyFederationError(code, detail);
}

function assertPlainObject(value, code, detail) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, detail);
  }
}

function assertExactKeys(value, expected, code, detail) {
  assertPlainObject(value, code, detail);
  const actual = Object.keys(value);
  const missing = [...expected].filter((key) => !Object.hasOwn(value, key));
  const extra = actual.filter((key) => !expected.has(key));
  if (missing.length || extra.length) fail(code, `${detail};missing=${missing.join(",")};extra=${extra.join(",")}`);
}

function assertId(value, code, detail) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) fail(code, detail);
}

function assertLabel(value, code, detail) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) fail(code, detail);
}

function assertEnum(value, allowed, code, detail) {
  if (!allowed.has(value)) fail(code, detail);
}

function assertSortedUniqueIds(values, code, detail) {
  if (!Array.isArray(values)) fail(code, detail);
  const seen = new Set();
  for (const value of values) {
    assertId(value, code, detail);
    if (seen.has(value)) fail(code, `${detail};duplicate=${value}`);
    seen.add(value);
  }
  return [...seen].sort(compareCodePoints);
}

function assertPublicSafe(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicSafe(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) fail("topology_provider_forbidden_key", `${path}.${key}`);
      assertPublicSafe(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (ABSOLUTE_PATH_PATTERN.test(value)) fail("topology_provider_absolute_path", path);
  if (PROJECT_CODE_PATTERN.test(value)) fail("topology_provider_project_identifier", path);
  if (EMAIL_PATTERN.test(value)) fail("topology_provider_email", path);
  if (SECRET_ASSIGNMENT_PATTERN.test(value)) fail("topology_provider_secret_value", path);
}

function normaliseNode(node, providerId) {
  assertExactKeys(node, NODE_KEYS, "topology_provider_node_shape", `${providerId}.${node?.id ?? "unknown"}`);
  assertId(node.id, "topology_provider_node_id", providerId);
  assertLabel(node.label, "topology_provider_node_label", `${providerId}.${node.id}`);
  assertEnum(node.kind, NODE_KINDS, "topology_provider_node_kind", `${providerId}.${node.id}`);
  assertEnum(node.layer, LAYERS, "topology_provider_node_layer", `${providerId}.${node.id}`);
  if (node.parent_id !== null) assertId(node.parent_id, "topology_provider_node_parent", `${providerId}.${node.id}`);
  if (node.group !== null) assertLabel(node.group, "topology_provider_node_group", `${providerId}.${node.id}`);
  assertEnum(node.diagnostic_state, DIAGNOSTIC_STATES, "topology_provider_node_diagnostic", `${providerId}.${node.id}`);
  assertEnum(node.repair_state, REPAIR_STATES, "topology_provider_node_repair", `${providerId}.${node.id}`);
  return { ...node };
}

function normaliseEdge(edge, providerId) {
  assertExactKeys(edge, EDGE_KEYS, "topology_provider_edge_shape", `${providerId}.${edge?.id ?? "unknown"}`);
  for (const field of ["id", "from", "to"]) assertId(edge[field], `topology_provider_edge_${field}`, `${providerId}.${edge?.id ?? "unknown"}`);
  assertLabel(edge.label, "topology_provider_edge_label", `${providerId}.${edge.id}`);
  assertEnum(edge.relation, RELATIONS, "topology_provider_edge_relation", `${providerId}.${edge.id}`);
  assertEnum(edge.layer, LAYERS, "topology_provider_edge_layer", `${providerId}.${edge.id}`);
  assertEnum(edge.evidence_mode, EVIDENCE_MODES, "topology_provider_edge_evidence", `${providerId}.${edge.id}`);
  if (edge.from.includes("::") || edge.to.includes("::")) fail("topology_provider_foreign_edge", `${providerId}.${edge.id}`);
  return { ...edge };
}

function assertParentGraph(nodes, providerId) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parent_id === null) continue;
    if (!nodesById.has(node.parent_id)) fail("topology_provider_parent_dangling", `${providerId}.${node.id}`);
    if (node.parent_id === node.id) fail("topology_provider_parent_cycle", `${providerId}.${node.id}`);
    const visited = new Set([node.id]);
    let cursor = node.parent_id;
    while (cursor !== null) {
      if (visited.has(cursor)) fail("topology_provider_parent_cycle", `${providerId}.${node.id}`);
      visited.add(cursor);
      cursor = nodesById.get(cursor)?.parent_id ?? null;
    }
  }
}

export function validateTopologyProviderFragment(fragment) {
  assertExactKeys(fragment, PROVIDER_KEYS, "topology_provider_shape", "provider");
  assertPublicSafe(fragment);
  if (fragment.schema_version !== AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION) fail("topology_provider_schema", fragment.schema_version);
  assertId(fragment.provider_id, "topology_provider_id", "provider_id");
  assertEnum(fragment.provider_kind, PROVIDER_KINDS, "topology_provider_kind", fragment.provider_id);
  assertLabel(fragment.label, "topology_provider_label", fragment.provider_id);
  assertEnum(fragment.declared_status, DECLARED_STATES, "topology_provider_declared_status", fragment.provider_id);
  assertEnum(fragment.claim_ceiling, CLAIM_CEILINGS, "topology_provider_claim_ceiling", fragment.provider_id);
  assertEnum(fragment.runtime_state, RUNTIME_STATES, "topology_provider_runtime_state", fragment.provider_id);
  assertEnum(fragment.payload_state, PAYLOAD_STATES, "topology_provider_payload_state", fragment.provider_id);

  assertExactKeys(fragment.source, SOURCE_KEYS, "topology_provider_source_shape", fragment.provider_id);
  for (const field of ["source_id", "schema_version", "revision"]) assertId(fragment.source[field], `topology_provider_source_${field}`, fragment.provider_id);
  if (typeof fragment.source.digest !== "string" || !SHA256_PATTERN.test(fragment.source.digest)) fail("topology_provider_source_digest", fragment.provider_id);

  assertExactKeys(fragment.validation, VALIDATION_KEYS, "topology_provider_validation_shape", fragment.provider_id);
  assertId(fragment.validation.validator_id, "topology_provider_validator_id", fragment.provider_id);
  assertEnum(fragment.validation.state, VALIDATION_STATES, "topology_provider_validation_state", fragment.provider_id);
  if (fragment.validation.evidence_ref !== null) {
    if (typeof fragment.validation.evidence_ref !== "string" || fragment.validation.evidence_ref.length > 240 || fragment.validation.evidence_ref.length === 0) {
      fail("topology_provider_evidence_ref", fragment.provider_id);
    }
  }
  if (fragment.validation.state === "passed" && fragment.validation.evidence_ref === null) fail("topology_provider_pass_without_evidence", fragment.provider_id);
  if (fragment.validation.source_commit !== null && !COMMIT_PATTERN.test(fragment.validation.source_commit)) fail("topology_provider_source_commit", fragment.provider_id);

  assertExactKeys(fragment.capabilities, CAPABILITY_KEYS, "topology_provider_capabilities_shape", fragment.provider_id);
  const capabilities = {
    observe: assertSortedUniqueIds(fragment.capabilities.observe, "topology_provider_capability", `${fragment.provider_id}.observe`),
    diagnose: assertSortedUniqueIds(fragment.capabilities.diagnose, "topology_provider_capability", `${fragment.provider_id}.diagnose`),
    propose_repair: assertSortedUniqueIds(fragment.capabilities.propose_repair, "topology_provider_capability", `${fragment.provider_id}.propose_repair`),
    execute_repair: fragment.capabilities.execute_repair,
  };
  if (capabilities.execute_repair !== false) fail("topology_provider_repair_execution_forbidden", fragment.provider_id);

  assertExactKeys(fragment.authority_boundary, AUTHORITY_KEYS, "topology_provider_authority_shape", fragment.provider_id);
  for (const key of AUTHORITY_KEYS) {
    if (fragment.authority_boundary[key] !== false) fail("topology_provider_authority_forbidden", `${fragment.provider_id}.${key}`);
  }

  const blockerCodes = assertSortedUniqueIds(fragment.blocker_codes, "topology_provider_blocker_code", fragment.provider_id);
  if (!Array.isArray(fragment.nodes) || fragment.nodes.length === 0) fail("topology_provider_nodes", fragment.provider_id);
  if (!Array.isArray(fragment.edges)) fail("topology_provider_edges", fragment.provider_id);
  const nodes = fragment.nodes.map((node) => normaliseNode(node, fragment.provider_id));
  const edges = fragment.edges.map((edge) => normaliseEdge(edge, fragment.provider_id));
  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) fail("topology_provider_node_duplicate", `${fragment.provider_id}.${node.id}`);
    nodeIds.add(node.id);
  }
  assertParentGraph(nodes, fragment.provider_id);
  const edgeIds = new Set();
  const edgeTuples = new Set();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) fail("topology_provider_edge_duplicate", `${fragment.provider_id}.${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) fail("topology_provider_edge_dangling", `${fragment.provider_id}.${edge.id}`);
    const tuple = `${edge.from}\u0000${edge.to}\u0000${edge.relation}\u0000${edge.label}`;
    if (edgeTuples.has(tuple)) fail("topology_provider_edge_tuple_duplicate", `${fragment.provider_id}.${edge.id}`);
    edgeTuples.add(tuple);
  }

  return {
    ...fragment,
    source: { ...fragment.source },
    validation: { ...fragment.validation },
    capabilities,
    authority_boundary: { ...fragment.authority_boundary },
    blocker_codes: blockerCodes,
    nodes: nodes.sort((left, right) => compareCodePoints(left.id, right.id)),
    edges: edges.sort((left, right) => compareCodePoints(left.id, right.id)),
  };
}

export function composeFederatedTopology(fragments) {
  if (!Array.isArray(fragments) || fragments.length === 0) fail("topology_federation_sources", "empty");
  const providers = fragments.map(validateTopologyProviderFragment)
    .sort((left, right) => compareCodePoints(left.provider_id, right.provider_id));
  const providerIds = new Set();
  const sourceIds = new Set();
  for (const provider of providers) {
    if (providerIds.has(provider.provider_id)) fail("topology_federation_provider_duplicate", provider.provider_id);
    providerIds.add(provider.provider_id);
    if (sourceIds.has(provider.source.source_id)) fail("topology_federation_source_duplicate", provider.source.source_id);
    sourceIds.add(provider.source.source_id);
  }

  const nodes = providers.flatMap((provider) => provider.nodes.map((node) => ({
    ...node,
    id: `${provider.provider_id}::${node.id}`,
    parent_id: node.parent_id === null ? null : `${provider.provider_id}::${node.parent_id}`,
    provider_id: provider.provider_id,
  }))).sort((left, right) => compareCodePoints(left.id, right.id));
  const edges = providers.flatMap((provider) => provider.edges.map((edge) => ({
    ...edge,
    id: `${provider.provider_id}::${edge.id}`,
    from: `${provider.provider_id}::${edge.from}`,
    to: `${provider.provider_id}::${edge.to}`,
    provider_id: provider.provider_id,
  }))).sort((left, right) => compareCodePoints(left.id, right.id));

  const body = {
    schema_version: AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION,
    projection_kind: "declared_structure",
    providers,
    nodes,
    edges,
    source_set_digest: topologyDigest(providers.map(({ provider_id, source }) => ({ provider_id, source }))),
    summary: {
      provider_count: providers.length,
      node_count: nodes.length,
      edge_count: edges.length,
      runtime_authority: false,
      repair_execution_authority: false,
    },
  };
  return { ...body, topology_digest: topologyDigest(body) };
}

export function reconcileTopologySets(declared, observed) {
  const declaredSet = normaliseTopologySet(declared, "declared");
  const observedSet = normaliseTopologySet(observed, "observed");
  const nodes = reconcileKind("node", declaredSet.nodes, observedSet.nodes);
  const edges = reconcileKind("edge", declaredSet.edges, observedSet.edges);
  return {
    schema_version: AX_TOPOLOGY_RECONCILIATION_SCHEMA_VERSION,
    declared_digest: topologyDigest(declaredSet),
    observed_digest: topologyDigest(observedSet),
    nodes,
    edges,
    drift: nodes.declared_only.length > 0 || nodes.observed_only.length > 0 || nodes.changed.length > 0
      || edges.declared_only.length > 0 || edges.observed_only.length > 0 || edges.changed.length > 0,
  };
}

function normaliseTopologySet(value, side) {
  assertPlainObject(value, "topology_reconciliation_shape", side);
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) fail("topology_reconciliation_shape", side);
  return {
    nodes: value.nodes.map((entry) => normaliseObservedEntry(entry, "node", side))
      .sort((left, right) => compareCodePoints(itemIdentity("node", left), itemIdentity("node", right))),
    edges: value.edges.map((entry) => normaliseObservedEntry(entry, "edge", side))
      .sort((left, right) => compareCodePoints(itemIdentity("edge", left), itemIdentity("edge", right))),
  };
}

function normaliseObservedEntry(entry, kind, side) {
  assertPlainObject(entry, "topology_reconciliation_entry", `${side}.${kind}`);
  assertPublicSafe(entry, `${side}.${kind}`);
  itemIdentity(kind, entry);
  return canonicaliseValue(entry);
}

function itemIdentity(kind, entry) {
  if (typeof entry.id === "string" && entry.id.length > 0) return entry.id;
  if (kind === "edge" && typeof entry.from === "string" && typeof entry.to === "string") {
    const relation = entry.relation ?? entry.flow ?? "unknown";
    const label = entry.label ?? "";
    return `${entry.from}>${entry.to}|${relation}|${label}`;
  }
  fail("topology_reconciliation_identity", kind);
}

function reconcileKind(kind, declaredEntries, observedEntries) {
  const declared = new Map(declaredEntries.map((entry) => [itemIdentity(kind, entry), entry]));
  const observed = new Map(observedEntries.map((entry) => [itemIdentity(kind, entry), entry]));
  if (declared.size !== declaredEntries.length || observed.size !== observedEntries.length) fail("topology_reconciliation_duplicate", kind);
  const declaredOnly = [];
  const observedOnly = [];
  const common = [];
  const changed = [];
  for (const [id, entry] of declared) {
    if (!observed.has(id)) {
      declaredOnly.push(id);
      continue;
    }
    const observedEntry = observed.get(id);
    if (canonicalStringify(entry) === canonicalStringify(observedEntry)) common.push(id);
    else changed.push({ id, declared_digest: topologyDigest(entry), observed_digest: topologyDigest(observedEntry) });
  }
  for (const id of observed.keys()) if (!declared.has(id)) observedOnly.push(id);
  return {
    declared_only: declaredOnly.sort(compareCodePoints),
    observed_only: observedOnly.sort(compareCodePoints),
    common: common.sort(compareCodePoints),
    changed: changed.sort((left, right) => compareCodePoints(left.id, right.id)),
  };
}

export function canonicalStringify(value) {
  return `${JSON.stringify(canonicaliseValue(value), null, 2)}\n`;
}

function canonicaliseValue(value) {
  if (Array.isArray(value)) return value.map(canonicaliseValue);
  if (value !== null && typeof value === "object") {
    // A normal object treats `__proto__` as a setter and silently drops it. A null-prototype
    // object preserves every JSON member so no attacker-controlled key can disappear from a
    // digest or declared/observed comparison.
    const result = Object.create(null);
    for (const key of Object.keys(value).sort(compareCodePoints)) result[key] = canonicaliseValue(value[key]);
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) fail("topology_non_finite_number");
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
  fail("topology_non_json_value", typeof value);
}

export function topologyDigest(value) {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
