import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportKnowledgeGraph } from "./graph_export.mjs";
import {
  DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL,
  buildKnowledgeGraphReviewRequest,
} from "./llm_review.mjs";
import { buildRetrievalPlan } from "./retrieval_plan.mjs";

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
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_output_root",
          outputRoot: "docs/knowledge_view",
        }),
      /knowledge graph output root must be under _workspaces\/system\/knowledge_view/,
    );

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
    assert.equal(graph.connectivity_analysis.weak_component_count, 2);
    assert.equal(graph.connectivity_analysis.isolated_count, 1);
    assert.deepEqual(graph.connectivity_analysis.dangling_edge_refs, []);
    assert.match(graph.connectivity_analysis.interpretation, /generated graph/);

    const knowledgeNode = graph.nodes.find((node) => node.node_ref === ".registry/knowledge/source_criticism");
    assert.ok(knowledgeNode);
    assert.equal(knowledgeNode.node_type, "knowledge");
    assert.equal(knowledgeNode.metrics.total_access_count, 1);
    assert.equal(knowledgeNode.visual.size_px, 14);
    assert.equal(knowledgeNode.trust.claim_ceiling, "canon_entry");

    const candidateKnowledgeNode = graph.nodes.find((node) => node.node_ref === ".registry/knowledge/graph_rag");
    assert.ok(candidateKnowledgeNode);
    assert.equal(candidateKnowledgeNode.trust.claim_ceiling, "source_supported");

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
    assert.match(html, /id="detectionCardPanel"/);
    assert.match(html, /id="detectionCardBody"/);
    assert.match(html, /id="detectionNodeRef"/);
    assert.match(html, /id="openDetectionCard"/);
    assert.match(html, /id="openDetectionCardByRef"/);
    assert.match(html, /id="copyDetectionBridgeCommand"/);
    assert.match(html, /id="detectionBridgeCommand"/);
    assert.match(html, /gpt-5\.5 검토 명령 복사/);
    assert.match(html, /탐지 카드는 답변이 아니라 검토 안내/);
    assert.match(html, /탐지 카드 열기/);
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
    assert.match(bundle, /showDetectionCardForContextNode/);
    assert.match(bundle, /openDetectionCardForNode/);
    assert.match(bundle, /buildDetectionCardPayload/);
    assert.match(bundle, /renderDetectionCard/);
    assert.match(bundle, /renderDetectionOperatorGuide/);
    assert.match(bundle, /buildDetectionBridgeCommand/);
    assert.match(bundle, /copyDetectionBridgeCommandFromCard/);
    assert.match(bundle, /npm run guild-hall:knowledge-graph -- review/);
    assert.match(bundle, /--model gpt-5\.5/);
    assert.match(bundle, /detectionJudgementText/);
    assert.match(bundle, /missingEvidenceItemsFor/);
    assert.match(bundle, /nextActionItemsFor/);
    assert.match(bundle, /detectionCardPlan/);
    assert.match(bundle, /candidate_nodes/);
    assert.match(bundle, /relation_paths/);
    assert.match(bundle, /missing_evidence_items/);
    assert.match(bundle, /next_action_items/);
    assert.match(bundle, /no_source_text_loaded/);
    assert.match(bundle, /no_notebooklm_answers/);
    assert.match(bundle, /no_vector_search/);
    assert.match(bundle, /no_codex_bridge_auto_call/);
    assert.match(bundle, /selected_node_no_relation_paths/);
    assert.match(bundle, /add_selected_node_relation_edges/);
    assert.match(bundle, /componentHaloCount/);
    assert.match(bundle, /focusedComponentHaloCount/);
    assert.match(exporterSource, /선택 범위의 글로우만/);
    assert.match(exporterSource, /지금 할 일/);
    assert.match(exporterSource, /아직 근거 문단을 찾아 답하는 RAG 답변기는 아닙니다/);
    assert.doesNotMatch(exporterSource, /fetch\s*\(/);
    assert.doesNotMatch(exporterSource, /XMLHttpRequest/);
    assert.doesNotMatch(exporterSource, /WebSocket/);
    assert.doesNotMatch(exporterSource, /buildRetrievalPlan\s*\(/);
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

    const ragManifestRef = "_workspaces/system/rag/manifests/fixture_manifest/rag_manifest.json";
    await writeFixtureRagManifest(repoRoot, ragManifestRef);
    const ragResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph_rag_lens",
      ledgerRefs: "_workmeta/system/reports/knowledge_access/events.jsonl",
      ragManifestRefs: ragManifestRef,
      now: "2026-05-22T02:00:00Z",
    });
    const ragGraph = JSON.parse(await readFile(path.join(repoRoot, ragResult.graph_ref), "utf8"));
    assert.equal(ragGraph.boundary.metadata_only, true);
    assert.equal(ragGraph.boundary.no_rag_source_payloads, true);
    assert.equal(ragGraph.source_refs.rag_manifest_refs[0], ragManifestRef);
    assert.equal(ragGraph.graph_scope.source_surfaces.includes("explicit_rag_manifest_refs"), true);
    assert.equal(ragGraph.graph_scope.rag_manifest_refs[0], ragManifestRef);
    assert.equal(ragGraph.graph_scope.included_lens_profile_ids.includes("rag_knowledge_readiness"), true);
    assert.equal(ragGraph.rag_projection.schema_version, "soulforge.knowledge_graph_rag_projection.v0");
    assert.equal(ragGraph.rag_projection.boundary.no_source_text_loaded, true);
    assert.equal(ragGraph.rag_projection.matched_node_count, 2);
    assert.equal(ragGraph.rag_projection.readiness_counts.metadata_answer_ready, 1);
    assert.equal(ragGraph.rag_projection.readiness_counts.blocked, 1);
    assert.equal(
      ragGraph.rag_projection.lens_profiles.find((profile) => profile.lens_id === "rag_knowledge_readiness")?.title,
      "rag_knowledge_readiness",
    );
    assert.equal(
      Object.hasOwn(ragGraph.rag_projection.lens_profiles.find((profile) => profile.lens_id === "rag_knowledge_readiness"), "purpose"),
      false,
    );
    const ragOverlayNode = ragGraph.nodes.find((node) => node.node_ref === ".registry/knowledge/graph_rag");
    assert.ok(ragOverlayNode.rag);
    assert.equal(ragOverlayNode.rag.readiness, "metadata_answer_ready");
    assert.equal(ragOverlayNode.rag.source_handle_count, 1);
    assert.equal(Object.hasOwn(ragOverlayNode.rag, "source_handles"), false);
    assert.equal(Object.hasOwn(ragOverlayNode.rag, "retrieval_unit_refs"), false);
    assert.equal(ragOverlayNode.rag.lens_profile_ids.includes("rag_knowledge_readiness"), true);
    const blockedOverlayNode = ragGraph.nodes.find((node) => node.node_ref === ".registry/knowledge/isolated_note");
    assert.equal(blockedOverlayNode.rag.readiness, "blocked");
    assert.equal(blockedOverlayNode.rag.allowed_for_retrieval, false);
    const ragHtml = await readFile(path.join(repoRoot, ragResult.html_ref), "utf8");
    assert.match(ragHtml, /id="ragLensMode"/);
    assert.match(ragHtml, /RAG 렌즈/);
    assert.match(ragHtml, /metadata 답변 가능 노드만/);
    const ragGraphDataMatch = ragHtml.match(/<script id="graph-data" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(ragGraphDataMatch);
    const embeddedRagGraph = JSON.parse(ragGraphDataMatch[1]);
    assert.equal(embeddedRagGraph.rag_projection.node_overlay_count, 2);
    assert.doesNotMatch(
      ragGraphDataMatch[1],
      /"source_text"\s*:|"chunk_text"\s*:|"notebooklm_answer"\s*:|"raw_payload"\s*:|\/Users\/|\/Volumes\//,
    );
    assert.doesNotMatch(ragGraphDataMatch[1], /"source_handles"\s*:|"retrieval_unit_refs"\s*:|Show metadata-only source/);
    const ragBundle = await readFile(path.join(repoRoot, ragResult.bundle_ref), "utf8");
    assert.match(ragBundle, /ragNodePassesLens/);
    assert.match(ragBundle, /ragEdgePassesLens/);
    assert.match(ragBundle, /ragProjectionPresent/);
    assert.match(ragBundle, /ragLensMode/);
    assert.match(ragBundle, /node_not_in_rag_manifest/);

    const triageRef =
      "_workmeta/system/reports/rag/source_slice_triage_register/fixture_register/source_slice_triage_register.json";
    const reviewQueueRef =
      "_workmeta/system/reports/rag/source_slice_review_queue/fixture_queue/source_slice_review_queue.json";
    await writeFixtureSourceSliceTriageRegister(repoRoot, triageRef);
    await writeFixtureSourceSliceReviewQueue(repoRoot, reviewQueueRef, triageRef);
    const sourceSliceResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph_source_slice_lens",
      ledgerRefs: "_workmeta/system/reports/knowledge_access/events.jsonl",
      ragManifestRefs: ragManifestRef,
      sourceSliceTriageRegisterRefs: triageRef,
      sourceSliceReviewQueueRefs: reviewQueueRef,
      now: "2026-05-22T02:00:00Z",
    });
    const sourceSliceGraph = JSON.parse(await readFile(path.join(repoRoot, sourceSliceResult.graph_ref), "utf8"));
    assert.equal(sourceSliceGraph.boundary.no_source_slice_payloads, true);
    assert.equal(sourceSliceGraph.source_refs.source_slice_triage_register_refs[0], triageRef);
    assert.equal(sourceSliceGraph.source_refs.source_slice_review_queue_refs[0], reviewQueueRef);
    assert.equal(sourceSliceGraph.graph_scope.source_surfaces.includes("explicit_source_slice_triage_register_refs"), true);
    assert.equal(sourceSliceGraph.source_slice_projection.schema_version, "soulforge.knowledge_graph_source_slice_projection.v0");
    assert.equal(sourceSliceGraph.source_slice_projection.boundary.no_source_text_loaded, true);
    assert.equal(sourceSliceGraph.source_slice_projection.boundary.no_index_build, true);
    assert.equal(sourceSliceGraph.source_slice_projection.matched_node_count, 2);
    assert.equal(sourceSliceGraph.source_slice_projection.totals.registered_metadata_count, 1);
    assert.equal(sourceSliceGraph.source_slice_projection.totals.owner_review_count, 1);
    assert.equal(sourceSliceGraph.source_slice_projection.totals.review_queue_item_count, 1);
    assert.equal(sourceSliceGraph.source_slice_projection.totals.stronger_permissions_default_false_count, 2);
    assert.equal(sourceSliceGraph.source_slice_projection.visibility_counts.registered_metadata_knowledge, 1);
    assert.equal(sourceSliceGraph.source_slice_projection.visibility_counts.owner_review_required, 1);
    const registeredSourceSliceNode = sourceSliceGraph.nodes.find((node) => node.node_ref === ".registry/knowledge/graph_rag");
    assert.equal(registeredSourceSliceNode.source_slice.registration_status, "registered_metadata_knowledge");
    assert.equal(registeredSourceSliceNode.source_slice.registered_metadata_count, 1);
    assert.equal(registeredSourceSliceNode.source_slice.stronger_permissions_default_false, true);
    assert.equal(Object.hasOwn(registeredSourceSliceNode.source_slice, "source_handles"), false);
    assert.equal(Object.hasOwn(registeredSourceSliceNode.source_slice, "source_locator_ref"), false);
    const reviewSourceSliceNode = sourceSliceGraph.nodes.find((node) => node.node_ref === ".registry/knowledge/isolated_note");
    assert.equal(reviewSourceSliceNode.source_slice.registration_status, "owner_review_required");
    assert.equal(reviewSourceSliceNode.source_slice.review_queue_item_count, 1);
    const sourceSliceHtml = await readFile(path.join(repoRoot, sourceSliceResult.html_ref), "utf8");
    assert.match(sourceSliceHtml, /id="sourceSliceMode"/);
    assert.match(sourceSliceHtml, /RAG 등록 상태/);
    assert.match(sourceSliceHtml, /metadata 등록 노드/);
    const sourceSliceGraphDataMatch = sourceSliceHtml.match(/<script id="graph-data" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(sourceSliceGraphDataMatch);
    const embeddedSourceSliceGraph = JSON.parse(sourceSliceGraphDataMatch[1]);
    assert.equal(embeddedSourceSliceGraph.source_slice_projection.node_overlay_count, 2);
    assert.doesNotMatch(
      sourceSliceGraphDataMatch[1],
      /"source_text"\s*:|"chunk_text"\s*:|"notebooklm_answer"\s*:|"raw_payload"\s*:|"source_handles"\s*:|"source_locator_ref"\s*:|\/Users\/|\/Volumes\//,
    );
    const sourceSliceBundle = await readFile(path.join(repoRoot, sourceSliceResult.bundle_ref), "utf8");
    assert.match(sourceSliceBundle, /sourceSliceNodePassesVisibility/);
    assert.match(sourceSliceBundle, /sourceSliceProjectionPresent/);
    assert.match(sourceSliceBundle, /node_not_in_source_slice_triage/);

    await writeFixtureSourceSliceTriageRegister(
      repoRoot,
      "_workmeta/system/reports/rag/source_slice_triage_register/bad_public_canon/source_slice_triage_register.json",
      { standingGrants: { public_canon: true } },
    );
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_source_slice_grant",
          sourceSliceTriageRegisterRefs:
            "_workmeta/system/reports/rag/source_slice_triage_register/bad_public_canon/source_slice_triage_register.json",
        }),
      /standing_policy_public_canon_must_not_be_granted/,
    );

    await writeFixtureSourceSliceTriageRegister(
      repoRoot,
      "_workmeta/system/reports/rag/source_slice_triage_register/bad_policy_source_text/source_slice_triage_register.json",
      { triagePolicy: { source_text_retrieval_allowed: true } },
    );
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_triage_policy_source_text",
          sourceSliceTriageRegisterRefs:
            "_workmeta/system/reports/rag/source_slice_triage_register/bad_policy_source_text/source_slice_triage_register.json",
        }),
      /triage_policy_source_text_must_not_be_allowed/,
    );

    await writeFixtureSourceSliceTriageRegister(
      repoRoot,
      "_workmeta/system/reports/rag/source_slice_triage_register/bad_source_text_excerpt/source_slice_triage_register.json",
      { extraRoot: { source_text_excerpt: "payload must be rejected" } },
    );
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_source_text_excerpt",
          sourceSliceTriageRegisterRefs:
            "_workmeta/system/reports/rag/source_slice_triage_register/bad_source_text_excerpt/source_slice_triage_register.json",
        }),
      /forbidden_payload_key_pattern/,
    );

    await writeFixtureSourceSliceReviewQueue(
      repoRoot,
      "_workmeta/system/reports/rag/source_slice_review_queue/bad_review_policy/source_slice_review_queue.json",
      triageRef,
      { reviewPolicy: { index_build_allowed: true } },
    );
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_review_policy",
          sourceSliceReviewQueueRefs:
            "_workmeta/system/reports/rag/source_slice_review_queue/bad_review_policy/source_slice_review_queue.json",
        }),
      /review_policy_index_build_must_not_be_allowed/,
    );

    await writeFixtureSourceSliceReviewQueue(
      repoRoot,
      "_workmeta/system/reports/rag/source_slice_review_queue/queue_only/source_slice_review_queue.json",
      triageRef,
      { nodeRef: ".registry/knowledge/graph_rag", sourceSliceRef: "source_slice:fixture_queue_only" },
    );
    const queueOnlyResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph_queue_only_source_slice",
      sourceSliceReviewQueueRefs:
        "_workmeta/system/reports/rag/source_slice_review_queue/queue_only/source_slice_review_queue.json",
    });
    const queueOnlyGraph = JSON.parse(await readFile(path.join(repoRoot, queueOnlyResult.graph_ref), "utf8"));
    const queueOnlyNode = queueOnlyGraph.nodes.find((node) => node.node_ref === ".registry/knowledge/graph_rag");
    assert.equal(queueOnlyNode.source_slice.stronger_permissions_default_false, true);
    assert.equal(queueOnlyGraph.source_slice_projection.totals.stronger_permissions_default_false_count, 1);

    await writeFixtureSourceSliceTriageRegister(
      repoRoot,
      "_workspaces/system/rag/source_slice_triage_register/bad_root/source_slice_triage_register.json",
    );
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_source_slice_root",
          sourceSliceTriageRegisterRefs:
            "_workspaces/system/rag/source_slice_triage_register/bad_root/source_slice_triage_register.json",
        }),
      /unsafe source slice triage register ref/,
    );

    await writeFixtureRagManifest(repoRoot, "_workspaces/system/rag/manifests/bad_boundary/rag_manifest.json", {
      boundary: { chunk_text_included: true },
    });
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_rag_boundary",
          ragManifestRefs: "_workspaces/system/rag/manifests/bad_boundary/rag_manifest.json",
        }),
      /rag_manifest_invalid/,
    );

    await writeFixtureRagManifest(repoRoot, "_workspaces/system/rag/manifests/bad_handle/rag_manifest.json", {
      sourceHandles: ["unknown_source_handle"],
    });
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_rag_handle",
          ragManifestRefs: "_workspaces/system/rag/manifests/bad_handle/rag_manifest.json",
        }),
      /retrieval_unit_unknown_source/,
    );

    await writeFixtureRagManifest(repoRoot, "_workspaces/system/rag/manifests/bad_handle_shape/rag_manifest.json", {
      sourceHandles: ["source handle prose"],
    });
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_rag_handle_shape",
          ragManifestRefs: "_workspaces/system/rag/manifests/bad_handle_shape/rag_manifest.json",
        }),
      /retrieval_unit_source_handle_unsafe/,
    );

    await writeFixtureRagManifest(repoRoot, "_workspaces/system/rag/manifests/bad_freshness_timestamp/rag_manifest.json", {
      freshness: { graph_generated_at_utc: "private prose timestamp" },
    });
    await assert.rejects(
      () =>
        exportKnowledgeGraph({
          repoRoot,
          exportId: "fixture_graph_bad_rag_freshness_timestamp",
          ragManifestRefs: "_workspaces/system/rag/manifests/bad_freshness_timestamp/rag_manifest.json",
        }),
      /freshness_graph_generated_at_utc_unsafe/,
    );

    const plan = await buildRetrievalPlan({
      repoRoot,
      graphRef: result.graph_ref,
      question: "GraphRAG multi-hop source-backed retrieval plan",
      maxNodes: 4,
      maxPaths: 6,
    });
    assert.equal(plan.schema_version, "soulforge.knowledge_graph_retrieval_plan.v0");
    assert.equal(plan.status, "metadata_only");
    assert.equal(plan.boundary.no_answer_generated, true);
    assert.equal(plan.boundary.no_source_text_loaded, true);
    assert.equal(plan.question.detected_modes.includes("multi_hop"), true);
    assert.equal(plan.question.detected_modes.includes("graph_vector_comparison"), true);
    assert.equal(plan.selected_node_ref, null);
    assert.equal(plan.selected_node, null);
    assert.equal(plan.display.mode, "question");
    assert.equal(plan.display.title, plan.detection_card.title);
    assert.equal(plan.input.question_text, "GraphRAG multi-hop source-backed retrieval plan");
    assert.equal(plan.input.max_source_refs, 20);
    assert.deepEqual(plan.candidate_nodes, plan.candidates);
    assert.equal(plan.candidates[0].node_ref, ".registry/knowledge/graph_rag");
    assert.equal(plan.candidates[0].is_selected, false);
    assert.equal(plan.candidates[0].claim_ceiling, "source_supported");
    assert.ok(plan.relation_paths.find((item) => item.to.node_ref === ".registry/knowledge/graph_rag"));
    const graphRagSourceRef = plan.source_refs.find((item) => item.ref === ".registry/knowledge/graph_rag/knowledge.yaml");
    assert.ok(graphRagSourceRef);
    assert.equal(Array.isArray(graphRagSourceRef.roles), true);
    assert.ok(graphRagSourceRef.referenced_by.includes(".registry/knowledge/graph_rag"));
    assert.ok(plan.missing_evidence.some((item) => item.includes("No vector/BM25 baseline")));
    assert.ok(plan.missing_evidence_items.some((item) => item.code === "no_vector_or_hybrid_retriever"));
    assert.ok(plan.missing_evidence.some((item) => item.includes("No source nodes")));
    assert.ok(plan.next_action_items.some((item) => item.code === "add_source_support_edges"));
    assert.equal(plan.detection_card.render_contract.candidates_from, "candidate_nodes");
    assert.equal(plan.detection_card.render_contract.relation_paths_from, "relation_paths");
    assert.equal(plan.detection_card.render_contract.missing_evidence_items_from, "missing_evidence_items");
    assert.equal(plan.detection_card.render_contract.next_action_items_from, "next_action_items");
    assert.equal(plan.detection_card.counts.candidate_nodes, plan.candidate_nodes.length);
    assert.equal(plan.detection_card.counts.source_refs, plan.source_refs.length);

    const selectedPlan = await buildRetrievalPlan({
      repoRoot,
      graphRef: result.graph_ref,
      question: "이 노드 기준으로 탐지 카드",
      nodeRef: ".registry/knowledge/graph_rag",
      maxNodes: 3,
      maxPaths: 6,
      maxSourceRefs: 2,
    });
    assert.equal(selectedPlan.selected_node_ref, ".registry/knowledge/graph_rag");
    assert.equal(selectedPlan.selected_node.node_ref, ".registry/knowledge/graph_rag");
    assert.equal(selectedPlan.selected_node.is_selected, true);
    assert.equal(selectedPlan.selected_node.match_reasons.includes("selected:node_ref"), true);
    assert.equal(selectedPlan.display.mode, "selected_node");
    assert.equal(selectedPlan.candidate_nodes[0].node_ref, ".registry/knowledge/graph_rag");
    assert.equal(selectedPlan.candidate_nodes[0].is_selected, true);
    assert.equal(selectedPlan.candidate_nodes[0].match_reasons.includes("selected:node_ref"), true);
    assert.equal(selectedPlan.detection_card.title, "탐지 카드: GraphRAG");
    assert.equal(selectedPlan.detection_card.focus_node_ref, ".registry/knowledge/graph_rag");
    assert.equal(selectedPlan.detection_card.claim_ceiling, "source_supported");
    assert.equal(selectedPlan.source_refs.length <= 2, true);
    assert.equal(selectedPlan.boundary.no_notebooklm_answers, true);
    assert.equal(selectedPlan.boundary.no_vector_search, true);
    const reviewRequest = buildKnowledgeGraphReviewRequest(selectedPlan);
    assert.equal(reviewRequest.schema_version, "soulforge.knowledge_graph_llm_review_request.v0");
    assert.equal(reviewRequest.model, DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL);
    assert.equal(reviewRequest.mode, "knowledge_graph_relation_candidate_review");
    assert.equal(reviewRequest.boundary.relation_candidates_only, true);
    assert.equal(reviewRequest.context.selected_node_ref, ".registry/knowledge/graph_rag");
    assert.equal(reviewRequest.context.candidate_nodes[0].node_ref, ".registry/knowledge/graph_rag");
    assert.match(reviewRequest.prompt, /관계 후보/);
    assert.match(reviewRequest.prompt, /owner approval/);
    assert.match(reviewRequest.prompt, /canon promotion/);
    assert.match(reviewRequest.prompt, /apply_now/);

    const isolatedPlan = await buildRetrievalPlan({
      repoRoot,
      graphRef: result.graph_ref,
      nodeRef: ".registry/knowledge/isolated_note",
      maxNodes: 3,
      maxPaths: 6,
    });
    assert.equal(isolatedPlan.question.text, "");
    assert.equal(isolatedPlan.selected_node_ref, ".registry/knowledge/isolated_note");
    assert.equal(isolatedPlan.candidate_nodes[0].node_ref, ".registry/knowledge/isolated_note");
    assert.equal(isolatedPlan.relation_paths.length, 0);
    assert.ok(isolatedPlan.missing_evidence.some((item) => item.includes("Selected node has no relation paths")));
    assert.ok(isolatedPlan.missing_evidence_items.some((item) => item.code === "selected_node_no_relation_paths"));
    assert.ok(isolatedPlan.next_actions.some((item) => item.includes("selected node")));
    assert.ok(isolatedPlan.next_action_items.some((item) => item.code === "add_selected_node_relation_edges"));

    await assert.rejects(
      () =>
        buildRetrievalPlan({
          repoRoot,
          graphRef: "missing/graph.json",
          question: "GraphRAG",
        }),
      /explicit --graph-ref was not found/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeFixtureRagManifest(repoRoot, relativePath, overrides = {}) {
  const manifest = {
    schema_version: "soulforge.rag_manifest.v0",
    kind: "rag_manifest",
    status: "draft",
    manifest_id: "fixture_rag_manifest",
    generator_id: "fixture",
    generated_at_utc: "2026-05-22T02:30:00Z",
    scope: {
      owner_surface: "guild_hall/rag",
      project_code: null,
      allowed_use: "metadata_navigation",
      source_surfaces: ["public_canon", "explicit_rag_manifest_refs"],
      lens_profile_ids: ["rag_knowledge_readiness", "soulforge_balance"],
    },
    source_refs: {
      graph_ref: "_workspaces/system/knowledge_view/graph_export/fixture_graph/graph.json",
      graph_loaded_from: "generated_graph_json",
      snapshot_ref: null,
      source_ledger_refs: [],
      packet_map_refs: [],
      knowledge_access_ledger_refs: [],
    },
    freshness: {
      graph_export_id: "fixture_graph",
      graph_generated_at_utc: "2026-05-22T02:00:00Z",
      graph_source_hash: "fixture_hash",
      snapshot_source_observations_fingerprint: null,
      ...(overrides.freshness ?? {}),
    },
    boundary: {
      metadata_only: true,
      source_payloads_included: false,
      chunk_text_included: false,
      node_metadata_included: true,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
      answer_generation_allowed: "metadata_only",
      ...(overrides.boundary ?? {}),
    },
    lens_profiles: [
      {
        lens_id: "rag_knowledge_readiness",
        title: "RAG Knowledge Readiness",
        purpose: "Show metadata-only source, claim, graph, and retrieval readiness.",
        node_types: ["knowledge", "source", "validation", "workflow", "party"],
        relation_types: ["supports", "derived_from", "uses", "routes_to"],
      },
      {
        lens_id: "soulforge_balance",
        title: "Soulforge Balance",
        purpose: "Show whole-system balance across canon, workflow, party, unit, model, and knowledge surfaces.",
        node_types: ["knowledge", "workflow", "party", "species", "class", "unit"],
        relation_types: ["uses", "recommends", "routes_to", "chains", "has_species", "has_class"],
      },
    ],
    sources: [
      {
        source_handle: "source_fixture_graph_rag",
        title_label: "knowledge.yaml",
        source_kind: "repo_metadata_ref",
        source_class: "metadata_only",
        warehouse_state: "observed",
        storage_locator: ".registry/knowledge/graph_rag/knowledge.yaml",
        version: null,
        source_hash: "fixture_source_hash",
        owner_approval: "public_canon_or_explicit_metadata",
        sensitivity: "public_safe_metadata",
        notebooklm_use: "not_included",
        review_state: { claim_ceiling: "source_supported" },
        tags: { domains: [], projects: [], organizations: [] },
        audit: { created_at_utc: null, updated_at_utc: null },
      },
    ],
    retrieval_units: [
      {
        unit_ref: "graph_node:.registry/knowledge/graph_rag",
        unit_type: "graph_node_metadata",
        graph_node_ref: ".registry/knowledge/graph_rag",
        source_handles: overrides.sourceHandles ?? ["source_fixture_graph_rag"],
        title_label: "GraphRAG",
        summary: "GraphRAG combines graph navigation with retrieval readiness.",
        node_type: "knowledge",
        owner_surface: ".registry/knowledge",
        claim_ceiling: "source_supported",
        lifecycle_status: "active",
        retrieval: {
          status: "metadata_only",
          allowed_for_retrieval: true,
          allowed_modes: ["metadata_graph_answer"],
          blocker_code: null,
          next_owner_action_ref: null,
        },
        payload_state: "not_in_manifest",
        content_hash_or_null: "fixture_content_hash",
        token_count_or_null: 4,
      },
      {
        unit_ref: "graph_node:.registry/knowledge/isolated_note",
        unit_type: "graph_node_metadata",
        graph_node_ref: ".registry/knowledge/isolated_note",
        source_handles: [],
        title_label: "Isolated Note",
        summary: null,
        node_type: "knowledge",
        owner_surface: ".registry/knowledge",
        claim_ceiling: "rejected_or_blocked",
        lifecycle_status: "active",
        retrieval: {
          status: "blocked",
          allowed_for_retrieval: false,
          allowed_modes: ["metadata_graph_answer"],
          blocker_code: "fixture_blocked",
          next_owner_action_ref: null,
        },
        payload_state: "not_in_manifest",
        content_hash_or_null: "fixture_blocked_hash",
        token_count_or_null: 2,
      },
    ],
    graph_bindings: [],
    indexes: [],
    validation: { status: "unchecked", blockers: [] },
  };
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function writeFixtureSourceSliceTriageRegister(repoRoot, relativePath, overrides = {}) {
  const grants = {
    metadata_knowledge: true,
    source_text_retrieval: false,
    index_build: false,
    notebooklm_packet: false,
    public_canon: false,
    ...(overrides.standingGrants ?? {}),
  };
  const register = {
    schema_version: "soulforge.source_slice_triage_register.v0",
    kind: "source_slice_triage_register",
    status: "metadata_only",
    register_id: "fixture_register",
    generator_id: "fixture",
    generated_at_utc: "2026-05-22T02:40:00Z",
    source_refs: {
      source_slice_ref: "_workspaces/system/rag/source_slice_cards/fixture/source_slice_cards.json",
      slice_set_id: "fixture_source_slices",
      manifest_ref: "_workspaces/system/rag/manifests/fixture_manifest/rag_manifest.json",
      manifest_id: "fixture_rag_manifest",
      graph_ref: "_workspaces/system/knowledge_view/graph_export/fixture_graph/graph.json",
    },
    triage_policy: {
      purpose: "apply_existing_wiki_intake_criteria_to_rag_metadata_knowledge",
      source_policy_ref: "docs/architecture/workspace/examples/llm_wiki_bookshelf/canonical_source_intake_checklist.md",
      standing_owner_policy: {
        policy_ref: "standing_owner_policy:rag_source_slice_metadata_v0",
        owner_defined_criteria_are_policy: true,
        auto_register_passed_metadata: true,
        stronger_permissions_default_false: true,
        grants,
      },
      metadata_knowledge_registration_allowed: true,
      register_is_not_owner_approval: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
      ...(overrides.triagePolicy ?? {}),
    },
    counts: {
      card_count: 2,
      registered_count: 1,
      owner_review_count: 1,
      blocked_count: 0,
      route_counts: { registered_metadata_knowledge: 1, owner_review_required: 1 },
      sensitivity_counts: { public_safe_metadata: 2 },
      claim_ceiling_counts: { observed: 2 },
    },
    registered_items: [
      sourceSliceTriageItem({
        nodeRef: ".registry/knowledge/graph_rag",
        sourceHandle: "source_fixture_graph_rag",
        sourceSliceRef: "source_slice:fixture_graph_rag",
        triageItemRef: "source_slice_triage:fixture_graph_rag",
        sourceLocatorRef: ".registry/knowledge/graph_rag/knowledge.yaml",
        route: "registered_metadata_knowledge",
        result: "accepted_for_metadata_knowledge",
        registrationScope: "rag_metadata_knowledge_only",
      }),
    ],
    owner_review_items: [
      sourceSliceTriageItem({
        nodeRef: ".registry/knowledge/isolated_note",
        sourceHandle: "source_fixture_isolated_note",
        sourceSliceRef: "source_slice:fixture_isolated_note",
        triageItemRef: "source_slice_triage:fixture_isolated_note",
        sourceLocatorRef: ".registry/knowledge/isolated_note/knowledge.yaml",
        route: "owner_review_required",
        result: "owner_review_required",
        registrationScope: "not_registered",
      }),
    ],
    blocked_items: [],
    boundary: {
      metadata_only: true,
      source_payloads_included: false,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
      register_is_not_owner_approval: true,
      register_applies_no_source_text_decisions: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      ...(overrides.boundary ?? {}),
    },
    ...(overrides.extraRoot ?? {}),
  };
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(register, null, 2)}\n`, "utf8");
}

async function writeFixtureSourceSliceReviewQueue(repoRoot, relativePath, triageRef, overrides = {}) {
  const nodeRef = overrides.nodeRef ?? ".registry/knowledge/isolated_note";
  const sourceSliceRef = overrides.sourceSliceRef ?? "source_slice:fixture_isolated_note";
  const queue = {
    schema_version: "soulforge.source_slice_review_queue.v0",
    kind: "source_slice_review_queue",
    status: "metadata_only",
    queue_id: "fixture_queue",
    generator_id: "fixture",
    generated_at_utc: "2026-05-22T02:45:00Z",
    source_refs: {
      source_slice_ref: "_workspaces/system/rag/source_slice_cards/fixture/source_slice_cards.json",
      triage_register_ref: triageRef,
      register_id: "fixture_register",
      slice_set_id: "fixture_source_slices",
      manifest_ref: "_workspaces/system/rag/manifests/fixture_manifest/rag_manifest.json",
      manifest_id: "fixture_rag_manifest",
      graph_ref: "_workspaces/system/knowledge_view/graph_export/fixture_graph/graph.json",
    },
    review_policy: {
      purpose: "owner_source_slice_decision_preparation_for_triage_holds",
      metadata_only: true,
      queue_is_not_owner_approval: true,
      queue_applies_no_decisions: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      allowed_next_actions: ["owner_approve_hold_or_block"],
      ...(overrides.reviewPolicy ?? {}),
    },
    counts: {
      card_count: 2,
      item_count: 1,
      decision_counts: { pending_owner_review: 1 },
      sensitivity_counts: { public_safe_metadata: 1 },
      priority_counts: { needs_owner_review: 1 },
    },
    items: [
      {
        review_item_ref: "source_slice_review:fixture_isolated_note",
        source_slice_ref: sourceSliceRef,
        source_handle: "source_fixture_isolated_note",
        source_locator_ref: ".registry/knowledge/isolated_note/knowledge.yaml",
        sensitivity: "public_safe_metadata",
        owner_approval_observed: "unknown",
        claim_ceiling: "observed",
        card_status: "candidate",
        card_index_readiness_status: "triage_owner_review_required",
        covered_graph_node_count: 1,
        covered_graph_node_refs: [nodeRef],
        blocker_codes: ["owner_source_slice_approval_required"],
        triage_item_ref: "source_slice_triage:fixture_isolated_note",
        triage_route: "owner_review_required",
        review_priority: "needs_owner_review",
        status: "pending_owner_review",
        decision: {
          status: "pending_owner_review",
          recommended_decision: "private_review_required",
          applied_decision: "none",
          owner_approval_granted: false,
          source_text_retrieval_allowed: false,
          index_build_allowed: false,
          allowed_next_actions: ["owner_approve_hold_or_block"],
          required_evidence_refs: [],
        },
        metadata_fingerprint: "fixture_review_hash",
        card_metadata_fingerprint: "fixture_card_hash",
      },
    ],
    boundary: {
      metadata_only: true,
      source_payloads_included: false,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
      queue_is_not_owner_approval: true,
      queue_applies_no_decisions: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
    },
  };
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

function sourceSliceTriageItem({
  nodeRef,
  sourceHandle,
  sourceSliceRef,
  triageItemRef,
  sourceLocatorRef,
  route,
  result,
  registrationScope,
}) {
  return {
    triage_item_ref: triageItemRef,
    source_slice_ref: sourceSliceRef,
    source_handle: sourceHandle,
    source_locator_ref: sourceLocatorRef,
    source_hash: "fixture_source_hash",
    source_kind: "repo_metadata_ref",
    source_class: "metadata_only",
    warehouse_state: "observed",
    sensitivity: "public_safe_metadata",
    owner_approval_observed: "public_canon_or_explicit_metadata",
    claim_ceiling: "observed",
    card_status: "candidate",
    covered_graph_node_count: 1,
    covered_graph_node_refs: [nodeRef],
    blocker_codes: ["index_not_built", "owner_source_slice_approval_required", "source_text_not_loaded"],
    criteria_result: {
      result,
      route,
      registration_scope: registrationScope,
      claim_ceiling: "observed",
      criteria_passed: ["source_identity", "storage_locator_safe", "payload_boundary"],
      criteria_failed: route === "owner_review_required" ? ["owner_review_needed"] : [],
      evidence_refs: [
        "docs/architecture/workspace/examples/llm_wiki_bookshelf/canonical_source_intake_checklist.md",
        "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md",
      ],
      boundary_contract: {
        metadata_only: true,
        allowed_for_rag_metadata_answer: route === "registered_metadata_knowledge",
        allowed_for_source_text_retrieval: false,
        allowed_for_index_build: false,
        allowed_for_notebooklm_packet: false,
        applied_owner_decision: false,
        public_canon_promotion_allowed: false,
      },
    },
    metadata_fingerprint: "fixture_triage_hash",
    card_metadata_fingerprint: "fixture_card_hash",
  };
}

async function writeFixtureRepo(repoRoot) {
  await writeYaml(repoRoot, ".registry/knowledge/source_criticism/knowledge.yaml", {
    knowledge_id: "source_criticism",
    kind: "knowledge",
    status: "active",
    title: "Source Criticism",
  });
  await writeYaml(repoRoot, ".registry/knowledge/graph_rag/knowledge.yaml", {
    knowledge_id: "graph_rag",
    kind: "knowledge",
    status: "active",
    title: "GraphRAG",
    claim_ceiling: "source_supported",
  });
  await writeYaml(repoRoot, ".registry/knowledge/isolated_note/knowledge.yaml", {
    knowledge_id: "isolated_note",
    kind: "knowledge",
    status: "active",
    title: "Isolated Note",
    claim_ceiling: "observed",
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
    assign: [
      { assign: "source_criticism", ref: "source_criticism" },
      { assign: "graph_rag", ref: "graph_rag" },
    ],
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
