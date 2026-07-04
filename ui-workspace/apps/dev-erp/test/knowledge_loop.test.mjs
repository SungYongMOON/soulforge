// KNOWLEDGE-LOOP-001: 지식 유통 슬라이스 B+C
// B: 완료 다이제스트 승인 → 담당자 메모리(Mem0 게이트)+core_knowledge 실기록 (no-op 해제)
// C: Codex developer instructions 에 출처 포인터·과제 지식 참조 주입(포인터만, 원문 미복사)
import test from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/store.mjs";
import { buildTaskDeveloperInstructions } from "../src/codex_bridge.mjs";
import { listProjectKnowledgeRefsFast } from "../tools/knowledge_grounding.mjs";

function freshStore() {
  return openStore(":memory:");
}

function digestProposal(store, payload) {
  return store.createProposal({
    source: "completion_hook", kind: "completion_digest", target_ref: payload.item_id ?? null,
    summary: payload.summary ?? "완료 요약", payload, used_refs: ["items"], data_label: "real",
  });
}

test("B: 승인 시 담당자 메모리+core_knowledge 실기록 (no-op 해제)", () => {
  const store = freshStore();
  const p = digestProposal(store, {
    item_id: "itm_k1", item_title: "LIG 회신 검토", project_id: "P24-049", assignee_ref: "이현재",
    work_type: "review", request_kind: "review/mail", log_ref: '["origin_mail:x"]',
    summary: "회신 검토 완료", knowledge: "발주처 회신은 24시간 내 1차 응답이 관례", verification: "owner 검토 통과",
  });
  const r = store.approveProposal(p.id, { decided_by: "owner" });
  assert.equal(r.ok, true);
  assert.equal(r.result.memory.action, "add");
  assert.equal(r.result.knowledge_id, "kn_completion_itm_k1"); // item 키잉 — 재완료 시 갱신(중복 누적 방지)
  // 메모리: 과제 격리 태그 + 출처 ref + 검증 동봉
  const mem = store.db.prepare("SELECT * FROM assignee_memory_item WHERE ref='이현재'").get();
  assert.equal(mem.project_id, "P24-049");
  assert.equal(mem.source_ref, "completion:itm_k1");
  assert.match(mem.text, /24시간 내 1차 응답/);
  assert.match(mem.text, /확인: owner 검토 통과/);
  // 지식: 검색 표면 행(요약·키워드·포인터만)
  const kn = store.db.prepare("SELECT * FROM core_knowledge WHERE id=?").get("kn_completion_itm_k1");
  assert.equal(kn.topic, "review/mail");
  assert.equal(kn.data_label, "ai_draft");
  assert.equal(kn.claim_ceiling, "observed");
  // 제안 상태 전이
  assert.equal(store.db.prepare("SELECT status FROM ai_proposal WHERE id=?").get(p.id).status, "approved");
  // 주입: 방금 쌓인 메모리가 다음 스레드 주입에 실제로 나온다 (0행 시대 종료)
  const injected = store.memoryForInjection("이현재", 1800, "LIG 회신", "P24-049");
  assert.match(String(injected), /24시간 내 1차 응답/);
});

test("B: 지식 텍스트가 없으면 예전 의미(승인=확인) 유지 — 기록 없음", () => {
  const store = freshStore();
  const p = digestProposal(store, { item_id: "itm_k2", assignee_ref: "이현재", project_id: "P24-049", summary: "요약만", knowledge: "" });
  const r = store.approveProposal(p.id);
  assert.equal(r.ok, true);
  assert.equal(r.result.skipped, "no_knowledge_text");
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM assignee_memory_item").get().n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM core_knowledge").get().n, 0);
});

test("B: 담당자 없는 다이제스트도 core_knowledge 는 기록", () => {
  const store = freshStore();
  const p = digestProposal(store, { item_id: "itm_k3", project_id: "P26-014", knowledge: "환경시험 절차서는 rev 표기 필수" });
  const r = store.approveProposal(p.id);
  assert.equal(r.ok, true);
  assert.equal(r.result.memory, null);
  assert.ok(store.db.prepare("SELECT 1 FROM core_knowledge WHERE id='kn_completion_itm_k3'").get());
});

test("B: 신세대 payload 의 request_kind:'' 는 work_type 폴백 — 빈 topic 방지 (리뷰 수리)", () => {
  const store = freshStore();
  const p = digestProposal(store, { item_id: "itm_k5", project_id: "P26-014", work_type: "review", request_kind: "", knowledge: "지식 한 줄" });
  store.approveProposal(p.id);
  const kn = store.db.prepare("SELECT topic, keywords FROM core_knowledge WHERE id='kn_completion_itm_k5'").get();
  assert.equal(kn.topic, "review");
  assert.equal(kn.keywords, null);
});

test("B: 같은 item 재완료→재승인은 core_knowledge 갱신(중복 행 누적 없음) (리뷰 수리)", () => {
  const store = freshStore();
  store.approveProposal(digestProposal(store, { item_id: "itm_k6", project_id: "P26-014", knowledge: "1차 지식" }).id);
  store.approveProposal(digestProposal(store, { item_id: "itm_k6", project_id: "P26-014", knowledge: "2차 갱신 지식" }).id);
  const rows = store.db.prepare("SELECT summary FROM core_knowledge WHERE id='kn_completion_itm_k6'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].summary, "2차 갱신 지식");
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM core_knowledge").get().n, 1);
});

test("B: 같은 담당자 유사 지식 재승인 → Mem0 게이트가 중복 방지(add 아님)", () => {
  const store = freshStore();
  const mk = (id) => digestProposal(store, { item_id: id, project_id: "P24-049", assignee_ref: "이현재", knowledge: "발주처 회신은 24시간 내 1차 응답이 관례" });
  store.approveProposal(mk("itm_k4a").id);
  const r2 = store.approveProposal(mk("itm_k4b").id);
  assert.equal(r2.ok, true);
  assert.notEqual(r2.result.memory.action, "add"); // noop 또는 update — 부풀림 방지
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM assignee_memory_item WHERE ref='이현재' AND status='active'").get().n, 1);
});

test("C: developer instructions 에 출처 포인터·지식 참조 주입(있을 때만)", () => {
  const base = { id: "itm_c1", project_id: "P26-014", title: "요구사양 검토", status: "open" };
  const legacy = buildTaskDeveloperInstructions(base);
  assert.doesNotMatch(legacy, /출처 포인터|과제 지식 참조/); // 없으면 기존 출력 그대로
  const enriched = buildTaskDeveloperInstructions({
    ...base,
    input_refs: ["origin_mail:P26-014:abc", "codex_thread:thr_1"],
    knowledge_refs: [
      { title: "KVDS 요구사양서", source_card_ref: "_workspaces/knowledge/source_cards/p26_014_req.md" },
      { index_id: "idx_only" },
    ],
  });
  assert.match(enriched, /출처 포인터\(id\/경로만/);
  assert.match(enriched, /- origin_mail:P26-014:abc/);
  assert.match(enriched, /과제 지식 참조/);
  assert.match(enriched, /- KVDS 요구사양서: _workspaces\/knowledge\/source_cards\/p26_014_req\.md/);
  assert.match(enriched, /- idx_only/);
  assert.match(enriched, /Do not claim raw mail/); // 원문 미제공 경계 유지
});

test("C: Fast 스캔 — 이름 프리필터로 과제 인덱스만 파싱, 손상/거대 파일 개별 skip (리뷰 must_fix)", () => {
  const goodIndex = JSON.stringify({
    status: "ready", index_id: "p26_014_req", title: "KVDS 요구사양",
    source_card_ref: "knowledge/projects/P26-014/cards/req.md", approval_status: "owner_approved",
  });
  const files = {
    "ROOT/p26_014_req/source_text_index.json": goodIndex,
    "ROOT/p26_014_broken/source_text_index.json": "{부분쓰기로 깨진 JSON",
    "ROOT/p26_014_huge/source_text_index.json": goodIndex, // 크기 상한으로 skip 될 대상
    "ROOT/aqap_2110/source_text_index.json": goodIndex,    // 이름 프리필터로 파싱 자체를 안 함
  };
  const parsed = [];
  const io = {
    existsSync: (p) => Object.keys(files).some((k) => String(p).replaceAll("\\", "/").includes(k.split("/source_text")[0])) || String(p).replaceAll("\\", "/").endsWith("ROOT"),
    readdirSync: () => ["p26_014_req", "p26_014_broken", "p26_014_huge", "aqap_2110"].map((name) => ({ name, isDirectory: () => true })),
    readFileSync: (p) => {
      const key = Object.keys(files).find((k) => String(p).replaceAll("\\", "/").endsWith(k.slice(5)));
      parsed.push(key);
      return files[key];
    },
    statSync: (p) => ({ size: String(p).replaceAll("\\", "/").includes("p26_014_huge") ? 999 * 1024 * 1024 : 100 }),
  };
  const refs = listProjectKnowledgeRefsFast("P26-014", { knowledgeRoot: "ROOT", io });
  assert.equal(refs.length, 1);
  assert.equal(refs[0].index_id, "p26_014_req");
  // 공용(aqap) 인덱스는 파싱 시도 자체가 없어야 하고(전수 스캔 5초 블록의 원인 제거), 거대 파일도 read 전에 skip
  assert.ok(!parsed.some((k) => String(k).includes("aqap")));
  assert.ok(!parsed.some((k) => String(k).includes("huge")));
});
