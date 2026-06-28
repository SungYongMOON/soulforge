import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi, listByProject } from "../src/julgi.mjs";
import { projectScheduleToJulgi } from "../src/julgi_schedule.mjs";

// 실제 core_deliverable 스키마를 흉내낸 합성 테이블(:memory:).
function seedDeliverables(db) {
  db.exec(`CREATE TABLE core_deliverable (id INTEGER PRIMARY KEY, project_id TEXT, stage_code TEXT,
    deliverable_no TEXT, name TEXT, submit_type TEXT, completion_criteria TEXT, due TEXT,
    out_pointer TEXT, produced INTEGER, review_stage TEXT, data_label TEXT, due_source TEXT, in_pointer TEXT)`);
  const ins = db.prepare("INSERT INTO core_deliverable (project_id,stage_code,deliverable_no,name,due,produced) VALUES (?,?,?,?,?,?)");
  ins.run("P", "030_SRR", "31", "요구사양서", "2026-03-30", 0);
  ins.run("P", "030_SRR", "32", "의사결정기록", null, 1); // produced → 열매
  ins.run("P", "120_CDR", "51", "상세설계서", null, 0);
}

test("일정→줄기: 게이트(척추) + 산출물(가지)", () => {
  const j = openJulgi(":memory:");
  seedDeliverables(j.db);
  const r = projectScheduleToJulgi(j.db, "P");
  assert.equal(r.stages, 2);        // SRR, CDR
  assert.equal(r.deliverables, 3);
  assert.equal(r.fruit, 1);         // produced=1
  assert.equal(listByProject(j.db, "P").length, 5); // 2 게이트 + 3 산출물
  j.close_db();
});

test("일정→줄기: produced=1 → 전달완료(열매·closed)", () => {
  const j = openJulgi(":memory:");
  seedDeliverables(j.db);
  projectScheduleToJulgi(j.db, "P");
  const done = listByProject(j.db, "P").find((r) => r.type === "전달완료");
  assert.ok(done);
  assert.equal(done.status, "closed");
  assert.match(done.text, /의사결정기록/);
  j.close_db();
});

test("일정→줄기: 마감 있으면 type=마감 + 마감일 표기", () => {
  const j = openJulgi(":memory:");
  seedDeliverables(j.db);
  projectScheduleToJulgi(j.db, "P");
  const due = listByProject(j.db, "P").find((r) => r.type === "마감");
  assert.ok(due);
  assert.match(due.text, /2026-03-30/);
  j.close_db();
});

test("일정→줄기: 게이트로 나무 묶임(parent)", () => {
  const j = openJulgi(":memory:");
  seedDeliverables(j.db);
  projectScheduleToJulgi(j.db, "P");
  const tree = j.tree("P");
  const srr = tree.find((n) => n.text.includes("030_SRR"));
  assert.ok(srr, "SRR 게이트 척추");
  assert.equal(srr.children.length, 2); // 요구사양서 + 의사결정기록
  j.close_db();
});

test("일정→줄기: 멱등(재실행해도 중복 0)", () => {
  const j = openJulgi(":memory:");
  seedDeliverables(j.db);
  projectScheduleToJulgi(j.db, "P");
  projectScheduleToJulgi(j.db, "P");
  assert.equal(listByProject(j.db, "P").length, 5);
  j.close_db();
});

test("일정→줄기: core_deliverable 없으면 graceful", () => {
  const j = openJulgi(":memory:");
  const r = projectScheduleToJulgi(j.db, "P");
  assert.ok(r.error || r.deliverables === 0);
  j.close_db();
});
