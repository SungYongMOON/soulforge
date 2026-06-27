import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi } from "../src/julgi.mjs";
import { buildJulgiView, compactSnapshot, combinedViewText, loadHaengbogwanSnapshot } from "../src/julgi_view.mjs";

function seed() {
  const j = openJulgi(":memory:");
  const spine = j.add({ project_id: "P", type: "요구사항", text: "전달모델 설계" });
  j.add({ project_id: "P", type: "마감", text: "SRR 3/30", parent_id: spine });
  const done = j.add({ project_id: "P", type: "전달완료", text: "SRR 제출" });
  return { j, done };
}

const SNAP = { pending_mail_count: 12, unclassified_task_count: 3, due_today_count: 1, overdue_count: 2, next_actions: ["A", "B"] };

test("뷰: 행보관 스냅샷 주입 → status + julgi 합본", () => {
  const { j } = seed();
  const v = buildJulgiView(j.db, "P", { snapshot: SNAP });
  assert.equal(v.has_status, true);
  assert.equal(v.status.pending_mail, 12);
  assert.equal(v.status.overdue, 2);
  assert.ok(v.julgi.stats.total >= 3);
  assert.ok(Array.isArray(v.julgi.flow));
  j.close_db();
});

test("뷰: 행보관 없으면 graceful(status=null, julgi 유지)", () => {
  const { j } = seed();
  const v = buildJulgiView(j.db, "P", { snapshot: null });
  assert.equal(v.has_status, false);
  assert.equal(v.status, null);
  assert.ok(v.julgi.stats.total >= 3); // 줄기는 그대로
  j.close_db();
});

test("뷰: compactSnapshot 부분/비객체 관용", () => {
  assert.equal(compactSnapshot(null), null);
  assert.equal(compactSnapshot("nope"), null);
  const c = compactSnapshot({ pending_mail_count: 5 });
  assert.equal(c.pending_mail, 5);
  assert.equal(c.overdue, 0);          // 누락 → 0
  assert.deepEqual(c.next_actions, []); // 누락 → []
});

test("뷰: 합본 텍스트 — '지금' 줄 + 완료율", () => {
  const { j } = seed();
  const txt = combinedViewText(j.db, "P", { snapshot: SNAP });
  assert.match(txt, /지금: 미분류메일 12/);
  assert.match(txt, /완료율: \d+%/);
  j.close_db();
});

test("뷰: 행보관 없을 때 합본 텍스트도 graceful", () => {
  const { j } = seed();
  const txt = combinedViewText(j.db, "P", {});
  assert.match(txt, /행보관 스냅샷 없음/);
  assert.match(txt, /완료율/);
  j.close_db();
});

test("뷰: loadHaengbogwanSnapshot 은 안 깨진다(null 또는 객체)", async () => {
  // 원장 없는 경로 → graceful (throw 금지). 행보관 모듈 자체가 없어도 null.
  const r = await loadHaengbogwanSnapshot("P99-999", { workmetaRoot: "C:/__no_such_workmeta__" });
  assert.ok(r === null || typeof r === "object");
});
