import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi } from "../src/julgi.mjs";
import { extractSpineCandidates, applySpine, buildSpineFromDoc } from "../src/julgi_spine.mjs";

const SAMPLE_지시서 = [
  "과제: KVDS 전달모델 설계 (예시·합성데이터)",
  "전달모델 설계는 필수 요구사항이다.",
  "SRR 검토는 3/30 까지 제출한다.",
  "입력자료는 발주처가 제공 예정.",
  "위험: 일정이 촉박하다.",
  "회식 장소는 미정.", // 신호 없는 줄 → 척추 제외
].join("\n");

test("척추: 결정적 폴백(모델 없이) — 종류 분류", () => {
  const c = extractSpineCandidates(SAMPLE_지시서, { project_id: "P26-014", source_ref: "지시서" });
  const byType = (t) => c.filter((x) => x.type === t);
  assert.ok(byType("요구사항").length >= 1, "요구사항 추출");
  assert.equal(byType("마감").length, 1, "날짜 줄 → 마감");
  assert.ok(byType("우리약속").length >= 1, "제공 예정 → 우리약속");
  assert.equal(byType("리스크").length, 1, "위험 → 리스크");
  assert.ok(!c.some((x) => x.text.includes("회식")), "신호 없는 줄 제외");
});

test("척추: 마감/필수 줄은 salience high", () => {
  const c = extractSpineCandidates(SAMPLE_지시서, { project_id: "P26-014" });
  const due = c.find((x) => x.type === "마감");
  assert.equal(due.salience, "high");
  const must = c.find((x) => x.text.includes("필수"));
  assert.equal(must.salience, "high");
});

test("척추: 모델 슬롯(extractor) 주면 그걸 쓴다", () => {
  let called = false;
  const extractor = (text, ctx) => {
    called = true;
    assert.equal(ctx.project_id, "P26-014");
    return [{ type: "요구사항", text: "모델이 뽑은 항목", salience: "high" }];
  };
  const c = extractSpineCandidates("아무 문서", { project_id: "P26-014", extractor });
  assert.ok(called);
  assert.equal(c.length, 1);
  assert.equal(c[0].text, "모델이 뽑은 항목");
});

test("척추: 모델 환각 방어 — 8종 외 type·빈 text 제거", () => {
  const extractor = () => [
    { type: "엉뚱한타입", text: "버려야 함" },
    { type: "요구사항", text: "" },
    { type: "요구사항", text: "유효" },
  ];
  const c = extractSpineCandidates("x", { project_id: "P", extractor });
  assert.equal(c.length, 1);
  assert.equal(c[0].text, "유효");
});

test("척추: 중복 줄 제거(dedup)", () => {
  const doc = "전달모델 설계 요구\n전달모델 설계 요구";
  const c = extractSpineCandidates(doc, { project_id: "P" });
  assert.equal(c.length, 1);
});

test("척추: extractor 비배열 반환 거부", () => {
  assert.throws(() => extractSpineCandidates("x", { project_id: "P", extractor: () => ({}) }), /extractor_must_return_array/);
});

test("척추: applySpine 이 줄기 표에 심는다", () => {
  const j = openJulgi(":memory:");
  const c = extractSpineCandidates(SAMPLE_지시서, { project_id: "P26-014", source_ref: "지시서" });
  const ids = applySpine(j.db, "P26-014", c, { source_ref: "지시서" });
  assert.equal(ids.length, c.length);
  const rows = j.list("P26-014");
  assert.equal(rows.length, c.length);
  assert.ok(rows.every((r) => r.status === "open"));
  assert.ok(rows.every((r) => r.source_ref === "지시서"));
  j.close_db();
});

test("척추: buildSpineFromDoc 한 번에(문서→후보→기록)", () => {
  const j = openJulgi(":memory:");
  const { candidates, ids } = buildSpineFromDoc(j.db, SAMPLE_지시서, { project_id: "P26-014", source_ref: "제안서" });
  assert.equal(ids.length, candidates.length);
  assert.ok(candidates.length >= 4);
  // 착수문서 종류 무관: source_ref 만 다름
  assert.ok(j.list("P26-014").every((r) => r.source_ref === "제안서"));
  j.close_db();
});
