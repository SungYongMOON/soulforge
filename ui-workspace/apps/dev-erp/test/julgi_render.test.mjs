import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi } from "../src/julgi.mjs";
import { renderFlow, renderFlowText, renderTreeText, renderOnePageText, treeStats, VISUAL_MARK } from "../src/julgi_render.mjs";

// 샘플 줄기: 척추(요구사항) + 가지(마감 closed=열매, 상대약속 open=잎) + 가닥(슬립링)
function seed() {
  const j = openJulgi(":memory:");
  const spine = j.add({ project_id: "P", type: "요구사항", text: "전달모델 설계", salience: "high" });
  j.add({ project_id: "P", type: "마감", text: "SRR 3/30", parent_id: spine });
  const due = j.list("P").find((r) => r.type === "마감");
  j.close(due.id); // 마감 완료 → 열매
  j.add({ project_id: "P", type: "상대약속", text: "입력자료 1/20", thread_key: "입력자료", salience: "high" });
  j.add({ project_id: "P", type: "전달완료", text: "입력자료 수령", thread_key: "입력자료" }); // 전달완료 → 열매
  return j;
}

test("렌더: 흐름 뷰 — 가닥별 묶음", () => {
  const j = seed();
  const flow = renderFlow(j.db, "P");
  const inputThread = flow.find((t) => t.thread_key === "입력자료");
  assert.ok(inputThread, "입력자료 가닥 존재");
  assert.equal(inputThread.items.length, 2);
  j.close_db();
});

test("렌더: 흐름 텍스트 — 화살표 체인 + 열매 마커", () => {
  const j = seed();
  const txt = renderFlowText(j.db, "P");
  assert.match(txt, /입력자료/);
  assert.match(txt, /→/);
  assert.ok(txt.includes(VISUAL_MARK.fruit), "완료 항목에 열매 마커");
  j.close_db();
});

test("렌더: 나무 텍스트 — 척추→가지 들여쓰기", () => {
  const j = seed();
  const txt = renderTreeText(j.db, "P");
  const lines = txt.split("\n");
  assert.ok(lines.some((l) => l.includes("전달모델 설계") && !l.startsWith("  ")), "척추는 0들여쓰기");
  assert.ok(lines.some((l) => l.startsWith("  ") && l.includes("SRR")), "마감은 가지(들여쓰기)");
  j.close_db();
});

test("렌더: 1페이지 — 활성만, 종류별", () => {
  const j = seed();
  const txt = renderOnePageText(j.db, "P");
  assert.match(txt, /요구사항: 전달모델 설계/);
  assert.match(txt, /상대약속: 입력자료/);
  assert.ok(!txt.includes("SRR"), "닫힌 마감(열매)은 1페이지 활성에서 제외");
  j.close_db();
});

test("렌더: 나무 통계 — 열매/잎/봉오리 + 완료율", () => {
  const j = seed();
  const s = treeStats(j.db, "P");
  assert.equal(s.total, 4);
  assert.equal(s.fruit, 2);   // 닫힌 마감 + 전달완료
  assert.equal(s.leaf, 2);    // 요구사항(open) + 상대약속(open)
  assert.equal(s.progress, 50); // 2/4
  j.close_db();
});

test("렌더: 빈 프로젝트는 빈 출력", () => {
  const j = openJulgi(":memory:");
  assert.equal(renderTreeText(j.db, "EMPTY"), "");
  assert.equal(renderOnePageText(j.db, "EMPTY"), "");
  assert.equal(treeStats(j.db, "EMPTY").progress, 0);
  j.close_db();
});
