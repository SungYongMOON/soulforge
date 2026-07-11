import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBranchStory } from "../src/context_graph.mjs";
import { openStore } from "../src/store.mjs";

// B9a 가지 이야기(기원/경로/종결) — docs/slices/B9-STEM-RIVER-VIEW.md §3. 독립 파일(동시 세션 append 충돌 회피).
// 시간좌표 원칙: 노드 원장 created_at 미사용 — sources.source_time·core_mail.at 실일시(패킷 66행).

const BOM = "﻿";

function writeContextFixture(root, project = "P99-500") {
  const dir = join(root, "_workmeta", project, "project_context");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "nodes.csv"), `${BOM}node_id,project_code,node_type,label,branch_key,status,source_id,metadata_hash,created_at,updated_at
project:${project},${project},project_trunk,${project},,active,,h,2026-07-01,2026-07-01
branch:${project}:work-task-1,${project},context_branch,규격 검토,work-task-1,active,,h,2026-07-01,2026-07-01
item:itm_story1,${project},item,규격 검토 회신,work-task-1,active,,h,2026-07-01,2026-07-01
`);
  writeFileSync(join(dir, "branches.csv"), `${BOM}branch_id,project_code,branch_key,label,branch_kind,anchor_ref,status,born_at,closed_at,updated_at
branch:${project}:work-task-1,${project},work-task-1,규격 검토,work,item:itm_story1,active,2026-07-02,,2026-07-05
branch:${project}:history-w,${project},history-w,주간회의,history,series:w,active,2026-06-01,,2026-07-05
`);
  writeFileSync(join(dir, "sources.csv"), `${BOM}source_id,project_code,source_kind,external_ref,source_time,title,branch_key,branch_ref,suggested_branch_ref,summary_hint,pointer_ref,metadata_hash,body_access,created_at,updated_at
s1,${project},mail,mailcsv:key-first,2026-07-02 09:00:00,장부 제목(첫 요청),work-task-1,branch:${project}:work-task-1,,,,h,metadata_only,2026-07-09,2026-07-09
s2,${project},mail,mailcsv:key-reply,2026-07-03 10:00:00,장부 제목(회신),work-task-1,branch:${project}:work-task-1,,,,h,metadata_only,2026-07-09,2026-07-09
s3,${project},mail,mailcsv:key-nodb,2026-07-04 08:00:00,DB 에 없는 메일,,branch:${project}:work-task-1,,,,h,metadata_only,2026-07-09,2026-07-09
s4,${project},mail,mailcsv:key-hist,2026-06-05 11:00:00,주간회의 소집,history-w,branch:${project}:history-w,,,,h,metadata_only,2026-07-09,2026-07-09
`);
  return dir;
}

function seededStore(project = "P99-500") {
  const store = openStore(":memory:");
  store.upsertProject({ id: project, title: "이야기 검증", data_label: "synthetic" });
  // core_mail — suffix 조인 대상(id = <코드>:<이력키>), 실일시가 sources.source_time 보다 정본.
  store.ingestMail({ id: `${project}:key-first`, project_code: project, at: "2026-07-02 09:12:00", subject: "규격 검토 요청드립니다", counterpart: "발주처 김OO <kim@x.com>", direction: "in", data_label: "synthetic" });
  store.ingestMail({ id: `${project}:key-reply`, project_code: project, at: "2026-07-03 10:30:00", subject: "RE: 규격 검토 회신", counterpart: "발주처 김OO <kim@x.com>", direction: "out", data_label: "synthetic" });
  // 가지 앵커 할일 + 사람-확정 이벤트(경로 '전환' 단)
  store.upsertItem({ id: "itm_story1", project_id: project, title: "규격 검토 회신", assignee_ref: "문성용", status: "open", data_label: "synthetic" });
  store.appendEvent({ at: "2026-07-02T10:00:00.000Z", actor_ref: "문성용", actor_kind: "human", kind: "item_promote", item_ref: "itm_story1", to: "규격 검토 회신", project_ref: project, used_refs: ["mail"], data_label: "synthetic" });
  store.appendEvent({ at: "2026-07-03T11:00:00.000Z", actor_ref: "문성용", actor_kind: "human", kind: "item_status", item_ref: "itm_story1", from: "open", to: "done", project_ref: project, used_refs: ["items"], data_label: "synthetic" });
  // 메일계 이벤트(item_ref 에 core_mail id) — 화이트리스트로 배제돼야 함
  store.appendEvent({ at: "2026-07-03T11:05:00.000Z", actor_ref: "문성용", actor_kind: "human", kind: "mail_assign", item_ref: `${project}:key-first`, to: project, project_ref: project, used_refs: ["mail"], data_label: "synthetic" });
  return store;
}

test("B9a story: 기원=첫 점(메일 실일시 조인) + 경로 시간순·방향·전환 + 미종결=열려 있음", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-story-"));
  try {
    writeContextFixture(root);
    const store = seededStore();
    const s = buildBranchStory(root, "P99-500", "work-task-1", { store });
    assert.equal(s.schema, "dev_erp.branch_story.v1");
    assert.equal(s.content_policy, "metadata_only");
    assert.equal(s.branch.branch_kind, "work");
    // 기원 = 시간순 첫 점: key-first 메일, core_mail 실일시(09:12)·발신자·제목이 장부 제목보다 우선
    assert.equal(s.origin.at, "2026-07-02 09:12:00");
    assert.equal(s.origin.direction, "in");
    assert.match(s.origin.counterpart, /발주처 김OO/);
    assert.equal(s.origin.title, "규격 검토 요청드립니다");
    // 경로: 메일 3점(s1·s2·s3) + 이벤트 2점(promote·status) 시간순 — mail_assign(메일계)은 배제
    assert.equal(s.path.length, 5);
    assert.deepEqual(s.path.map((p) => p.kind), ["mail", "event:item_promote", "mail", "event:item_status", "mail"]);
    assert.equal(s.path[2].direction, "out", "회신 방향 표기");
    assert.equal(s.path[4].title, "DB 에 없는 메일", "core_mail 미존재 소스는 장부 메타로 폴백");
    assert.equal(s.path[4].at, "2026-07-04 08:00:00", "폴백 시각 = sources.source_time");
    // body_text 미노출(metadata_only)
    assert.equal(Object.keys(s.origin).includes("body_text"), false);
    // 미종결: completion_log 없음 → 열려 있음 + 마지막 움직임
    assert.equal(s.closure.done, false);
    assert.equal(s.closure.open, true);
    assert.equal(s.closure.last_activity_at, "2026-07-04 08:00:00");
    assert.equal(s.counts.truncated, false);
    assert.equal(s.counts.items, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9a story: 종결 — completion_log + 산출물(title 역링크) / 이력줄기 기원=최초 회차 첫 소스", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-story-close-"));
  try {
    writeContextFixture(root);
    const store = seededStore();
    // 완료 + 산출물(origin='schedule' title 역링크 계약)
    store.setItemStatus("itm_story1", "done");
    store.logCompletion(store.itemById("itm_story1"), { completed_by: "문성용" });
    store.db.prepare(
      "INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,data_label) VALUES (?,?,?,?,?,?)"
    ).run("P99-500:120:D1", "P99-500", "120", "D1", "규격 검토 회신", "synthetic");
    store.db.prepare("UPDATE core_item SET origin='schedule' WHERE id=?").run("itm_story1");
    const s = buildBranchStory(root, "P99-500", "work-task-1", { store });
    assert.equal(s.closure.done, true);
    assert.ok(s.closure.done_at, "완료 일시");
    assert.equal(s.closure.completed_by, "문성용");
    assert.deepEqual(s.closure.deliverables.map((d) => d.name), ["규격 검토 회신"]);
    assert.equal(s.closure.open, false);
    // 이력줄기: 기원 = 최초 회차의 첫 소스 메일(작업줄기와 동일 규칙 — 시간순 첫 점)
    const h = buildBranchStory(root, "P99-500", "history-w", { store });
    assert.equal(h.branch.branch_kind, "history");
    assert.equal(h.origin.title, "주간회의 소집");
    assert.equal(h.closure.open, true, "이력줄기는 명시 종결 전까지 열려 있음");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9a story: 점 상한 cap+truncated + 오류 경로(project_invalid/branch_required/not_found)", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-story-cap-"));
  try {
    writeContextFixture(root);
    const store = seededStore();
    const s = buildBranchStory(root, "P99-500", "work-task-1", { store, maxPoints: 3 });
    assert.equal(s.path.length, 3);
    assert.equal(s.counts.truncated, true);
    assert.equal(s.counts.points, 5);
    assert.equal(buildBranchStory(root, "../evil", "b", { store }).error, "project_invalid");
    assert.equal(buildBranchStory(root, "P99-500", "", { store }).error, "branch_required");
    assert.equal(buildBranchStory(root, "P99-999", "b", { store }).error, "context_not_found");
    assert.equal(buildBranchStory(root, "P99-500", "no-such-branch", { store }).error, "branch_not_found");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9a store 헬퍼: suffix 메일 조인·이벤트 화이트리스트·읽기전용(이벤트 무증가)", () => {
  const store = seededStore();
  const before = store.counts().events;
  const mails = store.mailByHistoryKeys(["key-first", "key-none"]);
  assert.equal(mails.size, 1);
  assert.equal(mails.get("key-first").subject, "규격 검토 요청드립니다");
  assert.equal(Object.keys(mails.get("key-first")).includes("body_text"), false, "metadata_only — body 미선택");
  const evs = store.eventsForItems(["itm_story1"]);
  assert.deepEqual(evs.map((e) => e.kind), ["item_promote", "item_status"], "메일계 kind 배제 + 시간순");
  assert.equal(store.eventsForItems([]).length, 0);
  assert.equal(store.completionsForItems(["itm_story1"]).length, 0);
  assert.equal(store.counts().events, before, "B9a 조인은 읽기전용 — 이벤트 무증가");
});
