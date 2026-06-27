import { test } from "node:test";
import assert from "node:assert/strict";
import { openJulgi } from "../src/julgi.mjs";
import { normSubject, proposeUpdates, applyUpdates } from "../src/julgi_update.mjs";

test("증분: 제목 정규화(회신/전달 접두어 제거)", () => {
  assert.equal(normSubject("RE: [KVDS] 입력자료 제공"), normSubject("입력자료 제공"));
  assert.equal(normSubject("회신: 입력자료 제공 (긴급)"), "입력자료 제공");
});

test("증분: 같은 가닥에 완료 메일 → CLOSE 제안", () => {
  const j = openJulgi(":memory:");
  const tk = normSubject("입력자료 제공");
  const id = j.add({ project_id: "P", type: "상대약속", text: "입력자료 1/20 제공", thread_key: tk });
  const ops = proposeUpdates(j.db, "P", { subject: "RE: 입력자료 제공", body_preview: "자료 수령 완료" });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "close");
  assert.equal(ops[0].id, id);
  const res = applyUpdates(j.db, "P", ops);
  assert.deepEqual(res.closed, [id]);
  assert.equal(j.list("P")[0].status, "closed"); // 열매
  j.close_db();
});

test("증분: 같은 가닥에 지연 메일 → UPDATE(지연) 제안", () => {
  const j = openJulgi(":memory:");
  const tk = normSubject("입력자료 제공");
  const id = j.add({ project_id: "P", type: "상대약속", text: "입력자료 1/20 제공", thread_key: tk });
  const ops = proposeUpdates(j.db, "P", { subject: "회신: 입력자료 제공", body_preview: "아직 미수령입니다" });
  assert.equal(ops[0].op, "update");
  assert.equal(ops[0].id, id);
  applyUpdates(j.db, "P", ops);
  assert.equal(j.list("P")[0].status, "updated");
  assert.match(j.list("P")[0].text, /지연|미수령/);
  j.close_db();
});

test("증분: 날짜 메일 → 마감 ADD", () => {
  const j = openJulgi(":memory:");
  const ops = proposeUpdates(j.db, "P", { subject: "CDR 검토 3/30 예정" });
  assert.equal(ops[0].op, "add");
  assert.equal(ops[0].item.type, "마감");
  assert.equal(ops[0].item.salience, "high");
  j.close_db();
});

test("증분: 요청 메일 → 요청 ADD", () => {
  const j = openJulgi(":memory:");
  const ops = proposeUpdates(j.db, "P", { subject: "도면 검토 요청드립니다" });
  assert.equal(ops[0].item.type, "요청");
  j.close_db();
});

test("증분: 신호 없어도 누락0 — 검토용 요청 후보(low)", () => {
  const j = openJulgi(":memory:");
  const ops = proposeUpdates(j.db, "P", { subject: "안녕하세요 오늘 날씨 좋네요" });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].item.type, "요청");
  assert.equal(ops[0].confidence, "low");
  j.close_db();
});

test("증분: 새 가닥은 thread_key 로 묶여 다음 메일이 잇는다", () => {
  const j = openJulgi(":memory:");
  // 첫 메일(요청) 적용 → 가닥 생성
  let ops = proposeUpdates(j.db, "P", { subject: "슬립링 사양 요청" });
  applyUpdates(j.db, "P", ops);
  const tk = normSubject("슬립링 사양 요청");
  assert.equal(j.list("P")[0].thread_key, tk);
  // 후속(RE:) 완료 메일 → 같은 가닥 CLOSE
  ops = proposeUpdates(j.db, "P", { subject: "RE: 슬립링 사양 요청", body_preview: "검토 완료" });
  assert.equal(ops[0].op, "close");
  j.close_db();
});

test("증분: 모델 슬롯(extractor) 우선", () => {
  const j = openJulgi(":memory:");
  let saw = false;
  const extractor = (mail, current, ctx) => { saw = true; assert.equal(ctx.project_id, "P"); return [{ op: "add", item: { type: "결정", text: "모델 제안" } }]; };
  const ops = proposeUpdates(j.db, "P", { subject: "x" }, { extractor });
  assert.ok(saw);
  assert.equal(ops[0].item.type, "결정");
  j.close_db();
});

test("증분: 환각 방어 — 8종 외·없는 id 제거", () => {
  const j = openJulgi(":memory:");
  const id = j.add({ project_id: "P", type: "요구사항", text: "A" });
  const extractor = () => [
    { op: "add", item: { type: "헛것", text: "버려" } },
    { op: "update", id: 99999, patch: { status: "closed" } }, // 없는 id
    { op: "close", id }, // 유효
  ];
  const ops = proposeUpdates(j.db, "P", { subject: "x" }, { extractor });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "close");
  assert.equal(ops[0].id, id);
  j.close_db();
});
