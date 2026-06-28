// 메모리 과제 격리: 누적 메모리 항목에 project_id 를 붙여, 주입 때 "현재 과제 + 과제무관 일반"만 넣고
// 다른 과제 항목은 차단한다(오염 방지). 사람 단위 통합 메모리의 cross-project bleed 를 막는다.
import assert from "node:assert/strict";
import test from "node:test";
import { openStore } from "../src/store.mjs";

test("메모리 격리 — retrieve 는 현재 과제+일반만, 다른 과제 차단", () => {
  const s = openStore(":memory:");
  const ref = "김철수";
  s.addMemoryItem(ref, { text: "과제A 고객은 알파사이고 저주파 사양 강조", project_id: "P26-014" });
  s.addMemoryItem(ref, { text: "보고서는 항상 표로 정리한다", project_id: null }); // 일반(과제무관)
  s.addMemoryItem(ref, { text: "과제B 납품 일정은 3월말 베타사 요구", project_id: "P24-049" });

  const a = s.retrieveMemoryItems(ref, { project_id: "P26-014", budget: 5000 }).map((i) => i.text);
  assert.ok(a.some((t) => t.includes("알파사")), "현재 과제(A) 항목 포함");
  assert.ok(a.some((t) => t.includes("표로")), "일반 항목 포함");
  assert.ok(!a.some((t) => t.includes("베타사")), "다른 과제(B) 차단");

  const b = s.retrieveMemoryItems(ref, { project_id: "P24-049", budget: 5000 }).map((i) => i.text);
  assert.ok(b.some((t) => t.includes("베타사")), "현재 과제(B) 항목 포함");
  assert.ok(b.some((t) => t.includes("표로")), "일반 항목 포함");
  assert.ok(!b.some((t) => t.includes("알파사")), "다른 과제(A) 차단");

  const none = s.retrieveMemoryItems(ref, { project_id: null, budget: 5000 }).map((i) => i.text);
  assert.ok(none.some((t) => t.includes("표로")), "과제 없으면 일반은 나옴");
  assert.ok(!none.some((t) => t.includes("알파사") || t.includes("베타사")), "과제 없으면 과제별 항목 차단");
});

test("메모리 격리 — memoryForInjection 이 다른 과제 비밀을 안 흘림", () => {
  const s = openStore(":memory:");
  const ref = "박영희";
  s.addMemoryItem(ref, { text: "과제A 계약금액은 비밀값 12억", project_id: "P26-014" });
  s.addMemoryItem(ref, { text: "과제B 시험은 부산에서 진행", project_id: "P24-049" });
  const inj = s.memoryForInjection(ref, 1800, "과제B 시험 준비", "P24-049");
  assert.ok(inj.includes("부산"), "현재 과제(B) 주입");
  assert.ok(!inj.includes("12억"), "다른 과제(A) 비밀 미주입");
});

test("메모리 dedup 은 같은 과제 범위 안에서만 — 다른 과제 동일문구는 별도 보존", () => {
  const s = openStore(":memory:");
  const ref = "이순신";
  const txt = "요구사양서 검토 완료";
  const r1 = s.addMemoryItem(ref, { text: txt, project_id: "P26-014" });
  const r2 = s.addMemoryItem(ref, { text: txt, project_id: "P24-049" }); // 다른 과제 → 별도 ADD
  const r3 = s.addMemoryItem(ref, { text: txt, project_id: "P26-014" }); // 같은 과제 동일 → NOOP
  assert.equal(r1.action, "add");
  assert.equal(r2.action, "add", "다른 과제 동일문구는 병합 안 됨");
  assert.equal(r3.action, "noop", "같은 과제 동일문구는 NOOP");
  assert.equal(s.listMemoryItems(ref).length, 2, "A·B 각 1건 = 2건");
});

test("메모리 격리 — 기존 무태그 항목(NULL=일반)은 모든 과제에 하위호환 주입", () => {
  const s = openStore(":memory:");
  const ref = "강감찬";
  s.addMemoryItem(ref, { text: "구버전 메모(과제 태그 없음)" }); // project_id 미지정 = NULL = 일반
  const any = s.retrieveMemoryItems(ref, { project_id: "P26-014", budget: 5000 }).map((i) => i.text);
  assert.ok(any.some((t) => t.includes("구버전")), "무태그 항목은 어느 과제에서나 나옴(하위호환)");
});
