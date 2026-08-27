import { createHash } from "node:crypto";

import {
  AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
  validateTopologyProviderFragment,
} from "./topology_federation.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WATCHTOWER_SCHEMA_VERSION = "soulforge.watchtower.topology.v1";
const ENGINE_TOPOLOGY_VERSION = "engine_topology.v0";

const AUTHORITY_BOUNDARY = Object.freeze({
  source_truth: false,
  answer_authority: false,
  owner_approval_authority: false,
  runtime_mutation: false,
});

export class TopologyProviderAdapterError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "TopologyProviderAdapterError";
    this.code = code;
  }
}

function fail(code, detail = "") {
  throw new TopologyProviderAdapterError(code, detail);
}

function assertPlainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
}

function digestExactSourceBytes(sourceBytes, sourceId) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) {
    fail("topology_adapter_source_bytes_invalid", sourceId);
  }
  return createHash("sha256").update(sourceBytes).digest("hex");
}

function assertExpectedCounts(nodes, edges, expectedNodes, expectedEdges, sourceId) {
  if (!Array.isArray(nodes) || nodes.length !== expectedNodes) {
    fail("topology_adapter_node_count_mismatch", `${sourceId};expected=${expectedNodes};actual=${nodes?.length ?? "missing"}`);
  }
  if (!Array.isArray(edges) || edges.length !== expectedEdges) {
    fail("topology_adapter_edge_count_mismatch", `${sourceId};expected=${expectedEdges};actual=${edges?.length ?? "missing"}`);
  }
}

function engineeringEngineModuleId(modulePath) {
  const readable = modulePath.replace(/\//g, ".");
  return readable.length <= 95
    ? readable
    : `module.${createHash("sha256").update(readable).digest("hex").slice(0, 32)}`;
}

function baseProvider({
  providerId,
  providerKind,
  label,
  source,
  declaredStatus,
  validatorId,
  evidenceRef,
  blockerCodes,
  nodes,
  edges,
}) {
  return validateTopologyProviderFragment({
    schema_version: AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
    provider_id: providerId,
    provider_kind: providerKind,
    label,
    source,
    declared_status: declaredStatus,
    validation: {
      validator_id: validatorId,
      state: "passed",
      evidence_ref: evidenceRef,
      source_commit: null,
    },
    capabilities: {
      observe: ["declared_structure"],
      diagnose: ["structural_validation"],
      propose_repair: [],
      execute_repair: false,
    },
    authority_boundary: { ...AUTHORITY_BOUNDARY },
    claim_ceiling: "observed",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: blockerCodes,
    nodes,
    edges,
  });
}

export function adaptWatchtowerTopology(topology, exactSourceBytes) {
  assertPlainObject(topology, "topology_adapter_watchtower_shape");
  const exactByteDigest = digestExactSourceBytes(exactSourceBytes, "watchtower_topology_source");
  if (topology.schema_version !== WATCHTOWER_SCHEMA_VERSION) {
    fail("topology_adapter_watchtower_schema_mismatch", topology.schema_version ?? "missing");
  }
  assertExpectedCounts(topology.nodes, topology.edges, 28, 36, "watchtower_topology_source");

  const nodes = topology.nodes.map((node) => {
    assertPlainObject(node, "topology_adapter_watchtower_node_shape");
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      layer: "subsystem",
      parent_id: null,
      group: node.group,
      diagnostic_state: "validator_backed",
      repair_state: "none",
    };
  });
  const edges = topology.edges.map((edge) => {
    assertPlainObject(edge, "topology_adapter_watchtower_edge_shape");
    return {
      id: `edge.${edge.from}.${edge.to}.${edge.flow}`,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      relation: edge.flow,
      layer: "subsystem",
      evidence_mode: "structural_only",
    };
  });

  return baseProvider({
    providerId: "watchtower",
    providerKind: "platform",
    label: "Soulforge Watchtower declared topology",
    source: {
      source_id: "watchtower_topology_source",
      schema_version: topology.schema_version,
      revision: "watchtower_topology.v1",
      digest: exactByteDigest,
    },
    declaredStatus: "active",
    validatorId: "watchtower_topology_adapter.v1",
    evidenceRef: "guild_hall/watchtower/topology.mjs",
    blockerCodes: ["delivery_receipts_absent", "runtime_observation_absent"],
    nodes,
    edges,
  });
}

export function adaptEngineeringEngineTopology(exactSourceBytes) {
  const exactByteDigest = digestExactSourceBytes(exactSourceBytes, "engineering_engine_topology_source");
  let topology;
  try {
    topology = JSON.parse(exactSourceBytes.toString("utf8"));
  } catch {
    fail("topology_adapter_engine_json_invalid");
  }
  assertPlainObject(topology, "topology_adapter_engine_shape");
  if (topology.topology_version !== ENGINE_TOPOLOGY_VERSION) {
    fail("topology_adapter_engine_schema_mismatch", topology.topology_version ?? "missing");
  }
  if (typeof topology.contract_revision !== "string" || topology.contract_revision.length === 0) {
    fail("topology_adapter_engine_revision_missing");
  }
  if (topology.module_count !== topology.modules?.length || topology.module_edge_count !== topology.module_edges?.length) {
    fail("topology_adapter_engine_declared_count_mismatch");
  }
  // 175/563. Pinned to the canonical recursive multi-domain topology across core/,
  // engines/systems_engineering/, engines/quality_readiness/, and
  // engines/database_engineering/, engines/material_procurement_readiness/,
  // engines/reliability_maintainability/, and engines/pcb_compliance/. Legacy flat compatibility
  // wrappers (kernel, assembly, stage_rules, subjects, observation, guidance, evaluation, mcp,
  // fixtures, tools, tests) are excluded from canonical module counts.
  assertExpectedCounts(topology.modules, topology.module_edges, 175, 563, "engineering_engine_topology_source");
  assertEmbeddedEngineDigest(topology);

  const nodes = topology.modules.map((module) => {
    assertPlainObject(module, "topology_adapter_engine_module_shape");
    const id = engineeringEngineModuleId(module.module);
    return {
      id,
      label: module.module,
      kind: "module",
      layer: "module",
      parent_id: null,
      group: module.area.replace(/\//g, "."),
      diagnostic_state: "validator_backed",
      repair_state: "none",
    };
  });
  const edges = topology.module_edges.map((edge) => {
    assertPlainObject(edge, "topology_adapter_engine_edge_shape");
    if (edge.relation !== "imports") fail("topology_adapter_engine_relation_mismatch", edge.relation ?? "missing");
    const from = engineeringEngineModuleId(edge.from);
    const to = engineeringEngineModuleId(edge.to);
    const rawId = `imports.${from}.${to}`;
    const id = rawId.length <= 95 ? rawId : `imports.${createHash("sha256").update(rawId).digest("hex").slice(0, 32)}`;
    return {
      id,
      from,
      to,
      label: "imports",
      relation: "imports",
      layer: "module",
      evidence_mode: "structural_only",
    };
  });

  return baseProvider({
    providerId: "engineering_engine",
    providerKind: "domain_engine",
    label: "Soulforge Engineering Engine declared module topology",
    source: {
      source_id: "engineering_engine_topology_source",
      schema_version: topology.topology_version,
      revision: topology.contract_revision,
      digest: exactByteDigest,
    },
    declaredStatus: "candidate",
    validatorId: "engineering_engine_topology_adapter.v1",
    evidenceRef: "guild_hall/engineering_engine/topology/engine_topology.json",
    blockerCodes: ["module_load_receipts_absent", "runtime_observation_absent"],
    nodes,
    edges,
  });
}

function assertEmbeddedEngineDigest(topology) {
  if (typeof topology.topology_digest !== "string" || !SHA256_PATTERN.test(topology.topology_digest)) {
    fail("topology_adapter_engine_embedded_digest_invalid");
  }
  const { topology_digest: expected, ...body } = topology;
  const actual = createHash("sha256").update(stableStringify(body), "utf8").digest("hex");
  if (actual !== expected) fail("topology_adapter_engine_embedded_digest_mismatch");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
