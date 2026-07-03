import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildKnowledgeRagCandidate } from "../knowledge_access/knowledge_rag_candidate_ledger.mjs";
import {
  buildKnowledgeApprovedBuildRun,
  buildKnowledgeWeeklyTriageReport,
  validateKnowledgeApprovedBuildRun,
  validateKnowledgeWeeklyTriageReport,
  writeKnowledgeApprovedBuildRun,
  writeKnowledgeWeeklyTriageReport,
} from "./knowledge_pipeline_automation.mjs";

test("approved build runner writes index after owner-approved source-card mapping and skips existing index", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-pipeline-"));
  try {
    const accepted = candidate({
      createdAt: "2026-07-01T00:00:00Z",
      status: "accepted_for_review",
      shortReason: "Approved fixture knowledge needs source-text indexing.",
    });
    await writeCandidateLedger(repoRoot, [accepted]);
    await writeSourceCard(repoRoot, {
      sourceId: "fixture_approved",
      approvalStatus: "owner_approved_local_source_text_ready",
      text: "Approved fixture knowledge.\n\nSecond paragraph for chunk coverage.\n",
    });

    const mapping = `${accepted.candidate_id}=_workspaces/knowledge/source_cards/fixture_approved.source_card.json`;
    const dryRun = await buildKnowledgeApprovedBuildRun({
      repoRoot,
      date: "2026-07-03",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
      candidateSourceCardRefs: [mapping],
    });

    assert.equal(dryRun.run.mode, "dry_run");
    assert.equal(dryRun.run.summary.planned_count, 1);
    assert.equal(dryRun.run.rows[0].projected_state, "approved_pending_index");
    assert.equal(validateKnowledgeApprovedBuildRun(dryRun.run).status, "pass");

    const written = await writeKnowledgeApprovedBuildRun({
      repoRoot,
      date: "2026-07-03",
      runId: "fixture_approved_build",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
      candidateSourceCardRefs: [mapping],
    });

    assert.equal(written.status, "written");
    assert.equal(written.summary.indexed_count, 1);

    const eventLedger = await readFile(
      path.join(repoRoot, "_workmeta/system/knowledge_pipeline_automation/build_events/2026-07.jsonl"),
      "utf8",
    );
    assert.match(eventLedger, /"event_type":"index_build_written"/u);

    const indexJson = JSON.parse(await readFile(
      path.join(repoRoot, "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_approved_source_text_index/source_text_index.json"),
      "utf8",
    ));
    assert.equal(indexJson.status, "ready");
    assert.equal(indexJson.boundary.storage_scope, "_workspaces_private_payload");

    const skipRun = await buildKnowledgeApprovedBuildRun({
      repoRoot,
      date: "2026-07-03",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
      candidateSourceCardRefs: [mapping],
    });
    assert.equal(skipRun.run.summary.skipped_existing_count, 1);
    assert.equal(skipRun.run.rows[0].projected_state, "index_skipped_existing");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("approved build runner blocks candidate source cards that still need owner approval", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-pipeline-block-"));
  try {
    const accepted = candidate({
      createdAt: "2026-07-01T00:00:00Z",
      status: "accepted_for_review",
      shortReason: "Candidate fixture still needs source approval.",
    });
    await writeCandidateLedger(repoRoot, [accepted]);
    await writeSourceCard(repoRoot, {
      sourceId: "fixture_candidate",
      approvalStatus: "candidate_source_text_ready_owner_review_required",
      text: "Candidate fixture knowledge.\n",
    });

    const run = await buildKnowledgeApprovedBuildRun({
      repoRoot,
      date: "2026-07-03",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
      candidateSourceCardRefs: [
        `${accepted.candidate_id}=_workspaces/knowledge/source_cards/fixture_candidate.source_card.json`,
      ],
    });

    assert.equal(run.run.summary.blocked_after_acceptance_count, 1);
    assert.equal(run.run.rows[0].projected_state, "blocked_after_acceptance");
    assert.deepEqual(run.run.rows[0].blockers, ["source_card_owner_approval_missing"]);
    assert.equal(validateKnowledgeApprovedBuildRun(run.run).status, "pass");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("weekly triage report includes six open P26-014 candidates and owner one-click commands", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-triage-"));
  try {
    const rows = [];
    for (let index = 1; index <= 6; index += 1) {
      rows.push(candidate({
        createdAt: `2026-06-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
        status: "open",
        shortReason: `Open P26 fixture knowledge candidate ${index}.`,
        candidateKind: index % 2 === 0 ? "completion_knowledge" : "knowledge_trigger",
        missingInputs: ["owner_decision_before_source_text_index"],
      }));
    }
    rows.push(candidate({
      createdAt: "2026-06-20T00:00:00Z",
      status: "accepted_for_review",
      shortReason: "Accepted P26 fixture knowledge candidate.",
    }));
    await writeCandidateLedger(repoRoot, rows);

    const built = await buildKnowledgeWeeklyTriageReport({
      repoRoot,
      date: "2026-07-03",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
    });

    assert.equal(built.report.summary.p26_014_open_candidate_count, 6);
    assert.equal(built.report.open_items.length, 6);
    assert.equal(built.report.owner_one_click_procedure.commands.length, 6);
    assert.equal(built.report.boundary.source_text_index_built, false);
    assert.equal(validateKnowledgeWeeklyTriageReport(built.report).status, "pass");

    const written = await writeKnowledgeWeeklyTriageReport({
      repoRoot,
      date: "2026-07-03",
      reportId: "fixture_weekly_triage",
      ledgerRootRefs: ["_workmeta/P26-014/knowledge_rag_candidate_ledger/events"],
    });

    const markdown = await readFile(path.join(repoRoot, written.report_md_ref), "utf8");
    assert.match(markdown, /P26-014 open candidates: 6/u);
    assert.match(markdown, /candidate-ledger-append/u);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

function candidate(options = {}) {
  return buildKnowledgeRagCandidate({
    createdAt: options.createdAt,
    projectCode: "P26-014",
    sourceContextRef: "_workmeta/P26-014/reports/procedure_capture/knowledge_candidate.md",
    candidateKind: options.candidateKind ?? "knowledge_trigger",
    shortReason: options.shortReason,
    suggestedRoute: "sourcebound_review_candidate",
    claimCeiling: "observed",
    missingInputs: options.missingInputs ?? ["owner_decision_before_source_text_index"],
    ownerQuestion: "Accept this metadata-only candidate for review?",
    status: options.status,
  });
}

async function writeCandidateLedger(repoRoot, rows) {
  await writeText(
    repoRoot,
    "_workmeta/P26-014/knowledge_rag_candidate_ledger/events/2026-07.jsonl",
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
}

async function writeSourceCard(repoRoot, { sourceId, approvalStatus, text }) {
  const sourceRef = `_workspaces/knowledge/common/${sourceId}/derived_text/${sourceId}.md`;
  await writeText(repoRoot, sourceRef, text);
  await writeJson(repoRoot, `_workspaces/knowledge/source_cards/${sourceId}.source_card.json`, {
    schema_version: "soulforge.knowledge_source_card.v0",
    source_id: sourceId,
    title: `Fixture source ${sourceId}`,
    source_ref: {
      repo_relative_path: sourceRef,
    },
    source_kind: "owner_approved_local_source_machine_extracted_markdown",
    domains: ["fixture"],
    sensitivity: "private_fixture",
    approval_status: approvalStatus,
    authority: {
      source_is_approved_knowledge_reference: approvalStatus.startsWith("owner_approved_"),
      approval_basis: "fixture_owner_approval",
      source_canon_status: "fixture_not_public_canon",
      derived_extraction_requires_quality_check: false,
      answer_runs_require_source_citation: true,
    },
    origin: {
      publisher: "fixture",
    },
    rag_permissions: {
      scope: "this_source_only",
      source_text_retrieval: true,
      index_build: true,
      answer_synthesis: true,
    },
    public_canon_promotion_allowed: false,
    notebooklm_packet_allowed: false,
    claim_ceiling: "observed",
    boundary: {
      repo_relative_paths_only: true,
      runtime_absolute_paths_allowed: false,
      source_payload_contains_project_raw_material: false,
      source_payload_contains_secret: false,
      derived_outputs_are_authority: false,
      notebooklm_is_authority: false,
      owner_review_required_before_external_upload_or_canon: true,
      public_source_payload_not_stored_in_public_repo: true,
    },
    derived_output_policy: {
      derived_text_allowed: true,
      index_output_allowed: true,
      allowed_output_root: "_workspaces/knowledge/rag",
      requires_source_ref_backlink: true,
      requires_rebuildable_output: true,
    },
  });
}

async function writeJson(repoRoot, ref, value) {
  await writeText(repoRoot, ref, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(repoRoot, ref, value) {
  const target = path.join(repoRoot, ref);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}
