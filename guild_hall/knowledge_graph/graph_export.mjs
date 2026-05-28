import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildBundle } from "esbuild";
import { parse as parseYaml } from "yaml";
import { analyzeKnowledgeAccessLedgers } from "../knowledge_access/ledger.mjs";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";

export const KNOWLEDGE_GRAPH_SCHEMA_VERSION = "soulforge.knowledge_graph_view.v0";
export const KNOWLEDGE_GRAPH_VISUAL_MAPPING_VERSION = "soulforge.knowledge_graph_visual_mapping.v0";
export const KNOWLEDGE_GRAPH_GENERATOR_ID = "guild_hall.knowledge_graph.exporter.v0";
export const KNOWLEDGE_GRAPH_RAG_PROJECTION_SCHEMA_VERSION = "soulforge.knowledge_graph_rag_projection.v0";
export const KNOWLEDGE_GRAPH_SOURCE_SLICE_PROJECTION_SCHEMA_VERSION =
  "soulforge.knowledge_graph_source_slice_projection.v0";
export const KNOWLEDGE_GRAPH_RELATION_REVIEW_PROJECTION_SCHEMA_VERSION =
  "soulforge.knowledge_graph_relation_review_projection.v0";

const RAG_MANIFEST_SCHEMA_VERSION = "soulforge.rag_manifest.v0";
const SOURCE_SLICE_TRIAGE_REGISTER_SCHEMA_VERSION = "soulforge.source_slice_triage_register.v0";
const SOURCE_SLICE_REVIEW_QUEUE_SCHEMA_VERSION = "soulforge.source_slice_review_queue.v0";
const GRAPH_RELATION_REVIEW_QUEUE_SCHEMA_VERSION = "soulforge.rag_graph_relation_review_queue.v0";

export const NODE_TYPES = [
  "knowledge",
  "concept",
  "source",
  "project",
  "workflow",
  "party",
  "mission",
  "species",
  "class",
  "unit",
  "model_profile",
  "agent_surface",
  "agent_run",
  "validation",
  "artifact",
];

const NODE_COLORS = {
  knowledge: "#2563eb",
  concept: "#64748b",
  source: "#0891b2",
  project: "#16a34a",
  workflow: "#7c3aed",
  party: "#4f46e5",
  mission: "#f97316",
  species: "#92400e",
  class: "#db2777",
  unit: "#65a30d",
  model_profile: "#dc2626",
  agent_surface: "#9333ea",
  agent_run: "#334155",
  validation: "#ca8a04",
  artifact: "#0284c7",
  unknown_node: "#94a3b8",
};

const BORDER_COLORS = {
  observed: "#94a3b8",
  source_supported: "#eab308",
  validated_private: "#2563eb",
  canon_candidate: "#7c3aed",
  canon_entry: "#16a34a",
  rejected_or_blocked: "#dc2626",
  unknown: "#cbd5e1",
};

const RELATION_COLORS = {
  uses: "#38bdf8",
  supports: "#14b8a6",
  derived_from: "#c084fc",
  conflicts_with: "#f43f5e",
  validates: "#84cc16",
  routes_to: "#f59e0b",
  recommends: "#ec4899",
  belongs_to: "#94a3b8",
  produces: "#fb7185",
  consumes: "#a3e635",
  co_used_with: "#2dd4bf",
  requires_owner_decision: "#f8fafc",
  has_species: "#22c55e",
  has_class: "#facc15",
  chains: "#a78bfa",
  related_candidate: "#94a3b8",
};

const FORBIDDEN_RAG_PROJECTION_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_text",
  "content",
  "bm25",
  "bm25_index",
  "chunk_ref",
  "embedding",
  "embeddings",
  "excerpt",
  "html",
  "index_payload",
  "index_ref",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "payload",
  "private_payload",
  "raw",
  "raw_payload",
  "ready_for_index",
  "secret",
  "source_body",
  "source_text_ref",
  "source_text",
  "text",
  "vector",
  "vector_index",
  "vector_store",
  "vectors",
]);

const FORBIDDEN_RAG_PROJECTION_KEY_PATTERNS = [
  /body/i,
  /chunk/i,
  /content/i,
  /embedding/i,
  /excerpt/i,
  /payload/i,
  /raw/i,
  /secret/i,
  /source.*locator.*payload/i,
  /source.*text/i,
  /text.*source/i,
  /notebooklm.*answer/i,
  /bm25/i,
  /vector/i,
  /index.*payload/i,
  /owner.*decision.*payload/i,
];

const CLAIM_STRENGTH = {
  unknown: 0,
  rejected_or_blocked: 0,
  observed: 1,
  source_supported: 2,
  validated_private: 3,
  canon_candidate: 4,
  canon_entry: 5,
};

const SAFE_RAG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SAFE_RAG_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const RELATION_TYPES = Object.keys(RELATION_COLORS);

const DEFAULT_ENCODING = {
  node_size_by: "total_access_count",
  node_opacity_by: "days_since_last_access",
  node_color_by: "node_type",
  node_border_color_by: "claim_ceiling",
  node_border_style_by: "lifecycle_status",
  edge_width_by: "evidence_event_count",
  edge_opacity_by: "days_since_last_evidence",
  edge_color_by: "relation_type",
  edge_style_by: "relation_state",
  edge_arrow_by: "directed",
};

const RUNTIME_CONTROLS = {
  editable_thresholds: true,
  editable_palette: true,
  editable_filters: true,
  editable_layout: true,
  semantic_mapping_mutable: false,
};

const LAYOUT_PRESETS = ["force_auto", "semantic_regions", "hybrid_regions_force", "radial_focus"];
const SYMMETRIC_RELATIONS = new Set(["co_used_with", "conflicts_with"]);
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function exportKnowledgeGraph(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const exportId = normalizeExportId(options.exportId ?? "knowledge_graph_view_v0");
  const now = normalizeNow(options.now);
  const generatedAtUtc = formatTimestampUtc(now);
  const outputRootRef = safeKnowledgeGraphOutputRoot(options.outputRoot ?? "_workspaces/system/knowledge_view");
  const outputRoot = path.join(repoRoot, outputRootRef);
  const graphDir = path.join(outputRoot, "graph_export", exportId);
  const obsidianDir = path.join(outputRoot, "obsidian_export", exportId);

  const graph = await buildKnowledgeGraph({
    repoRoot,
    exportId,
    generatedAtUtc,
    now,
    ledgerRefs: normalizeInputList(options.ledgerRefs ?? options.ledgerRef),
    ledgerFiles: normalizeInputList(options.ledgerFiles ?? options.ledgerFile),
    ragManifestRefs: normalizeInputList(options.ragManifestRefs ?? options.ragManifestRef),
    sourceSliceTriageRegisterRefs: normalizeInputList(
      options.sourceSliceTriageRegisterRefs ?? options.sourceSliceTriageRegisterRef,
    ),
    sourceSliceReviewQueueRefs: normalizeInputList(options.sourceSliceReviewQueueRefs ?? options.sourceSliceReviewQueueRef),
    graphRelationReviewQueueRefs: normalizeInputList(
      options.graphRelationReviewQueueRefs ?? options.graphRelationReviewQueueRef,
    ),
  });

  await fs.mkdir(graphDir, { recursive: true });
  await fs.mkdir(obsidianDir, { recursive: true });
  const graphPath = path.join(graphDir, "graph.json");
  const htmlPath = path.join(graphDir, "graph_preview.html");
  const html2dPath = path.join(graphDir, "graph_preview_2d.html");
  const bundlePath = path.join(graphDir, "graph_preview_3d.bundle.js");

  await writeJson(graphPath, graph);
  await writeGraph3dBundle(bundlePath);
  await fs.writeFile(html2dPath, renderGraphHtml2d(graph), "utf8");
  await fs.writeFile(htmlPath, renderGraphHtml3d(graph), "utf8");
  await writeObsidianExport({ graph, outputDir: obsidianDir });

  return {
    status: "exported",
    export_id: exportId,
    graph_ref: normalizeRepoPath(path.relative(repoRoot, graphPath)),
    html_ref: normalizeRepoPath(path.relative(repoRoot, htmlPath)),
    html_2d_ref: normalizeRepoPath(path.relative(repoRoot, html2dPath)),
    bundle_ref: normalizeRepoPath(path.relative(repoRoot, bundlePath)),
    obsidian_vault_ref: normalizeRepoPath(path.relative(repoRoot, obsidianDir)),
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
  };
}

export async function buildKnowledgeGraph({
  repoRoot,
  exportId = "knowledge_graph_view_v0",
  generatedAtUtc = formatTimestampUtc(new Date()),
  now = new Date(),
  ledgerRefs = [],
  ledgerFiles = [],
  ragManifestRefs = [],
  sourceSliceTriageRegisterRefs = [],
  sourceSliceReviewQueueRefs = [],
  graphRelationReviewQueueRefs = [],
} = {}) {
  const root = path.resolve(repoRoot ?? process.cwd());
  const nodes = new Map();
  const edges = new Map();
  const usage = await loadUsageRollup({ repoRoot: root, ledgerRefs, ledgerFiles });
  const ragProjection = await loadRagProjection({ repoRoot: root, ragManifestRefs });
  const sourceSliceProjection = await loadSourceSliceProjection({
    repoRoot: root,
    sourceSliceTriageRegisterRefs,
    sourceSliceReviewQueueRefs,
  });
  const graphRelationReviewProjection = await loadGraphRelationReviewProjection({
    repoRoot: root,
    graphRelationReviewQueueRefs,
  });

  await addKnowledgeNodes({ repoRoot: root, nodes });
  await addClassNodesAndEdges({ repoRoot: root, nodes, edges });
  await addSpeciesNodes({ repoRoot: root, nodes });
  await addUnitNodesAndEdges({ repoRoot: root, nodes, edges });
  await addWorkflowNodes({ repoRoot: root, nodes });
  await addWorkflowProfilePolicyEdges({ repoRoot: root, edges });
  await addPartyNodesAndEdges({ repoRoot: root, nodes, edges });
  addUsageNodesAndEdges({ nodes, edges, usage });
  applyRagProjectionToNodes(nodes, ragProjection);
  applySourceSliceProjectionToNodes(nodes, sourceSliceProjection);
  applyGraphRelationReviewProjectionToGraph(nodes, edges, graphRelationReviewProjection);

  const nodeList = [...nodes.values()]
    .map((node) => applyNodeMetricsAndVisuals(node, usage.byTarget.get(node.node_ref), now))
    .sort((left, right) => left.node_ref.localeCompare(right.node_ref));
  const edgeList = [...edges.values()]
    .map((edge) => applyEdgeVisuals(edge, now))
    .sort((left, right) => left.edge_ref.localeCompare(right.edge_ref));
  finalizeRagProjectionForGraph(ragProjection, nodeList, edgeList);
  finalizeSourceSliceProjectionForGraph(sourceSliceProjection);
  const connectivityAnalysis = analyzeGraphConnectivity(nodeList, edgeList);

  return {
    schema_version: KNOWLEDGE_GRAPH_SCHEMA_VERSION,
    kind: "knowledge_graph_export",
    status: usage.analysis?.status === "review_required" ? "review_required" : "draft",
    export_id: exportId,
    generator_id: KNOWLEDGE_GRAPH_GENERATOR_ID,
    visual_mapping_version: KNOWLEDGE_GRAPH_VISUAL_MAPPING_VERSION,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      visual_contract: "docs/architecture/guild_hall/KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md",
      ontology_contract: "docs/architecture/foundation/ONTOLOGY_MODEL_V0.md",
      relation_contract: "docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md",
      ledger_refs: usage.ledgerRefs,
      rag_manifest_refs: ragProjection?.manifest_refs.map((item) => item.manifest_ref) ?? [],
      source_slice_triage_register_refs:
        sourceSliceProjection?.triage_register_refs.map((item) => item.triage_register_ref) ?? [],
      source_slice_review_queue_refs:
        sourceSliceProjection?.review_queue_refs.map((item) => item.review_queue_ref) ?? [],
      graph_relation_review_queue_refs:
        graphRelationReviewProjection?.queue_refs.map((item) => item.queue_ref) ?? [],
    },
    graph_scope: {
      time_window: usage.timeWindow,
      source_surfaces: [
        "public_canon",
        "explicit_knowledge_access_ledgers",
        ...(ragProjection ? ["explicit_rag_manifest_refs"] : []),
        ...(sourceSliceProjection?.triage_register_refs.length ? ["explicit_source_slice_triage_register_refs"] : []),
        ...(sourceSliceProjection?.review_queue_refs.length ? ["explicit_source_slice_review_queue_refs"] : []),
        ...(graphRelationReviewProjection ? ["explicit_graph_relation_review_queue_refs"] : []),
      ],
      included_node_types: NODE_TYPES,
      included_relation_types: sortedUnique(edgeList.map((edge) => edge.relation_type)),
      included_lens_profile_ids: ragProjection?.lens_profiles.map((profile) => profile.lens_id) ?? [],
      ledger_refs: usage.ledgerRefs,
      rag_manifest_refs: ragProjection?.manifest_refs.map((item) => item.manifest_ref) ?? [],
      source_slice_triage_register_refs:
        sourceSliceProjection?.triage_register_refs.map((item) => item.triage_register_ref) ?? [],
      source_slice_review_queue_refs:
        sourceSliceProjection?.review_queue_refs.map((item) => item.review_queue_ref) ?? [],
      graph_relation_review_queue_refs:
        graphRelationReviewProjection?.queue_refs.map((item) => item.queue_ref) ?? [],
      canon_only: usage.ledgerRefs.length === 0 && !ragProjection && !sourceSliceProjection && !graphRelationReviewProjection,
      metadata_only: true,
    },
    visual_encoding: DEFAULT_ENCODING,
    runtime_controls: RUNTIME_CONTROLS,
    layout_presets: LAYOUT_PRESETS,
    connectivity_analysis: connectivityAnalysis,
    palettes: {
      node_type: NODE_COLORS,
      trust_border: BORDER_COLORS,
      relation_type: RELATION_COLORS,
    },
    thresholds: {
      node_size_access_count: [
        { max: 0, size_px: 8 },
        { min: 1, max: 1, size_px: 14 },
        { min: 2, max: 4, size_px: 24 },
        { min: 5, max: 9, size_px: 36 },
        { min: 10, size_px: 52 },
      ],
      recency_opacity_days: [
        { max_days: 30, opacity: 1 },
        { max_days: 90, opacity: 0.7 },
        { max_days: 180, opacity: 0.4 },
        { min_days: 181, opacity: 0.2 },
        { no_evidence: true, opacity: 0.15 },
      ],
      edge_width_evidence_count: [
        { min: 1, max: 1, width_px: 1 },
        { min: 2, max: 4, width_px: 2 },
        { min: 5, max: 9, width_px: 4 },
        { min: 10, width_px: 6 },
      ],
    },
    rag_projection: ragProjection,
    source_slice_projection: sourceSliceProjection,
    graph_relation_review_projection: graphRelationReviewProjection,
    nodes: nodeList,
    edges: edgeList,
    boundary: {
      metadata_only: true,
      no_raw_payloads: true,
      no_rag_source_payloads: true,
      no_source_slice_payloads: true,
      no_graph_relation_private_refs: true,
      no_notebooklm_answers: true,
      no_private_payloads: true,
      no_secret_or_session: true,
      no_runtime_absolute_paths: true,
      no_archive_or_retire_execution: true,
      no_canon_or_ontology_mutation: true,
      usage_count_is_signal_not_truth: true,
      generated_view_is_not_authority: true,
    },
    source_analysis: usage.analysis
      ? {
          status: usage.analysis.status,
          accepted_event_count: usage.analysis.accepted_event_count,
          invalid_event_count: usage.analysis.invalid_event_count,
          duplicate_event_count: usage.analysis.duplicate_event_count,
        }
      : null,
  };
}

async function addKnowledgeNodes({ repoRoot, nodes }) {
  const root = path.join(repoRoot, ".registry", "knowledge");
  for (const entry of await listChildDirs(root)) {
    const file = path.join(root, entry, "knowledge.yaml");
    const data = await readYaml(file);
    if (!data?.knowledge_id) {
      continue;
    }
    addNode(nodes, {
      node_ref: `.registry/knowledge/${data.knowledge_id}`,
      node_type: "knowledge",
      label: data.title ?? data.knowledge_id,
      summary: data.summary ?? null,
      owner_surface: ".registry/knowledge",
      source_refs: {
        node_type: `.registry/knowledge/${data.knowledge_id}/knowledge.yaml`,
        label: `.registry/knowledge/${data.knowledge_id}/knowledge.yaml`,
        trust: `.registry/knowledge/${data.knowledge_id}/knowledge.yaml`,
        lifecycle: `.registry/knowledge/${data.knowledge_id}/knowledge.yaml`,
      },
      trust: { claim_ceiling: data.claim_ceiling ?? "canon_entry" },
      lifecycle: { status: data.status ?? "unknown" },
    });
  }
}

async function addClassNodesAndEdges({ repoRoot, nodes, edges }) {
  const root = path.join(repoRoot, ".registry", "classes");
  for (const entry of await listChildDirs(root)) {
    const file = path.join(root, entry, "class.yaml");
    const data = await readYaml(file);
    if (!data?.class_id) {
      continue;
    }
    const classRef = `.registry/classes/${data.class_id}`;
    addNode(nodes, {
      node_ref: classRef,
      node_type: "class",
      label: data.title ?? data.class_id,
      summary: data.summary ?? null,
      owner_surface: ".registry/classes",
      source_refs: {
        node_type: `.registry/classes/${data.class_id}/class.yaml`,
        label: `.registry/classes/${data.class_id}/class.yaml`,
        trust: `.registry/classes/${data.class_id}/class.yaml`,
        lifecycle: `.registry/classes/${data.class_id}/class.yaml`,
      },
      trust: { claim_ceiling: "canon_entry" },
      lifecycle: { status: data.status ?? "unknown" },
    });

    const refsFile = path.join(root, entry, "knowledge_refs.yaml");
    if (!(await pathExists(refsFile))) {
      continue;
    }
    const refsData = await readYaml(refsFile);
    for (const item of refsData?.assign ?? []) {
      if (!item?.ref) {
        continue;
      }
      addEdge(edges, {
        from_ref: classRef,
        to_ref: `.registry/knowledge/${item.ref}`,
        relation_type: "uses",
        relation_state: "confirmed",
        source_refs: {
          relation_type: `.registry/classes/${data.class_id}/knowledge_refs.yaml`,
          strength: `.registry/classes/${data.class_id}/knowledge_refs.yaml`,
          state: `.registry/classes/${data.class_id}/knowledge_refs.yaml`,
        },
      });
    }
  }
}

async function addSpeciesNodes({ repoRoot, nodes }) {
  const root = path.join(repoRoot, ".registry", "species");
  for (const entry of await listChildDirs(root)) {
    const file = path.join(root, entry, "species.yaml");
    const data = await readYaml(file);
    if (!data?.species_id) {
      continue;
    }
    addNode(nodes, {
      node_ref: `.registry/species/${data.species_id}`,
      node_type: "species",
      label: data.title ?? data.species_id,
      summary: data.summary ?? null,
      owner_surface: ".registry/species",
      source_refs: {
        node_type: `.registry/species/${data.species_id}/species.yaml`,
        label: `.registry/species/${data.species_id}/species.yaml`,
        trust: `.registry/species/${data.species_id}/species.yaml`,
        lifecycle: `.registry/species/${data.species_id}/species.yaml`,
      },
      trust: { claim_ceiling: "canon_entry" },
      lifecycle: { status: data.status ?? "unknown" },
    });
  }
}

async function addUnitNodesAndEdges({ repoRoot, nodes, edges }) {
  const root = path.join(repoRoot, ".unit");
  for (const entry of await listChildDirs(root)) {
    const file = path.join(root, entry, "unit.yaml");
    const data = await readYaml(file);
    if (!data?.unit_id) {
      continue;
    }
    const unitRef = `.unit/${data.unit_id}`;
    addNode(nodes, {
      node_ref: unitRef,
      node_type: "unit",
      label: data.summary ? data.unit_id : data.unit_id,
      summary: data.summary ?? null,
      owner_surface: ".unit",
      source_refs: {
        node_type: `.unit/${data.unit_id}/unit.yaml`,
        label: `.unit/${data.unit_id}/unit.yaml`,
        trust: `.unit/${data.unit_id}/unit.yaml`,
        lifecycle: `.unit/${data.unit_id}/unit.yaml`,
      },
      trust: { claim_ceiling: "canon_entry" },
      lifecycle: { status: data.status ?? "unknown" },
    });
    if (data.identity?.species_id) {
      addEdge(edges, {
        from_ref: unitRef,
        to_ref: `.registry/species/${data.identity.species_id}`,
        relation_type: "has_species",
        relation_state: "confirmed",
        source_refs: {
          relation_type: `.unit/${data.unit_id}/unit.yaml`,
          strength: `.unit/${data.unit_id}/unit.yaml`,
          state: `.unit/${data.unit_id}/unit.yaml`,
        },
      });
    }
    for (const classId of data.class_ids ?? []) {
      addEdge(edges, {
        from_ref: unitRef,
        to_ref: `.registry/classes/${classId}`,
        relation_type: "has_class",
        relation_state: "confirmed",
        source_refs: {
          relation_type: `.unit/${data.unit_id}/unit.yaml`,
          strength: `.unit/${data.unit_id}/unit.yaml`,
          state: `.unit/${data.unit_id}/unit.yaml`,
        },
      });
    }
  }
}

async function addWorkflowNodes({ repoRoot, nodes }) {
  const indexFile = path.join(repoRoot, ".workflow", "index.yaml");
  const indexData = await readYaml(indexFile);
  for (const entry of indexData?.entries ?? []) {
    if (!entry?.workflow_id || !entry?.path) {
      continue;
    }
    const workflowFile = path.join(repoRoot, ".workflow", entry.path);
    const data = await readYaml(workflowFile);
    addNode(nodes, {
      node_ref: `.workflow/${entry.workflow_id}`,
      node_type: "workflow",
      label: data?.title ?? entry.workflow_id,
      summary: data?.summary ?? null,
      owner_surface: ".workflow",
      source_refs: {
        node_type: `.workflow/${entry.path}`,
        label: `.workflow/${entry.path}`,
        trust: `.workflow/${entry.path}`,
        lifecycle: `.workflow/${entry.path}`,
      },
      trust: { claim_ceiling: "canon_entry" },
      lifecycle: { status: data?.status ?? "unknown" },
    });
  }
}

async function addWorkflowProfilePolicyEdges({ repoRoot, edges }) {
  const indexFile = path.join(repoRoot, ".workflow", "index.yaml");
  const indexData = await readYaml(indexFile);
  for (const entry of indexData?.entries ?? []) {
    if (!entry?.workflow_id || !entry?.path) {
      continue;
    }
    const workflowDir = path.dirname(entry.path);
    const policyFile = path.join(repoRoot, ".workflow", workflowDir, "profile_policy.yaml");
    if (!(await pathExists(policyFile))) {
      continue;
    }
    const data = await readYaml(policyFile);
    const profile = data?.primary_profile;
    if (!profile) {
      continue;
    }
    const workflowRef = `.workflow/${entry.workflow_id}`;
    const policyRef = normalizeRepoPath(path.join(".workflow", workflowDir, "profile_policy.yaml"));
    const relationState = profilePolicyRelationState(profile);
    if (profile.species) {
      addEdge(edges, {
        from_ref: workflowRef,
        to_ref: `.registry/species/${profile.species}`,
        relation_type: "recommends",
        relation_state: relationState,
        source_refs: {
          relation_type: policyRef,
          strength: policyRef,
          state: policyRef,
        },
      });
    }
    if (profile.class) {
      addEdge(edges, {
        from_ref: workflowRef,
        to_ref: `.registry/classes/${profile.class}`,
        relation_type: "recommends",
        relation_state: relationState,
        source_refs: {
          relation_type: policyRef,
          strength: policyRef,
          state: policyRef,
        },
      });
    }
  }
}

function profilePolicyRelationState(profile) {
  const quality = String(profile.quality_gate ?? profile.quality_class ?? "").toLowerCase();
  if (quality.includes("pass")) {
    return "confirmed";
  }
  return "candidate";
}

async function addPartyNodesAndEdges({ repoRoot, nodes, edges }) {
  const indexFile = path.join(repoRoot, ".party", "index.yaml");
  const indexData = await readYaml(indexFile);
  for (const entry of indexData?.entries ?? []) {
    if (!entry?.party_id || !entry?.path) {
      continue;
    }
    const partyFile = path.join(repoRoot, ".party", entry.path);
    const data = await readYaml(partyFile);
    const partyRef = `.party/${entry.party_id}`;
    addNode(nodes, {
      node_ref: partyRef,
      node_type: "party",
      label: data?.title ?? entry.party_id,
      summary: data?.summary ?? null,
      owner_surface: ".party",
      source_refs: {
        node_type: `.party/${entry.path}`,
        label: `.party/${entry.path}`,
        trust: `.party/${entry.path}`,
        lifecycle: `.party/${entry.path}`,
      },
      trust: { claim_ceiling: "canon_entry" },
      lifecycle: { status: data?.status ?? "unknown" },
    });
    for (const chained of data?.workflow_chain ?? []) {
      if (!chained?.workflow_id) {
        continue;
      }
      addEdge(edges, {
        from_ref: partyRef,
        to_ref: `.workflow/${chained.workflow_id}`,
        relation_type: "chains",
        relation_state: "confirmed",
        source_refs: {
          relation_type: `.party/${entry.path}`,
          strength: `.party/${entry.path}`,
          state: `.party/${entry.path}`,
        },
      });
    }
    if (data?.default_workflow_id) {
      addEdge(edges, {
        from_ref: partyRef,
        to_ref: `.workflow/${data.default_workflow_id}`,
        relation_type: "routes_to",
        relation_state: "confirmed",
        source_refs: {
          relation_type: `.party/${entry.path}`,
          strength: `.party/${entry.path}`,
          state: `.party/${entry.path}`,
        },
      });
    }
  }
}

function addUsageNodesAndEdges({ nodes, edges, usage }) {
  for (const row of usage.rows) {
    const nodeRef = mapKnowledgeRefToNodeRef(row.knowledge_ref);
    if (!nodes.has(nodeRef)) {
      addNode(nodes, {
        node_ref: nodeRef,
        node_type: inferNodeTypeFromRef(nodeRef),
        label: labelFromRef(row.knowledge_ref),
        summary: null,
        owner_surface: ownerSurfaceFromRef(row.knowledge_ref),
        source_refs: {
          node_type: row.knowledge_ref,
          label: row.knowledge_ref,
          metrics: row.count_summary_ref,
          trust: row.knowledge_ref,
          lifecycle: row.knowledge_ref,
        },
        trust: { claim_ceiling: nodeRef.startsWith(".registry/") ? "canon_entry" : "observed" },
        lifecycle: { status: "active" },
      });
    }

    for (const [contextKey, count] of Object.entries(row.context_counts ?? {})) {
      if (!contextKey.startsWith("workflow:")) {
        continue;
      }
      const workflowId = contextKey.slice("workflow:".length);
      addEdge(edges, {
        from_ref: `.workflow/${workflowId}`,
        to_ref: nodeRef,
        relation_type: "uses",
        relation_state: "confirmed",
        evidence_event_count: count,
        last_evidence_timestamp_utc: row.last_access_timestamp_utc,
        source_refs: {
          relation_type: row.count_summary_ref,
          strength: row.count_summary_ref,
          state: row.count_summary_ref,
        },
      });
    }
  }
}

async function loadUsageRollup({ repoRoot, ledgerRefs, ledgerFiles }) {
  if (ledgerRefs.length === 0 && ledgerFiles.length === 0) {
    return {
      analysis: null,
      ledgerRefs: [],
      rows: [],
      byTarget: new Map(),
      timeWindow: { starts_at_utc: null, ends_at_utc: null },
    };
  }

  const analysis = await analyzeKnowledgeAccessLedgers({
    repoRoot,
    ledgerRefs,
    ledgerFiles,
  });
  const rows = analysis.usage_rollup.counts_by_target.map((row) => ({
    ...row,
    knowledge_ref: mapKnowledgeRefToNodeRef(row.knowledge_ref),
    original_knowledge_ref: row.knowledge_ref,
    count_summary_ref: `${analysis.usage_rollup.rollup_id}:${row.knowledge_ref}`,
  }));
  return {
    analysis,
    ledgerRefs: analysis.source_ledger_refs,
    rows,
    byTarget: new Map(rows.map((row) => [row.knowledge_ref, row])),
    timeWindow: analysis.usage_rollup.time_window,
  };
}

async function loadRagProjection({ repoRoot, ragManifestRefs }) {
  if (ragManifestRefs.length === 0) {
    return null;
  }
  const loaded = [];
  for (const rawRef of ragManifestRefs) {
    const manifestRef = safeRepoRelativeMetadataRef(rawRef);
    const manifestPath = path.join(repoRoot, manifestRef);
    if (!(await pathExists(manifestPath))) {
      throw new Error(`explicit --rag-manifest-ref was not found: ${manifestRef}`);
    }
    const manifest = await readJson(manifestPath);
    const validation = validateRagManifestForGraphProjection(manifest);
    if (validation.status !== "pass") {
      throw new Error(`rag_manifest_invalid:${manifestRef}:${validation.blockers.join(",")}`);
    }
    loaded.push({ manifest_ref: manifestRef, manifest, validation });
  }
  return buildRagProjection(loaded);
}

function validateRagManifestForGraphProjection(manifest) {
  const blockers = [];
  if (manifest?.schema_version !== RAG_MANIFEST_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (manifest?.kind !== "rag_manifest") blockers.push("kind_must_be_rag_manifest");
  const boundary = manifest?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  const sources = projectionArrayField(manifest, "sources", blockers);
  const retrievalUnits = projectionArrayField(manifest, "retrieval_units", blockers);
  const graphBindings = projectionArrayField(manifest, "graph_bindings", blockers);
  const lensProfiles = projectionArrayField(manifest, "lens_profiles", blockers);
  if (!isSafeProjectionId(manifest?.manifest_id)) blockers.push("manifest_id_unsafe");
  if (manifest?.generated_at_utc && !SAFE_RAG_TIMESTAMP_PATTERN.test(manifest.generated_at_utc)) {
    blockers.push("generated_at_utc_unsafe");
  }
  if (manifest?.freshness?.graph_export_id && !isSafeProjectionId(manifest.freshness.graph_export_id)) {
    blockers.push("freshness_graph_export_id_unsafe");
  }
  if (
    manifest?.freshness?.graph_generated_at_utc &&
    !SAFE_RAG_TIMESTAMP_PATTERN.test(manifest.freshness.graph_generated_at_utc)
  ) {
    blockers.push("freshness_graph_generated_at_utc_unsafe");
  }
  if (manifest?.freshness?.graph_source_hash && !isSafeProjectionId(manifest.freshness.graph_source_hash)) {
    blockers.push("freshness_graph_source_hash_unsafe");
  }
  for (const profile of lensProfiles) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      blockers.push("lens_profile_must_be_object");
      continue;
    }
    if (!isSafeProjectionId(profile.lens_id)) blockers.push("lens_profile_id_unsafe");
    for (const nodeType of projectionArrayField(profile, "node_types", blockers, { required: false })) {
      if (!NODE_TYPES.includes(nodeType)) blockers.push("lens_profile_unknown_node_type");
    }
    for (const relationType of projectionArrayField(profile, "relation_types", blockers, { required: false })) {
      if (!RELATION_TYPES.includes(relationType)) blockers.push("lens_profile_unknown_relation_type");
    }
  }
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      blockers.push("source_must_be_object");
      continue;
    }
    if (!isSafeProjectionId(source.source_handle)) blockers.push("source_handle_unsafe");
    if (!isSafeProjectionRef(source.storage_locator)) {
      blockers.push("unsafe_source_locator");
    }
  }
  const sourceHandles = new Set(sources.map((source) => source?.source_handle).filter(Boolean));
  for (const unit of retrievalUnits) {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      blockers.push("retrieval_unit_must_be_object");
      continue;
    }
    if (!isSafeProjectionUnitRef(unit.unit_ref)) blockers.push("retrieval_unit_ref_unsafe");
    if (!isSafeProjectionRef(unit.graph_node_ref)) blockers.push("retrieval_unit_graph_node_ref_unsafe");
    if (!isSafeProjectionId(unit.node_type) || !NODE_TYPES.includes(unit.node_type)) blockers.push("retrieval_unit_unknown_node_type");
    if (!Object.hasOwn(CLAIM_STRENGTH, unit.claim_ceiling ?? "unknown")) blockers.push("retrieval_unit_unknown_claim_ceiling");
    if (unit.retrieval?.status && !isSafeProjectionId(unit.retrieval.status)) blockers.push("retrieval_unit_status_unsafe");
    if (unit.retrieval?.blocker_code && !isSafeProjectionId(unit.retrieval.blocker_code)) {
      blockers.push("retrieval_unit_blocker_code_unsafe");
    }
    const unitSourceHandles = projectionArrayField(unit, "source_handles", blockers, { required: false });
    for (const handle of unitSourceHandles) {
      if (!isSafeProjectionId(handle)) {
        blockers.push("retrieval_unit_source_handle_unsafe");
        continue;
      }
      if (!sourceHandles.has(handle)) {
        blockers.push("retrieval_unit_unknown_source");
      }
    }
  }
  for (const binding of graphBindings) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      blockers.push("graph_binding_must_be_object");
      continue;
    }
    if (!isSafeProjectionId(binding.binding_ref)) blockers.push("graph_binding_ref_unsafe");
    if (!isSafeProjectionRef(binding.from_ref)) blockers.push("graph_binding_from_ref_unsafe");
    if (!isSafeProjectionRef(binding.to_ref)) blockers.push("graph_binding_to_ref_unsafe");
    if (!RELATION_TYPES.includes(binding.relation_type)) blockers.push("graph_binding_unknown_relation_type");
  }
  blockers.push(...findUnsafeProjectionValues(manifest));
  return {
    status: blockers.length === 0 ? "pass" : "blocked",
    blockers: [...new Set(blockers)].sort(),
  };
}

function buildRagProjection(loadedManifests) {
  const manifestRefs = [];
  const lensProfilesById = new Map();
  const overlaysByNode = new Map();
  let retrievalUnitCount = 0;
  let blockedUnitCount = 0;
  const allSourceHandles = new Set();

  for (const { manifest_ref: manifestRef, manifest } of loadedManifests) {
    manifestRefs.push({
      manifest_ref: manifestRef,
      manifest_id: manifest.manifest_id,
      generated_at_utc: manifest.generated_at_utc ?? null,
      freshness: {
        graph_export_id: manifest.freshness?.graph_export_id ?? null,
        graph_generated_at_utc: manifest.freshness?.graph_generated_at_utc ?? null,
        graph_source_hash: manifest.freshness?.graph_source_hash ?? null,
      },
      source_count: manifest.sources.length,
      retrieval_unit_count: manifest.retrieval_units.length,
      graph_binding_count: manifest.graph_bindings.length,
    });
    for (const profile of manifest.lens_profiles ?? []) {
      if (profile?.lens_id && !lensProfilesById.has(profile.lens_id)) {
        lensProfilesById.set(profile.lens_id, {
          lens_id: profile.lens_id,
          title: profile.lens_id,
          node_types: [...new Set(profile.node_types ?? [])].sort(),
          relation_types: [...new Set(profile.relation_types ?? [])].sort(),
        });
      }
    }
    for (const unit of manifest.retrieval_units ?? []) {
      retrievalUnitCount += 1;
      const sourceHandles = [...new Set(unit.source_handles ?? [])].sort();
      sourceHandles.forEach((handle) => allSourceHandles.add(handle));
      const answerEligible = isRagUnitAnswerEligible(unit);
      if (!answerEligible) blockedUnitCount += 1;
      const lensProfileIds = lensIdsForRagUnit(unit, manifest.lens_profiles ?? []);
      const overlay = overlaysByNode.get(unit.graph_node_ref) ?? {
        node_ref: unit.graph_node_ref,
        manifest_ids: new Set(),
        source_handles: new Set(),
        lens_profile_ids: new Set(),
        claim_ceilings: [],
        retrieval_statuses: new Set(),
        allowed_for_retrieval: false,
        blocked_reason_codes: new Set(),
        payload_state: "not_in_manifest",
      };
      overlay.manifest_ids.add(manifest.manifest_id);
      sourceHandles.forEach((handle) => overlay.source_handles.add(handle));
      lensProfileIds.forEach((lensId) => overlay.lens_profile_ids.add(lensId));
      overlay.claim_ceilings.push(unit.claim_ceiling ?? "unknown");
      overlay.retrieval_statuses.add(unit.retrieval?.status ?? "unknown");
      overlay.allowed_for_retrieval ||= answerEligible;
      if (unit.retrieval?.blocker_code) overlay.blocked_reason_codes.add(unit.retrieval.blocker_code);
      overlaysByNode.set(unit.graph_node_ref, overlay);
    }
  }

  const nodeOverlays = [...overlaysByNode.values()]
    .map((overlay) => {
      const sourceHandles = [...overlay.source_handles].sort();
      const allowed = overlay.allowed_for_retrieval;
      return {
        node_ref: overlay.node_ref,
        manifest_ids: [...overlay.manifest_ids].sort(),
        lens_profile_ids: [...overlay.lens_profile_ids].sort(),
        claim_ceiling: weakestClaimCeiling(overlay.claim_ceilings),
        retrieval_status: [...overlay.retrieval_statuses].sort().join("+"),
        allowed_for_retrieval: allowed,
        readiness: ragReadinessForOverlay({ allowed, sourceHandles, blockedReasonCodes: overlay.blocked_reason_codes }),
        source_handle_count: sourceHandles.length,
        payload_state: overlay.payload_state,
        blocked_reason_codes: [...overlay.blocked_reason_codes].sort(),
      };
    })
    .sort((left, right) => left.node_ref.localeCompare(right.node_ref));

  return {
    schema_version: KNOWLEDGE_GRAPH_RAG_PROJECTION_SCHEMA_VERSION,
    kind: "knowledge_graph_rag_projection",
    status: "metadata_only",
    manifest_refs: manifestRefs.sort((left, right) => left.manifest_ref.localeCompare(right.manifest_ref)),
    lens_profiles: [...lensProfilesById.values()].sort((left, right) => left.lens_id.localeCompare(right.lens_id)),
    node_overlays: nodeOverlays,
    node_overlay_count: nodeOverlays.length,
    retrieval_unit_count: retrievalUnitCount,
    blocked_unit_count: blockedUnitCount,
    source_handle_count: allSourceHandles.size,
    matched_node_count: 0,
    unmatched_node_refs: [],
    readiness_counts: {},
    boundary: {
      metadata_only: true,
      no_source_text_loaded: true,
      no_chunk_text_loaded: true,
      no_notebooklm_answers: true,
      no_vector_search: true,
      no_private_payloads: true,
      projection_is_not_answer: true,
    },
  };
}

function applyRagProjectionToNodes(nodes, ragProjection) {
  if (!ragProjection) return;
  const matched = [];
  const unmatched = [];
  for (const overlay of ragProjection.node_overlays) {
    const node = nodes.get(overlay.node_ref);
    if (!node) {
      unmatched.push(overlay.node_ref);
      continue;
    }
    node.rag = {
      manifest_ids: overlay.manifest_ids,
      lens_profile_ids: overlay.lens_profile_ids,
      claim_ceiling: overlay.claim_ceiling,
      retrieval_status: overlay.retrieval_status,
      allowed_for_retrieval: overlay.allowed_for_retrieval,
      readiness: overlay.readiness,
      source_handle_count: overlay.source_handle_count,
      payload_state: overlay.payload_state,
      blocked_reason_codes: overlay.blocked_reason_codes,
    };
    matched.push(overlay.node_ref);
  }
  ragProjection.matched_node_count = matched.length;
  ragProjection.unmatched_node_refs = unmatched.sort();
}

function finalizeRagProjectionForGraph(ragProjection) {
  if (!ragProjection) return;
  const counts = {};
  for (const overlay of ragProjection.node_overlays) {
    counts[overlay.readiness] = (counts[overlay.readiness] ?? 0) + 1;
  }
  ragProjection.readiness_counts = counts;
}

async function loadSourceSliceProjection({ repoRoot, sourceSliceTriageRegisterRefs, sourceSliceReviewQueueRefs }) {
  if (sourceSliceTriageRegisterRefs.length === 0 && sourceSliceReviewQueueRefs.length === 0) {
    return null;
  }
  const loadedRegisters = [];
  for (const rawRef of sourceSliceTriageRegisterRefs) {
    const triageRegisterRef = safeSourceSliceTriageRegisterRef(rawRef);
    const registerPath = path.join(repoRoot, triageRegisterRef);
    if (!(await pathExists(registerPath))) {
      throw new Error(`explicit --source-slice-triage-register-ref was not found: ${triageRegisterRef}`);
    }
    const register = await readJson(registerPath);
    const validation = validateSourceSliceTriageRegisterForGraphProjection(register);
    if (validation.status !== "pass") {
      throw new Error(`source_slice_triage_register_invalid:${triageRegisterRef}:${validation.blockers.join(",")}`);
    }
    loadedRegisters.push({ triage_register_ref: triageRegisterRef, register, validation });
  }

  const loadedQueues = [];
  for (const rawRef of sourceSliceReviewQueueRefs) {
    const reviewQueueRef = safeSourceSliceReviewQueueRef(rawRef);
    const queuePath = path.join(repoRoot, reviewQueueRef);
    if (!(await pathExists(queuePath))) {
      throw new Error(`explicit --source-slice-review-queue-ref was not found: ${reviewQueueRef}`);
    }
    const queue = await readJson(queuePath);
    const validation = validateSourceSliceReviewQueueForGraphProjection(queue);
    if (validation.status !== "pass") {
      throw new Error(`source_slice_review_queue_invalid:${reviewQueueRef}:${validation.blockers.join(",")}`);
    }
    loadedQueues.push({ review_queue_ref: reviewQueueRef, queue, validation });
  }

  return buildSourceSliceProjection({ loadedRegisters, loadedQueues });
}

function validateSourceSliceTriageRegisterForGraphProjection(register) {
  const blockers = [];
  if (register?.schema_version !== SOURCE_SLICE_TRIAGE_REGISTER_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (register?.kind !== "source_slice_triage_register") blockers.push("kind_must_be_source_slice_triage_register");
  if (!isSafeProjectionId(register?.register_id)) blockers.push("register_id_unsafe");
  const boundary = register?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.register_is_not_owner_approval !== true) blockers.push("register_must_not_be_owner_approval");
  if (boundary.register_applies_no_source_text_decisions !== true) blockers.push("register_must_apply_no_source_text_decisions");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");

  const standingPolicy = register?.triage_policy?.standing_owner_policy ?? {};
  const triagePolicy = register?.triage_policy ?? {};
  const grants = standingPolicy.grants ?? {};
  if (triagePolicy.metadata_knowledge_registration_allowed !== true) {
    blockers.push("triage_policy_metadata_registration_must_be_allowed");
  }
  if (triagePolicy.register_is_not_owner_approval !== true) {
    blockers.push("triage_policy_must_not_be_owner_approval");
  }
  if (triagePolicy.source_text_retrieval_allowed !== false) {
    blockers.push("triage_policy_source_text_must_not_be_allowed");
  }
  if (triagePolicy.index_build_allowed !== false) {
    blockers.push("triage_policy_index_build_must_not_be_allowed");
  }
  if (triagePolicy.notebooklm_packet_membership_allowed !== false) {
    blockers.push("triage_policy_notebooklm_packet_must_not_be_allowed");
  }
  if (triagePolicy.public_canon_promotion_allowed !== false) {
    blockers.push("triage_policy_public_canon_must_not_be_allowed");
  }
  if (standingPolicy.owner_defined_criteria_are_policy !== true) {
    blockers.push("standing_policy_owner_criteria_must_be_policy");
  }
  if (standingPolicy.auto_register_passed_metadata !== true) {
    blockers.push("standing_policy_auto_register_metadata_must_be_true");
  }
  if (standingPolicy.stronger_permissions_default_false !== true) {
    blockers.push("standing_policy_stronger_permissions_default_false_required");
  }
  if (grants.metadata_knowledge !== true) blockers.push("standing_policy_metadata_knowledge_must_be_granted");
  if (grants.source_text_retrieval !== false) blockers.push("standing_policy_source_text_must_not_be_granted");
  if (grants.index_build !== false) blockers.push("standing_policy_index_build_must_not_be_granted");
  if (grants.notebooklm_packet !== false) blockers.push("standing_policy_notebooklm_packet_must_not_be_granted");
  if (grants.public_canon !== false) blockers.push("standing_policy_public_canon_must_not_be_granted");

  for (const field of ["registered_items", "owner_review_items", "blocked_items"]) {
    for (const item of projectionArrayField(register, field, blockers, { required: false })) {
      validateSourceSliceTriageItemForGraphProjection(item, field, blockers);
    }
  }
  blockers.push(...findUnsafeProjectionValues(register));
  return {
    status: blockers.length === 0 ? "pass" : "blocked",
    blockers: [...new Set(blockers)].sort(),
  };
}

function validateSourceSliceTriageItemForGraphProjection(item, field, blockers) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    blockers.push(`${field}_item_must_be_object`);
    return;
  }
  if (!isSafeProjectionId(item.triage_item_ref)) blockers.push(`${field}_triage_item_ref_unsafe`);
  if (!isSafeProjectionId(item.source_slice_ref)) blockers.push(`${field}_source_slice_ref_unsafe`);
  if (!isSafeProjectionId(item.source_handle)) blockers.push(`${field}_source_handle_unsafe`);
  if (!isSafeProjectionRef(item.source_locator_ref)) blockers.push(`${field}_source_locator_ref_unsafe`);
  if (!Object.hasOwn(CLAIM_STRENGTH, item.claim_ceiling ?? "unknown")) blockers.push(`${field}_claim_ceiling_unknown`);
  for (const nodeRef of projectionArrayField(item, "covered_graph_node_refs", blockers, { required: false })) {
    if (!isSafeProjectionRef(nodeRef)) blockers.push(`${field}_covered_graph_node_ref_unsafe`);
  }
  for (const code of projectionArrayField(item, "blocker_codes", blockers, { required: false })) {
    if (!isSafeProjectionId(code)) blockers.push(`${field}_blocker_code_unsafe`);
  }
  const result = item.criteria_result ?? {};
  if (result.route && !isSafeProjectionId(result.route)) blockers.push(`${field}_criteria_route_unsafe`);
  if (result.registration_scope && !isSafeProjectionId(result.registration_scope)) {
    blockers.push(`${field}_registration_scope_unsafe`);
  }
  const boundary = result.boundary_contract ?? {};
  if (boundary.metadata_only !== true) blockers.push(`${field}_boundary_metadata_only_must_be_true`);
  if (boundary.allowed_for_source_text_retrieval !== false) {
    blockers.push(`${field}_source_text_retrieval_must_not_be_allowed`);
  }
  if (boundary.allowed_for_index_build !== false) blockers.push(`${field}_index_build_must_not_be_allowed`);
  if (boundary.allowed_for_notebooklm_packet !== false) blockers.push(`${field}_notebooklm_packet_must_not_be_allowed`);
  if (boundary.applied_owner_decision !== false) blockers.push(`${field}_applied_owner_decision_must_be_false`);
  if (boundary.public_canon_promotion_allowed !== false) blockers.push(`${field}_public_canon_must_not_be_allowed`);
}

function validateSourceSliceReviewQueueForGraphProjection(queue) {
  const blockers = [];
  if (queue?.schema_version !== SOURCE_SLICE_REVIEW_QUEUE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (queue?.kind !== "source_slice_review_queue") blockers.push("kind_must_be_source_slice_review_queue");
  if (!isSafeProjectionId(queue?.queue_id)) blockers.push("queue_id_unsafe");
  const boundary = queue?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.queue_is_not_owner_approval !== true) blockers.push("queue_must_not_be_owner_approval");
  if (boundary.queue_applies_no_decisions !== true) blockers.push("queue_must_apply_no_decisions");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");
  const reviewPolicy = queue?.review_policy ?? {};
  if (reviewPolicy.metadata_only !== true) blockers.push("review_policy_metadata_only_must_be_true");
  if (reviewPolicy.queue_is_not_owner_approval !== true) blockers.push("review_policy_must_not_be_owner_approval");
  if (reviewPolicy.queue_applies_no_decisions !== true) blockers.push("review_policy_must_apply_no_decisions");
  if (reviewPolicy.source_text_retrieval_allowed !== false) {
    blockers.push("review_policy_source_text_must_not_be_allowed");
  }
  if (reviewPolicy.index_build_allowed !== false) blockers.push("review_policy_index_build_must_not_be_allowed");
  for (const item of projectionArrayField(queue, "items", blockers, { required: false })) {
    validateSourceSliceReviewItemForGraphProjection(item, blockers);
  }
  blockers.push(...findUnsafeProjectionValues(queue));
  return {
    status: blockers.length === 0 ? "pass" : "blocked",
    blockers: [...new Set(blockers)].sort(),
  };
}

function validateSourceSliceReviewItemForGraphProjection(item, blockers) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    blockers.push("review_item_must_be_object");
    return;
  }
  if (!isSafeProjectionId(item.review_item_ref)) blockers.push("review_item_ref_unsafe");
  if (!isSafeProjectionId(item.source_slice_ref)) blockers.push("review_source_slice_ref_unsafe");
  if (!isSafeProjectionId(item.source_handle)) blockers.push("review_source_handle_unsafe");
  if (!isSafeProjectionRef(item.source_locator_ref)) blockers.push("review_source_locator_ref_unsafe");
  if (!Object.hasOwn(CLAIM_STRENGTH, item.claim_ceiling ?? "unknown")) blockers.push("review_claim_ceiling_unknown");
  for (const nodeRef of projectionArrayField(item, "covered_graph_node_refs", blockers, { required: false })) {
    if (!isSafeProjectionRef(nodeRef)) blockers.push("review_covered_graph_node_ref_unsafe");
  }
  const decision = item.decision ?? {};
  if (decision.applied_decision !== "none") blockers.push("review_applied_decision_must_be_none");
  if (decision.owner_approval_granted !== false) blockers.push("review_owner_approval_must_not_be_granted");
  if (decision.source_text_retrieval_allowed !== false) blockers.push("review_source_text_retrieval_must_not_be_allowed");
  if (decision.index_build_allowed !== false) blockers.push("review_index_build_must_not_be_allowed");
}

function buildSourceSliceProjection({ loadedRegisters, loadedQueues }) {
  const overlaysByNode = new Map();
  const triageRegisterRefs = loadedRegisters.map(({ triage_register_ref: triageRegisterRef, register }) => ({
    triage_register_ref: triageRegisterRef,
    register_id: register.register_id,
    card_count: register.counts?.card_count ?? 0,
    registered_count: register.counts?.registered_count ?? 0,
    owner_review_count: register.counts?.owner_review_count ?? 0,
    blocked_count: register.counts?.blocked_count ?? 0,
    standing_owner_policy_ref: register.triage_policy?.standing_owner_policy?.policy_ref ?? null,
  }));
  const reviewQueueRefs = loadedQueues.map(({ review_queue_ref: reviewQueueRef, queue }) => ({
    review_queue_ref: reviewQueueRef,
    queue_id: queue.queue_id,
    card_count: queue.counts?.card_count ?? 0,
    item_count: queue.counts?.item_count ?? 0,
  }));

  for (const { register } of loadedRegisters) {
    for (const item of register.registered_items ?? []) {
      addSourceSliceProjectionItem(overlaysByNode, item, "registered_metadata_knowledge");
    }
    for (const item of register.owner_review_items ?? []) {
      addSourceSliceProjectionItem(overlaysByNode, item, "owner_review_required");
    }
    for (const item of register.blocked_items ?? []) {
      addSourceSliceProjectionItem(overlaysByNode, item, "blocked_unsafe_source_locator");
    }
  }
  for (const { queue } of loadedQueues) {
    for (const item of queue.items ?? []) {
      addSourceSliceReviewQueueProjectionItem(overlaysByNode, item);
    }
  }

  const nodeOverlays = [...overlaysByNode.values()]
    .map((overlay) => {
      const sourceHandles = [...overlay.source_handles].sort();
      const triageRoutes = [...overlay.triage_routes].sort();
      const registrationScopes = [...overlay.registration_scopes].sort();
      const strongerPermissionsDefaultFalse = overlay.stronger_permissions_default_false_count > 0;
      return {
        node_ref: overlay.node_ref,
        source_slice_count: overlay.source_slice_refs.size,
        source_handle_count: sourceHandles.length,
        registered_metadata_count: overlay.registered_metadata_count,
        owner_review_count: overlay.owner_review_count,
        blocked_count: overlay.blocked_count,
        review_queue_item_count: overlay.review_queue_item_count,
        registration_status: sourceSliceRegistrationStatus(overlay),
        triage_routes: triageRoutes,
        registration_scopes: registrationScopes,
        claim_ceiling: weakestClaimCeiling(overlay.claim_ceilings),
        stronger_permission_state: strongerPermissionsDefaultFalse
          ? "metadata_registered_stronger_permissions_default_false"
          : "not_applicable",
        stronger_permissions_default_false: strongerPermissionsDefaultFalse,
      };
    })
    .sort((left, right) => left.node_ref.localeCompare(right.node_ref));

  const totals = nodeOverlays.reduce(
    (acc, overlay) => {
      acc.source_slice_count += overlay.source_slice_count;
      acc.registered_metadata_count += overlay.registered_metadata_count;
      acc.owner_review_count += overlay.owner_review_count;
      acc.blocked_count += overlay.blocked_count;
      acc.review_queue_item_count += overlay.review_queue_item_count;
      if (overlay.stronger_permissions_default_false) acc.stronger_permissions_default_false_count += 1;
      return acc;
    },
    {
      source_slice_count: 0,
      registered_metadata_count: 0,
      owner_review_count: 0,
      blocked_count: 0,
      review_queue_item_count: 0,
      stronger_permissions_default_false_count: 0,
    },
  );

  return {
    schema_version: KNOWLEDGE_GRAPH_SOURCE_SLICE_PROJECTION_SCHEMA_VERSION,
    kind: "knowledge_graph_source_slice_projection",
    status: "metadata_only",
    triage_register_refs: triageRegisterRefs.sort((left, right) =>
      left.triage_register_ref.localeCompare(right.triage_register_ref),
    ),
    review_queue_refs: reviewQueueRefs.sort((left, right) => left.review_queue_ref.localeCompare(right.review_queue_ref)),
    node_overlays: nodeOverlays,
    node_overlay_count: nodeOverlays.length,
    totals,
    registration_status_counts: {},
    matched_node_count: 0,
    unmatched_node_refs: [],
    boundary: {
      metadata_only: true,
      no_source_payloads: true,
      no_source_text_loaded: true,
      no_index_build: true,
      no_notebooklm_answers: true,
      no_owner_approval_mutation: true,
      no_public_canon_promotion: true,
      projection_is_not_answer: true,
    },
  };
}

function addSourceSliceProjectionItem(overlaysByNode, item, fallbackRoute) {
  const route = item.criteria_result?.route ?? fallbackRoute;
  for (const nodeRef of item.covered_graph_node_refs ?? []) {
    const overlay = sourceSliceOverlayFor(overlaysByNode, nodeRef);
    overlay.source_slice_refs.add(item.source_slice_ref);
    overlay.source_handles.add(item.source_handle);
    overlay.triage_routes.add(route);
    if (item.criteria_result?.registration_scope) overlay.registration_scopes.add(item.criteria_result.registration_scope);
    overlay.claim_ceilings.push(item.claim_ceiling ?? "unknown");
    if (route === "registered_metadata_knowledge") overlay.registered_metadata_count += 1;
    else if (route === "blocked_unsafe_source_locator") overlay.blocked_count += 1;
    else overlay.owner_review_count += 1;
    if (sourceSliceItemHasStrongerPermissionsDefaultFalse(item)) {
      overlay.stronger_permissions_default_false_count += 1;
    }
  }
}

function addSourceSliceReviewQueueProjectionItem(overlaysByNode, item) {
  for (const nodeRef of item.covered_graph_node_refs ?? []) {
    const overlay = sourceSliceOverlayFor(overlaysByNode, nodeRef);
    overlay.source_slice_refs.add(item.source_slice_ref);
    overlay.source_handles.add(item.source_handle);
    overlay.triage_routes.add(item.triage_route ?? "owner_review_required");
    overlay.claim_ceilings.push(item.claim_ceiling ?? "observed");
    overlay.review_queue_item_count += 1;
    if (reviewQueueItemHasStrongerPermissionsDefaultFalse(item)) {
      overlay.stronger_permissions_default_false_count += 1;
    }
  }
}

function sourceSliceOverlayFor(overlaysByNode, nodeRef) {
  const existing = overlaysByNode.get(nodeRef);
  if (existing) return existing;
  const overlay = {
    node_ref: nodeRef,
    source_slice_refs: new Set(),
    source_handles: new Set(),
    triage_routes: new Set(),
    registration_scopes: new Set(),
    claim_ceilings: [],
    registered_metadata_count: 0,
    owner_review_count: 0,
    blocked_count: 0,
    review_queue_item_count: 0,
    stronger_permissions_default_false_count: 0,
  };
  overlaysByNode.set(nodeRef, overlay);
  return overlay;
}

function sourceSliceItemHasStrongerPermissionsDefaultFalse(item) {
  const boundary = item.criteria_result?.boundary_contract ?? {};
  return (
    boundary.allowed_for_source_text_retrieval === false ||
    boundary.allowed_for_index_build === false ||
    boundary.allowed_for_notebooklm_packet === false ||
    boundary.public_canon_promotion_allowed === false
  );
}

function reviewQueueItemHasStrongerPermissionsDefaultFalse(item) {
  const decision = item.decision ?? {};
  return decision.source_text_retrieval_allowed === false || decision.index_build_allowed === false;
}

function sourceSliceRegistrationStatus(overlay) {
  const activeKinds = [
    overlay.registered_metadata_count > 0 ? "registered" : null,
    overlay.owner_review_count > 0 || overlay.review_queue_item_count > 0 ? "owner_review" : null,
    overlay.blocked_count > 0 ? "blocked" : null,
  ].filter(Boolean);
  if (activeKinds.length > 1) return "mixed";
  if (overlay.blocked_count > 0) return "blocked_unsafe_source_locator";
  if (overlay.owner_review_count > 0 || overlay.review_queue_item_count > 0) return "owner_review_required";
  if (overlay.registered_metadata_count > 0) return "registered_metadata_knowledge";
  return "not_in_triage_register";
}

function applySourceSliceProjectionToNodes(nodes, sourceSliceProjection) {
  if (!sourceSliceProjection) return;
  const matched = [];
  const unmatched = [];
  for (const overlay of sourceSliceProjection.node_overlays) {
    const node = nodes.get(overlay.node_ref);
    if (!node) {
      unmatched.push(overlay.node_ref);
      continue;
    }
    node.source_slice = {
      source_slice_count: overlay.source_slice_count,
      source_handle_count: overlay.source_handle_count,
      registered_metadata_count: overlay.registered_metadata_count,
      owner_review_count: overlay.owner_review_count,
      blocked_count: overlay.blocked_count,
      review_queue_item_count: overlay.review_queue_item_count,
      registration_status: overlay.registration_status,
      triage_routes: overlay.triage_routes,
      registration_scopes: overlay.registration_scopes,
      claim_ceiling: overlay.claim_ceiling,
      stronger_permission_state: overlay.stronger_permission_state,
      stronger_permissions_default_false: overlay.stronger_permissions_default_false,
    };
    matched.push(overlay.node_ref);
  }
  sourceSliceProjection.matched_node_count = matched.length;
  sourceSliceProjection.unmatched_node_refs = unmatched.sort();
}

function finalizeSourceSliceProjectionForGraph(sourceSliceProjection) {
  if (!sourceSliceProjection) return;
  const counts = {};
  for (const overlay of sourceSliceProjection.node_overlays) {
    counts[overlay.registration_status] = (counts[overlay.registration_status] ?? 0) + 1;
  }
  sourceSliceProjection.visibility_counts = counts;
  sourceSliceProjection.registration_status_counts = counts;
}

async function loadGraphRelationReviewProjection({ repoRoot, graphRelationReviewQueueRefs }) {
  if (graphRelationReviewQueueRefs.length === 0) {
    return null;
  }
  const loadedQueues = [];
  for (const rawRef of graphRelationReviewQueueRefs) {
    const queueRef = safeGraphRelationReviewQueueRef(rawRef);
    const queuePath = path.join(repoRoot, queueRef);
    if (!(await pathExists(queuePath))) {
      throw new Error(`explicit --graph-relation-review-queue-ref was not found: ${queueRef}`);
    }
    const queue = await readYaml(queuePath);
    const validation = validateGraphRelationReviewQueueForProjection(queue);
    if (validation.status !== "pass") {
      throw new Error(`graph_relation_review_queue_invalid:${queueRef}:${validation.blockers.join(",")}`);
    }
    loadedQueues.push({ queue_ref: queueRef, queue, validation });
  }
  return buildGraphRelationReviewProjection(loadedQueues);
}

function validateGraphRelationReviewQueueForProjection(queue) {
  const blockers = [];
  if (queue?.schema_version !== GRAPH_RELATION_REVIEW_QUEUE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (queue?.kind !== "graph_relation_review_queue") blockers.push("kind_must_be_graph_relation_review_queue");
  if (!isSafeProjectionId(queue?.queue_id)) blockers.push("queue_id_unsafe");
  if (queue?.edge_schema_status !== "compatible_with_current_exporter_relation_types") {
    blockers.push("edge_schema_must_match_exporter_relation_types");
  }
  const reviewDecision = queue?.review_decision ?? {};
  if (reviewDecision.graph_mutation_applied !== false) blockers.push("graph_mutation_must_not_be_applied");
  if (reviewDecision.graph_truth_claimed !== false) blockers.push("graph_truth_must_not_be_claimed");
  if (reviewDecision.default_route_mutation_applied !== false) blockers.push("default_route_mutation_must_not_be_applied");
  const boundary = queue?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_text_included !== false) blockers.push("source_text_must_not_be_included");
  if (boundary.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (boundary.copied_excerpts_included !== false) blockers.push("copied_excerpts_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.graph_mutation_applied !== false) blockers.push("boundary_graph_mutation_must_not_be_applied");
  if (boundary.graph_truth_claimed !== false) blockers.push("boundary_graph_truth_must_not_be_claimed");
  if (boundary.public_canon_promotion_claimed !== false) blockers.push("public_canon_must_not_be_claimed");
  if (boundary.ontology_acceptance_claimed !== false) blockers.push("ontology_acceptance_must_not_be_claimed");
  if (boundary.final_answer_claimed !== false) blockers.push("final_answer_must_not_be_claimed");
  if (boundary.default_route_mutation_claimed !== false) blockers.push("default_route_mutation_must_not_be_claimed");

  const candidateEdges = projectionArrayField(queue, "candidate_edges", blockers);
  for (const edge of candidateEdges) {
    validateGraphRelationReviewEdgeForProjection(edge, blockers);
  }
  return {
    status: blockers.length === 0 ? "pass" : "blocked",
    blockers: [...new Set(blockers)].sort(),
  };
}

function validateGraphRelationReviewEdgeForProjection(edge, blockers) {
  if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
    blockers.push("candidate_edge_must_be_object");
    return;
  }
  if (!isSafeProjectionId(edge.edge_id)) blockers.push("candidate_edge_id_unsafe");
  if (!isSafeGraphRelationQueueRef(edge.from_ref)) blockers.push("candidate_edge_from_ref_unsafe");
  if (!RELATION_TYPES.includes(edge.relation_type)) blockers.push("candidate_edge_unknown_relation_type");
  if (!isSafeProjectionId(edge.semantic_label)) blockers.push("candidate_edge_semantic_label_unsafe");
  if (edge.review_status !== "review_required") blockers.push("candidate_edge_review_status_must_be_review_required");
  if (!isSafeGraphRelationQueueTargetRef(edge.to_ref)) blockers.push("candidate_edge_target_ref_unsafe");
  if (!Object.hasOwn(CLAIM_STRENGTH, normalizeGraphRelationClaimCeiling(edge.claim_ceiling))) {
    blockers.push("candidate_edge_claim_ceiling_unknown");
  }
  for (const page of edge.evidence_pages ?? []) {
    if (!Number.isInteger(page) || page < 1 || page > 2000) {
      blockers.push("candidate_edge_evidence_page_unsafe");
    }
  }
}

function buildGraphRelationReviewProjection(loadedQueues) {
  const queueRefs = [];
  const candidateEdges = [];
  let originalTargetRefCount = 0;

  for (const { queue_ref: queueRef, queue } of loadedQueues) {
    const edges = queue.candidate_edges ?? [];
    queueRefs.push({
      queue_ref: queueRef,
      queue_id: queue.queue_id,
      status: queue.status ?? "unknown",
      candidate_edge_count: edges.length,
      edge_schema_status: queue.edge_schema_status ?? "unknown",
    });
    for (const edge of edges) {
      originalTargetRefCount += edge.to_ref ? 1 : 0;
      candidateEdges.push({
        edge_id: edge.edge_id,
        queue_id: queue.queue_id,
        source_queue_ref: queueRef,
        from_ref: edge.from_ref,
        to_alias_ref: graphRelationReviewTargetAliasRef(queue.queue_id, edge),
        relation_type: edge.relation_type,
        semantic_label: edge.semantic_label,
        review_status: edge.review_status,
        evidence_page_count: (edge.evidence_pages ?? []).length,
        claim_ceiling: edge.claim_ceiling ?? "observed",
        original_target_ref_redacted: true,
      });
    }
  }

  return {
    schema_version: KNOWLEDGE_GRAPH_RELATION_REVIEW_PROJECTION_SCHEMA_VERSION,
    kind: "knowledge_graph_relation_review_projection",
    status: "metadata_only_review_required",
    queue_refs: queueRefs.sort((left, right) => left.queue_ref.localeCompare(right.queue_ref)),
    candidate_edges: candidateEdges.sort((left, right) => left.edge_id.localeCompare(right.edge_id)),
    candidate_edge_count: candidateEdges.length,
    original_target_ref_count: originalTargetRefCount,
    original_target_refs_redacted: true,
    matched_edge_count: 0,
    boundary: {
      metadata_only: true,
      no_private_target_refs_in_graph: true,
      no_source_text_loaded: true,
      no_chunk_text_loaded: true,
      no_notebooklm_answers: true,
      no_graph_truth_mutation: true,
      no_default_route_mutation: true,
      no_source_truth_claim: true,
      no_public_canon_promotion: true,
      projection_is_not_answer: true,
    },
  };
}

function applyGraphRelationReviewProjectionToGraph(nodes, edges, projection) {
  if (!projection) return;
  let matchedEdgeCount = 0;
  for (const candidate of projection.candidate_edges) {
    addNode(nodes, {
      node_ref: candidate.from_ref,
      node_type: "artifact",
      label: labelForGraphRelationRoute(candidate.from_ref),
      summary: "Operational RAG route alias from a metadata-only graph relation review queue.",
      owner_surface: "_workmeta",
      source_refs: {
        node_type: candidate.source_queue_ref,
        label: candidate.source_queue_ref,
        trust: candidate.source_queue_ref,
        lifecycle: candidate.source_queue_ref,
      },
      trust: { claim_ceiling: normalizeGraphRelationClaimCeiling(candidate.claim_ceiling) },
      lifecycle: { status: "candidate" },
    });
    addNode(nodes, {
      node_ref: candidate.to_alias_ref,
      node_type: "artifact",
      label: labelForGraphRelationTarget(candidate),
      summary: "Redacted private/local target alias. Original target ref is kept out of graph data.",
      owner_surface: "_workmeta",
      source_refs: {
        node_type: candidate.source_queue_ref,
        label: candidate.source_queue_ref,
        trust: candidate.source_queue_ref,
        lifecycle: candidate.source_queue_ref,
      },
      trust: { claim_ceiling: normalizeGraphRelationClaimCeiling(candidate.claim_ceiling) },
      lifecycle: { status: "candidate" },
    });
    addEdge(edges, {
      from_ref: candidate.from_ref,
      to_ref: candidate.to_alias_ref,
      relation_type: candidate.relation_type,
      relation_state: "review_required",
      evidence_event_count: Math.max(1, candidate.evidence_page_count),
      source_refs: {
        relation_type: candidate.source_queue_ref,
        strength: candidate.source_queue_ref,
        state: candidate.source_queue_ref,
      },
    });
    matchedEdgeCount += 1;
  }
  projection.matched_edge_count = matchedEdgeCount;
}

function normalizeGraphRelationClaimCeiling(value) {
  if (Object.hasOwn(CLAIM_STRENGTH, value ?? "unknown")) {
    return value;
  }
  if (String(value ?? "").includes("source_supported")) {
    return "source_supported";
  }
  return "observed";
}

function graphRelationReviewTargetAliasRef(queueId, edge) {
  return `graph_relation_target:${queueId}:${edge.edge_id}`;
}

function labelForGraphRelationRoute(ref) {
  const value = String(ref);
  return value.startsWith("route:") ? value.slice("route:".length).replaceAll("_", " ") : labelFromRef(value);
}

function labelForGraphRelationTarget(candidate) {
  return `${candidate.semantic_label.replaceAll("_", " ")} (${candidate.edge_id.replaceAll("_", " ")})`;
}

function isRagUnitAnswerEligible(unit) {
  if (unit?.claim_ceiling === "rejected_or_blocked") return false;
  const retrieval = unit?.retrieval ?? {};
  if (retrieval.status === "blocked") return false;
  if (retrieval.allowed_for_retrieval === false) return false;
  return true;
}

function lensIdsForRagUnit(unit, lensProfiles) {
  const matching = [];
  for (const profile of lensProfiles ?? []) {
    if (!profile?.lens_id) continue;
    const nodeTypes = new Set(profile.node_types ?? []);
    if (nodeTypes.has(unit.node_type)) {
      matching.push(profile.lens_id);
    }
  }
  return matching.length > 0 ? matching.sort() : ["rag_knowledge_readiness"];
}

function ragReadinessForOverlay({ allowed, sourceHandles, blockedReasonCodes }) {
  if (!allowed || blockedReasonCodes.size > 0) return "blocked";
  if (sourceHandles.length === 0) return "metadata_no_source_handle";
  return "metadata_answer_ready";
}

function weakestClaimCeiling(values) {
  const candidates = values.filter(Boolean);
  if (candidates.length === 0) return "observed";
  return candidates.sort((left, right) => (CLAIM_STRENGTH[left] ?? 0) - (CLAIM_STRENGTH[right] ?? 0))[0] ?? "observed";
}

function projectionArrayField(value, key, blockers, options = {}) {
  const required = options.required !== false;
  const child = value?.[key];
  if (child === undefined || child === null) {
    if (required) blockers.push(`${key}_must_be_array`);
    return [];
  }
  if (!Array.isArray(child)) {
    blockers.push(`${key}_must_be_array`);
    return [];
  }
  return child;
}

function findUnsafeProjectionValues(value, trail = "manifest") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findUnsafeProjectionValues(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_RAG_PROJECTION_KEYS.has(normalizedKey)) {
        blockers.push(`forbidden_payload_key:${trail}.${key}`);
      }
      if (shouldCheckForbiddenProjectionKeyPattern(key) && FORBIDDEN_RAG_PROJECTION_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        blockers.push(`forbidden_payload_key_pattern:${trail}.${key}`);
      }
      blockers.push(...findUnsafeProjectionValues(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") {
    return blockers;
  }
  if (hasUnsafeProjectionString(value)) {
    blockers.push(`unsafe_manifest_string:${trail}`);
  }
  return blockers;
}

function shouldCheckForbiddenProjectionKeyPattern(key) {
  const normalized = String(key ?? "").toLowerCase();
  if (normalized.endsWith("_included")) return false;
  if (normalized.endsWith("_allowed")) return false;
  if (normalized.endsWith("_state")) return false;
  if (normalized.endsWith("source_text_retrieval")) return false;
  if (normalized.endsWith("source_text_decisions")) return false;
  if (normalized.endsWith("index_build")) return false;
  if (normalized.endsWith("notebooklm_packet")) return false;
  if (normalized.endsWith("notebooklm_packet_membership")) return false;
  if (normalized.endsWith("public_canon")) return false;
  if (normalized.endsWith("public_canon_promotion")) return false;
  if (normalized === "content_hash_or_null") return false;
  if (normalized === "token_count_or_null") return false;
  return true;
}

function safeRepoRelativeMetadataRef(value) {
  const ref = normalizeRepoPath(value);
  if (!isSafeProjectionRef(ref)) {
    throw new Error(`unsafe repo-relative path: ${value}`);
  }
  return ref;
}

function safeKnowledgeGraphOutputRoot(value) {
  const ref = normalizeRepoPath(value);
  if (
    path.isAbsolute(ref) ||
    ref.includes("..") ||
    ref.includes("\\") ||
    (ref !== "_workspaces/system/knowledge_view" && !ref.startsWith("_workspaces/system/knowledge_view/"))
  ) {
    throw new Error("knowledge graph output root must be under _workspaces/system/knowledge_view/");
  }
  return ref;
}

function safeSourceSliceTriageRegisterRef(value) {
  const ref = safeRepoRelativeMetadataRef(value);
  if (!/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_triage_register\//.test(ref)) {
    throw new Error(`unsafe source slice triage register ref: ${ref}`);
  }
  return ref;
}

function safeSourceSliceReviewQueueRef(value) {
  const ref = safeRepoRelativeMetadataRef(value);
  if (!/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_review_queue\//.test(ref)) {
    throw new Error(`unsafe source slice review queue ref: ${ref}`);
  }
  return ref;
}

function safeGraphRelationReviewQueueRef(value) {
  const ref = safeRepoRelativeMetadataRef(value);
  if (!/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/graph_relation_review\//.test(ref)) {
    throw new Error(`unsafe graph relation review queue ref: ${ref}`);
  }
  return ref;
}

function isSafeProjectionId(value) {
  return typeof value === "string" && SAFE_RAG_ID_PATTERN.test(value) && !hasUnsafeProjectionString(value);
}

function isSafeProjectionUnitRef(value) {
  if (typeof value !== "string") return false;
  if (value.startsWith("graph_node:")) return isSafeProjectionRef(value.slice("graph_node:".length));
  return isSafeProjectionId(value);
}

function isSafeProjectionRef(value) {
  const ref = String(value ?? "");
  if (!ref || path.isAbsolute(ref) || ref.includes("..")) return false;
  if (/[A-Za-z]:[\\/]/.test(ref)) return false;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(ref)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) {
    return false;
  }
  if (
    ref.startsWith("_workspaces/") &&
    !ref.startsWith("_workspaces/system/knowledge_view/") &&
    !ref.startsWith("_workspaces/system/rag/")
  ) {
    return false;
  }
  return true;
}

function isSafeGraphRelationQueueRef(value) {
  const ref = String(value ?? "");
  if (ref.startsWith("route:")) {
    return isSafeProjectionId(ref.slice("route:".length));
  }
  return isSafeProjectionRef(ref);
}

function isSafeGraphRelationQueueTargetRef(value) {
  const ref = String(value ?? "");
  if (!ref || path.isAbsolute(ref) || ref.includes("..") || /[A-Za-z]:[\\/]/.test(ref)) return false;
  if (/\/Users\/|\/Volumes\/|\/var\/folders\//.test(ref)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) {
    return false;
  }
  if (
    ref.startsWith("_workspaces/") &&
    !ref.startsWith("_workspaces/knowledge/") &&
    !ref.startsWith("_workspaces/system/knowledge_view/") &&
    !ref.startsWith("_workspaces/system/rag/")
  ) {
    return false;
  }
  return true;
}

function hasUnsafeProjectionString(value) {
  const text = value.trim();
  if (!text) return false;
  if (/[A-Za-z]:[\\/]/.test(text)) return true;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(text)) return true;
  if (/(^|[\s/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([\s/_.-]|$)/i.test(text)) {
    return true;
  }
  return false;
}

function applyNodeMetricsAndVisuals(node, usageRow, now) {
  const metrics = {
    total_access_count: usageRow?.total_access_count ?? 0,
    useful_access_count: usageRow?.useful_access_count ?? 0,
    blocked_access_count: usageRow?.blocked_access_count ?? 0,
    cite_or_promote_count: usageRow?.cite_or_promote_count ?? 0,
    last_access_timestamp_utc: usageRow?.last_access_timestamp_utc ?? null,
    days_since_last_access: daysSince(usageRow?.last_access_timestamp_utc, now),
    metric_source_ref: usageRow?.count_summary_ref ?? null,
  };
  const visual = {
    size_px: sizeForCount(metrics.total_access_count),
    opacity: opacityForDays(metrics.days_since_last_access),
    color: NODE_COLORS[node.node_type] ?? NODE_COLORS.unknown_node,
    border_color: BORDER_COLORS[node.trust.claim_ceiling] ?? BORDER_COLORS.unknown,
    border_style: borderStyleForStatus(node.lifecycle.status),
  };
  return {
    ...node,
    metrics,
    visual,
  };
}

function applyEdgeVisuals(edge, now) {
  const count = edge.evidence_event_count ?? 1;
  const metrics = {
    evidence_event_count: count,
    last_evidence_timestamp_utc: edge.last_evidence_timestamp_utc ?? null,
    days_since_last_evidence: daysSince(edge.last_evidence_timestamp_utc, now),
  };
  return {
    ...edge,
    metrics,
    visual: {
      width_px: widthForCount(count),
      opacity: opacityForDays(metrics.days_since_last_evidence),
      color: RELATION_COLORS[edge.relation_type] ?? RELATION_COLORS.related_candidate,
      line_style: lineStyleForState(edge.relation_state),
      arrow: edge.directed,
    },
  };
}

function analyzeGraphConnectivity(nodes, edges) {
  const byRef = new Map(nodes.map((node) => [node.node_ref, node]));
  const degreeByRef = new Map(
    nodes.map((node) => [
      node.node_ref,
      {
        node_ref: node.node_ref,
        node_type: node.node_type,
        label: node.label,
        in_degree: 0,
        out_degree: 0,
        total_degree: 0,
      },
    ]),
  );
  const adjacency = new Map(nodes.map((node) => [node.node_ref, new Set()]));
  const relationCounts = {};
  const danglingEdges = [];

  for (const edge of edges) {
    relationCounts[edge.relation_type] = (relationCounts[edge.relation_type] ?? 0) + 1;
    const from = degreeByRef.get(edge.from_ref);
    const to = degreeByRef.get(edge.to_ref);
    if (!from || !to) {
      danglingEdges.push(edge.edge_ref);
      continue;
    }
    from.out_degree += 1;
    from.total_degree += 1;
    to.in_degree += 1;
    to.total_degree += 1;
    adjacency.get(edge.from_ref).add(edge.to_ref);
    adjacency.get(edge.to_ref).add(edge.from_ref);
  }

  const componentRefs = [];
  const seen = new Set();
  for (const node of nodes) {
    if (seen.has(node.node_ref)) {
      continue;
    }
    const stack = [node.node_ref];
    const refs = [];
    seen.add(node.node_ref);
    while (stack.length > 0) {
      const current = stack.pop();
      refs.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    componentRefs.push(refs);
  }
  componentRefs.sort((left, right) => right.length - left.length);

  const byNodeType = {};
  for (const degree of degreeByRef.values()) {
    byNodeType[degree.node_type] ??= {
      node_count: 0,
      isolated_count: 0,
      total_degree: 0,
      max_degree: 0,
      average_degree: 0,
    };
    const row = byNodeType[degree.node_type];
    row.node_count += 1;
    row.total_degree += degree.total_degree;
    row.max_degree = Math.max(row.max_degree, degree.total_degree);
    if (degree.total_degree === 0) {
      row.isolated_count += 1;
    }
  }
  for (const row of Object.values(byNodeType)) {
    row.average_degree = Number((row.total_degree / row.node_count).toFixed(2));
  }

  const isolatedNodes = [...degreeByRef.values()]
    .filter((degree) => degree.total_degree === 0)
    .sort((left, right) => left.node_ref.localeCompare(right.node_ref));
  const lowDegreeNodes = [...degreeByRef.values()]
    .filter((degree) => degree.total_degree > 0 && degree.total_degree <= 1)
    .sort((left, right) => left.total_degree - right.total_degree || left.node_ref.localeCompare(right.node_ref));
  const possibleMissingRelationSurfaces = [];
  if ((byNodeType.workflow?.isolated_count ?? 0) > 0) {
    possibleMissingRelationSurfaces.push(".workflow/*/step_graph.yaml and workflow-to-workflow dependency metadata");
  }
  if ((byNodeType.class?.node_count ?? 0) > 0) {
    possibleMissingRelationSurfaces.push(".registry/classes/*/skill_refs.yaml and tool_refs.yaml");
  }
  if (!byNodeType.project && !byNodeType.agent_run && !byNodeType.model_profile) {
    possibleMissingRelationSurfaces.push("_workmeta project, validation, agent/model attribution metadata");
  }

  return {
    status: isolatedNodes.length > 0 ? "low_connectivity_observed" : "connected_observed",
    claim_ceiling: "observed",
    node_count: nodes.length,
    edge_count: edges.length,
    weak_component_count: componentRefs.length,
    largest_component_size: componentRefs[0]?.length ?? 0,
    isolated_count: isolatedNodes.length,
    edge_density: nodes.length > 1 ? Number((edges.length / (nodes.length * (nodes.length - 1))).toFixed(4)) : 0,
    component_sizes: componentRefs.map((refs) => refs.length),
    relation_counts: relationCounts,
    by_node_type: byNodeType,
    isolated_node_refs: isolatedNodes.map((degree) => degree.node_ref),
    low_degree_node_refs: lowDegreeNodes.map((degree) => degree.node_ref),
    dangling_edge_refs: danglingEdges,
    current_extraction_scope: [
      ".registry/classes/*/knowledge_refs.yaml",
      ".unit/*/unit.yaml species/class fields",
      ".workflow/*/profile_policy.yaml primary_profile species/class fields",
      ".party/*/party.yaml workflow_chain/default_workflow_id",
      "explicit knowledge_access ledgers",
    ],
    possible_missing_relation_surfaces: possibleMissingRelationSurfaces,
    interpretation:
      isolatedNodes.length > 0
        ? "The rendered separation matches the generated graph data; verify whether isolated nodes are expected scope exclusions or missing extractor coverage."
        : "The generated graph has no isolated nodes under the current extraction scope.",
  };
}

function addNode(nodes, node) {
  const existing = nodes.get(node.node_ref);
  if (existing) {
    return existing;
  }
  const normalized = {
    node_ref: node.node_ref,
    node_type: node.node_type,
    label: node.label,
    title: node.label,
    summary: node.summary ?? null,
    owner_surface: node.owner_surface,
    source_refs: {
      node_type: node.source_refs?.node_type ?? null,
      label: node.source_refs?.label ?? null,
      metrics: node.source_refs?.metrics ?? null,
      trust: node.source_refs?.trust ?? null,
      lifecycle: node.source_refs?.lifecycle ?? null,
    },
    trust: {
      claim_ceiling: node.trust?.claim_ceiling ?? "unknown",
    },
    lifecycle: {
      status: node.lifecycle?.status ?? "unknown",
    },
  };
  normalized.source_hash = hashMetadata({
    node_ref: normalized.node_ref,
    node_type: normalized.node_type,
    source_refs: normalized.source_refs,
    trust: normalized.trust,
    lifecycle: normalized.lifecycle,
  });
  nodes.set(normalized.node_ref, normalized);
  return normalized;
}

function addEdge(edges, edge) {
  const directed = edge.directed ?? !SYMMETRIC_RELATIONS.has(edge.relation_type);
  const key = `${edge.from_ref}|${edge.relation_type}|${edge.to_ref}|${directed}`;
  const existing = edges.get(key);
  if (existing) {
    existing.evidence_event_count += edge.evidence_event_count ?? 1;
    existing.last_evidence_timestamp_utc = maxTimestamp(
      existing.last_evidence_timestamp_utc,
      edge.last_evidence_timestamp_utc,
    );
    return existing;
  }
  const normalized = {
    edge_ref: `edge:${stableSlug(key)}`,
    from_ref: edge.from_ref,
    to_ref: edge.to_ref,
    relation_type: edge.relation_type,
    relation_state: edge.relation_state ?? "confirmed",
    directed,
    evidence_event_count: edge.evidence_event_count ?? 1,
    last_evidence_timestamp_utc: edge.last_evidence_timestamp_utc ?? null,
    source_refs: {
      relation_type: edge.source_refs?.relation_type ?? null,
      strength: edge.source_refs?.strength ?? null,
      state: edge.source_refs?.state ?? null,
    },
  };
  edges.set(key, normalized);
  return normalized;
}

async function writeGraph3dBundle(bundlePath) {
  const entryPath = path.join(path.dirname(bundlePath), ".graph_preview_3d.entry.mjs");
  await fs.writeFile(entryPath, renderGraph3dBundleEntry(), "utf8");
  try {
    await buildBundle({
      entryPoints: [entryPath],
      absWorkingDir: PACKAGE_ROOT,
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2020",
      outfile: bundlePath,
      nodePaths: [path.join(PACKAGE_ROOT, "node_modules")],
      logLevel: "silent",
    });
  } finally {
    await fs.rm(entryPath, { force: true });
  }
}

function renderGraphHtml3d(graph) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Soulforge Knowledge Graph 3D - ${escapeHtml(graph.export_id)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #05070b; color: #e5e7eb; overflow: hidden; }
    .app { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: 100vh; min-height: 0; overflow: hidden; }
    aside { height: 100vh; min-height: 0; border-right: 1px solid rgba(148, 163, 184, .24); background: #0b1020; padding: 18px; overflow-y: auto; overscroll-behavior: contain; }
    main { position: relative; height: 100vh; min-height: 0; overflow: hidden; background: #05070b; }
    h1 { font-size: 18px; margin: 0 0 10px; letter-spacing: 0; }
    h2 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
    label, select, input, button { font: inherit; }
    select, input[type="range"], input[type="text"] { width: 100%; }
	    select, input[type="text"] { color: #e5e7eb; background: #111827; border: 1px solid #334155; border-radius: 6px; padding: 7px 8px; }
	    button { color: #e0f2fe; background: #12304a; border: 1px solid rgba(56, 189, 248, .46); border-radius: 6px; padding: 8px 10px; cursor: pointer; font-weight: 750; }
	    button:hover { background: #164466; }
	    input[type="color"] { width: 28px; height: 24px; padding: 0; background: transparent; border: 0; }
    input[type="range"] { accent-color: #38bdf8; }
    .check { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 13px; color: #dbeafe; }
    .legend-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; color: #cbd5e1; }
    .meta { font-size: 12px; color: #94a3b8; line-height: 1.45; }
    .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0 4px; }
    .metric { border: 1px solid rgba(148, 163, 184, .24); border-radius: 6px; padding: 7px 8px; background: rgba(15, 23, 42, .62); }
    .metric strong { display: block; color: #f8fafc; font-size: 15px; line-height: 1.1; }
    .metric span { display: block; color: #94a3b8; font-size: 11px; margin-top: 3px; }
    .rule-panel { margin: 14px 0 2px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 8px; background: rgba(15, 23, 42, .56); overflow: hidden; }
    .rule-panel summary { cursor: pointer; padding: 10px 11px; color: #f8fafc; font-size: 13px; font-weight: 750; }
    .rule-panel[open] summary { border-bottom: 1px solid rgba(148, 163, 184, .18); }
    .rule-list { display: grid; gap: 8px; margin: 0; padding: 10px 11px 12px; }
    .rule { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 9px; font-size: 12px; line-height: 1.38; }
    .rule strong { color: #e0f2fe; font-weight: 750; }
    .rule span { color: #a9b6ca; }
    .section-body { display: grid; gap: 8px; padding: 10px 11px 12px; }
    .section-body h2 { margin: 8px 0 0; }
    .detection-card-panel { border-color: rgba(56, 189, 248, .34); }
    .detection-card-controls { display: grid; gap: 7px; }
    .detection-card-body { outline: none; }
    .detection-card { display: grid; gap: 10px; overflow-wrap: anywhere; }
    .detection-card-title { color: #f8fafc; font-size: 14px; font-weight: 800; line-height: 1.3; }
    .detection-card-guide { display: grid; gap: 8px; border: 1px solid rgba(56, 189, 248, .28); border-radius: 8px; padding: 9px; background: rgba(8, 47, 73, .34); }
    .detection-card-guide-title { color: #bae6fd; font-size: 12px; font-weight: 850; }
    .detection-card-guide-judgement { color: #f8fafc; font-size: 13px; font-weight: 800; line-height: 1.35; }
    .detection-card-guide ol { display: grid; gap: 5px; margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 12px; line-height: 1.42; }
    .detection-card-guide li::marker { color: #38bdf8; font-weight: 800; }
    .detection-card-section { display: grid; gap: 6px; }
    .detection-card-section-title { color: #a5b4fc; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .detection-card-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .detection-card-list li { border: 1px solid rgba(148, 163, 184, .20); border-radius: 6px; padding: 7px 8px; background: rgba(2, 6, 23, .34); color: #cbd5e1; font-size: 12px; line-height: 1.38; }
    .detection-card-item-title { display: block; color: #e0f2fe; font-weight: 750; }
    .detection-card-code { color: #fef08a; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .detection-card-boundary { border-top: 1px solid rgba(148, 163, 184, .18); padding-top: 8px; }
    #graph3d { width: 100%; height: 100%; display: block; background: #05070b; }
    .hud { position: absolute; left: 18px; bottom: 16px; color: #cbd5e1; font-size: 12px; background: rgba(15, 23, 42, .72); border: 1px solid rgba(148, 163, 184, .22); border-radius: 8px; padding: 9px 11px; backdrop-filter: blur(10px); }
    .legend-panel { position: absolute; top: 16px; right: 18px; width: max-content; min-width: 170px; max-width: min(250px, calc(100% - 36px)); max-height: calc(100vh - 32px); overflow: auto; color: #e0f2fe; background: rgba(15, 23, 42, .84); border: 1px solid rgba(148, 163, 184, .26); border-radius: 8px; padding: 12px 14px; font-size: 13px; font-weight: 650; backdrop-filter: blur(10px); }
    .legend-title { font-size: 14px; font-weight: 750; color: #f8fafc; margin-bottom: 10px; }
    .legend-section { margin-top: 10px; color: #a5b4fc; font-size: 12px; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; }
    .legend-item { display: flex; align-items: center; gap: 10px; margin-top: 7px; line-height: 1.25; white-space: nowrap; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 999px; flex: 0 0 auto; border: 1px solid rgba(255, 255, 255, .34); box-shadow: 0 0 0 2px rgba(15, 23, 42, .6); }
    .legend-line { height: 4px; width: 28px; border-radius: 999px; flex: 0 0 auto; box-shadow: 0 0 0 1px rgba(255, 255, 255, .12); }
    .tooltip { position: absolute; min-width: 220px; max-width: 340px; pointer-events: none; background: rgba(15, 23, 42, .94); color: white; border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.4; display: none; border: 1px solid rgba(148, 163, 184, .28); }
    .context-menu { position: absolute; display: none; z-index: 20; min-width: 220px; max-width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; color: #dbeafe; background: rgba(15, 23, 42, .96); border: 1px solid rgba(148, 163, 184, .32); border-radius: 8px; padding: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, .38); backdrop-filter: blur(10px); }
    .context-menu-title { color: #f8fafc; font-size: 13px; font-weight: 800; line-height: 1.25; margin: 3px 4px 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .context-menu button { width: 100%; display: block; text-align: left; margin: 4px 0; background: rgba(30, 41, 59, .86); border-color: rgba(148, 163, 184, .24); color: #e0f2fe; }
    .context-menu button:hover { background: rgba(14, 116, 144, .42); border-color: rgba(56, 189, 248, .46); }
    .context-menu-prompt { display: none; width: 100%; min-height: 132px; margin-top: 8px; resize: vertical; border-radius: 6px; border: 1px solid rgba(148, 163, 184, .28); background: rgba(2, 6, 23, .78); color: #dbeafe; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 8px; box-sizing: border-box; }
    .detection-bridge-command { display: none; width: 100%; min-height: 96px; margin-top: 8px; resize: vertical; border-radius: 6px; border: 1px solid rgba(148, 163, 184, .28); background: rgba(2, 6, 23, .78); color: #dbeafe; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 8px; box-sizing: border-box; }
    .context-menu-status { min-height: 17px; margin: 7px 4px 2px; }
    a { color: #93c5fd; }
    @media (max-width: 760px) {
      body { overflow: hidden; }
      .app { grid-template-columns: 1fr; grid-template-rows: minmax(220px, 40vh) minmax(360px, 60vh); }
      aside { height: 40vh; border-right: 0; border-bottom: 1px solid rgba(148, 163, 184, .24); padding: 14px; }
      main { height: 60vh; min-height: 0; }
      #graph3d { height: 100%; }
      .hud { left: 12px; bottom: 10px; max-width: calc(100vw - 24px); }
      .legend-panel { top: 10px; right: 12px; min-width: 160px; max-width: calc(100vw - 24px); max-height: 44vh; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <h1>Soulforge Knowledge Graph</h1>
      <div class="meta">3D 미리보기<br>생성: ${escapeHtml(graph.generated_at_utc)}<br>전체 노드: ${graph.nodes.length} / 전체 선: ${graph.edges.length}<br>출력은 메타데이터 전용이며 권한 판단이 아닙니다.<br><a href="./graph_preview_2d.html">2D 대체 보기 열기</a></div>
      ${renderRagLensControlsHtml(graph)}
      ${renderSourceSliceControlsHtml(graph)}
      <details class="rule-panel" id="settingsControls" open>
        <summary>설정 저장</summary>
        <div class="section-body">
          <button id="saveSettings" type="button">현재 설정 저장</button>
          <div class="meta" id="saveSettingsStatus">저장하면 이 브라우저에서 다음에 열 때 자동으로 불러옵니다.</div>
        </div>
      </details>
      <details class="rule-panel detection-card-panel" id="detectionCardPanel" aria-labelledby="detectionCardSummary">
        <summary id="detectionCardSummary">탐지 카드</summary>
        <div class="section-body">
          <div class="detection-card-controls">
            <label class="meta" for="detectionNodeRef">노드 ref</label>
            <input id="detectionNodeRef" type="text" autocomplete="off" placeholder=".registry/knowledge/graph_rag">
            <button id="openDetectionCardByRef" type="button">ref로 열기</button>
            <button id="copyDetectionBridgeCommand" type="button">gpt-5.5 검토 명령 복사</button>
            <button id="closeDetectionCard" type="button">닫기</button>
            <textarea id="detectionBridgeCommand" class="detection-bridge-command" readonly aria-label="수동 복사용 gpt-5.5 검토 명령"></textarea>
            <div class="meta" id="detectionCardStatus" aria-live="polite">노드를 우클릭하고 탐지 카드 열기를 누르거나 ref를 입력하세요.</div>
          </div>
          <div class="detection-card-body" id="detectionCardBody" tabindex="-1">
            <div class="meta">탐지 카드는 답변이 아니라 검토 안내입니다. 카드를 열면 맨 위의 판정과 지금 할 일을 먼저 보세요.</div>
          </div>
        </div>
      </details>
      <details class="rule-panel" id="visualRules">
        <summary>시각 규칙 보기</summary>
        <div class="rule-list">
          <div class="rule"><strong>원 크기</strong><span id="ruleNodeSizeMeaning">현재 선택한 기준에 따라 달라집니다.</span></div>
          <div class="rule"><strong>전체 배율</strong><span>모든 원을 같은 비율로 키우거나 줄입니다.</span></div>
          <div class="rule"><strong>상대 배율</strong><span>큰 원과 작은 원의 차이를 줄이거나 키웁니다.</span></div>
          <div class="rule"><strong>원 색</strong><span>노드 종류입니다. 예: 워크플로우, 직업, 종족, 지식.</span></div>
          <div class="rule"><strong>테두리</strong><span>신뢰도/주장 한계입니다. 정본, 후보, 관찰됨 같은 상태를 구분합니다.</span></div>
          <div class="rule"><strong>투명도</strong><span>최근성입니다. 최근 근거나 사용 기록일수록 더 진하게 보입니다.</span></div>
          <div class="rule"><strong>선 굵기</strong><span>관계 강도입니다. 근거 횟수나 관찰 횟수가 많을수록 굵어집니다.</span></div>
          <div class="rule"><strong>선 색</strong><span>관계 종류입니다. 추천, 사용, 체인, 라우팅 같은 의미를 구분합니다.</span></div>
          <div class="rule"><strong>선 모양</strong><span>관계 상태입니다. 실선은 확정, 짧은 점선은 후보/약한 관계입니다.</span></div>
          <div class="rule"><strong>화살표</strong><span>방향성입니다. 관계가 어느 노드에서 어느 노드로 흐르는지 보여줍니다.</span></div>
          <div class="rule"><strong>윤곽</strong><span id="ruleComponentHaloMeaning">현재 보이는 덩어리입니다. 포커스 중에는 선택 범위의 글로우만 남깁니다.</span></div>
        </div>
      </details>
      <details class="rule-panel" id="connectivityControls" open>
        <summary>연결성 / 덩어리</summary>
        <div class="section-body">
          <div class="metric-grid">
            <div class="metric" title="덩어리: 현재 보이는 노드 중 선을 따라 서로 도달할 수 있는 묶음 수"><strong id="metricComponents">${graph.connectivity_analysis.weak_component_count}</strong><span>덩어리</span></div>
            <div class="metric" title="고립 노드: 현재 보이는 선이 하나도 없는 노드 수"><strong id="metricIsolated">${graph.connectivity_analysis.isolated_count}</strong><span>고립 노드</span></div>
            <div class="metric" title="가장 큰 덩어리: 가장 큰 묶음 안에 들어 있는 노드 수"><strong id="metricLargest">${graph.connectivity_analysis.largest_component_size}</strong><span>가장 큰 덩어리</span></div>
            <div class="metric" title="보이는 선: 현재 필터 후 화면에 남은 관계선 수"><strong id="metricEdges">${graph.connectivity_analysis.edge_count}</strong><span>보이는 선</span></div>
          </div>
          <div class="meta" id="connectivitySummary">현재 선택한 필터 기준으로 다시 계산합니다.</div>
          <div class="meta">덩어리=선으로 이어진 묶음, 고립 노드=선이 없는 노드, 가장 큰 덩어리=최대 묶음의 노드 수, 보이는 선=필터 후 남은 관계입니다.</div>
          <label class="check"><input id="componentHalos" type="checkbox" checked> 덩어리 윤곽 표시</label>
          <label class="meta" for="componentHaloStyle">덩어리 표현</label>
          <select id="componentHaloStyle">
            <option value="glow">연두 윤곽 글로우</option>
            <option value="line">얇은 한 줄</option>
            <option value="bold">굵은 한 줄</option>
          </select>
          <div class="meta">연두 윤곽 글로우는 둥근 점 구름으로 덩어리 경계를 감싸고, 한 줄은 가장 절제된 표현입니다.</div>
          <h2>윤곽 점 구름</h2>
          <label class="meta" for="componentShellSpacing">점 간격: <span id="componentShellSpacingValue">22</span></label>
          <input id="componentShellSpacing" type="range" min="8" max="34" step="1" value="22">
          <label class="meta" for="componentShellPointScale">점 크기: <span id="componentShellPointScaleValue">1.65</span>x</label>
          <input id="componentShellPointScale" type="range" min="0.45" max="2.20" step="0.05" value="1.65">
          <label class="meta" for="componentShellOpacityScale">점 밝기: <span id="componentShellOpacityScaleValue">1.60</span>x</label>
          <input id="componentShellOpacityScale" type="range" min="0.20" max="1.60" step="0.05" value="1.60">
          <label class="meta" for="componentShellDepth">구 깊이: <span id="componentShellDepthValue">1.00</span>x</label>
          <input id="componentShellDepth" type="range" min="0.25" max="2.40" step="0.05" value="1.00">
          <label class="meta" for="componentShellInnerRadius">속 비움: <span id="componentShellInnerRadiusValue">0.90</span></label>
          <input id="componentShellInnerRadius" type="range" min="0" max="0.90" step="0.01" value="0.90">
          <label class="meta" for="componentShellJitter">흔들림: <span id="componentShellJitterValue">0.12</span></label>
          <input id="componentShellJitter" type="range" min="0" max="0.12" step="0.005" value="0.12">
          <div class="meta">점 간격은 작을수록 촘촘합니다. 구 깊이는 얕고 납작한 느낌을 깊게 만들고, 속 비움은 낮을수록 중심까지 채웁니다.</div>
        </div>
      </details>
      <details class="rule-panel" id="nodeSizeControls" open>
        <summary>원 크기</summary>
        <div class="section-body">
          <label class="meta" for="nodeSizeMode">원 크기 기준</label>
          <select id="nodeSizeMode">
            <option value="degree">연결수</option>
            <option value="usage">사용량</option>
          </select>
          <div class="meta">연결수는 현재 필터 후 보이는 선 기준입니다. 사용량은 방명록/접근 기록 기준입니다.</div>
          <label class="meta" for="nodeGlobalScale">전체 배율: <span id="nodeGlobalScaleValue">0.85</span>x</label>
          <input id="nodeGlobalScale" type="range" min="0.45" max="1.40" step="0.05" value="0.85">
          <label class="meta" for="nodeRelativeScale">상대 배율: <span id="nodeRelativeScaleValue">0.75</span>x</label>
          <input id="nodeRelativeScale" type="range" min="0" max="1.60" step="0.05" value="0.75">
          <div class="meta">전체 배율은 모든 원을 함께 조절하고, 상대 배율은 큰 원과 작은 원의 차이를 조절합니다.</div>
        </div>
      </details>
      <details class="rule-panel" id="viewControls" open>
        <summary>배치 / 포커스 / 시간</summary>
        <div class="section-body">
          <label class="meta" for="layout">배치</label>
          <select id="layout">
            <option value="force_3d">force_3d</option>
            <option value="semantic_shell">semantic_shell</option>
            <option value="radial_layers">radial_layers</option>
          </select>
          <label class="check"><input id="autoRotate" type="checkbox"> 자동 회전</label>
          <label class="meta" for="focusDepth">포커스 범위</label>
          <select id="focusDepth">
            <option value="1">1단계</option>
            <option value="2">2단계</option>
            <option value="all">전체 연결</option>
          </select>
          <label class="meta" for="hotDays">최근 기준 일수: <span id="hotDaysValue">30</span></label>
          <input id="hotDays" type="range" min="7" max="120" value="30">
          <label class="meta" for="staleDays">오래됨 기준 일수: <span id="staleDaysValue">180</span></label>
          <input id="staleDays" type="range" min="60" max="365" value="180">
        </div>
      </details>
      <details class="rule-panel" id="filterControls" open>
        <summary>필터</summary>
        <div class="section-body">
          <h2>노드 종류</h2>
          <div id="nodeFilters"></div>
          <h2>관계 종류</h2>
          <div id="edgeFilters"></div>
        </div>
      </details>
      <details class="rule-panel" id="paletteControls">
        <summary>팔레트 편집</summary>
        <div class="section-body">
          <div id="palette"></div>
        </div>
      </details>
    </aside>
    <main>
      <canvas id="graph3d" aria-label="Soulforge generated 3D knowledge graph"></canvas>
      <div class="hud" id="hud">3D graph initializing</div>
      <div class="legend-panel" id="legendPanel"></div>
      <div class="tooltip" id="tooltip"></div>
      <div class="context-menu" id="nodeContextMenu" role="menu" aria-hidden="true">
        <div class="context-menu-title" id="contextMenuTitle">노드 탐구</div>
        <button id="openDetectionCard" type="button">탐지 카드 열기</button>
        <button id="copyExplorePrompt" type="button">탐구 프롬프트 복사</button>
        <button id="focusContextNode" type="button">연결만 보기</button>
        <button id="copyNodeRef" type="button">ref 복사</button>
        <textarea id="contextMenuPrompt" class="context-menu-prompt" readonly aria-label="수동 복사용 탐구 프롬프트"></textarea>
        <div class="meta context-menu-status" id="contextMenuStatus">우클릭한 노드에서 시작합니다.</div>
      </div>
    </main>
  </div>
  <script id="graph-data" type="application/json">${escapeScriptJson(graph)}</script>
  <script src="./graph_preview_3d.bundle.js?v=${encodeURIComponent(`${graph.export_id}-${graph.generated_at_utc}`)}"></script>
</body>
</html>
`;
}

function renderRagLensControlsHtml(graph) {
  const projection = graph.rag_projection;
  const profiles = projection?.lens_profiles ?? [];
  const profileOptions = profiles
    .map((profile) => `<option value="${escapeHtml(profile.lens_id)}">${escapeHtml(profile.title ?? profile.lens_id)}</option>`)
    .join("");
  const disabled = projection ? "" : " disabled";
  const summary = projection
    ? `Manifest ${projection.manifest_refs.map((item) => item.manifest_id).join(", ")} 기준. 매칭 노드 ${projection.matched_node_count}, source handle ${projection.source_handle_count}.`
    : "RAG manifest를 지정하지 않아 렌즈 overlay가 없습니다.";
  return `
      <details class="rule-panel" id="ragLensControls" ${projection ? "open" : ""}>
        <summary>RAG 렌즈</summary>
        <div class="section-body">
          <label class="meta" for="ragLensMode">렌즈</label>
          <select id="ragLensMode"${disabled}>
            <option value="all">전체 보기</option>
            ${profileOptions}
          </select>
          <label class="check"><input id="ragAnswerReadyOnly" type="checkbox"${disabled}> metadata 답변 가능 노드만</label>
          <div class="meta" id="ragLensSummary">${escapeHtml(summary)}</div>
          <div class="meta">RAG 렌즈는 manifest metadata overlay입니다. 원문, chunk, vector, NotebookLM 답변은 이 preview에 포함되지 않습니다.</div>
        </div>
      </details>`;
}

function renderSourceSliceControlsHtml(graph) {
  const projection = graph.source_slice_projection;
  const disabled = projection ? "" : " disabled";
  const totals = projection?.totals ?? {};
  const summary = projection
    ? `등록 ${totals.registered_metadata_count ?? 0}, 검토 ${totals.owner_review_count ?? 0}, 차단 ${totals.blocked_count ?? 0}, queue ${totals.review_queue_item_count ?? 0}.`
    : "source slice triage register를 지정하지 않아 등록 상태 overlay가 없습니다.";
  return `
      <details class="rule-panel" id="sourceSliceControls" ${projection ? "open" : ""}>
        <summary>RAG 등록 상태</summary>
        <div class="section-body">
          <label class="meta" for="sourceSliceMode">표시 상태</label>
          <select id="sourceSliceMode"${disabled}>
            <option value="all">전체 보기</option>
            <option value="registered_metadata_knowledge">metadata 등록 노드</option>
            <option value="owner_review_required">검토 필요 노드</option>
            <option value="blocked_unsafe_source_locator">차단 노드</option>
            <option value="stronger_permission_needed">강한 권한 필요 노드</option>
          </select>
          <div class="meta" id="sourceSliceSummary">${escapeHtml(summary)}</div>
          <div class="meta">등록 상태는 source slice triage metadata입니다. public canon, 원문 읽기, index build, NotebookLM 투입 승인이 아닙니다.</div>
        </div>
      </details>`;
}

function renderGraphHtml2d(graph) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Soulforge Knowledge Graph - ${escapeHtml(graph.export_id)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    .app { display: grid; grid-template-columns: 320px minmax(0, 1fr); min-height: 100vh; }
    aside { border-right: 1px solid #dbe3ef; background: #ffffff; padding: 18px; overflow: auto; }
    main { position: relative; min-height: 100vh; overflow: hidden; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    h2 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
    label, select, input, button { font: inherit; }
    select, input[type="range"] { width: 100%; }
    .check { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 13px; }
    .legend-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; }
    .swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #cbd5e1; }
    .meta { font-size: 12px; color: #64748b; line-height: 1.45; }
    #graph { width: 100%; height: 100vh; display: block; background: radial-gradient(circle at 40% 25%, #ffffff 0, #f8fafc 42%, #eef2f7 100%); }
    .edge { fill: none; }
    .node-label { pointer-events: none; font-size: 11px; paint-order: stroke; stroke: white; stroke-width: 4px; stroke-linejoin: round; fill: #0f172a; }
    .tooltip { position: absolute; min-width: 220px; max-width: 340px; pointer-events: none; background: rgba(15, 23, 42, .94); color: white; border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.4; display: none; }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <h1>Soulforge Knowledge Graph</h1>
      <div class="meta">Generated: ${escapeHtml(graph.generated_at_utc)}<br>Nodes: ${graph.nodes.length} / Edges: ${graph.edges.length}<br>Output is metadata-only and not authority.</div>
      <h2>Layout</h2>
      <select id="layout"></select>
      <h2>Thresholds</h2>
      <label class="meta" for="hotDays">Hot days: <span id="hotDaysValue">30</span></label>
      <input id="hotDays" type="range" min="7" max="120" value="30">
      <label class="meta" for="staleDays">Stale days: <span id="staleDaysValue">180</span></label>
      <input id="staleDays" type="range" min="60" max="365" value="180">
      <h2>Node Types</h2>
      <div id="nodeFilters"></div>
      <h2>Relation Types</h2>
      <div id="edgeFilters"></div>
      <h2>Palette</h2>
      <div id="palette"></div>
    </aside>
    <main>
      <svg id="graph" role="img" aria-label="Soulforge generated knowledge graph"></svg>
      <div class="tooltip" id="tooltip"></div>
    </main>
  </div>
  <script id="graph-data" type="application/json">${escapeScriptJson(graph)}</script>
  <script>
    const graph = JSON.parse(document.getElementById("graph-data").textContent);
    const state = {
      layout: "force_auto",
      nodeTypes: Object.fromEntries([...new Set(graph.nodes.map((n) => n.node_type))].sort().map((type) => [type, true])),
      edgeTypes: Object.fromEntries([...new Set(graph.edges.map((e) => e.relation_type))].sort().map((type) => [type, true])),
      nodeColors: { ...graph.palettes.node_type },
      relationColors: { ...graph.palettes.relation_type },
      hotDays: 30,
      staleDays: 180,
      focusRef: graph.nodes[0]?.node_ref ?? null,
    };
    const svg = document.getElementById("graph");
    const tooltip = document.getElementById("tooltip");
    const width = () => svg.clientWidth || 1000;
    const height = () => svg.clientHeight || 720;

    initControls();
    draw();

    function initControls() {
      const layout = document.getElementById("layout");
      for (const item of graph.layout_presets) {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        layout.append(option);
      }
      layout.value = state.layout;
      layout.addEventListener("change", () => { state.layout = layout.value; draw(); });

      bindRange("hotDays", "hotDaysValue", "hotDays");
      bindRange("staleDays", "staleDaysValue", "staleDays");
      renderFilter("nodeFilters", state.nodeTypes, draw);
      renderFilter("edgeFilters", state.edgeTypes, draw);
      renderPalette();
    }

    function bindRange(inputId, outputId, stateKey) {
      const input = document.getElementById(inputId);
      const output = document.getElementById(outputId);
      input.addEventListener("input", () => {
        state[stateKey] = Number(input.value);
        output.textContent = input.value;
        draw();
      });
    }

    function renderFilter(id, target, onChange) {
      const root = document.getElementById(id);
      root.replaceChildren();
      for (const key of Object.keys(target).sort()) {
        const label = document.createElement("label");
        label.className = "check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = target[key];
        input.addEventListener("change", () => { target[key] = input.checked; onChange(); });
        label.append(input, document.createTextNode(key));
        root.append(label);
      }
    }

    function renderPalette() {
      const root = document.getElementById("palette");
      root.replaceChildren();
      for (const [key, value] of Object.entries(state.nodeColors).sort()) {
        const row = document.createElement("label");
        row.className = "legend-row";
        const input = document.createElement("input");
        input.type = "color";
        input.value = value;
        input.addEventListener("input", () => { state.nodeColors[key] = input.value; draw(); });
        const text = document.createElement("span");
        text.textContent = key;
        row.append(input, text);
        root.append(row);
      }
    }

    function draw() {
      const nodes = graph.nodes.filter((node) => state.nodeTypes[node.node_type]);
      const nodeRefs = new Set(nodes.map((node) => node.node_ref));
      const edges = graph.edges.filter((edge) => state.edgeTypes[edge.relation_type] && nodeRefs.has(edge.from_ref) && nodeRefs.has(edge.to_ref));
      const positioned = layoutNodes(nodes, edges);
      const byRef = new Map(positioned.map((node) => [node.node_ref, node]));
      svg.replaceChildren();
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.innerHTML = '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#334155"></path></marker>';
      svg.append(defs);

      for (const edge of edges) {
        const from = byRef.get(edge.from_ref);
        const to = byRef.get(edge.to_ref);
        if (!from || !to) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", state.relationColors[edge.relation_type] ?? edge.visual.color);
        line.setAttribute("stroke-width", edge.visual.width_px);
        line.setAttribute("stroke-opacity", recencyOpacity(edge.metrics.days_since_last_evidence));
        line.setAttribute("stroke-dasharray", dashArray(edge.visual.line_style));
        if (edge.directed) line.setAttribute("marker-end", "url(#arrow)");
        line.classList.add("edge");
        addHover(line, edgeTooltip(edge));
        svg.append(line);
      }

      for (const node of positioned) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", node.x);
        circle.setAttribute("cy", node.y);
        circle.setAttribute("r", node.visual.size_px);
        circle.setAttribute("fill", state.nodeColors[node.node_type] ?? node.visual.color);
        circle.setAttribute("fill-opacity", recencyOpacity(node.metrics.days_since_last_access));
        circle.setAttribute("stroke", node.visual.border_color);
        circle.setAttribute("stroke-width", 3);
        circle.setAttribute("stroke-dasharray", dashArray(node.visual.border_style));
        addHover(circle, nodeTooltip(node));
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", node.x + node.visual.size_px + 5);
        text.setAttribute("y", node.y + 4);
        text.textContent = node.label;
        text.classList.add("node-label");
        group.append(circle, text);
        svg.append(group);
      }
    }

    function layoutNodes(nodes, edges) {
      const w = width();
      const h = height();
      const base = nodes.map((node, index) => ({ ...node, x: w / 2 + Math.cos(index) * 120, y: h / 2 + Math.sin(index) * 120 }));
      if (state.layout === "semantic_regions" || state.layout === "hybrid_regions_force") {
        return semanticLayout(base, state.layout === "hybrid_regions_force");
      }
      if (state.layout === "radial_focus") {
        return radialLayout(base);
      }
      return forceLayout(base, edges, 140);
    }

    function semanticLayout(nodes, relax) {
      const anchors = {
        project: [0.16, 0.5], mission: [0.18, 0.72], artifact: [0.72, 0.78],
        knowledge: [0.5, 0.46], concept: [0.5, 0.24], source: [0.5, 0.1],
        workflow: [0.82, 0.42], party: [0.82, 0.22], model_profile: [0.35, 0.86],
        agent_surface: [0.5, 0.88], agent_run: [0.62, 0.86], validation: [0.72, 0.12],
        species: [0.18, 0.18], class: [0.24, 0.3], unit: [0.24, 0.42],
      };
      const grouped = new Map();
      for (const node of nodes) {
        const group = grouped.get(node.node_type) ?? [];
        group.push(node);
        grouped.set(node.node_type, group);
      }
      const out = [];
      for (const [type, group] of grouped) {
        const [ax, ay] = anchors[type] ?? [0.5, 0.5];
        group.forEach((node, index) => {
          const angle = (Math.PI * 2 * index) / Math.max(1, group.length);
          const radius = relax ? 78 : 58;
          out.push({ ...node, x: width() * ax + Math.cos(angle) * radius, y: height() * ay + Math.sin(angle) * radius });
        });
      }
      return relax ? forceLayout(out, [], 40) : out;
    }

    function radialLayout(nodes) {
      const focus = nodes.find((node) => node.node_ref === state.focusRef) ?? nodes[0];
      const others = nodes.filter((node) => node !== focus);
      return [
        { ...focus, x: width() / 2, y: height() / 2 },
        ...others.map((node, index) => {
          const angle = (Math.PI * 2 * index) / Math.max(1, others.length);
          return { ...node, x: width() / 2 + Math.cos(angle) * 260, y: height() / 2 + Math.sin(angle) * 220 };
        }),
      ];
    }

    function forceLayout(nodes, edges, iterations) {
      const out = nodes.map((node, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
        return { ...node, x: width() / 2 + Math.cos(angle) * 250, y: height() / 2 + Math.sin(angle) * 210 };
      });
      const byRef = new Map(out.map((node) => [node.node_ref, node]));
      for (let step = 0; step < iterations; step += 1) {
        for (let i = 0; i < out.length; i += 1) {
          for (let j = i + 1; j < out.length; j += 1) {
            const a = out[i], b = out[j];
            const dx = a.x - b.x || 0.1, dy = a.y - b.y || 0.1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const push = Math.min(2.5, 1400 / (dist * dist));
            a.x += (dx / dist) * push; a.y += (dy / dist) * push;
            b.x -= (dx / dist) * push; b.y -= (dy / dist) * push;
          }
        }
        for (const edge of edges) {
          const a = byRef.get(edge.from_ref), b = byRef.get(edge.to_ref);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          a.x += dx * 0.012; a.y += dy * 0.012;
          b.x -= dx * 0.012; b.y -= dy * 0.012;
        }
        for (const node of out) {
          node.x += (width() / 2 - node.x) * 0.004;
          node.y += (height() / 2 - node.y) * 0.004;
          node.x = Math.max(40, Math.min(width() - 160, node.x));
          node.y = Math.max(40, Math.min(height() - 40, node.y));
        }
      }
      return out;
    }

    function recencyOpacity(days) {
      if (days === null || days === undefined) return 0.15;
      if (days <= state.hotDays) return 1;
      if (days <= 90) return 0.7;
      if (days <= state.staleDays) return 0.4;
      return 0.2;
    }

    function dashArray(style) {
      if (style === "dashed") return "7 4";
      if (style === "dotted") return "2 4";
      if (style === "long_dash") return "12 6";
      if (style === "faint") return "4 6";
      return "";
    }

    function addHover(element, html) {
      element.addEventListener("mousemove", (event) => {
        tooltip.innerHTML = html;
        tooltip.style.display = "block";
        positionTooltip(event);
      });
      element.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    }

    function positionTooltip(event) {
      const host = tooltip.parentElement;
      const hostRect = host.getBoundingClientRect();
      const offset = 14;
      const margin = 8;
      const rect = tooltip.getBoundingClientRect();
      const maxX = Math.max(margin, hostRect.width - rect.width - margin);
      const maxY = Math.max(margin, hostRect.height - rect.height - margin);
      const x = clamp(event.clientX - hostRect.left + offset, margin, maxX);
      const y = clamp(event.clientY - hostRect.top + offset, margin, maxY);
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function nodeTooltip(node) {
      return "<strong>" + escapeHtmlText(node.label) + "</strong><br>" +
        "type: " + escapeHtmlText(node.node_type) + "<br>" +
        "ref: " + escapeHtmlText(node.node_ref) + "<br>" +
        "usage: " + node.metrics.total_access_count + "<br>" +
        "last used: " + escapeHtmlText(node.metrics.last_access_timestamp_utc ?? "none") + "<br>" +
        "trust: " + escapeHtmlText(node.trust.claim_ceiling) + "<br>" +
        "status: " + escapeHtmlText(node.lifecycle.status);
    }

    function edgeTooltip(edge) {
      return "<strong>" + escapeHtmlText(edge.relation_type) + "</strong><br>" +
        escapeHtmlText(edge.from_ref) + " -> " + escapeHtmlText(edge.to_ref) + "<br>" +
        "state: " + escapeHtmlText(edge.relation_state) + "<br>" +
        "evidence count: " + edge.metrics.evidence_event_count + "<br>" +
        "last evidence: " + escapeHtmlText(edge.metrics.last_evidence_timestamp_utc ?? "none");
    }

    function escapeHtmlText(value) {
      return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
    }
  </script>
</body>
</html>
`;
}

function renderGraph3dBundleEntry() {
  return String.raw`
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const graph = JSON.parse(document.getElementById("graph-data").textContent);
const canvas = document.getElementById("graph3d");
const tooltip = document.getElementById("tooltip");
const hud = document.getElementById("hud");
const legendPanel = document.getElementById("legendPanel");
const nodeContextMenu = document.getElementById("nodeContextMenu");
const contextMenuTitle = document.getElementById("contextMenuTitle");
const contextMenuStatus = document.getElementById("contextMenuStatus");
const contextMenuPrompt = document.getElementById("contextMenuPrompt");
const openDetectionCardButton = document.getElementById("openDetectionCard");
const copyExplorePromptButton = document.getElementById("copyExplorePrompt");
const focusContextNodeButton = document.getElementById("focusContextNode");
const copyNodeRefButton = document.getElementById("copyNodeRef");
const detectionCardPanel = document.getElementById("detectionCardPanel");
const detectionCardBody = document.getElementById("detectionCardBody");
const detectionCardStatus = document.getElementById("detectionCardStatus");
const detectionNodeRefInput = document.getElementById("detectionNodeRef");
const openDetectionCardByRefButton = document.getElementById("openDetectionCardByRef");
const copyDetectionBridgeCommandButton = document.getElementById("copyDetectionBridgeCommand");
const detectionBridgeCommand = document.getElementById("detectionBridgeCommand");
const closeDetectionCardButton = document.getElementById("closeDetectionCard");
const ruleNodeSizeMeaning = document.getElementById("ruleNodeSizeMeaning");
const ruleComponentHaloMeaning = document.getElementById("ruleComponentHaloMeaning");
const ragLensMode = document.getElementById("ragLensMode");
const ragAnswerReadyOnly = document.getElementById("ragAnswerReadyOnly");
const ragLensSummary = document.getElementById("ragLensSummary");
const sourceSliceMode = document.getElementById("sourceSliceMode");
const sourceSliceSummary = document.getElementById("sourceSliceSummary");
const connectivityEls = {
  components: document.getElementById("metricComponents"),
  isolated: document.getElementById("metricIsolated"),
  largest: document.getElementById("metricLargest"),
  edges: document.getElementById("metricEdges"),
  summary: document.getElementById("connectivitySummary"),
};
const SETTINGS_STORAGE_KEY = "soulforge.knowledgeGraph3d.settings.v1:" + graph.export_id;
const RAG_LENS_OPTIONS = new Set(["all", ...((graph.rag_projection?.lens_profiles ?? []).map((profile) => profile.lens_id))]);
const SOURCE_SLICE_OPTIONS = new Set([
  "all",
  "registered_metadata_knowledge",
  "owner_review_required",
  "blocked_unsafe_source_locator",
  "stronger_permission_needed",
]);
const NUMBER_SETTING_KEYS = [
  "hotDays",
  "staleDays",
  "nodeGlobalScale",
  "nodeRelativeScale",
  "componentShellSpacing",
  "componentShellPointScale",
  "componentShellOpacityScale",
  "componentShellDepth",
  "componentShellInnerRadius",
  "componentShellJitter",
];
const STRING_SETTING_OPTIONS = {
  layout: new Set(["force_3d", "semantic_shell", "radial_layers"]),
  nodeSizeMode: new Set(["degree", "usage"]),
  componentHaloStyle: new Set(["glow", "line", "bold"]),
  focusDepth: new Set(["1", "2", "all"]),
  ragLensMode: RAG_LENS_OPTIONS,
  sourceSliceMode: SOURCE_SLICE_OPTIONS,
};
const BOOLEAN_SETTING_KEYS = ["showComponentHalos", "autoRotate", "ragAnswerReadyOnly"];

const NODE_TYPE_LABELS = {
  agent_run: "실행 기록",
  agent_surface: "실행 표면",
  artifact: "산출물",
  class: "직업",
  concept: "개념",
  knowledge: "지식",
  mission: "미션",
  model_profile: "모델 프로필",
  party: "파티",
  project: "프로젝트",
  source: "출처",
  species: "종족",
  unit: "유닛",
  validation: "검증",
  workflow: "워크플로우",
};

const RELATION_TYPE_LABELS = {
  belongs_to: "소속",
  chains: "체인",
  co_used_with: "함께 사용",
  conflicts_with: "충돌",
  consumes: "소비",
  derived_from: "파생",
  has_class: "직업 보유",
  has_species: "종족 보유",
  produces: "생성",
  recommends: "추천",
  requires_owner_decision: "책임자 판단 필요",
  routes_to: "라우팅",
  supports: "뒷받침",
  uses: "사용",
  validates: "검증",
};

const COMPONENT_HALO_COLORS = [
  "#84cc16",
  "#22c55e",
  "#a3e635",
  "#2dd4bf",
  "#facc15",
  "#38bdf8",
  "#a78bfa",
  "#ec4899",
  "#fb7185",
];

const state = {
  layout: "force_3d",
  nodeTypes: Object.fromEntries([...new Set(graph.nodes.map((node) => node.node_type))].sort().map((type) => [type, true])),
  edgeTypes: Object.fromEntries([...new Set(graph.edges.map((edge) => edge.relation_type))].sort().map((type) => [type, true])),
  nodeColors: { ...graph.palettes.node_type },
  relationColors: { ...graph.palettes.relation_type },
  hotDays: 30,
  staleDays: 180,
  nodeSizeMode: "degree",
  nodeGlobalScale: 0.85,
  nodeRelativeScale: 0.75,
  showComponentHalos: true,
  componentHaloStyle: "glow",
  componentShellSpacing: 22,
  componentShellPointScale: 1.65,
  componentShellOpacityScale: 1.6,
  componentShellDepth: 1,
  componentShellInnerRadius: 0.9,
  componentShellJitter: 0.12,
  focusDepth: "2",
  autoRotate: false,
  ragLensMode: "all",
  ragAnswerReadyOnly: false,
  sourceSliceMode: "all",
  focusRef: null,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);

const camera = new THREE.PerspectiveCamera(48, 1, 1, 2600);
camera.position.set(0, 120, 760);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.42;
controls.minDistance = 160;
controls.maxDistance = 1450;
const savedSettingsLoaded = loadSavedSettings();
controls.autoRotate = state.autoRotate;

const graphGroup = new THREE.Group();
scene.add(graphGroup);
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
keyLight.position.set(160, 280, 380);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.8);
rimLight.position.set(-320, -120, -260);
scene.add(rimLight);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let interactiveMeshes = [];
let nodeVisuals = new Map();
let edgeVisuals = [];
let componentVisuals = [];
let currentVisibleNodes = [];
let currentVisibleEdges = [];
let lastHoveredNodeRef = null;
let visibleNodeCount = 0;
let visibleEdgeCount = 0;
let focusedNodeCount = 0;
let focusedEdgeCount = 0;
let visibleConnectivity = { components: 0, isolated: 0, largest: 0 };
let componentGlowPointTexture = null;
let contextNodeRef = null;
let activeDetectionCardPayload = null;
let detectionCardFocusRef = null;

initControls();
resize();
rebuild();
animate();

window.addEventListener("resize", resize);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerleave", () => { tooltip.style.display = "none"; });
canvas.addEventListener("contextmenu", onCanvasContextMenu);
canvas.addEventListener("dblclick", onCanvasDoubleClick);
nodeContextMenu.addEventListener("click", (event) => event.stopPropagation());
openDetectionCardButton.addEventListener("click", () => showDetectionCardForContextNode());
copyExplorePromptButton.addEventListener("click", () => copyContextExplorePrompt());
focusContextNodeButton.addEventListener("click", () => focusContextNode());
copyNodeRefButton.addEventListener("click", () => copyContextNodeRef());
openDetectionCardByRefButton.addEventListener("click", () => openDetectionCardFromInput());
copyDetectionBridgeCommandButton.addEventListener("click", () => copyDetectionBridgeCommandFromCard());
closeDetectionCardButton.addEventListener("click", () => closeDetectionCard());
detectionNodeRefInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openDetectionCardFromInput();
});
window.addEventListener("click", hideContextMenu);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  hideContextMenu();
  if (detectionCardPanel.open && detectionCardPanel.contains(document.activeElement)) {
    closeDetectionCard();
  }
});

function initControls() {
  const saveSettingsButton = document.getElementById("saveSettings");
  saveSettingsButton.addEventListener("click", saveSettings);
  setSettingsStatus(savedSettingsLoaded
    ? "저장된 설정을 불러왔습니다. 새 값은 버튼을 누르면 다시 저장됩니다."
    : "현재 기본값으로 시작했습니다. 버튼을 누르면 이 브라우저에 저장됩니다.");
  const layout = document.getElementById("layout");
  layout.value = state.layout;
  layout.addEventListener("change", () => {
    state.layout = layout.value;
    rebuild();
  });
  bindRange("hotDays", "hotDaysValue", "hotDays");
  bindRange("staleDays", "staleDaysValue", "staleDays");
  renderFilter("nodeFilters", state.nodeTypes, rebuild);
  renderFilter("edgeFilters", state.edgeTypes, rebuild);
  renderPalette();
  bindRange("nodeGlobalScale", "nodeGlobalScaleValue", "nodeGlobalScale");
  bindRange("nodeRelativeScale", "nodeRelativeScaleValue", "nodeRelativeScale");
  const nodeSizeMode = document.getElementById("nodeSizeMode");
  nodeSizeMode.value = state.nodeSizeMode;
  nodeSizeMode.addEventListener("change", () => {
    state.nodeSizeMode = nodeSizeMode.value;
    updateVisualRules();
    rebuild();
  });
  const componentHalos = document.getElementById("componentHalos");
  componentHalos.checked = state.showComponentHalos;
  componentHalos.addEventListener("change", () => {
    state.showComponentHalos = componentHalos.checked;
    updateVisualRules();
    rebuild();
  });
  const componentHaloStyle = document.getElementById("componentHaloStyle");
  componentHaloStyle.value = state.componentHaloStyle;
  componentHaloStyle.addEventListener("change", () => {
    state.componentHaloStyle = componentHaloStyle.value;
    updateVisualRules();
    rebuild();
  });
  bindRange("componentShellSpacing", "componentShellSpacingValue", "componentShellSpacing");
  bindRange("componentShellPointScale", "componentShellPointScaleValue", "componentShellPointScale");
  bindRange("componentShellOpacityScale", "componentShellOpacityScaleValue", "componentShellOpacityScale");
  bindRange("componentShellDepth", "componentShellDepthValue", "componentShellDepth");
  bindRange("componentShellInnerRadius", "componentShellInnerRadiusValue", "componentShellInnerRadius");
  bindRange("componentShellJitter", "componentShellJitterValue", "componentShellJitter");
  const autoRotate = document.getElementById("autoRotate");
  autoRotate.checked = controls.autoRotate;
  autoRotate.addEventListener("change", () => {
    state.autoRotate = autoRotate.checked;
    controls.autoRotate = state.autoRotate;
    updateHud();
  });
  const focusDepth = document.getElementById("focusDepth");
  focusDepth.value = state.focusDepth;
  focusDepth.addEventListener("change", () => {
    state.focusDepth = focusDepth.value;
    if (state.focusRef) {
      rebuild();
    } else {
      applyFocus();
    }
    updateHud();
  });
  if (ragLensMode) {
    ragLensMode.value = state.ragLensMode;
    ragLensMode.addEventListener("change", () => {
      state.ragLensMode = ragLensMode.value;
      rebuild();
    });
  }
  if (ragAnswerReadyOnly) {
    ragAnswerReadyOnly.checked = state.ragAnswerReadyOnly;
    ragAnswerReadyOnly.addEventListener("change", () => {
      state.ragAnswerReadyOnly = ragAnswerReadyOnly.checked;
      rebuild();
    });
  }
  if (sourceSliceMode) {
    sourceSliceMode.value = state.sourceSliceMode;
    sourceSliceMode.addEventListener("change", () => {
      state.sourceSliceMode = sourceSliceMode.value;
      rebuild();
    });
  }
}

function bindRange(inputId, outputId, stateKey) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  input.value = String(state[stateKey]);
  output.textContent = input.value;
  input.addEventListener("input", () => {
    state[stateKey] = Number(input.value);
    output.textContent = input.value;
    rebuild();
  });
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(serializeSettings()));
    setSettingsStatus("저장됨: " + new Date().toLocaleString("ko-KR"));
  } catch (error) {
    setSettingsStatus("저장 실패: 브라우저 저장소를 사용할 수 없습니다.");
  }
}

function serializeSettings() {
  const settings = {
    version: 1,
    savedAt: new Date().toISOString(),
    nodeTypes: { ...state.nodeTypes },
    edgeTypes: { ...state.edgeTypes },
    nodeColors: { ...state.nodeColors },
    relationColors: { ...state.relationColors },
  };
  for (const key of NUMBER_SETTING_KEYS) settings[key] = state[key];
  for (const key of Object.keys(STRING_SETTING_OPTIONS)) settings[key] = state[key];
  for (const key of BOOLEAN_SETTING_KEYS) settings[key] = key === "autoRotate" ? controls.autoRotate : state[key];
  return settings;
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return false;
    return applySavedSettings(JSON.parse(raw));
  } catch (error) {
    return false;
  }
}

function applySavedSettings(saved) {
  if (!isPlainRecord(saved) || saved.version !== 1) return false;
  for (const key of NUMBER_SETTING_KEYS) {
    const value = Number(saved[key]);
    if (Number.isFinite(value)) state[key] = value;
  }
  for (const [key, options] of Object.entries(STRING_SETTING_OPTIONS)) {
    if (typeof saved[key] === "string" && options.has(saved[key])) state[key] = saved[key];
  }
  for (const key of BOOLEAN_SETTING_KEYS) {
    if (typeof saved[key] === "boolean") state[key] = saved[key];
  }
  applySavedBooleanMap(state.nodeTypes, saved.nodeTypes);
  applySavedBooleanMap(state.edgeTypes, saved.edgeTypes);
  applySavedColorMap(state.nodeColors, saved.nodeColors);
  applySavedColorMap(state.relationColors, saved.relationColors);
  return true;
}

function applySavedBooleanMap(target, source) {
  if (!isPlainRecord(source)) return;
  for (const key of Object.keys(target)) {
    if (typeof source[key] === "boolean") target[key] = source[key];
  }
}

function applySavedColorMap(target, source) {
  if (!isPlainRecord(source)) return;
  for (const key of Object.keys(target)) {
    if (typeof source[key] === "string" && /^#[0-9a-f]{6}$/i.test(source[key])) target[key] = source[key];
  }
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function setSettingsStatus(message) {
  const status = document.getElementById("saveSettingsStatus");
  if (status) status.textContent = message;
}

function renderFilter(id, target, onChange) {
  const root = document.getElementById(id);
  root.replaceChildren();
  for (const key of Object.keys(target).sort()) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = target[key];
    input.addEventListener("change", () => {
      target[key] = input.checked;
      onChange();
    });
    label.append(input, document.createTextNode(displayLabel(id, key)));
    root.append(label);
  }
}

function renderPalette() {
  const root = document.getElementById("palette");
  root.replaceChildren();
  for (const [key, value] of Object.entries(state.nodeColors).sort()) {
    const row = document.createElement("label");
    row.className = "legend-row";
    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    input.addEventListener("input", () => {
      state.nodeColors[key] = input.value;
      rebuild();
    });
    const text = document.createElement("span");
    text.textContent = labelForNodeType(key);
    row.append(input, text);
    root.append(row);
  }
}

function displayLabel(filterId, key) {
  if (filterId === "nodeFilters") return labelForNodeType(key);
  if (filterId === "edgeFilters") return labelForRelationType(key);
  return key;
}

function labelForNodeType(type) {
  return NODE_TYPE_LABELS[type] ?? type;
}

function labelForRelationType(type) {
  return RELATION_TYPE_LABELS[type] ?? type;
}

function ragNodePassesLens(node) {
  if (!graph.rag_projection) return true;
  if (state.ragAnswerReadyOnly && node.rag?.readiness !== "metadata_answer_ready") return false;
  if (state.ragLensMode === "all") return true;
  return Boolean(node.rag?.lens_profile_ids?.includes(state.ragLensMode));
}

function ragEdgePassesLens(edge) {
  if (!graph.rag_projection || state.ragLensMode === "all") return true;
  const profile = graph.rag_projection.lens_profiles?.find((item) => item.lens_id === state.ragLensMode);
  const relationTypes = profile?.relation_types ?? [];
  return relationTypes.length === 0 || relationTypes.includes(edge.relation_type);
}

function sourceSliceNodePassesVisibility(node) {
  if (!graph.source_slice_projection || state.sourceSliceMode === "all") return true;
  const overlay = node.source_slice;
  if (!overlay) return false;
  if (state.sourceSliceMode === "registered_metadata_knowledge") return overlay.registered_metadata_count > 0;
  if (state.sourceSliceMode === "owner_review_required") {
    return overlay.owner_review_count > 0 || overlay.review_queue_item_count > 0;
  }
  if (state.sourceSliceMode === "blocked_unsafe_source_locator") return overlay.blocked_count > 0;
  if (state.sourceSliceMode === "stronger_permission_needed") {
    return Boolean(overlay.stronger_permissions_default_false);
  }
  return true;
}

function rebuild() {
  disposeChildren(graphGroup);
  graphGroup.clear();
  interactiveMeshes = [];
  nodeVisuals = new Map();
  edgeVisuals = [];
  componentVisuals = [];

  const nodes = graph.nodes.filter(
    (node) => state.nodeTypes[node.node_type] && ragNodePassesLens(node) && sourceSliceNodePassesVisibility(node),
  );
  const nodeRefs = new Set(nodes.map((node) => node.node_ref));
  const edges = graph.edges.filter(
    (edge) => state.edgeTypes[edge.relation_type] && ragEdgePassesLens(edge) && nodeRefs.has(edge.from_ref) && nodeRefs.has(edge.to_ref),
  );
  currentVisibleNodes = nodes;
  currentVisibleEdges = edges;
  if (state.focusRef && !nodeRefs.has(state.focusRef)) state.focusRef = null;
  const positioned = layoutNodes3d(nodes, edges);
  const byRef = new Map(positioned.map((node) => [node.node_ref, node]));
  const visibleComponents = componentGroupsFor(positioned, edges);
  const focusRefs = state.focusRef ? connectedRefsFor(state.focusRef) : null;
  const haloComponents = focusRefs ? focusComponentGroupsFor(positioned, edges, focusRefs) : visibleComponents;
  const degreeByRef = visibleDegreeByRef(positioned, edges);
  const nodeRadiusByRef = new Map(
    positioned.map((node) => [node.node_ref, renderedNodeRadius(node, degreeByRef.get(node.node_ref) ?? 0)]),
  );
  addComponentHalos(haloComponents, { includeSingletons: Boolean(focusRefs), fallbackNodes: focusRefs ? [] : positioned });

  for (const edge of edges) {
    const from = byRef.get(edge.from_ref);
    const to = byRef.get(edge.to_ref);
    if (!from || !to) continue;
    const edgeColor = state.relationColors[edge.relation_type] || edge.visual.color;
    const edgeOpacity = Math.max(0.58, recencyOpacity(edge.metrics.days_since_last_evidence));
    const width = Math.max(0.72, edge.visual.width_px * 0.78);
    const segments = edge.visual.line_style === "solid" ? 1 : 15;
    const lineMeshes = addEdgeMeshes(from.position, to.position, width, edgeColor, edgeOpacity, segments, edge);
    const arrowMesh = edge.directed
      ? addArrowMesh(from.position, to.position, width, edgeColor, edgeOpacity, nodeRadiusByRef.get(to.node_ref) ?? 10, edge)
      : null;
    edgeVisuals.push({ edge, meshes: [...lineMeshes, ...(arrowMesh ? [arrowMesh] : [])] });
  }

  for (const node of positioned) {
    const visibleDegree = degreeByRef.get(node.node_ref) ?? 0;
    const radius = nodeRadiusByRef.get(node.node_ref) ?? renderedNodeRadius(node, visibleDegree);
    const opacity = Math.max(0.82, recencyOpacity(node.metrics.days_since_last_access));
    const fillColor = state.nodeColors[node.node_type] || node.visual.color;
    const runtimeNode = {
      ...node,
      runtime_visible_degree: visibleDegree,
      runtime_node_size_mode: state.nodeSizeMode,
    };
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(fillColor),
        transparent: true,
        opacity,
      }),
    );
    sphere.material.userData.baseOpacity = opacity;
    sphere.position.copy(node.position);
    sphere.userData.kind = "node";
    sphere.userData.payload = runtimeNode;
    graphGroup.add(sphere);
    interactiveMeshes.push(sphere);

    const border = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.28, Math.max(0.22, radius * 0.018), 8, 44),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.visual.border_color),
        transparent: true,
        opacity: node.lifecycle.status === "active" ? 0.38 : 0.24,
      }),
    );
    border.material.userData.baseOpacity = border.material.opacity;
    border.position.copy(node.position);
    border.renderOrder = 2;
    graphGroup.add(border);
    nodeVisuals.set(node.node_ref, { node: runtimeNode, sphere, border });
  }

  visibleNodeCount = positioned.length;
  visibleEdgeCount = edges.length;
  updateConnectivityPanel(nodes, edges, visibleComponents);
  renderPaletteLegend(nodes, edges);
  applyFocus();
  updateHud();
  updateVisualRules();
  updateRagLensSummary();
  updateSourceSliceSummary();
  const detectionCardDebugFields = buildDetectionCardDebugFields();
  window.__soulforgeGraphPreview = {
    mode: "3d",
    visibleNodeCount,
    visibleEdgeCount,
    visibleConnectivity,
    nodeSizeMode: state.nodeSizeMode,
    nodeGlobalScale: state.nodeGlobalScale,
    nodeRelativeScale: state.nodeRelativeScale,
    componentHaloStyle: state.componentHaloStyle,
    componentShellSpacing: state.componentShellSpacing,
    componentShellPointScale: state.componentShellPointScale,
    componentShellOpacityScale: state.componentShellOpacityScale,
    componentShellDepth: state.componentShellDepth,
    componentShellInnerRadius: state.componentShellInnerRadius,
    componentShellJitter: state.componentShellJitter,
    autoRotate: controls.autoRotate,
    savedSettingsLoaded,
    settingsStorageKey: SETTINGS_STORAGE_KEY,
    ragProjectionPresent: Boolean(graph.rag_projection),
    ragLensMode: state.ragLensMode,
    ragAnswerReadyOnly: state.ragAnswerReadyOnly,
    ragProjection: graph.rag_projection,
    sourceSliceProjectionPresent: Boolean(graph.source_slice_projection),
    sourceSliceMode: state.sourceSliceMode,
    sourceSliceProjection: graph.source_slice_projection,
    focusRef: state.focusRef,
    contextNodeRef,
    focusDepth: state.focusDepth,
    focusedNodeCount,
    focusedEdgeCount,
    componentHaloCount: componentVisuals.length,
    canvasPixelProbe,
    openDetectionCardForNode,
    closeDetectionCard,
    ...detectionCardDebugFields,
  };
}

function updateHud() {
  const focusText = state.focusRef ? " / 포커스 " + focusedNodeCount + " 노드 / " + focusedEdgeCount + " 선" : "";
  const ragText = graph.rag_projection ? " / RAG " + (state.ragLensMode === "all" ? "전체" : state.ragLensMode) : "";
  const sourceSliceText = graph.source_slice_projection
    ? " / 등록 " + (state.sourceSliceMode === "all" ? "전체" : state.sourceSliceMode)
    : "";
  hud.textContent = "3D 노드 " + visibleNodeCount + " / 선 " + visibleEdgeCount + " / 배치 " + state.layout + " / 회전 " + (controls.autoRotate ? "켜짐" : "꺼짐") + ragText + sourceSliceText + focusText;
}

function updateVisualRules() {
  const scaleText = " 전체 " + state.nodeGlobalScale.toFixed(2) + "x, 상대 " + state.nodeRelativeScale.toFixed(2) + "x.";
  const shellText = " 점 간격 " + state.componentShellSpacing.toFixed(0) + ", 깊이 " + state.componentShellDepth.toFixed(2) + "x, 속 비움 " + state.componentShellInnerRadius.toFixed(2) + ".";
  ruleNodeSizeMeaning.textContent = state.nodeSizeMode === "degree"
    ? "현재는 연결수입니다. 필터 후 보이는 선이 많이 붙은 노드일수록 큽니다." + scaleText
    : "현재는 사용량입니다. 방명록/접근 기록에 많이 등장한 노드일수록 큽니다." + scaleText;
  const styleText = {
    glow: "현재는 연두 윤곽 글로우입니다. 둥근 점 구름으로 덩어리 경계를 감쌉니다. 연결 덩어리가 없으면 현재 보이는 범위를 감쌉니다. 포커스 중에는 선택 범위 기준으로 윤곽을 다시 그립니다." + shellText,
    line: "현재는 얇은 한 줄입니다. 가장 절제된 덩어리 윤곽만 보여줍니다.",
    bold: "현재는 굵은 한 줄입니다. 한 방향 윤곽을 더 강하게 보여줍니다.",
  };
  ruleComponentHaloMeaning.textContent = state.showComponentHalos
    ? styleText[state.componentHaloStyle] ?? styleText.glow
    : "현재는 꺼져 있습니다. 덩어리 배경 윤곽을 표시하지 않습니다.";
}

function updateRagLensSummary() {
  if (!ragLensSummary) return;
  if (!graph.rag_projection) {
    ragLensSummary.textContent = "RAG manifest를 지정하지 않아 렌즈 overlay가 없습니다.";
    return;
  }
  const mode = state.ragLensMode === "all" ? "전체" : state.ragLensMode;
  const readiness = graph.rag_projection.readiness_counts ?? {};
  ragLensSummary.textContent =
    "렌즈 " + mode +
    " / 보이는 노드 " + visibleNodeCount +
    " / metadata 답변 가능 " + (readiness.metadata_answer_ready ?? 0) +
    " / source handle 없음 " + (readiness.metadata_no_source_handle ?? 0) +
    " / blocked " + (readiness.blocked ?? 0);
}

function updateSourceSliceSummary() {
  if (!sourceSliceSummary) return;
  if (!graph.source_slice_projection) {
    sourceSliceSummary.textContent = "source slice triage register를 지정하지 않아 등록 상태 overlay가 없습니다.";
    return;
  }
  const totals = graph.source_slice_projection.totals ?? {};
  const counts = graph.source_slice_projection.visibility_counts ?? graph.source_slice_projection.registration_status_counts ?? {};
  const mode = state.sourceSliceMode === "all" ? "전체" : state.sourceSliceMode;
  sourceSliceSummary.textContent =
    "상태 " + mode +
    " / 보이는 노드 " + visibleNodeCount +
    " / metadata 등록 " + (totals.registered_metadata_count ?? 0) +
    " / 검토 " + (totals.owner_review_count ?? 0) +
    " / 차단 " + (totals.blocked_count ?? 0) +
    " / 강한 권한 기본차단 " + (totals.stronger_permissions_default_false_count ?? 0) +
    " / mixed " + (counts.mixed ?? 0);
}

function updateConnectivityPanel(nodes, edges, components) {
  visibleConnectivity = analyzeVisibleConnectivity(nodes, edges, components);
  connectivityEls.components.textContent = String(visibleConnectivity.components);
  connectivityEls.isolated.textContent = String(visibleConnectivity.isolated);
  connectivityEls.largest.textContent = String(visibleConnectivity.largest);
  connectivityEls.edges.textContent = String(edges.length);
  connectivityEls.summary.textContent =
    "현재 선택한 노드/관계 필터 기준입니다. 전체 그래프는 " +
    graph.nodes.length + " 노드 / " + graph.edges.length + " 선입니다.";
}

function analyzeVisibleConnectivity(nodes, edges, knownComponents = null) {
  const nodeRefs = new Set(nodes.map((node) => node.node_ref));
  if (nodeRefs.size === 0) return { components: 0, isolated: 0, largest: 0 };
  const components = knownComponents ?? componentGroupsFor(nodes, edges);
  const adjacency = new Map([...nodeRefs].map((nodeRef) => [nodeRef, new Set()]));
  for (const edge of edges) {
    if (!nodeRefs.has(edge.from_ref) || !nodeRefs.has(edge.to_ref)) continue;
    adjacency.get(edge.from_ref).add(edge.to_ref);
    adjacency.get(edge.to_ref).add(edge.from_ref);
  }
  let isolated = 0;
  let largest = 0;
  for (const component of components) {
    if (component.length === 1 && (adjacency.get(component[0].node_ref)?.size ?? 0) === 0) isolated += 1;
    largest = Math.max(largest, component.length);
  }
  return { components: components.length, isolated, largest };
}

function componentGroupsFor(nodes, edges) {
  const byRef = new Map(nodes.map((node) => [node.node_ref, node]));
  const adjacency = new Map([...byRef.keys()].map((nodeRef) => [nodeRef, new Set()]));
  for (const edge of edges) {
    if (!byRef.has(edge.from_ref) || !byRef.has(edge.to_ref)) continue;
    adjacency.get(edge.from_ref).add(edge.to_ref);
    adjacency.get(edge.to_ref).add(edge.from_ref);
  }
  const visited = new Set();
  const components = [];
  for (const nodeRef of byRef.keys()) {
    if (visited.has(nodeRef)) continue;
    const group = [];
    const stack = [nodeRef];
    visited.add(nodeRef);
    while (stack.length > 0) {
      const current = stack.pop();
      group.push(byRef.get(current));
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    components.push(group);
  }
  return components.sort((left, right) => right.length - left.length);
}

function focusComponentGroupsFor(nodes, edges, focusRefs) {
  const focusedNodes = nodes.filter((node) => focusRefs.has(node.node_ref));
  const focusedEdges = edges.filter((edge) => focusRefs.has(edge.from_ref) && focusRefs.has(edge.to_ref));
  return componentGroupsFor(focusedNodes, focusedEdges);
}

function renderPaletteLegend(nodes, edges) {
  const visibleNodeTypes = [...new Set(nodes.map((node) => node.node_type))].sort();
  const visibleRelationTypes = [...new Set(edges.map((edge) => edge.relation_type))].sort();
  legendPanel.replaceChildren();
  const title = document.createElement("div");
  title.className = "legend-title";
  title.textContent = "팔레트";
  legendPanel.append(title);
  appendLegendSection("노드 색", visibleNodeTypes, (type) => state.nodeColors[type] ?? graph.palettes.node_type[type], labelForNodeType, "node");
  appendLegendSection("선 색", visibleRelationTypes, (type) => state.relationColors[type] ?? graph.palettes.relation_type[type], labelForRelationType, "line");
}

function appendLegendSection(titleText, keys, colorFor, labelFor, kind) {
  const section = document.createElement("div");
  section.className = "legend-section";
  section.textContent = titleText;
  legendPanel.append(section);
  if (keys.length === 0) {
    const empty = document.createElement("div");
    empty.className = "legend-item";
    empty.textContent = "표시 없음";
    legendPanel.append(empty);
    return;
  }
  for (const key of keys) {
    const row = document.createElement("div");
    row.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = kind === "line" ? "legend-line" : "legend-swatch";
    swatch.style.backgroundColor = colorFor(key);
    const label = document.createElement("span");
    label.textContent = labelFor(key);
    row.append(swatch, label);
    legendPanel.append(row);
  }
}

function addComponentHalos(components, options = {}) {
  if (!state.showComponentHalos) return;
  const minimumSize = options.includeSingletons ? 1 : 2;
  const fallbackNodes = options.fallbackNodes ?? [];
  const componentCandidates = components.filter((component) => component.length >= minimumSize);
  const candidates = (componentCandidates.length > 0 ? componentCandidates : [fallbackNodes].filter((component) => component.length > 0)).slice(0, 8);
  for (let index = 0; index < candidates.length; index += 1) {
    const component = candidates[index];
    const positions = component.map((node) => node.position).filter(Boolean);
    if (positions.length < 1) continue;
    const center = positions.reduce((sum, position) => sum.add(position), new THREE.Vector3()).multiplyScalar(1 / positions.length);
    const maxDistance = positions.reduce((max, position) => Math.max(max, position.distanceTo(center)), 0);
    const radius = clamp(maxDistance + 28, 34, 520);
    const profile = componentHaloProfile(index, radius);
    const color = componentHaloColor(index);
    const meshes = profile.kind === "glow"
      ? addComponentGlow(center, radius, color, profile, index)
      : addComponentRings(center, radius, color, profile);
    componentVisuals.push({
      nodeRefs: new Set(component.map((node) => node.node_ref)),
      meshes,
    });
  }
}

function componentHaloColor(index) {
  if (state.componentHaloStyle === "glow") {
    const limeOrbitColors = ["#84cc16", "#22c55e", "#a3e635", "#65a30d"];
    return limeOrbitColors[index % limeOrbitColors.length];
  }
  return COMPONENT_HALO_COLORS[index % COMPONENT_HALO_COLORS.length];
}

function componentHaloProfile(index, radius) {
  if (state.componentHaloStyle === "line") {
    return {
      kind: "ring",
      rotations: [[0, 0, 0]],
      tube: clamp(radius * 0.0035, 0.22, 0.8),
      opacity: index === 0 ? 0.14 : 0.09,
      depthTest: true,
      blending: THREE.NormalBlending,
      renderOrder: -2,
    };
  }
  if (state.componentHaloStyle === "bold") {
    return {
      kind: "ring",
      rotations: [[0, 0, 0]],
      tube: clamp(radius * 0.008, 0.55, 1.8),
      opacity: index === 0 ? 0.24 : 0.16,
      depthTest: true,
      blending: THREE.NormalBlending,
      renderOrder: -2,
    };
  }
  const shellPointSpacing = index === 0 ? state.componentShellSpacing : state.componentShellSpacing * 1.2;
  return {
    kind: "glow",
    shellPointSpacing,
    shellPointCount: componentShellPointCount(radius, shellPointSpacing, index === 0 ? 30000 : 18000),
    shellPointSize: (index === 0 ? 2.45 : 2.05) * state.componentShellPointScale,
    shellPointOpacity: clamp((index === 0 ? 0.56 : 0.38) * state.componentShellOpacityScale, 0.04, 0.95),
    shellShape: [1, 1, state.componentShellDepth],
    shellInnerRadius: state.componentShellInnerRadius,
    shellJitter: state.componentShellJitter,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    renderOrder: -1,
  };
}

function componentShellPointCount(radius, spacing, maxCount) {
  const shellArea = 4 * Math.PI * radius * radius;
  const count = Math.round(shellArea / (spacing * spacing));
  return clamp(count, 760, maxCount);
}

function addComponentRings(center, radius, color, profile) {
  const meshes = [];
  for (const rotation of profile.rotations) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(radius, profile.tube, 8, 128),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: profile.opacity,
        depthWrite: false,
        depthTest: profile.depthTest,
        blending: profile.blending,
      }),
    );
    halo.position.copy(center);
    halo.rotation.set(rotation[0], rotation[1], rotation[2]);
    halo.renderOrder = profile.renderOrder;
    halo.material.userData.baseOpacity = profile.opacity;
    graphGroup.add(halo);
    meshes.push(halo);
  }
  return meshes;
}

function addComponentGlow(center, radius, color, profile, seed) {
  const shell = new THREE.Points(
    componentShellPointGeometry(radius, profile.shellPointCount, seed, profile),
    new THREE.PointsMaterial({
      map: getComponentGlowPointTexture(),
      color: new THREE.Color(color),
      size: profile.shellPointSize,
      sizeAttenuation: false,
      transparent: true,
      opacity: profile.shellPointOpacity,
      alphaTest: 0.02,
      depthWrite: false,
      depthTest: profile.depthTest,
      blending: profile.blending,
    }),
  );
  shell.position.copy(center);
  shell.renderOrder = profile.renderOrder + 1;
  shell.material.userData.baseOpacity = profile.shellPointOpacity;
  graphGroup.add(shell);
  return [shell];
}

function componentShellPointGeometry(radius, count, seed, profile) {
  const positions = new Float32Array(count * 3);
  const shape = profile.shellShape ?? [1, 1, 1];
  const innerRadius = profile.shellInnerRadius ?? 0.62;
  const jitterScale = profile.shellJitter ?? 0.04;
  for (let index = 0; index < count; index += 1) {
    const u = seededUnit(index, seed, 0);
    const v = seededUnit(index, seed, 1);
    const w = seededUnit(index, seed, 2);
    const theta = u * Math.PI * 2;
    const z = 1 - 2 * v;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    const volumeRadius = Math.cbrt(innerRadius ** 3 + w * (1 - innerRadius ** 3));
    const jitter = (seededUnit(index, seed, 3) - 0.5) * jitterScale;
    const shellRadius = radius * (volumeRadius + jitter);
    positions[index * 3] = Math.cos(theta) * radial * shellRadius * shape[0];
    positions[index * 3 + 1] = Math.sin(theta) * radial * shellRadius * shape[1];
    positions[index * 3 + 2] = z * shellRadius * shape[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function seededUnit(index, seed, salt) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233) + seed * (78.233 + salt * 19.19)) * 43758.5453;
  return value - Math.floor(value);
}

function getComponentGlowPointTexture() {
  if (componentGlowPointTexture) return componentGlowPointTexture;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.74, "rgba(255,255,255,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  componentGlowPointTexture = new THREE.CanvasTexture(textureCanvas);
  return componentGlowPointTexture;
}

function addEdgeMeshes(from, to, width, color, opacity, segments, edge) {
  const start = from.clone();
  const end = to.clone();
  const direction = end.clone().sub(start);
  if (direction.length() < 0.1) return [];
  const meshes = [];
  for (let index = 0; index < segments; index += 1) {
    if (segments > 1 && index % 2 === 1) continue;
    const segmentStart = index / segments;
    const segmentEnd = segments === 1 ? 1 : Math.min((index + 0.72) / segments, 1);
    const a = start.clone().lerp(end, segmentStart);
    const b = start.clone().lerp(end, segmentEnd);
    const cylinder = cylinderBetween(a, b, width, color, opacity);
    cylinder.userData.kind = "edge";
    cylinder.userData.payload = edge;
    cylinder.material.userData.baseOpacity = opacity;
    graphGroup.add(cylinder);
    meshes.push(cylinder);
  }
  return meshes;
}

function addArrowMesh(from, to, width, color, opacity, targetRadius, edge) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 0.1) return;
  const unit = direction.clone().normalize();
  const coneRadius = Math.max(3, width * 2.35);
  const coneHeight = Math.max(8, width * 5.7);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(coneRadius, coneHeight, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: Math.min(0.9, opacity + 0.25) }),
  );
  cone.position.copy(to.clone().sub(unit.clone().multiplyScalar(targetRadius + coneHeight * 0.48)));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  cone.userData.kind = "edge";
  cone.userData.payload = edge;
  cone.material.userData.baseOpacity = Math.min(0.9, opacity + 0.25);
  graphGroup.add(cone);
  return cone;
}

function cylinderBetween(from, to, radius, color, opacity) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity }),
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function layoutNodes3d(nodes, edges) {
  const bodies = nodes.map((node, index) => ({ ...node, position: initialPosition(node, index, nodes.length), velocity: new THREE.Vector3() }));
  const byRef = new Map(bodies.map((node) => [node.node_ref, node]));
  const iterations = state.layout === "semantic_shell" ? 90 : 150;
  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i], b = bodies[j];
        const delta = a.position.clone().sub(b.position);
        const distSq = Math.max(900, delta.lengthSq());
        const force = Math.min(2.8, 5600 / distSq);
        delta.normalize().multiplyScalar(force);
        a.position.add(delta);
        b.position.sub(delta);
      }
    }
    for (const edge of edges) {
      const a = byRef.get(edge.from_ref);
      const b = byRef.get(edge.to_ref);
      if (!a || !b) continue;
      const delta = b.position.clone().sub(a.position);
      const distance = Math.max(1, delta.length());
      const desired = 96 + Math.min(90, edge.visual.width_px * 14);
      const pull = (distance - desired) * 0.006;
      delta.normalize().multiplyScalar(pull);
      a.position.add(delta);
      b.position.sub(delta);
    }
    for (const node of bodies) {
      const anchor = anchorFor(node);
      node.position.lerp(anchor, state.layout === "force_3d" ? 0.002 : 0.013);
      node.position.clampLength(20, 420);
    }
  }
  return bodies;
}

function initialPosition(node, index, total) {
  if (state.layout === "semantic_shell") {
    const anchor = anchorFor(node);
    const angle = (index * 2.399963229728653) % (Math.PI * 2);
    return anchor.clone().add(new THREE.Vector3(Math.cos(angle) * 34, Math.sin(angle * 1.7) * 34, Math.sin(angle) * 34));
  }
  if (state.layout === "radial_layers") {
    const radius = 120 + typeRank(node.node_type) * 26;
    const angle = (index * 2.399963229728653) % (Math.PI * 2);
    const z = (typeRank(node.node_type) - 6) * 28;
    return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius);
  }
  const offset = 2 / Math.max(1, total);
  const y = index * offset - 1 + offset / 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(phi) * r * 270, y * 230, Math.sin(phi) * r * 270);
}

function anchorFor(node) {
  const anchors = {
    project: [-260, -40, 20], mission: [-250, -140, -80], artifact: [220, -180, 80],
    knowledge: [0, 0, 0], concept: [0, 120, -40], source: [0, 220, -110],
    workflow: [270, 0, 20], party: [250, 145, -70], model_profile: [-75, -245, 70],
    agent_surface: [60, -260, 120], agent_run: [150, -245, 40], validation: [220, 210, 90],
    species: [-260, 180, 100], class: [-210, 95, 0], unit: [-210, 10, -90],
  };
  const value = anchors[node.node_type] || [0, 0, 0];
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function typeRank(type) {
  return graph.graph_scope.included_node_types.indexOf(type) >= 0 ? graph.graph_scope.included_node_types.indexOf(type) : 4;
}

function recencyOpacity(days) {
  if (days === null || days === undefined) return 0.15;
  if (days <= state.hotDays) return 1;
  if (days <= 90) return 0.7;
  if (days <= state.staleDays) return 0.4;
  return 0.2;
}

function onPointerMove(event) {
  const hit = raycastNodeFromEvent(event);
  if (!hit) {
    lastHoveredNodeRef = null;
    tooltip.style.display = "none";
    return;
  }
  const node = hit.object.userData.payload;
  lastHoveredNodeRef = node.node_ref;
  tooltip.innerHTML = nodeTooltip(node);
  tooltip.style.display = "block";
  positionTooltip(event);
}

function focusNode(focusRef) {
  state.focusRef = focusRef;
  rebuild();
  updateHud();
}

function onCanvasDoubleClick(event) {
  const hit = raycastNodeFromEvent(event);
  const focusRef = hit?.object.userData.payload.node_ref ?? nearestNodeRefFromEvent(event);
  if (focusRef) {
    focusNode(focusRef);
    return;
  }
  clearFocus();
}

function onCanvasContextMenu(event) {
  event.preventDefault();
  const hit = raycastNodeFromEvent(event);
  if (!hit) {
    hideContextMenu();
    return;
  }
  const node = hit.object.userData.payload;
  contextNodeRef = node.node_ref;
  tooltip.style.display = "none";
  showContextMenu(node, event);
}

function showContextMenu(node, event) {
  contextMenuTitle.textContent = node.label;
  contextMenuStatus.textContent = labelForNodeType(node.node_type) + " / " + node.node_ref;
  hidePromptFallback();
  nodeContextMenu.style.display = "block";
  nodeContextMenu.setAttribute("aria-hidden", "false");
  const host = nodeContextMenu.parentElement;
  const hostRect = host.getBoundingClientRect();
  const rect = nodeContextMenu.getBoundingClientRect();
  const margin = 8;
  const maxX = Math.max(margin, hostRect.width - rect.width - margin);
  const maxY = Math.max(margin, hostRect.height - rect.height - margin);
  const x = clamp(event.clientX - hostRect.left, margin, maxX);
  const y = clamp(event.clientY - hostRect.top, margin, maxY);
  nodeContextMenu.style.left = x + "px";
  nodeContextMenu.style.top = y + "px";
  if (window.__soulforgeGraphPreview) {
    window.__soulforgeGraphPreview.contextNodeRef = contextNodeRef;
  }
}

function hideContextMenu() {
  nodeContextMenu.style.display = "none";
  nodeContextMenu.setAttribute("aria-hidden", "true");
  hidePromptFallback();
}

async function copyContextExplorePrompt() {
  const node = contextNode();
  if (!node) {
    setContextMenuStatus("탐구할 노드를 찾지 못했습니다.");
    return;
  }
  const prompt = buildExplorePrompt(node);
  const copied = await copyTextToClipboard(prompt);
  if (copied) {
    hidePromptFallback();
    setContextMenuStatus("탐구 프롬프트를 복사했습니다.");
    return;
  }
  showPromptFallback(prompt);
  setContextMenuStatus("복사 실패: 아래 프롬프트를 직접 복사하세요.");
}

function focusContextNode() {
  const node = contextNode();
  if (!node) {
    setContextMenuStatus("포커스할 노드를 찾지 못했습니다.");
    return;
  }
  hideContextMenu();
  focusNode(node.node_ref);
}

async function copyContextNodeRef() {
  const node = contextNode();
  if (!node) {
    setContextMenuStatus("복사할 ref를 찾지 못했습니다.");
    return;
  }
  const copied = await copyTextToClipboard(node.node_ref);
  if (copied) {
    hidePromptFallback();
    setContextMenuStatus("ref를 복사했습니다.");
    return;
  }
  showPromptFallback(node.node_ref);
  setContextMenuStatus("복사 실패: 아래 ref를 직접 복사하세요.");
}

function contextNode() {
  if (!contextNodeRef) return null;
  return currentVisibleNodes.find((node) => node.node_ref === contextNodeRef) ?? graph.nodes.find((node) => node.node_ref === contextNodeRef) ?? null;
}

function setContextMenuStatus(message) {
  contextMenuStatus.textContent = message;
}

function showPromptFallback(text) {
  contextMenuPrompt.value = text;
  contextMenuPrompt.style.display = "block";
  contextMenuPrompt.focus();
  contextMenuPrompt.select();
}

function hidePromptFallback() {
  contextMenuPrompt.value = "";
  contextMenuPrompt.style.display = "none";
}

function showDetectionCardForContextNode() {
  const node = contextNode();
  if (!node) {
    setContextMenuStatus("탐지 카드를 열 노드를 찾지 못했습니다.");
    return null;
  }
  const payload = openDetectionCardForNode(node.node_ref);
  if (payload) {
    hideContextMenu();
  }
  return payload;
}

function openDetectionCardFromInput() {
  const nodeRef = detectionNodeRefInput.value.trim();
  if (!nodeRef) {
    setDetectionCardStatus("노드 ref를 입력하세요.");
    detectionNodeRefInput.focus();
    return null;
  }
  return openDetectionCardForNode(nodeRef);
}

function openDetectionCardForNode(nodeRef) {
  const node = visibleNodeFor(String(nodeRef ?? "").trim());
  if (!node) {
    setDetectionCardStatus("해당 ref의 노드를 찾지 못했습니다.");
    return null;
  }
  activeDetectionCardPayload = buildDetectionCardPayload(node.node_ref);
  detectionCardFocusRef = node.node_ref;
  detectionCardPanel.open = true;
  detectionNodeRefInput.value = node.node_ref;
  detectionBridgeCommand.value = buildDetectionBridgeCommand(node.node_ref);
  detectionBridgeCommand.style.display = "none";
  renderDetectionCard(activeDetectionCardPayload);
  setDetectionCardStatus("탐지 카드를 열었습니다: " + node.label);
  syncDetectionCardDebugState();
  detectionCardBody.focus({ preventScroll: true });
  return activeDetectionCardPayload;
}

function closeDetectionCard() {
  activeDetectionCardPayload = null;
  detectionCardFocusRef = null;
  detectionCardPanel.open = false;
  detectionBridgeCommand.value = "";
  detectionBridgeCommand.style.display = "none";
  renderDetectionCardPlaceholder("노드를 우클릭하고 탐지 카드 열기를 누르거나 ref를 입력하세요.");
  setDetectionCardStatus("탐지 카드를 닫았습니다.");
  syncDetectionCardDebugState();
}

async function copyDetectionBridgeCommandFromCard() {
  const nodeRef = detectionCardFocusRef ?? detectionNodeRefInput.value.trim();
  if (!nodeRef) {
    setDetectionCardStatus("먼저 탐지 카드를 열 노드 ref를 입력하세요.");
    detectionNodeRefInput.focus();
    return;
  }
  const command = buildDetectionBridgeCommand(nodeRef);
  detectionBridgeCommand.value = command;
  const copied = await copyTextToClipboard(command);
  if (copied) {
    detectionBridgeCommand.style.display = "none";
    setDetectionCardStatus("gpt-5.5 Codex 검토 명령을 복사했습니다. 터미널에서 실행하면 관계 후보 검토를 받을 수 있습니다.");
    return;
  }
  detectionBridgeCommand.style.display = "block";
  detectionBridgeCommand.focus();
  detectionBridgeCommand.select();
  setDetectionCardStatus("복사 실패: 아래 명령을 직접 복사하세요.");
}

function buildDetectionBridgeCommand(nodeRef) {
  const graphRef = "_workspaces/system/knowledge_view/graph_export/" + (graph.export_id || "knowledge_graph_view_v0") + "/graph.json";
  return [
    "npm run guild-hall:knowledge-graph -- review",
    "--node-ref " + shellQuoteForCommand(nodeRef),
    "--graph-ref " + shellQuoteForCommand(graphRef),
    "--model gpt-5.5",
    "--text",
  ].join(" ");
}

function shellQuoteForCommand(value) {
  return "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
}

function buildDetectionCardPayload(nodeRef) {
  const selectedNode = visibleNodeFor(nodeRef);
  const relations = contextRelationsFor(nodeRef);
  const selectedCandidate = formatDetectionCandidate({
    node: selectedNode,
    relationEdges: relations,
    score: 100,
    reasons: ["selected:node_ref", "visible:current_filter"],
    isSelected: true,
  });
  const candidateNodes = [
    selectedCandidate,
    ...buildNeighborDetectionCandidates(nodeRef, relations).slice(0, 7),
  ];
  const candidateRefs = new Set(candidateNodes.map((candidate) => candidate.node_ref));
  const relationPaths = relations
    .filter((edge) => candidateRefs.has(edge.from_ref) || candidateRefs.has(edge.to_ref))
    .slice(0, 24)
    .map((edge) => formatDetectionRelationPath(edge, nodeRef));
  const sourceRefs = collectDetectionSourceRefs(candidateNodes, relationPaths, 20);
  const missingEvidenceItems = missingEvidenceItemsFor({
    selectedNodeRef: nodeRef,
    candidateNodes,
    relationPaths,
  });
  const nextActionItems = nextActionItemsFor({
    missingEvidenceItems,
    candidateNodes,
    selectedNodeRef: nodeRef,
  });
  const missingEvidence = missingEvidenceItems.map((item) => item.label);
  const nextActions = nextActionItems.map((item) => item.label);
  const detectionCard = {
    title: "탐지 카드: " + selectedNode.label,
    focus_node_ref: selectedNode.node_ref,
    focus_node_type: selectedNode.node_type,
    claim_ceiling: selectedCandidate.claim_ceiling,
    summary: "Metadata-only graph detection card payload. Render this as navigation and review guidance, not as an answer.",
    counts: {
      candidate_nodes: candidateNodes.length,
      relation_paths: relationPaths.length,
      source_refs: sourceRefs.length,
      missing_evidence: missingEvidenceItems.length,
      next_actions: nextActionItems.length,
    },
    render_contract: {
      title_from: "detection_card.title",
      focus_from: "detection_card.focus_node_ref",
      candidates_from: "candidate_nodes",
      relation_paths_from: "relation_paths",
      source_refs_from: "source_refs",
      missing_evidence_from: "missing_evidence",
      missing_evidence_items_from: "missing_evidence_items",
      next_actions_from: "next_actions",
      next_action_items_from: "next_action_items",
    },
  };
  return {
    schema_version: "soulforge.knowledge_graph_browser_detection_card.v0",
    status: "metadata_only",
    display: {
      mode: "selected_node",
      title: detectionCard.title,
    },
    selected_node_ref: nodeRef,
    selected_node: selectedCandidate,
    input: {
      source: "3d_preview",
      question_text: "",
      max_nodes: 8,
      max_paths: 24,
      max_source_refs: 20,
    },
    candidate_nodes: candidateNodes,
    candidates: candidateNodes,
    relation_paths: relationPaths,
    source_refs: sourceRefs,
    missing_evidence: missingEvidence,
    missing_evidence_items: missingEvidenceItems,
    next_actions: nextActions,
    next_action_items: nextActionItems,
    detection_card: detectionCard,
    boundary: {
      metadata_only: true,
      no_answer_generated: true,
      no_source_text_loaded: true,
      no_notebooklm_answers: true,
      no_vector_search: true,
      no_codex_bridge_auto_call: true,
      no_private_payloads: true,
      no_canon_promotion: true,
    },
  };
}

function buildNeighborDetectionCandidates(selectedNodeRef, relations) {
  const byRef = new Map();
  for (const edge of relations) {
    const otherRef = edge.from_ref === selectedNodeRef ? edge.to_ref : edge.from_ref;
    const node = visibleNodeFor(otherRef);
    if (!node) continue;
    const item = byRef.get(otherRef) ?? {
      node,
      relationEdges: [],
      score: 0,
      reasons: new Set(["neighbor:one_hop", "visible:current_filter"]),
    };
    item.relationEdges.push(edge);
    item.score += 1 + (edge.metrics?.evidence_event_count ?? edge.evidence_event_count ?? 0);
    item.reasons.add("relation:" + edge.relation_type);
    byRef.set(otherRef, item);
  }
  return [...byRef.values()]
    .sort((left, right) => right.score - left.score || left.node.node_ref.localeCompare(right.node.node_ref))
    .map((item) =>
      formatDetectionCandidate({
        node: item.node,
        relationEdges: item.relationEdges,
        score: item.score,
        reasons: [...item.reasons].sort(),
        isSelected: false,
      }),
    );
}

function formatDetectionCandidate({ node, relationEdges, score, reasons, isSelected }) {
  return {
    node_ref: node.node_ref,
    label: node.label,
    node_type: node.node_type,
    score,
    match_reasons: reasons,
    is_selected: isSelected,
    claim_ceiling: node.trust?.claim_ceiling ?? "unknown",
    lifecycle_status: node.lifecycle?.status ?? "unknown",
    rag: node.rag ?? null,
    source_slice: node.source_slice ?? null,
    source_refs: compactDetectionSourceRefs(node.source_refs),
    visible_degree: relationEdges.length,
    relation_type_counts: countByValues(relationEdges.map((edge) => edge.relation_type)),
  };
}

function formatDetectionRelationPath(edge, selectedNodeRef) {
  const fromNode = visibleNodeFor(edge.from_ref);
  const toNode = visibleNodeFor(edge.to_ref);
  return {
    path_ref: edge.edge_ref,
    depth: 1,
    from: formatDetectionPathNode(fromNode, edge.from_ref),
    relation_type: edge.relation_type,
    relation_state: edge.relation_state,
    directed: edge.directed,
    direction_from_selected: edge.directed ? (edge.from_ref === selectedNodeRef ? "outgoing" : "incoming") : "undirected",
    to: formatDetectionPathNode(toNode, edge.to_ref),
    source_refs: compactDetectionSourceRefs(edge.source_refs),
    evidence_event_count: edge.metrics?.evidence_event_count ?? edge.evidence_event_count ?? 0,
    claim_ceiling_hint: weakestClaimCeilingForCard([
      fromNode?.trust?.claim_ceiling,
      toNode?.trust?.claim_ceiling,
    ]),
  };
}

function formatDetectionPathNode(node, fallbackRef) {
  return {
    node_ref: node?.node_ref ?? fallbackRef,
    label: node?.label ?? fallbackRef,
    node_type: node?.node_type ?? "unknown_node",
    claim_ceiling: node?.trust?.claim_ceiling ?? "unknown",
  };
}

function collectDetectionSourceRefs(candidateNodes, relationPaths, maxSourceRefs) {
  const refs = new Map();
  for (const candidate of candidateNodes) {
    for (const [role, value] of Object.entries(candidate.source_refs ?? {})) {
      addDetectionSourceRef(refs, value, role, candidate.node_ref);
    }
  }
  for (const pathItem of relationPaths) {
    for (const [role, value] of Object.entries(pathItem.source_refs ?? {})) {
      addDetectionSourceRef(refs, value, role, pathItem.path_ref);
    }
  }
  return [...refs.values()]
    .map((item) => ({
      ...item,
      roles: [...item.roles].sort(),
      referenced_by: [...item.referenced_by].sort(),
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref))
    .slice(0, maxSourceRefs);
}

function addDetectionSourceRef(refs, value, role, referencedBy) {
  if (!value || typeof value !== "string") return;
  const item =
    refs.get(value) ??
    {
      ref: value,
      ref_type: value.startsWith("http") ? "url" : "repo_metadata_ref",
      roles: new Set(),
      referenced_by: new Set(),
    };
  item.roles.add(role);
  item.referenced_by.add(referencedBy);
  refs.set(value, item);
}

function missingEvidenceItemsFor({ selectedNodeRef, candidateNodes, relationPaths }) {
  const missing = [];
  const addMissing = (code, label, refs = []) => {
    missing.push({ code, label, related_refs: refs });
  };
  const nodeTypes = new Set((graph.nodes ?? []).map((node) => node.node_type));
  const relationTypes = new Set((graph.edges ?? []).map((edge) => edge.relation_type));
  if (selectedNodeRef && relationPaths.length === 0) {
    addMissing(
      "selected_node_no_relation_paths",
      "Selected node has no relation paths in the current metadata graph, so the card can only show node-local metadata.",
      [selectedNodeRef],
    );
  }
  if (candidateNodes.length === 0) {
    addMissing("no_strong_metadata_match", "No metadata node match was found for the selected ref.");
  }
  if (graph.graph_scope?.canon_only || (graph.graph_scope?.ledger_refs ?? []).length === 0) {
    addMissing(
      "no_knowledge_access_ledger_refs",
      "No explicit knowledge-access ledger refs are included, so usage and recency are navigation defaults only.",
    );
  }
  if (graph.rag_projection && selectedNodeRef && !visibleNodeFor(selectedNodeRef)?.rag) {
    addMissing(
      "node_not_in_rag_manifest",
      "Selected node is not covered by the current RAG manifest overlay, so RAG lens readiness is unknown for this node.",
      [selectedNodeRef],
    );
  }
  const selectedNode = selectedNodeRef ? visibleNodeFor(selectedNodeRef) : null;
  if (graph.source_slice_projection && selectedNodeRef && !selectedNode?.source_slice) {
    addMissing(
      "node_not_in_source_slice_triage",
      "Selected node is not covered by the current source-slice triage overlay, so RAG registration status is unknown for this node.",
      [selectedNodeRef],
    );
  }
  if (selectedNode?.source_slice?.owner_review_count > 0 || selectedNode?.source_slice?.review_queue_item_count > 0) {
    addMissing(
      "source_slice_owner_review_pending",
      "Selected node has source-slice items waiting for owner review before stronger source use.",
      [selectedNodeRef],
    );
  }
  if (selectedNode?.source_slice?.blocked_count > 0) {
    addMissing(
      "source_slice_blocked",
      "Selected node has blocked source-slice items and must not be indexed or promoted without fixing the blocker.",
      [selectedNodeRef],
    );
  }
  if (!nodeTypes.has("source") || !relationTypes.has("supports")) {
    addMissing(
      "no_source_support_edges",
      "No source nodes or supports edges are present, so the card can point to metadata refs but not evidence-source support paths.",
    );
  }
  addMissing(
    "no_vector_or_hybrid_retriever",
    "No vector/BM25 baseline, embedding index, graph traversal engine, or hybrid retriever is attached to this browser preview.",
  );
  if (relationPaths.length > 0) {
    addMissing("one_hop_paths_only", "Relation paths are one-hop metadata paths only; no query-time multi-hop path scoring is implemented.");
  }
  if (!nodeTypes.has("validation") && !relationTypes.has("validates")) {
    addMissing("no_validation_benchmark", "No validation or benchmark node is present for corpus-specific retrieval quality claims.");
  }
  return dedupeDetectionItemsByCode(missing);
}

function nextActionItemsFor({ missingEvidenceItems, candidateNodes, selectedNodeRef }) {
  const codes = new Set(missingEvidenceItems.map((item) => item.code));
  const actions = [];
  const addAction = (code, label, refs = []) => {
    actions.push({ code, label, related_refs: refs });
  };
  if (selectedNodeRef && codes.has("selected_node_no_relation_paths")) {
    addAction(
      "add_selected_node_relation_edges",
      "Add reviewed relation edges for the selected node before treating it as a connected evidence path.",
      [selectedNodeRef],
    );
  }
  if (codes.has("no_source_support_edges")) {
    addAction("add_source_support_edges", "Add public-safe source nodes plus supports or derived_from edges for reviewed source refs.");
  }
  if (codes.has("no_knowledge_access_ledger_refs")) {
    addAction("regenerate_with_ledger_refs", "Regenerate the graph with explicit knowledge-access ledger refs when usage or recency matters.");
  }
  if (codes.has("no_vector_or_hybrid_retriever")) {
    addAction("keep_metadata_only_until_sourcebound_retrieval", "Keep this card metadata-only; add a separate sourcebound retrieval workflow before any answer generation.");
  }
  if (codes.has("node_not_in_rag_manifest")) {
    addAction("regenerate_rag_manifest_for_scope", "Regenerate or extend the RAG manifest if this node should be part of a RAG lens.");
  }
  if (codes.has("node_not_in_source_slice_triage")) {
    addAction("regenerate_source_slice_triage_for_scope", "Regenerate source slice cards and triage register if this node should show RAG registration status.", [selectedNodeRef]);
  }
  if (codes.has("source_slice_owner_review_pending")) {
    addAction("review_source_slice_hold_items", "Review only the source-slice hold items before granting any stronger source use.", [selectedNodeRef]);
  }
  if (codes.has("source_slice_blocked")) {
    addAction("fix_or_block_source_slice", "Fix the unsafe source locator or keep the source slice blocked; do not build indexes from it.", [selectedNodeRef]);
  }
  const selectedNode = selectedNodeRef ? visibleNodeFor(selectedNodeRef) : null;
  if (selectedNode?.source_slice?.stronger_permissions_default_false) {
    addAction(
      "keep_stronger_permissions_separate",
      "Keep source-text retrieval, index build, NotebookLM packet use, and public canon promotion separate from metadata registration.",
      [selectedNodeRef],
    );
  }
  if (codes.has("no_validation_benchmark")) {
    addAction("add_validation_benchmark", "Add a validation or benchmark node before making retrieval quality claims.");
  }
  if (candidateNodes.length > 0) {
    addAction(
      "use_candidates_for_sourcebound_review",
      "Use the selected and neighboring candidate nodes as the next sourcebound review scope.",
      candidateNodes.map((candidate) => candidate.node_ref),
    );
  }
  return dedupeDetectionItemsByCode(actions);
}

function dedupeDetectionItemsByCode(items) {
  const byCode = new Map();
  for (const item of items) {
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }
  return [...byCode.values()];
}

function renderDetectionCard(payload) {
  const root = createDetectionElement("div", "detection-card");
  root.append(
    createDetectionElement("div", "detection-card-title", payload.detection_card.title),
    createDetectionElement(
      "div",
      "meta",
      "focus: " + payload.detection_card.focus_node_ref + " / claim: " + payload.detection_card.claim_ceiling,
    ),
    renderDetectionMetrics(payload),
    renderDetectionOperatorGuide(payload),
  );
  appendDetectionSection(root, "후보 노드", payload.candidate_nodes, renderDetectionCandidateItem, "후보 노드가 없습니다.");
  appendDetectionSection(root, "근거 경로", payload.relation_paths, renderDetectionRelationItem, "현재 필터 기준 관계 경로가 없습니다.");
  appendDetectionSection(root, "출처 ref", payload.source_refs, renderDetectionSourceItem, "출처 ref가 없습니다.");
  appendDetectionSection(root, "부족한 증거", payload.missing_evidence_items, renderDetectionCodedItem, "부족한 증거 코드가 없습니다.");
  appendDetectionSection(root, "다음 행동", payload.next_action_items, renderDetectionCodedItem, "다음 행동 코드가 없습니다.");
  root.append(
    createDetectionElement(
      "div",
      "meta detection-card-boundary",
      "메타데이터 전용: 답변 생성, 원문 로딩, NotebookLM 답변, vector search, Codex bridge 자동 호출, private payload 사용 없음.",
    ),
  );
  detectionCardBody.replaceChildren(root);
}

function renderDetectionCardPlaceholder(message) {
  detectionCardBody.replaceChildren(createDetectionElement("div", "meta", message));
}

function renderDetectionMetrics(payload) {
  const grid = createDetectionElement("div", "metric-grid");
  grid.append(
    renderDetectionMetric(String(payload.detection_card.counts.candidate_nodes), "후보"),
    renderDetectionMetric(String(payload.detection_card.counts.relation_paths), "경로"),
    renderDetectionMetric(String(payload.detection_card.counts.source_refs), "출처 ref"),
    renderDetectionMetric(
      payload.detection_card.counts.missing_evidence + " / " + payload.detection_card.counts.next_actions,
      "부족 / 행동",
    ),
  );
  return grid;
}

function renderDetectionMetric(value, label) {
  const item = createDetectionElement("div", "metric");
  item.append(createDetectionElement("strong", "", value), createDetectionElement("span", "", label));
  return item;
}

function appendDetectionSection(root, title, items, renderer, emptyText) {
  const section = createDetectionElement("div", "detection-card-section");
  section.append(createDetectionElement("div", "detection-card-section-title", title));
  const list = createDetectionElement("ul", "detection-card-list");
  if (items.length === 0) {
    list.append(createDetectionElement("li", "meta", emptyText));
  } else {
    for (const item of items) {
      list.append(renderer(item));
    }
  }
  section.append(list);
  root.append(section);
}

function renderDetectionCandidateItem(candidate) {
  const item = createDetectionElement("li", "");
  item.append(
    createDetectionElement(
      "span",
      "detection-card-item-title",
      candidate.label + (candidate.is_selected ? " (선택)" : ""),
    ),
    createDetectionElement(
      "span",
      "meta",
      labelForNodeType(candidate.node_type) + " / score " + candidate.score + " / degree " + candidate.visible_degree + " / claim " + candidate.claim_ceiling,
    ),
    ...(candidate.rag
      ? [
          createDetectionElement(
            "span",
            "meta",
            "RAG: " + candidate.rag.readiness + " / lenses " + candidate.rag.lens_profile_ids.join(", ") + " / source handles " + candidate.rag.source_handle_count,
          ),
        ]
      : []),
    ...(candidate.source_slice
      ? [
          createDetectionElement(
            "span",
            "meta",
            "등록: " + candidate.source_slice.registration_status +
              " / metadata " + candidate.source_slice.registered_metadata_count +
              " / 검토 " + (candidate.source_slice.owner_review_count + candidate.source_slice.review_queue_item_count) +
              " / 차단 " + candidate.source_slice.blocked_count +
              " / 강한 권한 기본차단 " + (candidate.source_slice.stronger_permissions_default_false ? "예" : "아니오"),
          ),
        ]
      : []),
    createDetectionElement("span", "meta", candidate.node_ref),
  );
  return item;
}

function renderDetectionRelationItem(pathItem) {
  const item = createDetectionElement("li", "");
  item.append(
    createDetectionElement(
      "span",
      "detection-card-item-title",
      labelForRelationType(pathItem.relation_type) + " / " + pathItem.relation_state + " / " + pathItem.direction_from_selected,
    ),
    createDetectionElement("span", "meta", pathItem.from.label + " -> " + pathItem.to.label),
    createDetectionElement(
      "span",
      "meta",
      "evidence " + pathItem.evidence_event_count + " / claim hint " + pathItem.claim_ceiling_hint,
    ),
  );
  return item;
}

function renderDetectionSourceItem(sourceRef) {
  const item = createDetectionElement("li", "");
  item.append(
    createDetectionElement("span", "detection-card-item-title", sourceRef.ref),
    createDetectionElement("span", "meta", sourceRef.ref_type + " / roles: " + sourceRef.roles.join(", ")),
  );
  return item;
}

function renderDetectionCodedItem(codedItem) {
  const item = createDetectionElement("li", "");
  item.append(
    createDetectionElement("span", "detection-card-code", codedItem.code),
    createDetectionElement("span", "meta", codedItem.label),
  );
  return item;
}

function renderDetectionOperatorGuide(payload) {
  const guide = createDetectionElement("div", "detection-card-guide");
  guide.append(
    createDetectionElement("div", "detection-card-guide-title", "판정"),
    createDetectionElement("div", "detection-card-guide-judgement", detectionJudgementText(payload)),
    createDetectionElement("div", "detection-card-guide-title", "지금 할 일"),
  );
  const steps = createDetectionElement("ol", "");
  for (const step of detectionOperatorSteps(payload)) {
    steps.append(createDetectionElement("li", "", step));
  }
  guide.append(steps);
  return guide;
}

function detectionJudgementText(payload) {
  const codes = new Set(payload.missing_evidence_items.map((item) => item.code));
  if (codes.has("selected_node_no_relation_paths")) {
    return "이 노드는 아직 주변 관계가 없어 답변 재료로 쓰기 어렵습니다. 먼저 연결할 대상부터 정해야 합니다.";
  }
  if (codes.has("no_source_support_edges") || codes.has("no_vector_or_hybrid_retriever")) {
    return "이 카드는 관련 노드와 파일 ref를 보여 주지만, 아직 근거 문단을 찾아 답하는 RAG 답변기는 아닙니다.";
  }
  if (codes.has("no_validation_benchmark")) {
    return "근거 연결은 일부 있지만, 검색 품질 검증이 없어 최종 답변 품질을 주장할 수 없습니다.";
  }
  return "현재 카드 기준으로 큰 차단 신호는 적지만, 답변 생성 전에는 출처와 검증 범위를 다시 확인해야 합니다.";
}

function detectionOperatorSteps(payload) {
  const codes = new Set(payload.missing_evidence_items.map((item) => item.code));
  const steps = [];
  if (codes.has("selected_node_no_relation_paths")) {
    steps.push("후보 노드에서 이 노드와 실제로 연결할 대상을 고르고 관계선을 추가할지 검토하세요.");
  }
  if (codes.has("no_source_support_edges")) {
    steps.push("출처 ref 중 실제 근거가 되는 파일을 골라 source 노드로 등록하고 supports 또는 derived_from 관계를 붙이세요.");
  }
  if (codes.has("no_vector_or_hybrid_retriever")) {
    steps.push("문서 본문 검색, 벡터/BM25, NotebookLM 같은 별도 retrieval 단계를 붙이기 전까지는 이 화면으로 답을 만들지 마세요.");
  }
  if (codes.has("one_hop_paths_only")) {
    steps.push("근거 경로는 바로 옆 관계만 보여 주므로, 여러 단계 추론이 필요하면 sourcebound review 범위를 따로 만드세요.");
  }
  if (codes.has("no_validation_benchmark")) {
    steps.push("검색 결과가 맞는지 볼 기준 질문이나 benchmark 노드를 만든 뒤 답변 품질을 판단하세요.");
  }
  if (steps.length === 0) {
    steps.push("후보 노드와 근거 경로를 검토한 뒤, 필요한 출처 ref를 sourcebound review 범위로 넘기세요.");
  }
  return steps;
}

function createDetectionElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function compactDetectionSourceRefs(sourceRefs) {
  return Object.fromEntries(Object.entries(sourceRefs ?? {}).filter(([, value]) => value !== null && value !== undefined));
}

function countByValues(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function weakestClaimCeilingForCard(values) {
  const order = ["unknown", "rejected_or_blocked", "observed", "source_supported", "validated_private", "canon_candidate", "canon_entry"];
  const present = values.filter(Boolean);
  if (present.length === 0) return "unknown";
  return present.sort((left, right) => claimOrderIndexForCard(left, order) - claimOrderIndexForCard(right, order))[0] ?? "unknown";
}

function claimOrderIndexForCard(value, order) {
  const index = order.indexOf(value);
  return index === -1 ? 0 : index;
}

function setDetectionCardStatus(message) {
  detectionCardStatus.textContent = message;
}

function buildDetectionCardDebugFields() {
  return {
    detectionCardOpen: Boolean(detectionCardPanel.open && activeDetectionCardPayload),
    detectionCardFocusRef,
    detectionBridgeCommand: detectionCardFocusRef ? buildDetectionBridgeCommand(detectionCardFocusRef) : "",
    detectionCardPlan: activeDetectionCardPayload,
    detectionCardMissingCodes: activeDetectionCardPayload?.missing_evidence_items.map((item) => item.code) ?? [],
    detectionCardNextActionCodes: activeDetectionCardPayload?.next_action_items.map((item) => item.code) ?? [],
    detectionCardCounts: activeDetectionCardPayload?.detection_card.counts ?? {
      candidate_nodes: 0,
      relation_paths: 0,
      source_refs: 0,
      missing_evidence: 0,
      next_actions: 0,
    },
  };
}

function syncDetectionCardDebugState() {
  if (window.__soulforgeGraphPreview) {
    Object.assign(window.__soulforgeGraphPreview, buildDetectionCardDebugFields());
  }
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {}
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.append(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  } catch (error) {
    return false;
  }
}

function buildExplorePrompt(node) {
  const relations = contextRelationsFor(node.node_ref);
  const relationLimit = 24;
  const relationLines = relations.slice(0, relationLimit).map((edge) => describeEdgeForPrompt(edge, node.node_ref));
  const hiddenCount = Math.max(0, relations.length - relationLimit);
  const lines = [
    "Soulforge knowledge graph에서 아래 노드를 탐구해줘.",
    "",
    "출발 노드:",
    "- label: " + node.label,
    "- ref: " + node.node_ref,
    "- type: " + labelForNodeType(node.node_type) + " (" + node.node_type + ")",
    "- usage: " + node.metrics.total_access_count,
    "- visible_degree: " + (node.runtime_visible_degree ?? "unknown"),
    "- last_access: " + (node.metrics.last_access_timestamp_utc || "none"),
    "- trust: " + node.trust.claim_ceiling,
    "- status: " + node.lifecycle.status,
    "- rag_readiness: " + (node.rag?.readiness ?? "not_in_manifest"),
    "- rag_lenses: " + (node.rag?.lens_profile_ids?.join(", ") ?? "none"),
    "- rag_source_handle_count: " + (node.rag?.source_handle_count ?? 0),
    "- source_slice_registration_status: " + (node.source_slice?.registration_status ?? "not_in_triage_register"),
    "- source_slice_registered_metadata_count: " + (node.source_slice?.registered_metadata_count ?? 0),
    "- source_slice_owner_review_count: " + (node.source_slice ? node.source_slice.owner_review_count + node.source_slice.review_queue_item_count : 0),
    "- source_slice_blocked_count: " + (node.source_slice?.blocked_count ?? 0),
    "- source_slice_stronger_permissions_default_false: " + (node.source_slice?.stronger_permissions_default_false ?? false),
    "",
    "현재 보기:",
    "- layout: " + state.layout,
    "- focus_depth: " + state.focusDepth,
    "- node_size_mode: " + (state.nodeSizeMode === "degree" ? "연결수" : "사용량"),
    "- visible_nodes: " + visibleNodeCount,
    "- visible_edges: " + visibleEdgeCount,
    "- active_node_types: " + activeLabels(state.nodeTypes, labelForNodeType),
    "- active_relation_types: " + activeLabels(state.edgeTypes, labelForRelationType),
    "",
    "주변 연결(현재 필터 기준):",
    ...(relationLines.length > 0 ? relationLines : ["- 없음"]),
    ...(hiddenCount > 0 ? ["- ... " + hiddenCount + "개 더 있음"] : []),
    "",
    "탐구 요청:",
    "1. 이 노드가 현재 그래프에서 어떤 의미를 갖는지 설명해줘.",
    "2. 관계 타입별로 추천/사용/체인/라우팅 등 의미를 분리해줘.",
    "3. 빠진 연결 후보, 과도한 연결, 이상한 연결을 지적해줘.",
    "4. source_refs 기준으로 검증해야 할 근거를 정리해줘.",
    "5. 필요하면 _workmeta에 남길 탐구 기록 초안을 제안해줘.",
    "",
    "경계:",
    "- 그래프 출력은 메타데이터 기반 관찰 신호이며 source truth나 정본 승격이 아님.",
    "- private/raw/secret payload를 복사하지 말고 ref와 메타데이터만 사용해줘.",
  ];
  return lines.join("\n");
}

function contextRelationsFor(nodeRef) {
  return currentVisibleEdges
    .filter((edge) => edge.from_ref === nodeRef || edge.to_ref === nodeRef)
    .sort((a, b) => {
      const evidenceDelta = (b.metrics?.evidence_event_count ?? 0) - (a.metrics?.evidence_event_count ?? 0);
      if (evidenceDelta !== 0) return evidenceDelta;
      return a.relation_type.localeCompare(b.relation_type);
    });
}

function describeEdgeForPrompt(edge, nodeRef) {
  const from = visibleNodeFor(edge.from_ref);
  const to = visibleNodeFor(edge.to_ref);
  const direction = edge.directed ? (edge.from_ref === nodeRef ? "outgoing" : "incoming") : "undirected";
  const sourceRefs = Object.values(edge.source_refs ?? {}).filter(Boolean);
  return "- " + labelForRelationType(edge.relation_type) + " (" + edge.relation_type + ", " + edge.relation_state + ", " + direction + "): " +
    labelAndRef(from, edge.from_ref) + " -> " + labelAndRef(to, edge.to_ref) +
    " / evidence=" + (edge.metrics?.evidence_event_count ?? edge.evidence_event_count ?? 0) +
    " / last=" + (edge.metrics?.last_evidence_timestamp_utc || edge.last_evidence_timestamp_utc || "none") +
    " / source_refs=" + (sourceRefs.length > 0 ? sourceRefs.join(", ") : "none");
}

function visibleNodeFor(nodeRef) {
  return currentVisibleNodes.find((node) => node.node_ref === nodeRef) ?? graph.nodes.find((node) => node.node_ref === nodeRef) ?? null;
}

function labelAndRef(node, fallbackRef) {
  if (!node) return fallbackRef;
  return node.label + " [" + labelForNodeType(node.node_type) + "] <" + node.node_ref + ">";
}

function activeLabels(record, labeler) {
  const labels = Object.keys(record).filter((key) => record[key]).sort().map((key) => labeler(key));
  return labels.length > 0 ? labels.join(", ") : "없음";
}

function clearFocus() {
  state.focusRef = null;
  tooltip.style.display = "none";
  hideContextMenu();
  rebuild();
  updateHud();
}

function raycastNodeFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(interactiveMeshes, false)[0] ?? null;
}

function nearestNodeRefFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const targetX = event.clientX - rect.left;
  const targetY = event.clientY - rect.top;
  let best = { nodeRef: null, distanceSq: 32 * 32 };
  for (const [nodeRef, visual] of nodeVisuals.entries()) {
    const projected = visual.sphere.position.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    const distanceSq = (x - targetX) ** 2 + (y - targetY) ** 2;
    if (distanceSq < best.distanceSq) {
      best = { nodeRef, distanceSq };
    }
  }
  return best.nodeRef;
}

function applyFocus() {
  const focusRefs = state.focusRef ? connectedRefsFor(state.focusRef) : null;
  focusedNodeCount = focusRefs?.size ?? visibleNodeCount;
  focusedEdgeCount = 0;
  for (const [nodeRef, visual] of nodeVisuals.entries()) {
    const focused = !focusRefs || focusRefs.has(nodeRef);
    setMeshOpacity(visual.sphere, focused ? 1 : 0.08);
    setMeshOpacity(visual.border, focused ? 1 : 0.08);
  }
  for (const visual of edgeVisuals) {
    const focused = !focusRefs || (focusRefs.has(visual.edge.from_ref) && focusRefs.has(visual.edge.to_ref));
    if (focused) focusedEdgeCount += 1;
    for (const mesh of visual.meshes) {
      setMeshOpacity(mesh, focused ? 1 : 0.04);
    }
  }
  for (const visual of componentVisuals) {
    const focused = !focusRefs || [...visual.nodeRefs].some((nodeRef) => focusRefs.has(nodeRef));
    for (const mesh of visual.meshes) {
      mesh.visible = focused;
      if (focused) setMeshOpacity(mesh, 1);
    }
  }
  if (window.__soulforgeGraphPreview) {
    window.__soulforgeGraphPreview.focusRef = state.focusRef;
    window.__soulforgeGraphPreview.focusDepth = state.focusDepth;
    window.__soulforgeGraphPreview.focusedNodeCount = focusedNodeCount;
    window.__soulforgeGraphPreview.focusedEdgeCount = focusedEdgeCount;
    window.__soulforgeGraphPreview.componentHaloCount = componentVisuals.length;
    window.__soulforgeGraphPreview.focusedComponentHaloCount = componentVisuals.filter(
      (visual) => !focusRefs || [...visual.nodeRefs].some((nodeRef) => focusRefs.has(nodeRef)),
    ).length;
  }
}

function connectedRefsFor(startRef) {
  const nodeRefs = new Set(currentVisibleNodes.map((node) => node.node_ref));
  if (!nodeRefs.has(startRef)) return new Set();
  const maxDepth = state.focusDepth === "all" ? Infinity : Number(state.focusDepth);
  const adjacency = new Map([...nodeRefs].map((nodeRef) => [nodeRef, new Set()]));
  for (const edge of currentVisibleEdges) {
    if (!nodeRefs.has(edge.from_ref) || !nodeRefs.has(edge.to_ref)) continue;
    adjacency.get(edge.from_ref).add(edge.to_ref);
    adjacency.get(edge.to_ref).add(edge.from_ref);
  }
  const visited = new Set([startRef]);
  const stack = [{ nodeRef: startRef, depth: 0 }];
  while (stack.length > 0) {
    const { nodeRef: current, depth } = stack.pop();
    if (depth >= maxDepth) continue;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push({ nodeRef: next, depth: depth + 1 });
      }
    }
  }
  return visited;
}

function setMeshOpacity(mesh, multiplier) {
  const baseOpacity = mesh.material.userData.baseOpacity ?? mesh.material.opacity ?? 1;
  mesh.material.opacity = Math.max(0.035, baseOpacity * multiplier);
  mesh.material.transparent = true;
  mesh.material.needsUpdate = true;
}

function visibleDegreeByRef(nodes, edges) {
  const degreeByRef = new Map(nodes.map((node) => [node.node_ref, 0]));
  for (const edge of edges) {
    if (degreeByRef.has(edge.from_ref)) degreeByRef.set(edge.from_ref, degreeByRef.get(edge.from_ref) + 1);
    if (degreeByRef.has(edge.to_ref)) degreeByRef.set(edge.to_ref, degreeByRef.get(edge.to_ref) + 1);
  }
  return degreeByRef;
}

function renderedNodeRadius(node, visibleDegree) {
  const size = state.nodeSizeMode === "degree" ? sizeForVisibleDegree(visibleDegree) : node.visual.size_px;
  const floorSize = state.nodeSizeMode === "degree" ? sizeForVisibleDegree(0) : 8;
  const adjustedSize = floorSize + (size - floorSize) * state.nodeRelativeScale;
  return Math.max(5, adjustedSize * state.nodeGlobalScale);
}

function sizeForVisibleDegree(degree) {
  if (degree <= 0) return 9;
  if (degree <= 1) return 14;
  if (degree <= 3) return 21;
  if (degree <= 6) return 30;
  if (degree <= 12) return 42;
  return 58;
}

function positionTooltip(event) {
  const host = tooltip.parentElement;
  const hostRect = host.getBoundingClientRect();
  const offset = 14;
  const margin = 8;
  const rect = tooltip.getBoundingClientRect();
  const maxX = Math.max(margin, hostRect.width - rect.width - margin);
  const maxY = Math.max(margin, hostRect.height - rect.height - margin);
  const x = clamp(event.clientX - hostRect.left + offset, margin, maxX);
  const y = clamp(event.clientY - hostRect.top + offset, margin, maxY);
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nodeTooltip(node) {
  return "<strong>" + escapeHtmlText(node.label) + "</strong><br>" +
    "종류: " + escapeHtmlText(labelForNodeType(node.node_type)) + "<br>" +
    "ref: " + escapeHtmlText(node.node_ref) + "<br>" +
    "사용: " + node.metrics.total_access_count + "<br>" +
    "연결수: " + (node.runtime_visible_degree ?? "알 수 없음") + "<br>" +
    "원 크기 기준: " + (node.runtime_node_size_mode === "degree" ? "연결수" : "사용량") + "<br>" +
    "마지막 사용: " + escapeHtmlText(node.metrics.last_access_timestamp_utc || "없음") + "<br>" +
    "신뢰: " + escapeHtmlText(node.trust.claim_ceiling) + "<br>" +
    "상태: " + escapeHtmlText(node.lifecycle.status) +
    sourceSliceTooltipText(node);
}

function sourceSliceTooltipText(node) {
  const sourceSlice = node.source_slice;
  if (!sourceSlice) return "";
  return "<br>RAG 등록: " + escapeHtmlText(sourceSlice.registration_status) +
    "<br>metadata 등록: " + sourceSlice.registered_metadata_count +
    " / 검토: " + (sourceSlice.owner_review_count + sourceSlice.review_queue_item_count) +
    " / 차단: " + sourceSlice.blocked_count +
    "<br>강한 권한 기본차단: " + (sourceSlice.stronger_permissions_default_false ? "예" : "아니오");
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function disposeChildren(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((item) => item.dispose());
      } else {
        object.material.dispose();
      }
    }
  });
}

function canvasPixelProbe() {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBackground = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], a = pixels[index + 3];
    if (a > 0 && (r > 18 || g > 22 || b > 32)) nonBackground += 1;
  }
  return { width, height, nonBackground };
}

function escapeHtmlText(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
`;
}

async function writeObsidianExport({ graph, outputDir }) {
  await fs.mkdir(path.join(outputDir, ".obsidian"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "Nodes"), { recursive: true });
  await fs.writeFile(
    path.join(outputDir, ".obsidian", "app.json"),
    `${JSON.stringify({ alwaysUpdateLinks: false, newFileLocation: "folder", newFileFolderPath: "Nodes" }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(path.join(outputDir, "README.md"), renderObsidianReadme(graph), "utf8");
  await fs.writeFile(path.join(outputDir, "Graph Index.md"), renderGraphIndexNote(graph), "utf8");
  for (const node of graph.nodes) {
    await fs.writeFile(path.join(outputDir, "Nodes", `${slugForNote(node.node_ref)}.md`), renderNodeNote(node, graph), "utf8");
  }
}

function renderObsidianReadme(graph) {
  return `---
schema_version: ${KNOWLEDGE_GRAPH_SCHEMA_VERSION}
generated: true
read_only: true
do_not_edit: true
graph_export_id: ${graph.export_id}
generated_from_graph_snapshot_id: ${graph.export_id}
---

# Soulforge Knowledge Graph View

This vault is a generated read-only metadata view.

- Graph index: [[Graph Index]]
- Node count: ${graph.nodes.length}
- Edge count: ${graph.edges.length}
- Weak component count: ${graph.connectivity_analysis.weak_component_count}
- Isolated node count: ${graph.connectivity_analysis.isolated_count}
- Generated at: ${graph.generated_at_utc}

Do not hand-edit these notes. Regenerate the export from Soulforge instead.
`;
}

function renderGraphIndexNote(graph) {
  const nodeLinks = graph.nodes.map((node) => `- [[${slugForNote(node.node_ref)}|${escapeMarkdown(node.label)}]]`).join("\n");
  return `---
schema_version: ${KNOWLEDGE_GRAPH_SCHEMA_VERSION}
generated: true
read_only: true
do_not_edit: true
graph_export_id: ${graph.export_id}
generated_from_graph_snapshot_id: ${graph.export_id}
node_count: ${graph.nodes.length}
edge_count: ${graph.edges.length}
weak_component_count: ${graph.connectivity_analysis.weak_component_count}
isolated_node_count: ${graph.connectivity_analysis.isolated_count}
---

# Graph Index

## Connectivity

- Components: ${graph.connectivity_analysis.weak_component_count}
- Isolated nodes: ${graph.connectivity_analysis.isolated_count}
- Largest cluster: ${graph.connectivity_analysis.largest_component_size}
- Confirmed edges: ${graph.connectivity_analysis.edge_count}
- Interpretation: ${escapeMarkdown(graph.connectivity_analysis.interpretation)}

## Nodes

${nodeLinks}
`;
}

function renderNodeNote(node, graph) {
  const outbound = graph.edges
    .filter((edge) => edge.from_ref === node.node_ref)
    .map((edge) => `- ${edge.relation_type} -> [[${slugForNote(edge.to_ref)}|${escapeMarkdown(labelForNodeRef(graph, edge.to_ref))}]]`)
    .join("\n");
  const inbound = graph.edges
    .filter((edge) => edge.to_ref === node.node_ref)
    .map((edge) => `- [[${slugForNote(edge.from_ref)}|${escapeMarkdown(labelForNodeRef(graph, edge.from_ref))}]] -> ${edge.relation_type}`)
    .join("\n");
  return `---
schema_version: ${KNOWLEDGE_GRAPH_SCHEMA_VERSION}
generated: true
read_only: true
do_not_edit: true
node_ref: ${quoteYaml(node.node_ref)}
source_knowledge_ref: ${quoteYaml(node.node_ref)}
source_hash: ${node.source_hash}
generated_from_graph_snapshot_id: ${graph.export_id}
node_type: ${node.node_type}
claim_ceiling: ${node.trust.claim_ceiling}
lifecycle_status: ${node.lifecycle.status}
lifecycle_state: ${node.lifecycle.status}
total_access_count: ${node.metrics.total_access_count}
last_access_timestamp_utc: ${node.metrics.last_access_timestamp_utc ?? "null"}
---

# ${escapeMarkdown(node.label)}

Type: \`${node.node_type}\`

Ref: \`${node.node_ref}\`

${node.summary ? `${escapeMarkdown(node.summary)}\n` : ""}

## Outbound

${outbound || "- none"}

## Inbound

${inbound || "- none"}
`;
}

function labelForNodeRef(graph, nodeRef) {
  return graph.nodes.find((node) => node.node_ref === nodeRef)?.label ?? nodeRef;
}

async function listChildDirs(root) {
  if (!(await pathExists(root))) {
    return [];
  }
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function readYaml(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return parseYaml(raw);
  } catch {
    return readTopLevelYamlFallback(raw);
  }
}

function readTopLevelYamlFallback(raw) {
  const data = {};
  for (const line of raw.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (value === "" || value.startsWith("|") || value.startsWith(">")) {
      continue;
    }
    data[key] = value.replace(/^["']|["']$/g, "");
  }
  return data;
}

function normalizeInputList(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeNow(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_now");
  }
  return date;
}

function normalizeExportId(value) {
  const text = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(text)) {
    throw new Error("export_id_must_be_simple");
  }
  return text;
}

function formatTimestampUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function mapKnowledgeRefToNodeRef(ref) {
  const value = String(ref);
  const normalized = value.replaceAll("\\", "/");
  const match = normalized.match(/^\.registry\/knowledge\/([^/]+)(?:\/knowledge\.yaml)?$/);
  if (match) {
    return `.registry/knowledge/${match[1]}`;
  }
  return normalized;
}

function inferNodeTypeFromRef(ref) {
  if (ref.startsWith(".registry/knowledge/")) return "knowledge";
  if (ref.startsWith(".workflow/")) return "workflow";
  if (ref.startsWith(".party/")) return "party";
  if (ref.startsWith(".registry/species/")) return "species";
  if (ref.startsWith(".registry/classes/")) return "class";
  if (ref.startsWith(".unit/")) return "unit";
  if (ref.startsWith(".mission/")) return "mission";
  if (ref.startsWith("docs/")) return "source";
  return "artifact";
}

function ownerSurfaceFromRef(ref) {
  const value = String(ref);
  if (value.startsWith(".registry/knowledge/")) return ".registry/knowledge";
  if (value.startsWith(".registry/classes/")) return ".registry/classes";
  if (value.startsWith(".registry/species/")) return ".registry/species";
  if (value.startsWith(".workflow/")) return ".workflow";
  if (value.startsWith(".party/")) return ".party";
  if (value.startsWith(".unit/")) return ".unit";
  if (value.startsWith(".mission/")) return ".mission";
  if (value.startsWith("docs/")) return "docs";
  return "metadata";
}

function labelFromRef(ref) {
  const base = String(ref).split("/").filter(Boolean).at(-1) ?? String(ref);
  return base.replace(/\.ya?ml$/u, "").replace(/\.md$/u, "");
}

function sizeForCount(count) {
  if (count <= 0) return 8;
  if (count === 1) return 14;
  if (count <= 4) return 24;
  if (count <= 9) return 36;
  return 52;
}

function widthForCount(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 4;
  return 6;
}

function opacityForDays(days) {
  if (days === null || days === undefined) return 0.15;
  if (days <= 30) return 1;
  if (days <= 90) return 0.7;
  if (days <= 180) return 0.4;
  return 0.2;
}

function daysSince(timestamp, now) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function borderStyleForStatus(status) {
  if (status === "draft" || status === "candidate") return "dashed";
  if (status === "blocked") return "long_dash";
  if (status === "superseded" || status === "retired") return "faint";
  return "solid";
}

function lineStyleForState(state) {
  if (state === "candidate") return "dashed";
  if (state === "weak") return "dotted";
  if (state === "conflict") return "dotted";
  if (state === "blocked" || state === "review_required") return "long_dash";
  if (state === "unknown") return "faint";
  return "solid";
}

function maxTimestamp(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left > right ? left : right;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function stableSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "edge";
}

function slugForNote(value) {
  return stableSlug(value).replaceAll("-", "_");
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function escapeMarkdown(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hashMetadata(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
