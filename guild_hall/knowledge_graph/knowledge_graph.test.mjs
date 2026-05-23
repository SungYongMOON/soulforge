import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportKnowledgeGraph } from "./graph_export.mjs";

test("exportKnowledgeGraph writes metadata-only graph, HTML preview, and Obsidian notes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-graph-"));
  try {
    await writeFixtureRepo(repoRoot);
    const ledger = path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access", "events.jsonl");
    await mkdir(path.dirname(ledger), { recursive: true });
    await writeFile(
      ledger,
      `${JSON.stringify({
        schema_version: "soulforge.knowledge_access_event.v0",
        workflow_id: "knowledge_access_event_capture_v0",
        kind: "knowledge_access_event",
        status: "recorded",
        event_id: "knowledge_access_20260522T010203Z_aaaaaaaaaaaa",
        timestamp_utc: "2026-05-22T01:02:03Z",
        capture_mode: "manual_agent_entry",
        ledger_ref: "_workmeta/system/reports/knowledge_access/events.jsonl",
        event_source_ref: null,
        manual_agent_note: null,
        actor: { type: "workflow", id: "knowledge_access_event_capture_v0", ref: null },
        target: {
          knowledge_ref: ".registry/knowledge/source_criticism/knowledge.yaml",
          target_type: "knowledge_node",
          source_workflow_id: null,
        },
        access_type: "read",
        reason_used: "fixture use",
        output_ref: null,
        work_context: {
          task_ref: null,
          run_ref: null,
          workflow_id: "knowledge_access_event_capture_v0",
          skill_id: null,
          mission_id: null,
          advisory_handoff_ref: null,
        },
        outcome_state: "useful",
        usefulness: { state: "useful", score_hint_0_to_3: null, note_ref: null },
        relation_hints: {
          relation_type_hint: null,
          relevance_score_hint_0_to_3: null,
          strength_hint: null,
          confidence_hint_0_to_3: null,
          duplicate_or_redundant_with: [],
          orphan_reason_hint: null,
        },
        accumulation_delta_hint: null,
        redaction: {
          metadata_only: true,
          manual_agent_note_payload_free: true,
          payload_copied: false,
          secret_present: false,
          runtime_absolute_path_present: false,
        },
      })}\n`,
      "utf8",
    );

    const result = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph",
      ledgerRefs: "_workmeta/system/reports/knowledge_access/events.jsonl",
      now: "2026-05-22T02:00:00Z",
    });

    assert.equal(result.status, "exported");
    assert.equal(result.node_count > 0, true);
    assert.equal(result.edge_count > 0, true);

    const graph = JSON.parse(await readFile(path.join(repoRoot, result.graph_ref), "utf8"));
    assert.equal(graph.schema_version, "soulforge.knowledge_graph_view.v0");
    assert.equal(graph.boundary.metadata_only, true);
    assert.equal(graph.visual_encoding.node_size_by, "total_access_count");
    assert.equal(graph.visual_encoding.node_opacity_by, "days_since_last_access");
    assert.equal(graph.palettes.relation_type.chains, "#a78bfa");
    assert.equal(graph.palettes.relation_type.routes_to, "#f59e0b");
    assert.equal(graph.palettes.relation_type.uses, "#38bdf8");
    assert.notEqual(graph.palettes.relation_type.has_class, graph.palettes.relation_type.recommends);
    assert.equal(graph.connectivity_analysis.node_count, graph.nodes.length);
    assert.equal(graph.connectivity_analysis.edge_count, graph.edges.length);
    assert.equal(graph.connectivity_analysis.weak_component_count, 1);
    assert.equal(graph.connectivity_analysis.isolated_count, 0);
    assert.deepEqual(graph.connectivity_analysis.dangling_edge_refs, []);
    assert.match(graph.connectivity_analysis.interpretation, /generated graph/);

    const knowledgeNode = graph.nodes.find((node) => node.node_ref === ".registry/knowledge/source_criticism");
    assert.ok(knowledgeNode);
    assert.equal(knowledgeNode.node_type, "knowledge");
    assert.equal(knowledgeNode.metrics.total_access_count, 1);
    assert.equal(knowledgeNode.visual.size_px, 14);
    assert.equal(knowledgeNode.trust.claim_ceiling, "canon_entry");

    const usageEdge = graph.edges.find(
      (edge) =>
        edge.from_ref === ".workflow/knowledge_access_event_capture_v0" &&
        edge.to_ref === ".registry/knowledge/source_criticism" &&
        edge.relation_type === "uses",
    );
    assert.ok(usageEdge);
    assert.equal(usageEdge.visual.width_px, 1);
    const profileClassEdge = graph.edges.find(
      (edge) =>
        edge.from_ref === ".workflow/knowledge_access_event_capture_v0" &&
        edge.to_ref === ".registry/classes/archivist" &&
        edge.relation_type === "recommends",
    );
    assert.ok(profileClassEdge);
    assert.equal(profileClassEdge.source_refs.relation_type, ".workflow/knowledge_access_event_capture_v0/profile_policy.yaml");
    const profileSpeciesEdge = graph.edges.find(
      (edge) =>
        edge.from_ref === ".workflow/knowledge_access_event_capture_v0" &&
        edge.to_ref === ".registry/species/human" &&
        edge.relation_type === "recommends",
    );
    assert.ok(profileSpeciesEdge);
    assert.equal(
      graph.connectivity_analysis.current_extraction_scope.includes(
        ".workflow/*/profile_policy.yaml primary_profile species/class fields",
      ),
      true,
    );

    const html = await readFile(path.join(repoRoot, result.html_ref), "utf8");
    assert.match(html, /Soulforge Knowledge Graph/);
    assert.match(html, /3D 미리보기/);
    assert.match(html, /자동 회전/);
    assert.match(html, /연결성/);
    assert.match(html, /시각 규칙 보기/);
    assert.match(html, /id="ruleNodeSizeMeaning"/);
    assert.match(html, /id="ruleComponentHaloMeaning"/);
    assert.match(html, /id="nodeGlobalScale"/);
    assert.match(html, /id="nodeRelativeScale"/);
    assert.match(html, /상대 배율은 큰 원과 작은 원의 차이/);
    assert.match(html, /화살표/);
    assert.match(html, /짧은 점선은 후보/);
    assert.match(html, /포커스 중에는 선택 범위의 글로우만/);
    assert.match(html, /덩어리=선으로 이어진 묶음/);
    assert.match(html, /id="saveSettings"/);
    assert.match(html, /현재 설정 저장/);
    assert.match(html, /id="nodeContextMenu"/);
    assert.match(html, /탐구 프롬프트 복사/);
    assert.match(html, /연결만 보기/);
    assert.match(html, /ref 복사/);
    assert.match(html, /id="contextMenuPrompt"/);
    assert.match(html, /id="componentHalos"/);
    assert.match(html, /id="componentHaloStyle"/);
    assert.match(html, /id="componentShellSpacing"/);
    assert.match(html, /id="componentShellPointScale"/);
    assert.match(html, /id="componentShellOpacityScale"/);
    assert.match(html, /id="componentShellDepth"/);
    assert.match(html, /id="componentShellInnerRadius"/);
    assert.match(html, /id="componentShellJitter"/);
    assert.match(html, /id="connectivityControls"/);
    assert.match(html, /id="nodeSizeControls"/);
    assert.match(html, /id="viewControls"/);
    assert.match(html, /id="filterControls"/);
    assert.match(html, /id="paletteControls"/);
    assert.match(html, /연두 윤곽 글로우/);
    assert.match(html, /id="nodeSizeMode"/);
    assert.match(html, /연결수는 현재 필터 후 보이는 선 기준/);
    assert.match(html, /id="focusDepth"/);
    assert.match(html, /id="metricComponents"/);
    assert.match(html, /id="legendPanel"/);
    assert.match(html, /graph_preview_3d\.bundle\.js\?v=/);
    assert.doesNotMatch(html, new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const graphDataMatch = html.match(/<script id="graph-data" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(graphDataMatch);
    assert.doesNotMatch(graphDataMatch[1], /&quot;/);
    const embeddedGraph = JSON.parse(graphDataMatch[1]);
    assert.equal(embeddedGraph.nodes.length, graph.nodes.length);
    assert.equal(embeddedGraph.edges.length, graph.edges.length);

    const html2d = await readFile(path.join(repoRoot, result.html_2d_ref), "utf8");
    assert.match(html2d, /<svg id="graph"/);
    const bundle = await readFile(path.join(repoRoot, result.bundle_ref), "utf8");
    const exporterSource = await readFile(new URL("./graph_export.mjs", import.meta.url), "utf8");
    assert.match(bundle, /THREE/);
    assert.match(bundle, /OrbitControls/);
    assert.match(bundle, /TorusGeometry/);
    assert.match(bundle, /positionTooltip/);
    assert.match(bundle, /connectedRefsFor/);
    assert.match(bundle, /onCanvasDoubleClick/);
    assert.match(bundle, /nearestNodeRefFromEvent/);
    assert.match(bundle, /clearFocus/);
    assert.doesNotMatch(bundle, /addEventListener\("click", onCanvasClick\)/);
    assert.doesNotMatch(bundle, /addEventListener\("pointerdown", onCanvasPointerDown\)/);
    assert.match(bundle, /NODE_TYPE_LABELS/);
    assert.match(bundle, /analyzeVisibleConnectivity/);
    assert.match(bundle, /renderPaletteLegend/);
    assert.match(bundle, /COMPONENT_HALO_COLORS/);
    assert.match(bundle, /addComponentHalos/);
    assert.match(bundle, /componentHaloColor/);
    assert.match(bundle, /componentHaloProfile/);
    assert.match(bundle, /componentHaloStyle/);
    assert.match(bundle, /SETTINGS_STORAGE_KEY/);
    assert.match(bundle, /localStorage/);
    assert.match(bundle, /serializeSettings/);
    assert.match(bundle, /applySavedSettings/);
    assert.match(bundle, /onCanvasContextMenu/);
    assert.match(bundle, /buildExplorePrompt/);
    assert.match(bundle, /copyTextToClipboard/);
    assert.match(bundle, /showPromptFallback/);
    assert.match(bundle, /contextRelationsFor/);
    assert.match(bundle, /contextNodeRef/);
    assert.match(bundle, /componentHaloCount/);
    assert.match(bundle, /focusedComponentHaloCount/);
    assert.match(exporterSource, /선택 범위의 글로우만/);
    assert.match(bundle, /componentShellPointGeometry/);
    assert.match(bundle, /componentShellPointCount/);
    assert.match(bundle, /shellPointSpacing/);
    assert.match(bundle, /componentShellDepth/);
    assert.match(bundle, /componentShellInnerRadius/);
    assert.match(bundle, /componentShellOpacityScale/);
    assert.match(bundle, /shellPointCount/);
    assert.match(bundle, /PointsMaterial/);
    assert.match(bundle, /sizeAttenuation/);
    assert.match(bundle, /getComponentGlowPointTexture/);
    assert.match(bundle, /alphaTest/);
    assert.match(bundle, /shellRadius/);
    assert.match(bundle, /shellShape/);
    assert.match(bundle, /shellInnerRadius/);
    assert.match(bundle, /seededUnit/);
    assert.match(bundle, /segmentEnd/);
    assert.match(bundle, /AdditiveBlending/);
    assert.match(bundle, /nodeSizeMode/);
    assert.match(bundle, /nodeGlobalScale/);
    assert.match(bundle, /nodeRelativeScale/);
    assert.match(bundle, /updateVisualRules/);
    assert.match(bundle, /visibleDegreeByRef/);
    assert.match(bundle, /sizeForVisibleDegree/);
    assert.match(bundle, /focusDepth/);
    assert.match(bundle, /focusedNodeCount/);
    assert.match(exporterSource, /targetRadius \+ coneHeight \* 0\.48/);
    assert.match(exporterSource, /width \* 2\.35/);
    assert.match(exporterSource, /floorSize \+ \(size - floorSize\) \* state\.nodeRelativeScale/);
    assert.match(exporterSource, /opacity: node\.lifecycle\.status === "active" \? 0\.38 : 0\.24/);
    assert.match(exporterSource, /event\.clientX - hostRect\.left/);
    assert.match(bundle, /autoRotate = false/);
    assert.doesNotMatch(bundle, /new THREE\.Fog/);
    assert.doesNotMatch(bundle, /wireframe: true/);

    const indexNote = await readFile(path.join(repoRoot, result.obsidian_vault_ref, "Graph Index.md"), "utf8");
    assert.match(indexNote, /generated: true/);
    assert.match(indexNote, /read_only: true/);
    assert.match(indexNote, /## Connectivity/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeFixtureRepo(repoRoot) {
  await writeYaml(repoRoot, ".registry/knowledge/source_criticism/knowledge.yaml", {
    knowledge_id: "source_criticism",
    kind: "knowledge",
    status: "active",
    title: "Source Criticism",
  });
  await writeYaml(repoRoot, ".registry/classes/archivist/class.yaml", {
    class_id: "archivist",
    kind: "class",
    status: "active",
    title: "Archivist",
  });
  await writeYaml(repoRoot, ".registry/classes/archivist/knowledge_refs.yaml", {
    class_id: "archivist",
    kind: "knowledge_refs",
    status: "active",
    assign: [{ assign: "source_criticism", ref: "source_criticism" }],
  });
  await writeYaml(repoRoot, ".registry/species/human/species.yaml", {
    species_id: "human",
    kind: "species",
    status: "active",
    title: "Human",
  });
  await writeYaml(repoRoot, ".unit/scribe_01/unit.yaml", {
    unit_id: "scribe_01",
    status: "active",
    identity: { species_id: "human" },
    class_ids: ["archivist"],
  });
  await writeYaml(repoRoot, ".workflow/index.yaml", {
    entries: [{ workflow_id: "knowledge_access_event_capture_v0", path: "knowledge_access_event_capture_v0/workflow.yaml" }],
  });
  await writeYaml(repoRoot, ".workflow/knowledge_access_event_capture_v0/workflow.yaml", {
    workflow_id: "knowledge_access_event_capture_v0",
    kind: "workflow",
    status: "active",
    title: "Knowledge Access Event Capture v0",
  });
  await writeYaml(repoRoot, ".workflow/knowledge_access_event_capture_v0/profile_policy.yaml", {
    workflow_id: "knowledge_access_event_capture_v0",
    kind: "workflow_profile_policy",
    status: "active",
    primary_profile: {
      model: "gpt-5.5",
      reasoning_effort: "medium",
      species: "human",
      class: "archivist",
      quality_class: "quality_equivalent_pass",
    },
  });
  await writeYaml(repoRoot, ".party/index.yaml", {
    entries: [{ party_id: "knowledge_wiki_cell", path: "knowledge_wiki_cell/party.yaml" }],
  });
  await writeYaml(repoRoot, ".party/knowledge_wiki_cell/party.yaml", {
    party_id: "knowledge_wiki_cell",
    kind: "party_template",
    status: "active",
    title: "Knowledge Wiki Cell",
    default_workflow_id: "knowledge_access_event_capture_v0",
    workflow_chain: [{ workflow_id: "knowledge_access_event_capture_v0" }],
  });
}

async function writeYaml(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const lines = Object.entries(value)
    .map(([key, child]) => `${key}: ${formatYamlValue(child, 0)}`)
    .join("\n");
  await writeFile(filePath, `${lines}\n`, "utf8");
}

function formatYamlValue(value, depth) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `\n${value.map((item) => `${"  ".repeat(depth + 1)}- ${formatYamlValue(item, depth + 1).trimStart()}`).join("\n")}`;
  }
  if (value && typeof value === "object") {
    return `\n${Object.entries(value)
      .map(([key, child]) => `${"  ".repeat(depth + 1)}${key}: ${formatYamlValue(child, depth + 1)}`)
      .join("\n")}`;
  }
  return JSON.stringify(value);
}
