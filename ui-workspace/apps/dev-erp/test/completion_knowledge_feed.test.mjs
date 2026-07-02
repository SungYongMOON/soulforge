import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import {
  runCompletionKnowledgeFeed,
} from "../tools/completion_knowledge_feed.mjs";

function makeFixture({ project = "P26-014", makeProject = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sf-completion-knowledge-feed-"));
  const dbPath = join(root, "dev-erp.db");
  const workmetaRoot = join(root, "_workmeta");
  const cursorPath = join(root, "completion_knowledge_cursor.json");
  if (makeProject) mkdirSync(join(workmetaRoot, project), { recursive: true });
  const store = openStore(dbPath);
  return {
    root,
    dbPath,
    workmetaRoot,
    cursorPath,
    store,
    cleanup: () => {
      store.db.close();
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function insertCompletion(store, {
  item = "item-1",
  project = "P26-014",
  knowledge = { lesson: "reuse the measured fixture shape" },
  doneAt = "2026-07-02T00:00:00Z",
} = {}) {
  store.db.prepare(
    `INSERT INTO completion_log
      (item_id,title,assignee_ref,work_type,project_id,done_at,completed_by,summary,knowledge,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    item,
    "fixture completion",
    "owner",
    "analysis",
    project,
    doneAt,
    "owner",
    "metadata summary",
    knowledge == null ? null : JSON.stringify(knowledge),
    doneAt,
  );
}

function feedOptions(tmp, extra = {}) {
  return {
    dbPath: tmp.dbPath,
    workmetaRoot: tmp.workmetaRoot,
    cursorPath: tmp.cursorPath,
    now: "2026-07-02T01:02:03Z",
    ...extra,
  };
}

function readLedgerRows(tmp, project = "P26-014") {
  const file = join(tmp.workmetaRoot, project, "knowledge_rag_candidate_ledger", "events", "2026-07.jsonl");
  return readFileSync(file, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

test("feed: knowledge 있는 완료행만 후보 이벤트로 변환", () => {
  const tmp = makeFixture();
  try {
    insertCompletion(tmp.store, { item: "item-1", knowledge: { lesson: "first" } });
    insertCompletion(tmp.store, { item: "item-2", knowledge: null });
    insertCompletion(tmp.store, { item: "item-3", knowledge: { lesson: "second" } });

    const summary = runCompletionKnowledgeFeed(feedOptions(tmp));

    assert.equal(summary.apply, false);
    assert.equal(summary.scanned_count, 2);
    assert.equal(summary.planned_count, 2);
    assert.equal(summary.written_count, 0);
    assert.equal(existsSync(tmp.cursorPath), false);
  } finally {
    tmp.cleanup();
  }
});

test("feed: apply 는 JSONL append + 커서 전진", () => {
  const tmp = makeFixture();
  try {
    insertCompletion(tmp.store, { item: "item-1", knowledge: { lesson: "promote this" } });

    const summary = runCompletionKnowledgeFeed(feedOptions(tmp, { apply: true }));
    const rows = readLedgerRows(tmp);
    const cursor = JSON.parse(readFileSync(tmp.cursorPath, "utf8"));
    const event = tmp.store.db.prepare("SELECT kind, used_refs, data_label FROM event_log ORDER BY id DESC LIMIT 1").get();

    assert.equal(summary.written_count, 1);
    assert.equal(cursor.last_id, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].candidate_kind, "completion_knowledge");
    assert.equal(rows[0].source_context_ref, "completion_log/1");
    assert.equal(rows[0].item_ref, "item-1");
    assert.equal(rows[0].boundary.metadata_only, true);
    assert.equal(rows[0].boundary.rag_ingestion_executed, false);
    assert.equal(event.kind, "knowledge_feed_run");
    assert.deepEqual(JSON.parse(event.used_refs), ["completion_log"]);
    assert.equal(event.data_label, "meta");
  } finally {
    tmp.cleanup();
  }
});

test("feed: 재실행 멱등", () => {
  const tmp = makeFixture();
  try {
    insertCompletion(tmp.store, { item: "item-1", knowledge: { lesson: "once" } });

    const first = runCompletionKnowledgeFeed(feedOptions(tmp, { apply: true }));
    const second = runCompletionKnowledgeFeed(feedOptions(tmp, { apply: true }));
    const rows = readLedgerRows(tmp);

    assert.equal(first.written_count, 1);
    assert.equal(second.written_count, 0);
    assert.equal(rows.length, 1);
  } finally {
    tmp.cleanup();
  }
});

test("feed: project 폴더 없으면 skip + 사유 보고", () => {
  const tmp = makeFixture({ makeProject: false });
  try {
    insertCompletion(tmp.store, { item: "item-1", project: "P26-014", knowledge: { lesson: "skip" } });

    const summary = runCompletionKnowledgeFeed(feedOptions(tmp, { apply: true }));

    assert.equal(summary.written_count, 0);
    assert.equal(summary.skipped_count, 1);
    assert.equal(summary.skipped[0].reason, "project_workmeta_folder_missing");
    assert.equal(existsSync(join(tmp.workmetaRoot, "P26-014", "knowledge_rag_candidate_ledger")), false);
  } finally {
    tmp.cleanup();
  }
});

test("feed: knowledge_hint 300자 캡, 원문 필드 부재", () => {
  const tmp = makeFixture();
  try {
    insertCompletion(tmp.store, {
      item: "item-1",
      knowledge: {
        lesson: "x".repeat(500),
        body_text: "this raw-like field must not be copied",
      },
    });

    runCompletionKnowledgeFeed(feedOptions(tmp, { apply: true }));
    const [row] = readLedgerRows(tmp);
    const serialized = JSON.stringify(row);

    assert.equal(row.knowledge_hint.length <= 300, true);
    assert.equal(serialized.includes("body_text"), false);
    assert.equal(serialized.includes("this raw-like field"), false);
    assert.equal(row.boundary.payload_copied, false);
    assert.equal(row.boundary.secret_present, false);
  } finally {
    tmp.cleanup();
  }
});
