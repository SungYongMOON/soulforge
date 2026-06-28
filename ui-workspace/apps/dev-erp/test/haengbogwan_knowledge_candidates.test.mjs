import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runProjectContextKnowledgeCandidateUpdate,
} from "../tools/haengbogwan_knowledge_candidates.mjs";

function makeTempRepo() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-knowledge-candidates-"));
  return {
    root,
    workmetaRoot: join(root, "_workmeta"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function contextReport() {
  return {
    apply: true,
    accepted_event_count: 3,
    incoming_counts: { sources: 3, review_queue: 2 },
    total_counts: { sources: 3, review_queue: 2, branch_summaries: 2 },
  };
}

test("HAENGBOGWAN-KNOWLEDGE-CANDIDATES: appends metadata-only candidate after context apply", () => {
  const tmp = makeTempRepo();
  try {
    const result = runProjectContextKnowledgeCandidateUpdate({
      repoRoot: tmp.root,
      workmetaRoot: tmp.workmetaRoot,
      projectCode: "P26-014",
      contextReport: contextReport(),
      generatedAt: "2026-06-28T04:00:00.000Z",
      apply: true,
    });
    assert.equal(result.appended_count, 1);
    assert.equal(result.ledger_ref, "_workmeta/P26-014/knowledge_rag_candidate_ledger/events/2026-06.jsonl");
    const ledger = readFileSync(join(tmp.root, result.ledger_ref), "utf8");
    const row = JSON.parse(ledger.trim());
    assert.equal(row.project_code, "P26-014");
    assert.equal(row.suggested_route, "owner_decision_needed");
    assert.equal(row.boundary.metadata_only, true);
    assert.equal(row.boundary.rag_ingestion_executed, false);
    assert.equal(JSON.stringify(row).includes("body_text"), false);
    assert.equal(JSON.stringify(row).includes(tmp.root), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-KNOWLEDGE-CANDIDATES: duplicate candidate ids are not appended twice", () => {
  const tmp = makeTempRepo();
  try {
    const first = runProjectContextKnowledgeCandidateUpdate({
      repoRoot: tmp.root,
      workmetaRoot: tmp.workmetaRoot,
      projectCode: "P26-014",
      contextReport: contextReport(),
      generatedAt: "2026-06-28T04:00:00.000Z",
      apply: true,
    });
    const second = runProjectContextKnowledgeCandidateUpdate({
      repoRoot: tmp.root,
      workmetaRoot: tmp.workmetaRoot,
      projectCode: "P26-014",
      contextReport: contextReport(),
      generatedAt: "2026-06-28T04:10:00.000Z",
      apply: true,
    });
    assert.equal(first.appended_count, 1);
    assert.equal(second.appended_count, 0);
    assert.equal(second.skipped_duplicate_count, 1);
    const rows = readFileSync(join(tmp.root, first.ledger_ref), "utf8").trim().split(/\r?\n/);
    assert.equal(rows.length, 1);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-KNOWLEDGE-CANDIDATES: skips when context was not applied", () => {
  const tmp = makeTempRepo();
  try {
    const result = runProjectContextKnowledgeCandidateUpdate({
      repoRoot: tmp.root,
      workmetaRoot: tmp.workmetaRoot,
      projectCode: "P26-014",
      contextReport: { ...contextReport(), apply: false },
      generatedAt: "2026-06-28T04:00:00.000Z",
      apply: true,
    });
    assert.equal(result.skipped_reason, "context_not_applied");
    assert.equal(result.appended_count, 0);
  } finally {
    tmp.cleanup();
  }
});
