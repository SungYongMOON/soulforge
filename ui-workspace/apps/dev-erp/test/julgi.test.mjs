import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi, JULGI_TYPES, visualState } from "../src/julgi.mjs";

const freshDb = () => openJulgi(":memory:");

test("줄기: 스키마 + 추가 + 조회", () => {
  const j = freshDb();
  const id = j.add({ project_id: "P26-014", type: "요구사항", text: "전달모델 설계", source_ref: "지시서§3", salience: "high" });
  assert.ok(id > 0);
  const rows = j.list("P26-014");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "전달모델 설계");
  assert.equal(rows[0].status, "open");
  assert.equal(rows[0].source_ref, "지시서§3");
  j.close_db();
});

test("줄기: 종류 검증(8종 외 거부)", () => {
  const j = freshDb();
  assert.throws(() => j.add({ project_id: "P", type: "엉뚱", text: "x" }), /invalid_type/);
  assert.equal(JULGI_TYPES.length, 8);
  j.close_db();
});

test("줄기: 빈 본문 거부", () => {
  const j = freshDb();
  assert.throws(() => j.add({ project_id: "P", type: "요청", text: "   " }), /text_required/);
  j.close_db();
});

test("줄기: 갱신→닫힘 흐름(가닥의 역사)", () => {
  const j = freshDb();
  const id = j.add({ project_id: "P", type: "상대약속", text: "입력자료 1/20 제공", salience: "high" });
  j.update(id, { text: "입력자료 미수령(지연)" }); // 내용 변경 → 자동 updated
  let r = j.list("P")[0];
  assert.equal(r.status, "updated");
  assert.equal(r.text, "입력자료 미수령(지연)");
  j.close(id);
  r = j.list("P")[0];
  assert.equal(r.status, "closed");
  j.close_db();
});

test("줄기: 나무(척추→가지, parent)", () => {
  const j = freshDb();
  const spine = j.add({ project_id: "P", type: "요구사항", text: "전달모델 설계" });
  const child = j.add({ project_id: "P", type: "마감", text: "SRR 3/30", parent_id: spine });
  const tree = j.tree("P");
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, spine);
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].id, child);
  j.close_db();
});

test("줄기: 열매/잎/봉오리 매핑", () => {
  assert.equal(visualState({ type: "전달완료", status: "open" }), "fruit");
  assert.equal(visualState({ type: "마감", status: "closed" }), "fruit");
  assert.equal(visualState({ type: "요청", status: "waiting" }), "bud");
  assert.equal(visualState({ type: "요구사항", status: "open" }), "leaf");
  assert.equal(visualState({ type: "리스크", status: "dropped" }), "dropped");
});

test("줄기: 1페이지 상태 뷰(활성만·salience 우선)", () => {
  const j = freshDb();
  j.add({ project_id: "P", type: "요구사항", text: "낮음", salience: "low" });
  j.add({ project_id: "P", type: "요구사항", text: "높음", salience: "high" });
  const closed = j.add({ project_id: "P", type: "요구사항", text: "닫힘" });
  j.close(closed);
  const st = j.state("P");
  assert.equal(st["요구사항"].length, 2);       // 닫힘 제외
  assert.equal(st["요구사항"][0].text, "높음");  // salience 우선
  j.close_db();
});

test("줄기: 프로젝트 격리(다른 과제 안 섞임)", () => {
  const j = freshDb();
  j.add({ project_id: "P26-014", type: "요구사항", text: "A" });
  j.add({ project_id: "P25-054", type: "요구사항", text: "B" });
  assert.equal(j.list("P26-014").length, 1);
  assert.equal(j.list("P26-014")[0].text, "A");
  j.close_db();
});
