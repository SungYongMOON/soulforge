import { createHash } from "node:crypto";

import {
  AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
  validateTopologyProviderFragment,
} from "../topology_federation.mjs";

export const KNOWLEDGE_STACK_SOURCE_REFS = Object.freeze([
  ".party/knowledge_wiki_cell/party.yaml",
  ".workflow/knowledge_wiki_pipeline_v0/workflow.yaml",
  "guild_hall/knowledge_access/README.md",
  "guild_hall/knowledge_canon/README.md",
  "guild_hall/knowledge_graph/README.md",
  "guild_hall/rag/README.md",
]);

const SOURCE_ANCHORS = new Map([
  [
    ".party/knowledge_wiki_cell/party.yaml",
    [
      "party_id: knowledge_wiki_cell",
      "default_workflow_id: knowledge_wiki_pipeline_v0",
    ],
  ],
  [
    ".workflow/knowledge_wiki_pipeline_v0/workflow.yaml",
    [
      "workflow_id: knowledge_wiki_pipeline_v0",
      "- knowledge_access_event_capture_v0",
      "- workflow_id: rag_metadata_refresh_v0",
      "rag_refresh_handoff_is_metadata_only: true",
    ],
  ],
  [
    "guild_hall/knowledge_access/README.md",
    [
      "`knowledge_access/` is a small public-safe command surface",
      "append selected-evidence `retrieve` rows automatically",
    ],
  ],
  [
    "guild_hall/knowledge_canon/README.md",
    ["builds and validates a bounded ontology canon release"],
  ],
  [
    "guild_hall/knowledge_graph/README.md",
    [
      "generates metadata-only graph views from Soulforge public canon metadata and explicit knowledge-access ledger analysis",
      "embeds a metadata-only `rag_projection` block",
    ],
  ],
  [
    "guild_hall/rag/README.md",
    [
      "builds a derived `rag_manifest_v0` from safe graph/canon metadata",
      "outputs append one metadata-only `retrieve` event",
    ],
  ],
]);

const AUTHORITY_BOUNDARY = Object.freeze({
  source_truth: false,
  answer_authority: false,
  owner_approval_authority: false,
  runtime_mutation: false,
});

export class KnowledgeStackTopologyError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "KnowledgeStackTopologyError";
    this.code = code;
  }
}

function fail(code, detail = "") {
  throw new KnowledgeStackTopologyError(code, detail);
}

function normaliseSourceBundle(sourceBundle) {
  if (!Array.isArray(sourceBundle)) fail("knowledge_stack_source_bundle_shape");

  const byRef = new Map();
  for (const entry of sourceBundle) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || Object.getPrototypeOf(entry) !== Object.prototype) {
      fail("knowledge_stack_source_entry_shape");
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "bytes" || keys[1] !== "ref") {
      fail("knowledge_stack_source_entry_shape");
    }
    if (typeof entry.ref !== "string" || !KNOWLEDGE_STACK_SOURCE_REFS.includes(entry.ref)) {
      fail("knowledge_stack_source_not_allowlisted");
    }
    if (byRef.has(entry.ref)) fail("knowledge_stack_source_duplicate", entry.ref);
    if (!Buffer.isBuffer(entry.bytes) || entry.bytes.length === 0) {
      fail("knowledge_stack_source_bytes_invalid", entry.ref);
    }
    assertContractAnchors(entry.ref, entry.bytes);
    byRef.set(entry.ref, entry.bytes);
  }

  const missing = KNOWLEDGE_STACK_SOURCE_REFS.filter((ref) => !byRef.has(ref));
  if (missing.length !== 0 || byRef.size !== KNOWLEDGE_STACK_SOURCE_REFS.length) {
    fail("knowledge_stack_source_set_mismatch", `missing=${missing.join(",")}`);
  }

  return KNOWLEDGE_STACK_SOURCE_REFS.map((ref) => ({
    ref,
    sha256: createHash("sha256").update(byRef.get(ref)).digest("hex"),
  }));
}

function assertContractAnchors(ref, bytes) {
  const text = bytes.toString("utf8").replace(/\s+/g, " ");
  const missing = SOURCE_ANCHORS.get(ref).filter((anchor) => !text.includes(anchor));
  if (missing.length !== 0) fail("knowledge_stack_source_contract_mismatch", ref);
}

function digestSourceInventory(inventory) {
  return createHash("sha256").update(JSON.stringify(inventory), "utf8").digest("hex");
}

function node(id, label, kind) {
  return {
    id,
    label,
    kind,
    layer: "subsystem",
    parent_id: "knowledge_stack",
    group: "Knowledge",
    diagnostic_state: "structural",
    repair_state: "none",
  };
}

function edge(id, from, to, label, relation) {
  return {
    id,
    from,
    to,
    label,
    relation,
    layer: "subsystem",
    evidence_mode: "structural_only",
  };
}

export function buildKnowledgeStackTopologyProvider(sourceBundle) {
  const sourceInventory = normaliseSourceBundle(sourceBundle);
  return validateTopologyProviderFragment({
    schema_version: AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
    provider_id: "knowledge_stack",
    provider_kind: "knowledge",
    label: "Soulforge declared knowledge stack",
    source: {
      source_id: "knowledge_stack_owner_contracts",
      schema_version: "knowledge_stack_owner_contracts.v1",
      revision: "knowledge_stack_topology.v1",
      digest: digestSourceInventory(sourceInventory),
    },
    declared_status: "candidate",
    validation: {
      validator_id: "knowledge_stack_topology_provider.v1",
      state: "passed",
      evidence_ref: "guild_hall/watchtower/providers/knowledge_stack.mjs",
      source_commit: null,
    },
    capabilities: {
      observe: ["declared_knowledge_contracts"],
      diagnose: ["source_bundle_integrity", "structural_validation"],
      propose_repair: [],
      execute_repair: false,
    },
    authority_boundary: { ...AUTHORITY_BOUNDARY },
    claim_ceiling: "source_supported",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: ["runtime_observation_absent"],
    nodes: [
      {
        id: "knowledge_stack",
        label: "Knowledge stack",
        kind: "provider",
        layer: "system",
        parent_id: null,
        group: "Knowledge",
        diagnostic_state: "validator_backed",
        repair_state: "none",
      },
      node("knowledge_access", "Knowledge access", "provider"),
      node("knowledge_canon", "Knowledge canon package", "knowledge"),
      node("knowledge_graph", "Knowledge graph", "knowledge"),
      node("rag", "RAG", "knowledge"),
      node("wiki_cell", "Knowledge Wiki Cell", "supervisor"),
      node("wiki_pipeline", "Knowledge Wiki Pipeline", "operation"),
    ],
    edges: [
      edge("access_projects_graph", "knowledge_access", "knowledge_graph", "explicit ledger analysis projection", "projects"),
      edge("canon_projects_graph", "knowledge_canon", "knowledge_graph", "public canon metadata projection", "projects"),
      edge("canon_supplies_rag", "knowledge_canon", "rag", "safe canon metadata", "data"),
      edge("graph_supplies_rag", "knowledge_graph", "rag", "safe graph metadata", "data"),
      edge("rag_projects_graph", "rag", "knowledge_graph", "metadata-only RAG overlay", "projects"),
      edge("rag_records_access", "rag", "knowledge_access", "metadata-only retrieval events", "data"),
      edge("wiki_cell_routes_pipeline", "wiki_cell", "wiki_pipeline", "default workflow", "control"),
      edge("wiki_pipeline_advises_rag", "wiki_pipeline", "rag", "metadata-only refresh handoff", "advises"),
      edge("wiki_pipeline_routes_access", "wiki_pipeline", "knowledge_access", "knowledge access capture stage", "control"),
    ],
  });
}
