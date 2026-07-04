// FIVE-FIELD-001: 완료 시점 자동화 자산 5필드 캡처 (request_to_automation_ladder S1/S2)
// - 결정적 필드(입력 포인터→log_ref, 집계키→request_kind)는 logCompletion 이 즉시 기록
// - LLM 초안 필드(검증/중단조건/집계키 세분화)는 updateCompletionLog 로 착지(data_label='ai_draft')
// - LLM 미가용이어도 완료를 막지 않는다(needs_backfill=1 유지)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../src/store.mjs";
import {
  composeInputRefs, encodeInputRefs, baseRequestKind, normalizeRequestKind, clampFiveFieldDigest,
} from "../src/five_field.mjs";

function freshStore() {
  return openStore(":memory:");
}

test("five_field: composeInputRefs collects pointers only (no bodies), encode respects manual log_ref", () => {
  const item = {
    origin_mail_id: "P00-000_INBOX:abc123",
    source_mail_ref: "메일_이력:row42",
    link_kind: "mail",
    link_ref: "P24-049:def456",
    guide_artifact_id: 7,
  };
  const refs = composeInputRefs(item, { threadId: "thr_1" });
  assert.deepEqual(refs, [
    "origin_mail:P00-000_INBOX:abc123",
    "source_mail:메일_이력:row42",
    "mail:P24-049:def456",
    "guide_artifact:7",
    "codex_thread:thr_1",
  ]);
  // 사람이 지정한 log_ref 는 존중(덮지 않음)
  assert.equal(encodeInputRefs({ ...item, log_ref: "log:manual" }), "log:manual");
  // 포인터가 하나도 없으면 null (없는 걸 지어내지 않음)
  assert.equal(encodeInputRefs({}), null);
  const encoded = encodeInputRefs(item, { threadId: "thr_1" });
  assert.deepEqual(JSON.parse(encoded), refs);
});

test("five_field: baseRequestKind is deterministic work_type/origin", () => {
  assert.equal(baseRequestKind({ work_type: "review", origin_mail_id: "m1" }), "review/mail");
  assert.equal(baseRequestKind({ work_type: "Document", link_kind: "deliverable" }), "document/deliverable");
  assert.equal(baseRequestKind({}), "unknown/manual");
});

test("five_field: normalizeRequestKind rejects invalid slugs and keeps fallback", () => {
  assert.equal(normalizeRequestKind("review/mail", "x"), "review/mail");
  assert.equal(normalizeRequestKind("Review/Mail", "x"), "review/mail");
  assert.equal(normalizeRequestKind("한글슬러그", "review/mail"), "review/mail");
  assert.equal(normalizeRequestKind("", "review/mail"), "review/mail");
  assert.equal(normalizeRequestKind("a".repeat(90), null), null);
});

test("five_field: clampFiveFieldDigest bounds every field and drops junk", () => {
  const out = clampFiveFieldDigest({
    summary: " s ".padEnd(2000, "x"),
    next_actions: ["a", "", "b", "c", "d"],
    knowledge: "k",
    verification: "v",
    stop_conditions: ["", "발주처 회신 메일이면 자동 금지", 3, "x".repeat(500)],
    request_kind: "Doc_Update/Manual",
  });
  assert.ok(out.summary.length <= 1000);
  assert.deepEqual(out.next_actions, ["a", "b", "c"]);
  assert.equal(out.verification, "v");
  assert.equal(out.stop_conditions.length, 3);
  assert.ok(out.stop_conditions[1].length <= 200);
  assert.equal(out.request_kind, "doc_update/manual");
  // 근거 없는 필드는 빈 값으로 소거(지어내지 않음)
  const empty = clampFiveFieldDigest({});
  assert.equal(empty.verification, "");
  assert.deepEqual(empty.stop_conditions, []);
  assert.equal(empty.request_kind, "");
});

test("five_field: logCompletion lands deterministic half immediately (needs_backfill=1)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P00-000_INBOX", title: "Inbox", data_label: "real" });
  const item = store.createItem({
    id: "itm_ff_det", project_id: "P00-000_INBOX", title: "5필드 결정 캡처",
    work_type: "review", origin_mail_id: "P00-000_INBOX:m9",
  }).item;
  const log = store.logCompletion(item, { completed_by: "tester", thread_id: "thr_9" });
  const row = store.db.prepare("SELECT * FROM completion_log WHERE id=?").get(log.id);
  assert.equal(row.request_kind, "review/mail");
  assert.equal(row.needs_backfill, 1);
  const refs = JSON.parse(row.log_ref);
  assert.ok(refs.includes("origin_mail:P00-000_INBOX:m9"));
  assert.ok(refs.includes("codex_thread:thr_9"));
  assert.equal(row.data_label, null); // LLM 초안 전 — 라벨 없음
});

test("five_field: updateCompletionLog lands ai_draft fields, keeps base on invalid slug", () => {
  const store = freshStore();
  store.upsertProject({ id: "P00-000_INBOX", title: "Inbox", data_label: "real" });
  const item = store.createItem({
    id: "itm_ff_draft", project_id: "P00-000_INBOX", title: "5필드 초안 착지",
    work_type: "review", origin_mail_id: "P00-000_INBOX:m10",
  }).item;
  const log = store.logCompletion(item, { completed_by: "tester" });
  store.updateCompletionLog(log.id, {
    summary: "요약",
    knowledge: "판단 기준 한 줄",
    verification: "테스트 41건 통과로 확인",
    stop_conditions: ["발주처 회신 메일이면 사람 게이트"],
    request_kind: "무효 슬러그!!", // 무효 → 결정적 베이스 유지
    data_label: "ai_draft",
    needs_backfill: 0,
  });
  const row = store.db.prepare("SELECT * FROM completion_log WHERE id=?").get(log.id);
  assert.equal(row.summary, "요약");
  assert.deepEqual(JSON.parse(row.knowledge), { note: "판단 기준 한 줄" });
  assert.equal(row.verification, "테스트 41건 통과로 확인");
  assert.deepEqual(JSON.parse(row.stop_conditions), ["발주처 회신 메일이면 사람 게이트"]);
  assert.equal(row.request_kind, "review/mail"); // 베이스 보존
  assert.equal(row.data_label, "ai_draft");
  assert.equal(row.needs_backfill, 0);
  // 유효 슬러그는 세분화 교체 허용
  store.updateCompletionLog(log.id, { request_kind: "review/mail-lig" });
  assert.equal(store.db.prepare("SELECT request_kind FROM completion_log WHERE id=?").get(log.id).request_kind, "review/mail-lig");
});

test("five_field: backfillCompletionLog fills deterministic half for legacy done items", () => {
  const store = freshStore();
  store.upsertProject({ id: "P24-049", title: "SAS", data_label: "real" });
  const item = store.createItem({
    id: "itm_ff_legacy", project_id: "P24-049", title: "과거 완료건",
    work_type: "author", link_kind: "artifact", link_ref: "D-12",
  }).item;
  store.db.prepare("UPDATE core_item SET status='done', done_at=? WHERE id=?").run(new Date().toISOString(), item.id);
  const r = store.backfillCompletionLog();
  assert.equal(r.inserted, 1);
  const row = store.db.prepare("SELECT * FROM completion_log WHERE item_id=?").get(item.id);
  assert.equal(row.request_kind, "author/artifact");
  assert.equal(row.needs_backfill, 1);
  assert.ok(JSON.parse(row.log_ref).includes("artifact:D-12"));
});

test("five_field: migration is idempotent on a file DB (open→close→reopen) and marks legacy rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-ff-"));
  const dbPath = join(dir, "ff.db");
  try {
    const a = openStore(dbPath);
    // legacy 행 시뮬레이션: 5필드 이전 시절 행(request_kind NULL, needs_backfill 0)
    a.db.prepare("INSERT INTO completion_log (item_id, title, created_at) VALUES ('itm_legacy','옛 완료', '2026-06-01T00:00:00Z')").run();
    a.db.prepare("UPDATE completion_log SET needs_backfill=0, request_kind=NULL WHERE item_id='itm_legacy'").run();
    a.db.close();
    const b = openStore(dbPath); // 재-open: ALTER 중복 경로 + legacy 소급 마커 UPDATE 실행
    const cols = b.db.prepare("PRAGMA table_info(completion_log)").all().map((c) => c.name);
    for (const c of ["verification", "stop_conditions", "request_kind", "data_label", "needs_backfill"]) {
      assert.ok(cols.includes(c), `missing column ${c}`);
    }
    const legacy = b.db.prepare("SELECT needs_backfill FROM completion_log WHERE item_id='itm_legacy'").get();
    assert.equal(legacy.needs_backfill, 1, "legacy 행(request_kind NULL)은 재-open 시 소급 대상(1)으로 마킹");
    b.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
