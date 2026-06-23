import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildMasterKnowledgeInventoryRefresh,
  validateMasterKnowledgeInventoryRefresh,
  writeMasterKnowledgeInventoryRefresh,
} from "./master_inventory_refresh.mjs";

test("master inventory refresh writes metadata-only inventory, triage, and selection", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-master-inventory-"));
  try {
    await writeFixtureRepo(repoRoot);
    const refresh = await buildMasterKnowledgeInventoryRefresh({
      repoRoot,
      date: "2026-06-14",
      notebooklmMetadataRef:
        "_workmeta/system/reports/knowledge_wiki/master_knowledge_inventory_reconcile_20260613/notebooklm_metadata_inventory.json",
    });

    assert.equal(refresh.status, "ready");
    assert.equal(refresh.summary.summary.public_knowledge_entries, 2);
    assert.equal(refresh.summary.summary.candidate_ledger_rows, 2);
    assert.equal(refresh.summary.summary.notebooklm_notebooks, 1);
    assert.equal(refresh.summary.summary.notebooklm_sources, 1);
    assert.equal(refresh.sourcebound_review_selection.selected_candidate.candidate_id, "knowledge_rag_candidate_d61cccdecf50b676");
    assert.equal(refresh.inventory.boundary.source_text_read, false);
    assert.equal(refresh.inventory.boundary.notebooklm_upload_or_query_executed, false);
    assert.equal(validateMasterKnowledgeInventoryRefresh(refresh).status, "pass");

    const written = await writeMasterKnowledgeInventoryRefresh({
      repoRoot,
      date: "2026-06-14",
      notebooklmMetadataRef:
        "_workmeta/system/reports/knowledge_wiki/master_knowledge_inventory_reconcile_20260613/notebooklm_metadata_inventory.json",
    });
    assert.equal(written.status, "written");
    assert.equal(written.selected_sourcebound_candidate_id, "knowledge_rag_candidate_d61cccdecf50b676");

    const csv = await readFile(path.join(repoRoot, written.artifacts.master_inventory_csv_ref), "utf8");
    assert.match(csv, /knowledge_rag_candidate_d61cccdecf50b676/u);
    const triage = JSON.parse(await readFile(path.join(repoRoot, written.artifacts.candidate_priority_triage_ref), "utf8"));
    assert.equal(triage.by_priority_lane.immediate_sourcebound_review, 1);
    assert.equal(triage.by_priority_lane.hold_or_monitor, 1);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("master inventory refresh accepts project ledger root and scan roots", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-project-master-inventory-"));
  try {
    await writeFixtureRepo(repoRoot);
    await writeText(
      repoRoot,
      "_workmeta/P26-014/knowledge_rag_candidate_ledger/events/2026-06.jsonl",
      [
        JSON.stringify({
          schema_version: "soulforge.knowledge_rag_candidate.v0",
          kind: "knowledge_rag_candidate",
          candidate_id: "knowledge_rag_candidate_19144524497a60df",
          created_at: "2026-06-23T14:10:53Z",
          project_code: "P26-014",
          source_context_ref: "_workmeta/P26-014/runs/sonar2093_corrected_basis_knowledge_capture_20260623/ingest_scope_packet.yaml",
          candidate_kind: "knowledge_trigger",
          short_reason: "SONAR 2093 corrected basis and roll CFD need private wiki and RAG metadata capture.",
          suggested_route: "sourcebound_review_candidate",
          claim_ceiling: "observed",
          missing_inputs: ["owner_decision_before_source_text_index"],
          owner_question: "Route this packet?",
          status: "accepted_for_review",
          boundary: { metadata_only: true },
        }),
        "",
      ].join("\n"),
    );
    await writeText(
      repoRoot,
      "_workmeta/P26-014/runs/sonar2093_corrected_basis_knowledge_capture_20260623/compiled_projection/index.md",
      "# SONAR 2093 Corrected Basis\n",
    );

    const refresh = await buildMasterKnowledgeInventoryRefresh({
      repoRoot,
      date: "2026-06-23",
      inventoryId: "p26_014_master_knowledge_inventory_reconcile_20260623",
      outputRootRef: "_workmeta/P26-014/reports/knowledge_wiki",
      ledgerRootRef: "_workmeta/P26-014/knowledge_rag_candidate_ledger/events",
      scanRoots: ["_workmeta/P26-014"],
    });

    assert.equal(refresh.status, "ready");
    assert.equal(refresh.summary.summary.candidate_ledger_rows, 1);
    assert.equal(refresh.sourcebound_review_selection.selected_candidate.candidate_id, "knowledge_rag_candidate_19144524497a60df");
    assert.match(refresh.sourcebound_review_selection.selected_candidate.title, /SONAR 2093 corrected basis/u);
    assert.deepEqual(refresh.sourcebound_review_selection.selected_candidate.required_before_import, ["owner_decision_before_source_text_index"]);
    assert.ok(refresh.summary.summary.scan.scanned_roots.includes("_workmeta/P26-014"));
    assert.equal(validateMasterKnowledgeInventoryRefresh(refresh).status, "pass");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

async function writeFixtureRepo(repoRoot) {
  await writeText(
    repoRoot,
    ".registry/knowledge/graph_rag/knowledge.yaml",
    [
      "knowledge_id: graph_rag",
      "kind: knowledge",
      "status: active",
      "title: GraphRAG",
      "summary: Graph-assisted retrieval.",
      "claim_ceiling: source_supported",
      "focus:",
      "  primary_domain: retrieval",
      "  applied_to:",
      "    - graph retrieval",
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    ".registry/knowledge/boundary_governance/knowledge.yaml",
    [
      "knowledge_id: boundary_governance",
      "kind: knowledge",
      "status: active",
      "title: Boundary Governance",
      "summary: Boundary separation.",
      "claim_ceiling: observed",
      "focus:",
      "  primary_domain: governance",
      "  applied_to:",
      "    - reviews",
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl",
    [
      JSON.stringify({
        schema_version: "soulforge.knowledge_rag_candidate.v0",
        kind: "knowledge_rag_candidate",
        candidate_id: "knowledge_rag_candidate_d61cccdecf50b676",
        created_at: "2026-06-14T06:29:27Z",
        project_code: "system",
        source_context_ref: "_workmeta/system/reports/procedure_capture/sonar_erp_calculator_research_20260614.md",
        candidate_kind: "manual_candidate",
        short_reason: "Sonar ERP calculator seed.",
        suggested_route: "sourcebound_review_candidate",
        claim_ceiling: "observed",
        missing_inputs: ["source_packet_curation"],
        owner_question: "Review?",
        status: "open",
        boundary: { metadata_only: true },
      }),
      JSON.stringify({
        schema_version: "soulforge.knowledge_rag_candidate.v0",
        kind: "knowledge_rag_candidate",
        candidate_id: "knowledge_rag_candidate_b97554eddf58b15c",
        created_at: "2026-06-14T04:29:36Z",
        project_code: "system",
        source_context_ref: "_workmeta/system/reports/procedure_capture/knowledge_rag_llm_wiki_gap_audit_20260614.md",
        candidate_kind: "owner_decision_gap",
        short_reason: "RAG metadata refresh workflow lacks aggregate runner.",
        suggested_route: "owner_decision_needed",
        claim_ceiling: "observed",
        missing_inputs: ["refresh_runner_scope_decision"],
        owner_question: "Build runner?",
        status: "open",
        boundary: { metadata_only: true },
      }),
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    "_workmeta/system/reports/knowledge_wiki/master_knowledge_inventory_reconcile_20260613/notebooklm_metadata_inventory.json",
    JSON.stringify(
      {
        schema_version: "soulforge.notebooklm_metadata_inventory.v0",
        generated_at_utc: "2026-06-13T00:00:00Z",
        boundary: {
          metadata_only: true,
          notebooklm_answers_included: false,
          source_payloads_included: false,
          raw_questions_included: false,
          secrets_included: false,
        },
        available: true,
        notebooks: [
          {
            notebook_id: "nb_fixture",
            title: "Fixture Notebook",
            group: "fixture",
            source_count_declared: 1,
          },
        ],
        sources: [
          {
            notebook_id: "nb_fixture",
            source_id: "src_fixture",
            title: "Fixture Source",
            group: "fixture",
          },
        ],
        groups: {
          fixture: {
            notebooks: 1,
            sources: 1,
            errors: 0,
          },
        },
        errors: [],
      },
      null,
      2,
    ),
  );
}

async function writeText(repoRoot, ref, value) {
  const filePath = path.join(repoRoot, ref);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}
