import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateRelPointer, safeSegment, safeWorkspacePath, safeUploadTarget, commitUpload } from "../src/filevault.mjs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore, deriveStartYear } from "../src/store.mjs";
import { importNewTaskLedgers, writeTaskToLedger, readTaskLedgerRows, importNewInputLedgers, writeInputToLedger, readInputLedgerRows } from "../src/autosync.mjs";
import { loadFixture } from "../src/fixture.mjs";
import { ingestNormalized, mapSoulforgeSnapshot } from "../src/adapter.mjs";
import { getLexicon, LEXICON } from "../src/lexicon.mjs";
import { crossSearch } from "../src/search.mjs";
import { runQueued, llmQueueStats } from "../src/llm.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function freshStore() {
  return openStore(":memory:");
}

test("store: 스키마 3구역 생성과 fixture 적재 (TEST-001)", () => {
  const store = freshStore();
  const counts = loadFixture(store);
  assert.equal(counts.projects, 7); // 업무 시드 3 + 데모 P26/P25 4
  assert.equal(counts.items, 30);
  assert.equal(counts.mail, 50);
  assert.equal(counts.artifacts, 30);
  assert.ok(counts.events >= 1, "ingest 이벤트가 남아야 함");
});

test("store: summary 가 프로젝트별 카운트를 만든다 (UI-001)", () => {
  const store = freshStore();
  loadFixture(store);
  const today = new Date().toISOString().slice(0, 10);
  const summary = store.summary(today);
  assert.equal(summary.length, 7); // PRJ-A/B/C(업무 시드) + 데모 P26/P25 4건
  const prjA = summary.find((p) => p.id === "PRJ-A");
  assert.ok(prjA.open > 0);
  assert.ok(prjA.boss_open >= 1, "보스(단계 종료) 항목이 카운트되어야 함");
  assert.equal(prjA.start_year, 2025, "과제시작년도 명시값");
  assert.equal(summary.find((p) => p.id === "P26-014").start_year, 2026, "과제시작년도 ID 접두 도출");
});

test("store: deriveStartYear — 과제번호 P{YY}- 접두에서 과제시작년도 도출 (PROJ-YEAR)", () => {
  assert.equal(deriveStartYear("P26-014"), 2026);
  assert.equal(deriveStartYear("P00-TEST"), 2000);
  assert.equal(deriveStartYear("P21-062"), 2021);
  assert.equal(deriveStartYear("PRJ-A"), null, "P{2자리}- 아니면 null(명시값 사용)");
  assert.equal(deriveStartYear("general_work"), null);
  assert.equal(deriveStartYear(null), null);
});

test("event_log: 라벨링 우선 원칙 — used_refs/data_label/actor_kind (INFRA-003)", () => {
  const store = freshStore();
  store.appendEvent({
    actor_ref: "p-kim", actor_kind: "human", item_ref: "IT-001", kind: "status",
    from: "open", to: "done", intervention_count: 0,
    used_refs: [".registry/skills/evidence_sift", "knowledge:cable_label_rule"],
    data_label: "real", note: "test"
  });
  const [event] = store.recentEvents(1);
  assert.equal(event.actor_kind, "human");
  assert.deepEqual(event.used_refs, [".registry/skills/evidence_sift", "knowledge:cable_label_rule"]);
  assert.equal(event.data_label, "real");
});

test("adapter: 정규화 ingest 와 불량 행 보고 (INFRA-002)", () => {
  const store = freshStore();
  const report = ingestNormalized(store, {
    projects: [{ id: "P1", title: "테스트" }, { title: "id 없음" }],
    items: [{ id: "I1", project_id: "P1", title: "할 일" }, { id: "I2" }],
    mail: [{ id: "M1", at: "2026-06-12T00:00:00Z", subject: "제목" }]
  }, { label: "real", source: "unit_test" });
  assert.equal(report.projects, 1);
  assert.equal(report.items, 1);
  assert.equal(report.mail, 1);
  assert.equal(report.skipped.length, 2);
  const [event] = store.recentEvents(1);
  assert.equal(event.kind, "ingest");
  assert.equal(event.data_label, "real");
});

test("adapter: soulforge snapshot 보수적 매핑 (INFRA-002)", () => {
  const mapped = mapSoulforgeSnapshot({
    operation_board: {
      sections: {
        dungeon_map: { rows: [{ project_code: "P00-TEST", title: "샘플 던전", health: "watch" }] },
        mission_board: { rows: [{ mission_id: "m1", project_code: "P00-TEST", title: "샘플 미션", readiness_status: "blocked" }] }
      }
    }
  });
  assert.equal(mapped.projects.length, 1);
  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].status, "blocked");
});

test("lexicon: business/fantasy 키 완전 일치 (INFRA-004, TEST-003)", () => {
  const bKeys = Object.keys(LEXICON.business).sort();
  const fKeys = Object.keys(LEXICON.fantasy).sort();
  assert.deepEqual(bKeys, fKeys, "두 모드의 라벨 키가 1:1 이어야 화면이 안 깨진다");
  assert.equal(getLexicon("unknown_mode").app_title, LEXICON.business.app_title);
});

test("search: 검색 1회로 3종 묶기 (UI-005)", () => {
  const store = freshStore();
  loadFixture(store);
  const result = crossSearch(store, "PRJ-A");
  assert.ok(result.items.length > 0);
  assert.ok(result.mail.length > 0);
  assert.ok(result.artifacts.length > 0);
  const empty = crossSearch(store, "");
  assert.equal(empty.items.length, 0);
});

test("mail: 기본 90일 범위와 원문 미저장 (UI-003)", () => {
  const store = freshStore();
  loadFixture(store);
  const mail = store.mail({ days: 90 });
  assert.ok(mail.length > 0);
  for (const m of mail.slice(0, 5)) {
    assert.ok(m.subject && m.pointer_ref, "제목/포인터만 있고");
    assert.equal(m.body, undefined, "본문 컬럼 자체가 없어야 함");
  }
});

test("P1b: purgeSynthetic 은 synthetic 만 지우고 real 은 보존 + meta 마커", () => {
  const store = freshStore();
  loadFixture(store);
  ingestNormalized(store, {
    projects: [{ id: "P99-REAL", title: "실프로젝트" }],
    mail: [{ id: "RM1", at: "2026-06-12T00:00:00+09:00", subject: "실메일 제목" }]
  }, { label: "real", source: "p1b_test" });

  const removed = store.purgeSynthetic();
  assert.ok(removed > 100, "합성 행들이 제거되어야 함");
  const counts = store.counts();
  assert.equal(counts.projects, 1);
  assert.equal(counts.mail, 1);
  assert.equal(store.db.prepare("SELECT COUNT(*) c FROM core_project WHERE data_label='real'").get().c, 1);

  store.setMeta("real_ingest_mtime", "12345");
  assert.equal(store.getMeta("real_ingest_mtime"), "12345");
  store.setMeta("real_ingest_mtime", "67890");
  assert.equal(store.getMeta("real_ingest_mtime"), "67890");
});

test("run11: 수동 라벨 CRUD + 메일 라벨 필터 (Gmail식)", () => {
  const store = freshStore();
  loadFixture(store);
  const dup = store.createLabel("  ", "#fff");
  assert.equal(dup.error, "label_name_required");
  const a = store.createLabel("긴급", "#b3372f");
  assert.ok(a.label.id);
  assert.equal(store.createLabel("긴급", "#000").error, "label_exists");

  const [m1, m2] = store.mail({ days: 0 }).slice(0, 2);
  assert.deepEqual(m1.label_ids, []);
  assert.equal(store.setMailLabel(m1.id, a.label.id, true).ok, true);
  assert.equal(store.setMailLabel("no-such", a.label.id, true).error, "mail_not_found");

  const filtered = store.mail({ days: 0, label_id: a.label.id });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, m1.id);
  assert.deepEqual(filtered[0].label_ids, [a.label.id]);

  store.setMailLabel(m1.id, a.label.id, false);
  assert.equal(store.mail({ days: 0, label_id: a.label.id }).length, 0);

  const q = store.mail({ days: 0, q: m2.subject.slice(0, 6) });
  assert.ok(q.some((m) => m.id === m2.id));
});

test("run13: 가이드 산출물 CRUD + 스텝 진행 상태", async () => {
  const { guideTemplates, SE_STAGES, ARTIFACT_FLOW } = await import("../src/guide.mjs");
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;

  // 템플릿: 양 모드 모두 8단계 + 7스텝, 파리티
  for (const mode of ["business", "fantasy"]) {
    const t = guideTemplates(mode);
    assert.equal(t.stages.length, SE_STAGES.length);
    assert.equal(t.flow.length, ARTIFACT_FLOW.length);
    assert.ok(t.stages.every((s) => s.name && s.code));
    assert.ok(t.flow.every((s) => s.name && s.hint));
  }
  // Out(final) 이 quality 앞, snapshot 이 첫 스텝 — "폴더 순서 = 업무 순서"
  const keys = ARTIFACT_FLOW.map((s) => s.key);
  assert.equal(keys[0], "snapshot");
  assert.ok(keys.indexOf("final") === keys.length - 2 && keys.at(-1) === "quality");

  // 산출물 추가: 검증 + 중복 거부
  assert.equal(store.addGuideArtifact(proj, "030", "  ").error, "artifact_name_required");
  assert.equal(store.addGuideArtifact("no-such", "030", "SSRS").error, "project_not_found");
  assert.equal(store.addGuideArtifact(proj, "030", "체계요구사항명세서(SSRS)").ok, true);
  assert.equal(store.addGuideArtifact(proj, "030", "체계요구사항명세서(SSRS)").error, "artifact_exists");

  // 스텝 체크/해제 + 상태 맵
  let [art] = store.guideState(proj);
  assert.equal(art.stage_code, "030");
  assert.deepEqual(art.steps, {});
  assert.equal(store.setGuideStep(art.id, "snapshot", true).ok, true);
  assert.equal(store.setGuideStep(999999, "snapshot", true).error, "artifact_not_found");
  [art] = store.guideState(proj);
  assert.ok(art.steps.snapshot.done_at);
  store.setGuideStep(art.id, "snapshot", false);
  [art] = store.guideState(proj);
  assert.equal(art.steps.snapshot, undefined);
});

test("P-0: gateEval 가 title 이 아니라 stage_code 로 산출물 매칭 (결합 분리)", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;
  // 단계의 title 과 stage_code 를 일부러 다르게 둔다.
  store.upsertStage({ id: "st-p0", project_id: proj, title: "상세설계", stage_code: "120", seq: 1 });
  store.addGuideArtifact(proj, "120", "CDR 패키지");
  let stage = store.gates({ project: proj }).find((s) => s.id === "st-p0");
  assert.equal(stage.stage_code, "120");
  assert.equal(stage.artifacts, 1, "stage_code 로 산출물 1건이 매칭돼야 한다");
  // title 을 바꿔도 stage_code 매칭은 유지 — title 결합이 끊겼음을 증명.
  store.upsertStage({ id: "st-p0", project_id: proj, title: "상세설계 v2", stage_code: "120", seq: 1 });
  stage = store.gates({ project: proj }).find((s) => s.id === "st-p0");
  assert.equal(stage.title, "상세설계 v2");
  assert.equal(stage.artifacts, 1, "title 변경 후에도 stage_code 매칭이 유지돼야 한다");
});

test("P-1: 완결성 게이트 — 보드 필수 6종 미충족 시 단계 reason, 채우면 사라짐", () => {
  const store = freshStore();
  loadFixture(store); // pt-board→PRJ-A 링크 + 필수 6종 시드됨
  // 첨부 0 → 6종 다 미충족
  let c = store.boardCompleteness("pt-board");
  assert.equal(c.required.length, 6);
  assert.equal(c.missing.length, 6, "첨부 0 이면 6종 다 미충족");
  // PRJ-A 상세설계 단계 게이트에 required_artifacts_missing reason
  let stage = store.gates({ project: "PRJ-A" }).find((s) => s.stage_code === "상세설계");
  assert.ok(stage.reasons.find((x) => x.code === "required_artifacts_missing")?.n === 6, "필수 6종 미충족이 게이트 reason 으로");
  // 6종 첨부(포인터·원문 미저장) → 충족
  for (const t of ["bom", "gerber", "digikey", "schematic", "pcb", "block_diagram"]) {
    assert.equal(store.addAttachment({ entity_type: "part", entity_id: "pt-board", name: `${t}.f`, pointer: `/ptr/${t}`, artifact_type: t }).ok, true);
  }
  assert.equal(store.boardCompleteness("pt-board").missing.length, 0, "6종 첨부 후 미충족 0");
  stage = store.gates({ project: "PRJ-A" }).find((s) => s.stage_code === "상세설계");
  assert.ok(!stage.reasons.find((x) => x.code === "required_artifacts_missing"), "충족 후 reason 사라짐");
  // entity_type='part' 허용 + 잘못된 타입 거부
  assert.equal(store.addAttachment({ entity_type: "nope", entity_id: "x", name: "x", pointer: "/x" }).error, "bad_entity_type");
});

test("P-2: SE 스케줄러 — 템플릿 적용 자동 spawn + 마일스톤 날짜 전파(멱등·보호)", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;
  const byTitle = (t) => store.db.prepare("SELECT * FROM core_item WHERE project_id=? AND title=?").get(proj, t);
  // 템플릿 적용 → 산출물 할일 자동 생성(메일 없이 일이 생김), due = 마일스톤 ± offset
  const r = store.applyTemplate(proj, "120_CDR", { anchorDates: { "120": "2026-08-01" } });
  assert.equal(r.ok, true);
  assert.equal(r.created.length, 3, "산출물 3건 자동 spawn");
  assert.equal(byTitle("회로도 초안").due, "2026-07-25", "-7일");
  assert.equal(byTitle("CDR 패키지").due, "2026-08-01", "마일스톤 당일");
  assert.equal(byTitle("시험계획서").due, "2026-08-15", "+14일");
  // 멱등: 재적용은 0건
  assert.equal(store.applyTemplate(proj, "120_CDR", { anchorDates: { "120": "2026-08-01" } }).created.length, 0);
  // 사람이 손댄 마감 보호 + 완료 보호
  store.db.prepare("UPDATE core_item SET due='2026-12-31', due_overridden=1 WHERE id=?").run(byTitle("시험계획서").id);
  store.setItemStatus(byTitle("회로도 초안").id, "done");
  // 마일스톤 이동 → 전파(보호 항목 제외)
  const m = store.setAnchor(proj, "120", "2026-09-01");
  assert.equal(byTitle("CDR 패키지").due, "2026-09-01", "전파됨");
  assert.equal(byTitle("회로도 초안").due, "2026-07-25", "완료 항목 마감 유지");
  assert.equal(byTitle("시험계획서").due, "2026-12-31", "사람이 손댄 마감 보호");
  assert.equal(m.shifted, 1, "보호 2건 제외, 1건만 이동");
  // 입력 검증
  assert.equal(store.applyTemplate(proj, "no-such").error, "template_not_found");
  assert.equal(store.setAnchor(proj, "120", "bad").error, "date_format");
});

test("SE-DATA: 시드 파일 부재 시 120_CDR stub 유지 + 멱등 + 어휘 정합", () => {
  const store = freshStore(); // :memory:, 디스크 se_process_seed.json 부재 전제
  const tpls = store.scheduleTemplates();
  const cdr = tpls.find((t) => t.key === "120_CDR");
  assert.ok(cdr, "stub 템플릿 유지");
  assert.equal(cdr.stages.length, 1);
  assert.equal(cdr.stages[0].stage_code, "120");
  assert.equal(cdr.stages[0].is_milestone, 1);
  assert.equal(cdr.deliverables.length, 3);
  assert.equal(tpls.filter((t) => t.key === "120_CDR").length, 1, "중복 시드 없음(멱등)");
  const DICT = ["bom", "gerber", "digikey", "schematic", "pcb", "block_diagram"];
  const ats = tpls.flatMap((t) => t.deliverables).map((d) => d.default_artifact_type).filter(Boolean);
  assert.ok(ats.every((a) => DICT.includes(a)), "default_artifact_type ⊂ 6종 사전");
});

test("SE-DATA: se_process_seed.json 있으면 소비(Codex 변형 필드명·중첩 허용)", async () => {
  const { writeFileSync, rmSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const seedPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "se_process_seed.json");
  if (existsSync(seedPath)) return; // Codex 실파일이 있으면 합성 테스트 건너뜀(실파일 보호)
  const seed = {
    templates: [{ key: "t_test", name: "테스트", stages: [{ stage_code: "130", seq: 1, is_milestone: true }],
      deliverables: [{ anchor_stage_code: "130", offset_days: 3, name: "테스트산출물", artifact_type: "bom" }] }], // name/artifact_type 변형
    board_requirements: [{ board_type: "수신부", artifacts: [{ artifact_type: "gerber", label: "거버" }] }], // 중첩 변형
  };
  writeFileSync(seedPath, JSON.stringify(seed));
  try {
    const store = freshStore();
    const t = store.scheduleTemplates().find((x) => x.key === "t_test");
    assert.ok(t, "파일 템플릿 적재");
    assert.equal(t.deliverables[0].deliverable_name, "테스트산출물", "name→deliverable_name 허용");
    assert.equal(t.deliverables[0].default_artifact_type, "bom", "artifact_type→default_artifact_type 허용");
    assert.ok(store.artifactRequirements({ scope_kind: "board_type", scope_key: "수신부" }).some((r) => r.artifact_type === "gerber"), "중첩 board_requirements 적재");
  } finally {
    rmSync(seedPath, { force: true });
  }
});

test("P-10: 지식 등재 + _tokenize 재사용 검색", () => {
  const store = freshStore();
  store.upsertKnowledge({ title: "케이블 라벨 규칙", summary: "라벨은 양끝에", topic: "wiring", keywords: "케이블,라벨", source_ref: ".registry/knowledge/source_criticism" });
  const hits = store.retrieveKnowledge("케이블 라벨");
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].knowledge.title.includes("케이블"));
  assert.equal(store.knowledge({ topic: "wiring" }).length, 1);
  assert.equal(store.upsertKnowledge({ title: "  " }).error, "title_required");
});

test("P-10: catalogSearch FAQ+지식 통합(type)", () => {
  const store = freshStore();
  store.upsertFaq({ question: "재고 부족 처리", answer: "발주 요청", keywords: "재고,부족" });
  store.upsertKnowledge({ title: "재고 안전기준", summary: "min_qty 기준", keywords: "재고,안전" });
  const r = store.catalogSearch("재고");
  assert.ok(r.some((x) => x.type === "faq"));
  assert.ok(r.some((x) => x.type === "knowledge"));
});

test("P-10: knowledge 엔터티 첨부 포인터(원문 미저장)", () => {
  const store = freshStore();
  const id = store.upsertKnowledge({ title: "규격서" }).id;
  const a = store.addAttachment({ entity_type: "knowledge", entity_id: id, name: "spec.pdf", pointer: "/proto/spec.pdf" });
  assert.ok(a.ok);
  assert.equal(store.attachments({ entity_type: "knowledge", entity_id: id }).length, 1);
  assert.equal(store.addAttachment({ entity_type: "badtype", entity_id: "x", name: "n", pointer: "p" }).error, "bad_entity_type");
});

test("P-6: person_skill 매핑 + capabilityMatrix(개인 점수 미저장)", () => {
  const store = freshStore();
  store.upsertPerson({ id: "p-kim", name: "김", role: "engineer", unit_ref: ".unit/vanguard_01", capability_label: "frontline" });
  assert.ok(store.setPersonSkill("p-kim", "evidence", { source_ref: ".registry/skills/evidence_sift" }).ok);
  const kim = store.capabilityMatrix().find((x) => x.person_id === "p-kim");
  assert.equal(kim.unit_ref, ".unit/vanguard_01");
  assert.ok(kim.skills.find((s) => s.capability_label === "evidence" && s.source_ref === ".registry/skills/evidence_sift"));
  assert.equal(store.setPersonSkill("nope", "x").error, "person_not_found");
  assert.ok(!("score" in kim), "개인 평가점수 필드 없음(감시경계)");
});

test("P-6: nudges 연체>오늘 우선 + 이벤트 미저장", () => {
  const store = freshStore();
  loadFixture(store);
  store.upsertPerson({ id: "p-kim", name: "김" });
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  store.createItem({ project_id: "PRJ-A", title: "연체할일", due: past, assignee_ref: "p-kim" });
  store.createItem({ project_id: "PRJ-A", title: "오늘할일", due: today, assignee_ref: "p-kim" });
  const n = store.nudges({ person: "p-kim" });
  assert.equal(n[0].reason, "overdue");
  assert.equal(n[0].title, "연체할일");
  const e = store.counts().events;
  store.nudges({ person: "p-kim" });
  assert.equal(store.counts().events, e, "nudges 는 읽기 전용(이벤트 미저장)");
});

test("P-6: .registry/.unit ref 문자열 포인터로만(파일 미파싱)", () => {
  const store = freshStore();
  store.upsertPerson({ id: "p2", name: "박", unit_ref: ".unit/guild_master" });
  assert.equal(store.people().find((x) => x.id === "p2").unit_ref, ".unit/guild_master");
});

test("P-7: workload 사람별 GROUP BY(이벤트 미저장)", () => {
  const store = freshStore();
  loadFixture(store);
  // 고유 id(fixture 미사용) — fixture 가 p-kim 을 담당자로 쓰므로 충돌 회피.
  store.upsertPerson({ id: "p-zztest", name: "테스터" });
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  store.createItem({ project_id: "PRJ-A", title: "a", assignee_ref: "p-zztest", due: past });
  store.createItem({ project_id: "PRJ-A", title: "b", assignee_ref: "p-zztest" });
  const kim = store.workload(today).find((x) => x.assignee_ref === "p-zztest");
  assert.equal(kim.open_cnt, 2);
  assert.equal(kim.overdue_cnt, 1);
  assert.equal(kim.name, "테스터");
  const e = store.counts().events;
  store.workload(today);
  assert.equal(store.counts().events, e, "workload 는 읽기 전용");
});

test("P-7: meetingOpenRollup 미완 액션 있는 회의만", () => {
  const store = freshStore();
  loadFixture(store);
  const mid = store.createMeeting({ title: "주간회의", project_id: "PRJ-A" }).id;
  const it = store.createItem({ project_id: "PRJ-A", title: "결의1" }).item;
  store.linkActionItem(mid, it.id);
  assert.equal(store.meetingOpenRollup().find((x) => x.meeting_id === mid).open_actions, 1);
  store.setItemStatus(it.id, "done");
  assert.ok(!store.meetingOpenRollup().find((x) => x.meeting_id === mid), "전부 done 이면 롤업 제외");
});

test("P-7: 미배정 버킷", () => {
  const store = freshStore();
  loadFixture(store);
  store.createItem({ project_id: "PRJ-A", title: "무담당" });
  const w = store.workload(new Date().toISOString().slice(0, 10));
  assert.ok(w.find((x) => x.name === "(미배정)" || x.assignee_ref === null));
});

test("P-11: safeEval 화이트리스트 — 산술/Math 만 평가", () => {
  const store = freshStore();
  const id = store.upsertCalculator({ name: "빗변", formula: "Math.sqrt(a*a+b*b)", variables: [{ name: "a" }, { name: "b" }] }).id;
  assert.equal(Math.round(store.evalCalculator(id, { a: 3, b: 4 }).value), 5);
  const id2 = store.upsertCalculator({ name: "거듭", formula: "a^2 + 2*(b-1)", variables: [{ name: "a" }, { name: "b" }] }).id;
  assert.equal(store.evalCalculator(id2, { a: 3, b: 5 }).value, 17);
});

test("P-11: 위험 식 거부 — process/대괄호/할당 차단(저장 단계)", () => {
  const store = freshStore();
  assert.equal(store.upsertCalculator({ name: "x", formula: "process.exit(1)" }).error, "unsafe_formula");
  assert.equal(store.upsertCalculator({ name: "y", formula: 'global["x"]' }).error, "unsafe_formula");
  assert.equal(store.upsertCalculator({ name: "z", formula: "a=1" }).error, "unsafe_formula");
});

test("P-11: example 회귀검증 — 통과해야 active", () => {
  const store = freshStore();
  const id = store.upsertCalculator({ name: "합", formula: "a+b", variables: [{ name: "a" }, { name: "b" }] }).id;
  store.addCalculatorExample(id, { a: 2, b: 3 }, 5);
  assert.ok(store.verifyCalculator(id).ok);
  assert.ok(store.activateCalculator(id).ok);
  store.addCalculatorExample(id, { a: 1, b: 1 }, 99);
  assert.equal(store.verifyCalculator(id).ok, false);
  assert.equal(store.activateCalculator(id).error, "examples_failed");
});

test("U-1a: schedule 라우트가 화면 데이터로 충분", () => {
  const store = freshStore();
  loadFixture(store);
  const today = new Date().toISOString().slice(0, 10);
  const proj = store.summary(today, today)[0].id;
  assert.equal(store.applyTemplate(proj, "120_CDR", { anchorDates: { "120": "2026-08-01" } }).created.length, 3);
  assert.ok(store.scheduleTemplates()[0].deliverables.length >= 3);
});

test("UI-sched: 산출물 offset 편집/추가(upsertDeliverable)", () => {
  const store = freshStore();
  store.upsertDeliverable("120_CDR", "120", "회로도 초안", { offset_days: -10 });
  const d = store.scheduleTemplates().find((t) => t.key === "120_CDR").deliverables.find((x) => x.deliverable_name === "회로도 초안");
  assert.equal(d.offset_days, -10, "기존 산출물 offset 편집");
  store.upsertDeliverable("120_CDR", "120", "신규산출물", { offset_days: 5, default_artifact_type: "bom" });
  assert.ok(store.scheduleTemplates().find((t) => t.key === "120_CDR").deliverables.find((x) => x.deliverable_name === "신규산출물"), "신규 산출물 추가");
  assert.equal(store.upsertDeliverable("nope", "120", "x").error, "template_not_found");
});

test("U-1b: part 첨부 → 완결성 미충족 단조 감소", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.boardCompleteness("pt-board").missing.length, 6);
  for (const t of ["bom", "gerber", "digikey", "schematic", "pcb", "block_diagram"]) {
    const before = store.boardCompleteness("pt-board").missing.length;
    store.addAttachment({ entity_type: "part", entity_id: "pt-board", name: t + ".f", pointer: "/" + t, artifact_type: t });
    assert.ok(store.boardCompleteness("pt-board").missing.length < before);
  }
  assert.equal(store.boardCompleteness("pt-board").missing.length, 0);
});

test("run16: P2a 할일 쓰기 — 생성/검증/가이드 연결", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;

  assert.equal(store.createItem({ project_id: proj, title: " " }).error, "title_required");
  assert.equal(store.createItem({ project_id: "no-such", title: "x" }).error, "project_not_found");
  assert.equal(store.createItem({ project_id: proj, title: "x", due: "6/13" }).error, "due_format");
  assert.equal(store.createItem({ project_id: proj, title: "x", guide_artifact_id: 999 }).error, "guide_artifact_not_found");

  const r = store.createItem({ project_id: proj, title: "방열판 견적 요청", assignee_ref: "u1", due: "2026-06-20", created_by: "owner" });
  assert.equal(r.ok, true);
  assert.equal(r.item.status, "open");
  assert.equal(r.item.data_label, "real");
  assert.equal(r.item.created_by, "owner");

  // 가이드 산출물 연결 (+ 타 과제 산출물 거부)
  store.addGuideArtifact(proj, "030", "SSRS");
  const [art] = store.guideState(proj);
  const linked = store.createItem({ project_id: proj, title: "SSRS 초안", guide_artifact_id: art.id, guide_step_key: "draft" });
  assert.equal(linked.ok, true);
  const rows = store.items({ project: proj, q: "SSRS 초안" });
  assert.equal(rows[0].guide_artifact_name, "SSRS");
  assert.equal(rows[0].guide_stage_code, "030");
  const other = store.summary("2026-06-12", "2026-06-18")[1].id;
  assert.equal(store.createItem({ project_id: other, title: "y", guide_artifact_id: art.id }).error, "guide_artifact_project_mismatch");
});

test("run16: P2a 상태 전이 + 담당 지정 + project_ref 이벤트 필터", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;
  const { item } = store.createItem({ project_id: proj, title: "테스트 할일" });

  assert.equal(store.setItemStatus(item.id, "weird").error, "bad_status");
  assert.equal(store.setItemStatus("no-such", "doing").error, "item_not_found");
  const s1 = store.setItemStatus(item.id, "doing");
  assert.deepEqual([s1.ok, s1.from, s1.project_id], [true, "open", proj]);
  const s2 = store.setItemStatus(item.id, "done");
  assert.equal(s2.from, "doing");

  const a1 = store.setItemAssignee(item.id, "u2");
  assert.equal(a1.ok, true);
  assert.equal(store.setItemAssignee("no-such", "u2").error, "item_not_found");

  // project_ref 차원: 과제별 이력 필터
  store.appendEvent({ kind: "item_status", item_ref: item.id, from: "open", to: "doing", project_ref: proj, data_label: "real" });
  store.appendEvent({ kind: "item_status", item_ref: "zzz", from: "open", to: "doing", project_ref: "OTHER", data_label: "real" });
  const filtered = store.recentEvents(50, proj);
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((e) => e.project_ref === proj));
});

test("run16: 메일→할일 승격 (메타만, 중복 거부)", () => {
  const store = freshStore();
  loadFixture(store);
  const [m] = store.mail({ days: 0 });
  const r = store.promoteMail(m.id, "owner");
  assert.equal(r.ok, true);
  assert.equal(r.item.title, m.subject);          // 제목 메타만 복사
  assert.equal(r.item.origin, "mail");
  assert.equal(r.item.origin_mail_id, m.id);
  assert.equal(r.item.project_id, m.project_id);
  const dup = store.promoteMail(m.id, "owner");
  assert.equal(dup.error, "already_promoted");
  assert.equal(dup.item_id, r.item.id);
  assert.equal(store.promoteMail("no-such", "owner").error, "mail_not_found");
  // 본문 필드 자체가 스키마에 없음 — 승격 항목 컬럼 확인
  const cols = store.db.prepare("PRAGMA table_info(core_item)").all().map((c) => c.name);
  assert.ok(cols.includes("origin_mail_id") && cols.includes("created_by"));
  assert.ok(!cols.includes("body"));
});

test("run17: 메일 과제 분류(재배정) — 단건/묶음/할일 동행 이동/출몰 생성", () => {
  const store = freshStore();
  loadFixture(store);
  const projects = store.summary("2026-06-12", "2026-06-18");
  const [pa, pb] = [projects[0].id, projects[1].id];
  const mails = store.mail({ days: 0 }).slice(0, 3);

  // 단건 검증
  assert.equal(store.setMailProject("no-such", pa).error, "mail_not_found");
  assert.equal(store.setMailProject(mails[0].id, "no-such").error, "project_not_found");
  const mv = store.setMailProject(mails[0].id, pb === mails[0].project_id ? pa : pb);
  assert.equal(mv.ok, true);
  assert.equal(mv.from, mails[0].project_id);

  // 승격된 메일 재배정 → 연결 할일 동행 이동 (단일 진실)
  const pr = store.promoteMail(mails[1].id, "owner");
  assert.equal(pr.ok, true);
  const target = mails[1].project_id === pa ? pb : pa;
  const mv2 = store.setMailProject(mails[1].id, target);
  assert.equal(mv2.item_moved, pr.item.id);
  assert.equal(store.db.prepare("SELECT project_id FROM core_item WHERE id=?").get(pr.item.id).project_id, target);

  // 묶음 + make_items: 미승격분만 생성, 승격분은 이동만 (중복 0)
  // 대상은 두 메일의 현재 과제와 다른 곳으로 (unchanged 회피)
  const cur1 = target;
  const cur2 = store.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get(mails[2].id).project_id;
  const batchTarget = projects.map((x) => x.id).find((id) => id !== cur1 && id !== cur2);
  const batch = store.assignMails([mails[1].id, mails[2].id], batchTarget, { make_items: true, created_by: "owner" });
  assert.equal(batch.ok, true);
  const r1 = batch.results.find((x) => x.mail_id === mails[1].id);
  const r2 = batch.results.find((x) => x.mail_id === mails[2].id);
  assert.equal(r1.item_moved, pr.item.id);      // 기존 할일 이동
  assert.equal(r1.item_created, null);           // 중복 생성 없음
  assert.ok(r2.item_created);                    // 새 출몰
  const created = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(r2.item_created);
  // slice1 계약: 메일 파생 할 일은 SE 기준점 미연결이면 'unclassified'(미분류) — 정식 'open' 아님
  assert.deepEqual([created.project_id, created.origin, created.status], [batchTarget, "mail", "unclassified"]);

  assert.equal(store.assignMails([], pa).error, "mail_ids_required");
  assert.equal(store.assignMails([mails[0].id], "no-such").error, "project_not_found");
});

test("store: SE 기준점 자동분류 — 인입 미연결=미분류, 정식 격리 (SE-CLASSIFY slice1)", () => {
  const store = freshStore();
  loadFixture(store);
  const today = new Date().toISOString().slice(0, 10);
  // 1) 메일 출처 + SE 기준점 없음 → unclassified
  const m1 = store.createItem({ project_id: "PRJ-A", title: "BOM 반영", origin: "mail", origin_mail_id: "m-x" });
  assert.equal(m1.item.status, "unclassified", "인입+미연결 → 미분류");
  // 2) 미분류는 활성 집계(summary.open)에 0 기여
  const before = store.summary(today).find((p) => p.id === "PRJ-A").open;
  store.createItem({ project_id: "PRJ-A", title: "또 미분류", origin: "mail" });
  assert.equal(store.summary(today).find((p) => p.id === "PRJ-A").open, before, "미분류는 open 카운트 0 기여");
  // 3) items() 기본 격리, status='unclassified' 명시 조회로만 노출
  assert.equal(store.items({ project: "PRJ-A" }).some((i) => i.status === "unclassified"), false, "기본 목록 격리");
  assert.ok(store.items({ project: "PRJ-A", status: "unclassified" }).length >= 2, "명시 조회로 보임");
  // 4) SE 기준점(업무유형+연결대상) 붙으면 정식 open + 속성 보존
  const linked = store.createItem({ project_id: "PRJ-A", title: "CDR BOM 수정", origin: "mail", work_type: "revise", link_kind: "artifact", link_ref: "art-1", completion_criteria: "최신 BOM 반영본 저장+검토요청" });
  assert.equal(linked.item.status, "open", "기준점 연결 → 정식");
  assert.deepEqual([linked.item.work_type, linked.item.link_kind, linked.item.completion_criteria], ["revise", "artifact", "최신 BOM 반영본 저장+검토요청"]);
  // 5) 수동/스케줄 출처는 기존대로 open (회귀 방지)
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "수동 작업" }).item.status, "open", "수동 출처 open 유지");
  // 6) enum 검증
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "x", origin: "mail", work_type: "bogus" }).error, "work_type_invalid");
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "x", origin: "mail", link_kind: "bogus" }).error, "link_kind_invalid");
});

test("store: confirmItem — 미분류→정식 확정 게이트 (SE-CONFIRM slice2)", () => {
  const store = freshStore();
  loadFixture(store);
  const m = store.createItem({ project_id: "PRJ-A", title: "BOM 반영", origin: "mail" });
  assert.equal(m.item.status, "unclassified");
  assert.equal(store.items({ project: "PRJ-A" }).some((i) => i.id === m.item.id), false, "확정 전 격리");
  // 게이트: 업무유형/기준점 없으면 needs_se_anchor
  assert.equal(store.confirmItem(m.item.id, {}).error, "needs_se_anchor");
  assert.equal(store.confirmItem(m.item.id, { work_type: "revise" }).error, "needs_se_anchor", "기준점 없으면 거부");
  // 업무유형 + 연결대상 → 정식 open + 속성 반영
  const r = store.confirmItem(m.item.id, { work_type: "revise", link_kind: "artifact", link_ref: "art-1", completion_criteria: "최신본 저장", assignee_ref: "kim" });
  assert.equal(r.ok, true);
  assert.equal(r.item.status, "open");
  assert.deepEqual([r.item.work_type, r.item.link_kind, r.item.completion_criteria, r.item.assignee_ref], ["revise", "artifact", "최신본 저장", "kim"]);
  assert.ok(store.items({ project: "PRJ-A" }).some((i) => i.id === m.item.id), "확정 후 정식 목록 노출");
  // 이미 정식이면 not_unclassified, 없는 id면 item_not_found
  assert.equal(store.confirmItem(m.item.id, { work_type: "review", link_kind: "risk" }).error, "not_unclassified");
  assert.equal(store.confirmItem("no-such", { work_type: "revise", link_kind: "risk" }).error, "item_not_found");
});

test("store: itemsPage/mailPage — 총량·다음페이지 계약으로 고정 500개 장벽 제거", () => {
  const store = freshStore();
  store.upsertProject({ id: "PRJ-A", title: "A", data_label: "real" });
  for (let i = 0; i < 12; i += 1) {
    store.createItem({ project_id: "PRJ-A", title: `메일 검토 ${String(i).padStart(2, "0")}`, origin: "mail", due: "2026-06-16" });
    store.createMail({ subject: `페이지 메일 ${String(i).padStart(2, "0")}`, at: `2026-06-${String(10 + i).padStart(2, "0")}T00:00:00Z`, mailbox: "a@corp.com" });
  }

  const first = store.itemsPage({ project: "PRJ-A", status: "unclassified", limit: 5, offset: 0 });
  assert.equal(first.rows.length, 5);
  assert.equal(first.total, 12);
  assert.equal(first.has_more, true);
  const last = store.itemsPage({ project: "PRJ-A", status: "unclassified", limit: 5, offset: 10 });
  assert.equal(last.rows.length, 2);
  assert.equal(last.has_more, false);
  const overdue = store.itemsPage({ status: "unclassified", due_before_exclusive: "2026-06-17", limit: 1 });
  assert.equal(overdue.total, 12, "미분류 연체도 명시 조회하면 총량 산정");

  const mailFirst = store.mailPage({ days: 0, mailbox: "a@corp.com", limit: 5, offset: 0 });
  assert.equal(mailFirst.rows.length, 5);
  assert.equal(mailFirst.total, 12);
  assert.equal(mailFirst.has_more, true);
  const mailLast = store.mailPage({ days: 0, mailbox: "a@corp.com", limit: 5, offset: 10 });
  assert.equal(mailLast.rows.length, 2);
  assert.equal(mailLast.has_more, false);

  store.createItem({ project_id: "PRJ-A", title: "A 담당 정식", assignee_ref: "a@corp.com" });
  store.createItem({ project_id: "PRJ-A", title: "B 담당 정식", assignee_ref: "b@corp.com" });
  const counts = store.itemCounts({ project: "PRJ-A", assignee_any: ["a@corp.com"] });
  assert.equal(counts.total, 1, "정식 할일 count 는 담당자 범위");
  assert.equal(counts.statuses.unclassified, 12, "미분류 count 는 팀 공용 큐 총량");
});

test("store: 개발요청 인입 채널 — createRequest→promoteRequest→미분류 할 일 (REQ slice6)", () => {
  const store = freshStore();
  loadFixture(store);
  // 과제 없이 등록 → promote 거부(과제 필요)
  const r0 = store.createRequest({ title: "다크모드 추가" });
  assert.equal(r0.ok, true);
  assert.equal(r0.request.status, "open");
  assert.equal(store.promoteRequest(r0.id, "owner").error, "request_project_missing");
  // 과제 연결 등록 → promote → origin=request, 자동 분류로 미분류
  const r1 = store.createRequest({ title: "CDR 검토 의견 반영", project_id: "PRJ-A", requester: "김가람", category: "검토" });
  const pr = store.promoteRequest(r1.id, "owner");
  assert.equal(pr.ok, true);
  assert.deepEqual([pr.item.origin, pr.item.status], ["request", "unclassified"]);
  // 요청 상태 promoted + 중복 승격 차단
  assert.equal(store.requests({ project: "PRJ-A" }).find((r) => r.id === r1.id).status, "promoted");
  assert.equal(store.promoteRequest(r1.id, "owner").error, "already_promoted");
  // 잘못된 과제 거부, 없는 요청 거부
  assert.equal(store.createRequest({ title: "x", project_id: "no-such" }).error, "project_not_found");
  assert.equal(store.promoteRequest("no-such", "owner").error, "request_not_found");
});

test("store: createMail — 사용자 메일 등록(원문 미저장) → 받은 일 → 분류 (MAIL-REG beta1)", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.createMail({}).error, "subject_required");
  assert.equal(store.createMail({ subject: "x", project_id: "no-such" }).error, "project_not_found");
  const r = store.createMail({ subject: "CDR 일정 문의", counterpart: "발주처", project_id: "PRJ-A", at: "2026-06-15", pointer_ref: "outlook://msg/123" });
  assert.equal(r.ok, true);
  assert.deepEqual([r.mail.subject, r.mail.project_id, r.mail.counterpart, r.mail.pointer_ref], ["CDR 일정 문의", "PRJ-A", "발주처", "outlook://msg/123"]);
  assert.ok(store.mail({ project: "PRJ-A" }).some((m) => m.id === r.id), "받은 일 목록 노출");
  const pr = store.promoteMail(r.id, "owner");
  assert.deepEqual([pr.item.origin, pr.item.status], ["mail", "unclassified"]);
});

test("store: SE 산출물 레지스터 — upsertCoreDeliverable→coreDeliverables 조회·게이트필터·멱등 (deliverable slice B)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "P26-014", data_label: "real" });
  // ingest 행 1건(최종·작성됨) — out_pointer 는 상대경로
  const r = store.upsertCoreDeliverable({
    project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "125",
    name: "HW설계기술서(HDD)", submit_type: "final", completion_criteria: "03_Out 폴더에 결과물",
    due: "2026-08-01", out_pointer: "_workspaces/P26-014/120_CDR/125_HW설계기술서(HDD)_F/03_Out",
    produced: 1
  });
  assert.equal(r.ok, true);
  assert.equal(r.id, "P26-014:120_CDR:125"); // <과제>:<게이트>:<산출물ID>
  // 초안·미작성 1건(다른 게이트)
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "030_SRR", deliverable_no: "040", name: "체계요구사항명세서(SSRS)", submit_type: "draft", produced: 0 });
  const all = store.coreDeliverables({ project: "P26-014" });
  assert.equal(all.length, 2);
  // 게이트 필터
  const cdr = store.coreDeliverables({ project: "P26-014", stage: "120_CDR" });
  assert.equal(cdr.length, 1);
  const d = cdr[0];
  assert.equal(d.submit_type, "final");
  assert.equal(d.produced, 1);
  assert.equal(d.review_stage, 1); // produced → review_stage 1 자동
  assert.ok(d.out_pointer.startsWith("_workspaces/"), "out_pointer 는 상대경로");
  assert.ok(!/\/(Volumes|Users)\//.test(d.out_pointer ?? ""), "절대경로 미저장");
  // draft·미작성은 review_stage 0
  assert.equal(store.coreDeliverables({ project: "P26-014", stage: "030_SRR" })[0].review_stage, 0);
  // 멱등: 같은 id 재upsert(이름 변경) → 행 증가 없이 갱신
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "125", name: "HW설계기술서(HDD) v2", produced: 1 });
  const again = store.coreDeliverables({ project: "P26-014", stage: "120_CDR" });
  assert.equal(again.length, 1);
  assert.equal(again[0].name, "HW설계기술서(HDD) v2");
  // submit_type 화이트리스트(이상값 → null)
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "240_LL", deliverable_no: "999", name: "x", submit_type: "weird" });
  assert.equal(store.coreDeliverables({ project: "P26-014", stage: "240_LL" })[0].submit_type, null);
});

test("DELIV-DUE: 산출물 일정(due) owner 직접 지정 + 재-ingest 보존 (일정은 RAG에 없음)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "P26-014", data_label: "real" });
  // ingest: 일정 없이 들어옴(보통 '언제'는 비어있음) → due_source 'ingest'
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "030_SRR", deliverable_no: "040", name: "SSRS", submit_type: "draft" });
  const id = "P26-014:030_SRR:040";
  assert.equal(store.coreDeliverables({ project: "P26-014" })[0].due_source, "ingest", "스캔 인입 기본 출처 ingest");
  assert.equal(store.coreDeliverables({ project: "P26-014" })[0].due, null);
  // owner 가 일정 직접 지정 → due_source 'owner'
  const r = store.setDeliverableDue(id, "2026-09-15");
  assert.equal(r.ok, true);
  let row = store.coreDeliverables({ project: "P26-014" })[0];
  assert.equal(row.due, "2026-09-15");
  assert.equal(row.due_source, "owner");
  // 형식 검증 / 없는 id
  assert.equal(store.setDeliverableDue(id, "2026/09/15").error, "due_format");
  assert.equal(store.setDeliverableDue("nope", "2026-09-15").error, "deliverable_not_found");
  // 재-ingest(스캔이 다시 돌아 일정 비거나 다른 값) → owner 지정 일정은 보존(덮지 않음)
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "030_SRR", deliverable_no: "040", name: "SSRS v2", due: "2026-01-01" });
  row = store.coreDeliverables({ project: "P26-014" })[0];
  assert.equal(row.name, "SSRS v2", "산출물명(뭘)은 재-ingest 가 갱신");
  assert.equal(row.due, "2026-09-15", "owner 일정(언제)은 재-ingest 가 덮지 않음");
  assert.equal(row.due_source, "owner");
  // 빈 값으로 일정 해제 → null, 출처는 owner(사람이 명시적으로 해제)
  const c = store.setDeliverableDue(id, "");
  assert.equal(c.ok, true);
  assert.equal(store.coreDeliverables({ project: "P26-014" })[0].due, null);
});

// DELIV-ADD: owner 직접 산출물 등록 — 고정 단계 밖 중간번호(31·32…) 추가.
test("DELIV-ADD: owner 산출물 추가(중간번호) + 검증·중복 거부", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  // 템플릿 밖 중간번호 31 등록(마감 지정 → due_source owner)
  const r = store.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "31", name: "추가 시험치구", completion_criteria: "치구 제작완료", due: "2026-10-01" });
  assert.ok(r.ok, "추가 ok");
  assert.equal(r.id, "P26-014:120_CDR:31");
  const row = store.coreDeliverables({ project: "P26-014" }).find((d) => d.id === r.id);
  assert.equal(row.deliverable_no, "31");
  assert.equal(row.name, "추가 시험치구");
  assert.equal(row.due, "2026-10-01");
  assert.equal(row.due_source, "owner", "마감 지정 시 owner 출처");
  assert.equal(row.review_stage, 0);
  // 또 다른 중간번호 32
  assert.ok(store.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "32", name: "추가 보고서" }).ok);
  // 같은 게이트·번호 중복 거부
  assert.equal(store.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "31", name: "딴거" }).error, "deliverable_exists");
  // 검증
  assert.equal(store.addDeliverable({ project_id: "P26-014", name: "" }).error, "name_required");
  assert.equal(store.addDeliverable({ project_id: "BAD", name: "x" }).error, "project_required");
  assert.equal(store.addDeliverable({ project_id: "P26-999", name: "x" }).error, "project_not_found");
  assert.equal(store.addDeliverable({ project_id: "P26-014", name: "x", due: "2026/01/01" }).error, "due_format");
  assert.equal(store.coreDeliverables({ project: "P26-014" }).length, 2, "유효 2건만 등록");
});

// DELIV-INPUT: 산출물 입력파일 장부(포인터·메타 전용) — 종류별 하위폴더·등록·상태·절대경로 거부.
test("DELIV-INPUT: 입력파일 등록·조회·상태 + 절대경로 거부 + 종류별 하위폴더", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  const add = store.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "31", name: "회로도 초안" });
  const did = add.id;
  // 종류별 In 하위폴더 매핑(설계 §3) + 기본 폴백
  assert.deepEqual(store.inputSubfoldersFor("schematic"), ["참고규격", "이전버전", "부품정보"]);
  assert.deepEqual(store.inputSubfoldersFor("nope"), ["참고자료"], "미정 종류는 기본 폴백");
  // 등록(상대 포인터·출처 erp)
  const r = store.registerDeliverableInput({ deliverable_id: did, subfolder: "참고규격",
    file_name: "규격서.pdf", pointer: "_workspaces/P26-014/120_CDR/회로도초안_D/01_In/참고규격/규격서.pdf",
    source: "erp", sha256: "abc123", size: 2048, status: "received" });
  assert.ok(r.ok, "등록 ok");
  assert.equal(r.id, `${did}:abc123`);
  // 절대경로 거부 + traversal/백슬래시(적대적 검토: DB 에 불안전 포인터 저장 차단)
  assert.equal(store.registerDeliverableInput({ deliverable_id: did, pointer: "/Volumes/x/a.pdf" }).error, "pointer_must_be_relative");
  assert.equal(store.registerDeliverableInput({ deliverable_id: did, pointer: "C:\\x\\a.pdf" }).error, "pointer_must_be_relative");
  assert.equal(store.registerDeliverableInput({ deliverable_id: did, pointer: "_workspaces/P26-014/../../etc/passwd" }).error, "pointer_must_be_relative", "traversal 포인터 저장 차단");
  assert.equal(store.registerDeliverableInput({ deliverable_id: did, pointer: "_workspaces/P26-014\\evil" }).error, "pointer_must_be_relative", "백슬래시 차단");
  // 없는 산출물 / 누락
  assert.equal(store.registerDeliverableInput({ deliverable_id: "nope", file_name: "x" }).error, "deliverable_not_found");
  assert.equal(store.registerDeliverableInput({ file_name: "x" }).error, "deliverable_required");
  // 출처 mail(메일 라우팅) + needed 상태
  store.registerDeliverableInput({ deliverable_id: did, subfolder: "부품정보", file_name: "BOM참고.xlsx",
    pointer: "_workspaces/P26-014/120_CDR/회로도초안_D/01_In/부품정보/BOM참고.xlsx", source: "mail", mail_ref: "mailcsv:k1", status: "needed" });
  const list = store.deliverableInputs({ deliverable_id: did });
  assert.equal(list.length, 2, "입력 2건");
  assert.ok(list.some((x) => x.source === "mail" && x.mail_ref === "mailcsv:k1"));
  // 상태 전이 received→used
  const st = store.setDeliverableInputStatus(`${did}:abc123`, "used");
  assert.ok(st.ok);
  assert.equal(store.deliverableInputs({ deliverable_id: did }).find((x) => x.id === `${did}:abc123`).status, "used");
  assert.equal(store.setDeliverableInputStatus(`${did}:abc123`, "weird").error, "bad_status");
  assert.equal(store.setDeliverableInputStatus("nope", "used").error, "input_not_found");
});

// INPUT-LEDGER: 입력파일_장부 write-through + 신규 import 왕복(autosync 패턴, 할일_장부처럼).
test("INPUT-LEDGER: 입력파일 장부 write-through + import 왕복·키머지·산출물없으면 skip", () => {
  const root = mkdtempSync(join(tmpdir(), "din-"));
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  store.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "31", name: "회로도 초안" });
  const did = "P26-014:120_CDR:31";
  store.afterInputWrite = (id) => writeInputToLedger(store, id, { root }); // 등록/상태 → 장부 write-through
  const r = store.registerDeliverableInput({ deliverable_id: did, subfolder: "참고규격", file_name: "규격서.pdf",
    pointer: "_workspaces/P26-014/120_CDR/회로도초안_D/01_In/참고규격/규격서.pdf", source: "erp", status: "received" });
  assert.ok(r.ok);
  const file = join(root, "_workmeta", "P26-014", "reports", "입력파일_장부", "입력파일_장부.csv");
  assert.ok(existsSync(file), "장부 파일 write-through 생성");
  let rows = readInputLedgerRows(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, r.id);
  assert.equal(rows[0].deliverable_id, did);
  assert.equal(rows[0].subfolder, "참고규격");
  assert.equal(rows[0].source, "erp");
  assert.equal(rows[0].status, "received");
  assert.equal(rows[0].pointer, "_workspaces/P26-014/120_CDR/회로도초안_D/01_In/참고규격/규격서.pdf");
  // 상태 변경 → 같은 키 머지(중복 행 없음)
  store.setDeliverableInputStatus(r.id, "used");
  rows = readInputLedgerRows(file);
  assert.equal(rows.length, 1, "같은 입력키 머지");
  assert.equal(rows[0].status, "used");
  // 신규 import: 산출물 있는 store2 로 왕복(입력키 보존·멱등)
  const store2 = freshStore();
  store2.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  store2.addDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "31", name: "회로도 초안" });
  const imp = importNewInputLedgers(store2, { root });
  assert.equal(imp.imported, 1, "신규 1건 import");
  const got = store2.deliverableInputs({ deliverable_id: did });
  assert.equal(got.length, 1);
  assert.equal(got[0].id, r.id, "입력키 보존(왕복 멱등)");
  assert.equal(got[0].status, "used");
  // 재-import 는 기존 보호(신규 0)
  assert.equal(importNewInputLedgers(store2, { root }).imported, 0, "기존행 재import 안 함");
  // 산출물 없는 store3 → import skip(고아 입력 방지)
  const store3 = freshStore();
  const imp3 = importNewInputLedgers(store3, { root });
  assert.equal(imp3.imported, 0, "산출물 없으면 import 안 함");
  assert.ok(imp3.skipped >= 1);
  rmSync(root, { recursive: true, force: true });
});

// FILEVAULT: 파일 업/다운로드 경로 안전(path-safety) — 적대적 검증.
test("FILEVAULT: validateRelPointer/safeSegment 거부 규칙", () => {
  // 상대 포인터: 공격 벡터 전부 거부
  for (const [p, why] of [
    ["", "empty"], ["/etc/passwd", "absolute"], ["C:\\x", "backslash"], ["..\\x", "backslash"],
    ["_workspaces/../etc/passwd", "bad_segment"], ["_workspaces/P26-014/../../secret", "bad_segment"],
    ["etc/passwd", "outside_workspaces"], ["_workspaces", "too_shallow"], ["_workspaces/./x", "bad_segment"],
    ["_workspaces/P26-014/ x", "control_char"],
  ]) assert.ok(validateRelPointer(p).error, `거부: ${p} (${why})`);
  assert.ok(validateRelPointer("_workspaces/P26-014/120_CDR/01_In/규격서.pdf").ok, "정상 포인터 통과");
  // 세그먼트: 분리자/점점/제어 거부
  for (const s of ["..", ".", "a/b", "a\\b", "a b"]) assert.ok(safeSegment(s).error, `세그먼트 거부: ${s}`);
  assert.ok(safeSegment("규격서_v2.pdf").ok);
  assert.ok(safeSegment("", { allowEmpty: true }).ok, "빈 subfolder 허용");
});

test("FILEVAULT: safeWorkspacePath — 봉쇄·심볼릭 탈출 차단·정상 서빙", () => {
  const root = mkdtempSync(join(tmpdir(), "fv-"));
  mkdirSync(join(root, "_workspaces", "P26-014", "01_In"), { recursive: true });
  writeFileSync(join(root, "_workspaces", "P26-014", "01_In", "ok.pdf"), "DATA");
  mkdirSync(join(root, "secret"), { recursive: true });
  writeFileSync(join(root, "secret", "passwd"), "SECRET");
  // 정상: 존재하는 파일 서빙
  const okR = safeWorkspacePath(root, "_workspaces/P26-014/01_In/ok.pdf");
  assert.ok(okR.ok && existsSync(okR.path), "정상 서빙 경로");
  // 절대/탈출/미존재 거부
  assert.ok(safeWorkspacePath(root, "/etc/passwd").error);
  assert.ok(safeWorkspacePath(root, "_workspaces/P26-014/../../secret/passwd").error, "../ 탈출 거부");
  assert.equal(safeWorkspacePath(root, "_workspaces/P26-014/01_In/none.pdf").error, "not_found");
  // 심볼릭 탈출: 과제 안에 _workspaces 밖으로 향하는 심볼릭 → realpath 봉쇄로 거부
  symlinkSync(join(root, "secret"), join(root, "_workspaces", "P26-014", "evil"));
  assert.equal(safeWorkspacePath(root, "_workspaces/P26-014/evil/passwd").error, "symlink_escape", "심볼릭 탈출 차단");
  rmSync(root, { recursive: true, force: true });
});

test("FILEVAULT: 정상 심볼릭 과제(OneDrive식)는 허용", () => {
  const root = mkdtempSync(join(tmpdir(), "fv2-"));
  mkdirSync(join(root, "_workspaces"), { recursive: true });
  mkdirSync(join(root, "onedrive", "P26-014", "01_In"), { recursive: true });
  writeFileSync(join(root, "onedrive", "P26-014", "01_In", "a.pdf"), "X");
  symlinkSync(join(root, "onedrive", "P26-014"), join(root, "_workspaces", "P26-014")); // 과제=심볼릭(실환경)
  const r = safeWorkspacePath(root, "_workspaces/P26-014/01_In/a.pdf");
  assert.ok(r.ok, "심볼릭 과제 내부 파일은 허용(realBase=심볼릭 타깃)");
  rmSync(root, { recursive: true, force: true });
});

test("FILEVAULT: safeUploadTarget + commitUpload — 봉쇄·쓰기·해시", () => {
  const root = mkdtempSync(join(tmpdir(), "fv3-"));
  const baseRel = "_workspaces/P26-014/120_CDR/01_In";
  mkdirSync(join(root, "_workspaces", "P26-014", "120_CDR", "01_In"), { recursive: true });
  // 정상 업로드 대상
  const t = safeUploadTarget(root, baseRel, "참고규격", "규격서.pdf");
  assert.ok(t.ok);
  assert.equal(t.rel, "_workspaces/P26-014/120_CDR/01_In/참고규격/규격서.pdf");
  const w = commitUpload(root, t, Buffer.from("hello"));
  assert.ok(w.ok && existsSync(w.path), "파일 기록됨");
  assert.equal(w.size, 5);
  assert.equal(w.sha256.length, 64);
  // 공격: subfolder/filename 분리자·점점 거부
  assert.ok(safeUploadTarget(root, baseRel, "a/b", "x.pdf").error, "subfolder 분리자 거부");
  assert.ok(safeUploadTarget(root, baseRel, "참고", "../../../etc/passwd").error, "filename ../ 거부");
  assert.ok(safeUploadTarget(root, baseRel, "..", "x.pdf").error, "subfolder .. 거부");
  // base 가 _workspaces 밖 → 거부
  assert.ok(safeUploadTarget(root, "etc/passwd", "a", "b").error, "base 밖 거부");
  rmSync(root, { recursive: true, force: true });
});

test("TASK-LEDGER: 할일_장부 행 → core_item ingest(과제필수·enum검증·stub·멱등 왕복)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  // 정상 행 → core_item, enum 매핑
  const r = store.ingestTaskItem({ id: "itm_t1", project_code: "P26-014", title: "회로도 검토", assignee_ref: "kim",
    work_type: "review", status: "doing", due: "2026-07-01", anchor_stage_code: "120_CDR", link_kind: "artifact",
    link_ref: "회로도", completion_criteria: "검토의견 회신", origin: "ledger" });
  assert.equal(r.ok, true); assert.equal(r.isNew, true);
  const it = store.db.prepare("SELECT * FROM core_item WHERE id='itm_t1'").get();
  assert.equal(it.title, "회로도 검토"); assert.equal(it.status, "doing"); assert.equal(it.work_type, "review");
  assert.equal(it.assignee_ref, "kim"); assert.equal(it.anchor_stage_code, "120_CDR"); assert.equal(it.link_kind, "artifact");
  // 과제 필수(메일과 다름): 코드 없거나 형식틀리면 거부
  assert.equal(store.ingestTaskItem({ id: "x", title: "t", project_code: "" }).error, "project_required");
  assert.equal(store.ingestTaskItem({ id: "x", title: "t", project_code: "INBOX" }).error, "project_required");
  // id/title 필수
  assert.equal(store.ingestTaskItem({ project_code: "P26-014", title: "t" }).error, "id_required");
  assert.equal(store.ingestTaskItem({ id: "x", project_code: "P26-014" }).error, "title_required");
  // 미등록 과제 → stub(제목=코드), 기존 제목 미클로버
  store.ingestTaskItem({ id: "itm_t2", project_code: "P99-001", title: "신규" });
  assert.equal(store.db.prepare("SELECT title FROM core_project WHERE id='P99-001'").get().title, "P99-001");
  assert.equal(store.db.prepare("SELECT title FROM core_project WHERE id='P26-014'").get().title, "KVDS", "기존 제목 보존");
  // enum 이상값 → 안전 폴백(상태 open, 업무유형/연결유형 null)
  store.ingestTaskItem({ id: "itm_t3", project_code: "P26-014", title: "x", status: "weird", work_type: "nope", link_kind: "bad" });
  const t3 = store.db.prepare("SELECT * FROM core_item WHERE id='itm_t3'").get();
  assert.equal(t3.status, "open"); assert.equal(t3.work_type, null); assert.equal(t3.link_kind, null);
  // 멱등: 같은 할일키 재-ingest → 신규 아님 + 갱신
  const again = store.ingestTaskItem({ id: "itm_t1", project_code: "P26-014", title: "회로도 검토(수정)", status: "done" });
  assert.equal(again.isNew, false);
  const u = store.db.prepare("SELECT title,status FROM core_item WHERE id='itm_t1'").get();
  assert.equal(u.title, "회로도 검토(수정)"); assert.equal(u.status, "done");
});

test("TASK-LEDGER: 자동화 메타데이터 구조화 ingest + enum 안전 폴백", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  const r = store.ingestTaskItem({
    id: "mailtask:h1", project_code: "P26-014", title: "메일 기반 회신", origin: "mail",
    status: "unclassified", work_type: "review", anchor_stage_code: "030_SRR", completion_criteria: "회신 완료",
    origin_mail_id: "h1", review_status: "needs_review", review_reason: "완료기준 보정 필요",
    correction_reason: "제목 축약", route_candidate: "P26-014", route_confidence: "0.8", route_reason: "메일 장부 과제",
    required_role: "SE", required_capability: "review", suggested_assignee_ref: "kim", assignee_confidence: "medium",
    assignee_reason: "관련 담당", source_candidate_ref: "cand:h1", source_mail_ref: "mailcsv:h1",
    source_mail_source_id: "mail-src-1", source_thread_ref: "thread-1", source_group_ref: "group-1",
    source_lineage_ref: "mailcsv:h1", generation_run_ref: "run-1", generation_rule_ref: "mail_history_to_task_generation_rule",
    sync_state: "pending", sync_revision: "2", sync_hash: "aaaaaaaaaaaaaaaa", sync_at: "2026-06-17T00:00:00Z"
  });
  assert.equal(r.ok, true);
  const it = store.db.prepare("SELECT * FROM core_item WHERE id='mailtask:h1'").get();
  assert.equal(it.origin_mail_id, "mailcsv:h1", "순수 메일키는 mailcsv: 로 정규화");
  assert.equal(it.review_status, "needs_review");
  assert.equal(it.review_reason, "완료기준 보정 필요");
  assert.equal(it.route_confidence, "review", "숫자 라우트 confidence 는 라우팅 enum 으로 보존");
  assert.equal(it.suggested_assignee_ref, "kim");
  assert.equal(it.source_mail_source_id, "mail-src-1");
  assert.equal(it.generation_rule_ref, "mail_history_to_task_generation_rule");
  assert.equal(it.sync_state, "pending");
  assert.equal(it.sync_revision, 2);

  store.ingestTaskItem({ id: "mailtask:h2", project_code: "P26-014", title: "검토필요", origin: "mail",
    review_status: "???", route_confidence: "sure", assignee_confidence: "maybe" });
  const bad = store.db.prepare("SELECT status,review_status,route_confidence,assignee_confidence FROM core_item WHERE id='mailtask:h2'").get();
  assert.equal(bad.status, "unclassified", "인입 할일은 기준점 부족 시 검토 대기로 격리");
  assert.equal(bad.review_status, "needs_review", "알 수 없는 검토상태는 검토 대기로 폴백");
  assert.equal(bad.route_confidence, null);
  assert.equal(bad.assignee_confidence, null);

  store.ingestTaskItem({ id: "mailtask:h3", project_code: "P26-014", title: "개인 알림", origin: "mail",
    route_candidate: "none/personal" });
  const nonWork = store.db.prepare("SELECT route_candidate,route_confidence FROM core_item WHERE id='mailtask:h3'").get();
  assert.equal(nonWork.route_candidate, "none/personal");
  assert.equal(nonWork.route_confidence, "none", "none/* 라우트는 confidence 공란이어도 none 으로 보존");

  const inbox = store.ingestTaskItem({
    id: "mailtask:inbox-h1",
    project_code: "P00-000_INBOX",
    title: "회사 일반 메일 검토",
    origin: "mail",
    work_type: "review",
    completion_criteria: "프로젝트 라우팅 또는 후속일 확정",
    source_mail_ref: "mailcsv:inbox-h1"
  });
  assert.equal(inbox.ok, true);
  const inboxProject = store.db.prepare("SELECT title,class FROM core_project WHERE id='P00-000_INBOX'").get();
  assert.equal(inboxProject.title, "미분류 메일함");
  assert.equal(inboxProject.class, "inbox");
  const inboxItem = store.db.prepare("SELECT project_id,status,review_status,origin_mail_id FROM core_item WHERE id='mailtask:inbox-h1'").get();
  assert.equal(inboxItem.project_id, "P00-000_INBOX");
  assert.equal(inboxItem.status, "unclassified", "예약 인박스도 분류 필요함으로 격리");
  assert.equal(inboxItem.review_status, "needs_review");
  assert.equal(inboxItem.origin_mail_id, "mailcsv:inbox-h1");
  const inboxMail = store.ingestMail({ id: "mailcsv:inbox-h1", project_code: "P00-000_INBOX", at: "2026-06-17T09:00:00+09:00", subject: "회사 일반 메일" });
  assert.equal(inboxMail.ok, true);
  assert.equal(inboxMail.project_id, "P00-000_INBOX");
  assert.equal(store.db.prepare("SELECT project_id FROM core_mail WHERE id='mailcsv:inbox-h1'").get().project_id, "P00-000_INBOX");
});

test("AUTOSYNC-WT: ERP 할일 생성/수정 → 할일_장부 write-through(멱등·atomic)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
  const root = mkdtempSync(join(tmpdir(), "autosync-wt-"));
  store.afterItemWrite = (id) => writeTaskToLedger(store, id, { root });
  // 생성 → 장부에 행 생김(버튼 없이)
  const r = store.createItem({ project_id: "P26-014", title: "써내려가기", origin: "manual", work_type: "author", assignee_ref: "kim", due: "2026-08-01" });
  const file = join(root, "_workmeta", "P26-014", "reports", "할일_장부", "할일_장부.csv");
  let rows = readTaskLedgerRows(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, r.item.id);
  assert.equal(rows[0].title, "써내려가기");
  assert.equal(rows[0].status, "open");
  assert.equal(rows[0].due, "2026-08-01");
  assert.equal(rows[0].sync_state, "synced");
  assert.equal(rows[0].sync_revision, "1");
  assert.equal(rows[0].sync_hash.length, 64);
  // 상태 변경 → 같은 할일키 행 갱신(중복 없음)
  store.setItemStatus(r.item.id, "doing");
  rows = readTaskLedgerRows(file);
  assert.equal(rows.length, 1, "같은 할일키 갱신, 중복 없음");
  assert.equal(rows[0].status, "doing");
  // 담당 변경도 반영
  store.setItemAssignee(r.item.id, "lee");
  assert.equal(readTaskLedgerRows(file)[0].assignee_ref, "lee");
  // 다른 할일 추가 → 기존 행 보존(2건)
  store.createItem({ project_id: "P26-014", title: "두번째", origin: "manual" });
  assert.equal(readTaskLedgerRows(file).length, 2, "다른 할일 추가 시 기존 보존");
  rmSync(root, { recursive: true, force: true });
});

test("AUTOSYNC-WT2: write-through 가 키없는 행·추가컬럼 보존(검토 반영)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
  const root = mkdtempSync(join(tmpdir(), "wt2-"));
  const dir = join(root, "_workmeta", "P26-014", "reports", "할일_장부");
  mkdirSync(dir, { recursive: true });
  // 기존 장부: 키 없는 손편집 행 + HEADERS 외 추가컬럼(메모)
  writeFileSync(join(dir, "할일_장부.csv"),
    "﻿할일키,프로젝트코드,할일명,상태,메모\n,P26-014,손편집 키없는 할일,open,중요\nmailtask:x,P26-014,기존행,open,참고\n");
  store.afterItemWrite = (id) => writeTaskToLedger(store, id, { root });
  store.createItem({ project_id: "P26-014", title: "새 할일", origin: "manual" }); // write-through 발동
  const raw = readFileSync(join(dir, "할일_장부.csv"), "utf8");
  assert.ok(raw.includes("손편집 키없는 할일"), "키 없는 손편집 행 보존(조용한 삭제 방지)");
  assert.ok(raw.includes("메모") && raw.includes("중요"), "HEADERS 외 추가컬럼 보존");
  assert.ok(raw.includes("mailtask:x"), "기존 행 보존");
  assert.ok(readTaskLedgerRows(join(dir, "할일_장부.csv")).some((r) => r.title === "새 할일"), "새 항목 write-through");
  rmSync(root, { recursive: true, force: true });
});

test("AUTOSYNC: 할일_장부 → ERP 자동 import(신규만, 사람 편집 보호)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
  const root = mkdtempSync(join(tmpdir(), "autosync-"));
  const dir = join(root, "_workmeta", "P26-014", "reports", "할일_장부");
  mkdirSync(dir, { recursive: true });
  const csv = "﻿할일키,스키마버전,기록일,프로젝트코드,할일명,담당자,업무유형,상태,마감일,SE단계,연결유형,연결대상,완료기준,출처,관련메일이력키,관련메일소스ID,산출물참조,관련몬스터ID,다음액션,비고,원문복사여부\n"
    + "mailtask:hA,v0,,P26-014,설계 회신,kim,review,unclassified,,030_SRR,,,의견 회신,mail,mailcsv:hA,mail-src-A,,,,옛비고검토,아니오\n";
  writeFileSync(join(dir, "할일_장부.csv"), csv);
  // 1차: 신규 import
  let r = importNewTaskLedgers(store, { root });
  assert.equal(r.imported, 1);
  const it = store.db.prepare("SELECT * FROM core_item WHERE id='mailtask:hA'").get();
  assert.equal(it.title, "설계 회신");
  assert.equal(it.status, "unclassified");
  assert.equal(it.anchor_stage_code, "030_SRR");
  assert.equal(it.origin, "mail");
  assert.equal(it.review_status, "needs_review");
  assert.equal(it.review_reason, "옛비고검토", "기존 비고 기반 검토사유도 구조화 보존");
  assert.equal(it.source_mail_source_id, "mail-src-A");
  assert.equal(it.sync_state, "synced");
  assert.equal(it.sync_hash.length, 64);
  assert.equal(readTaskLedgerRows(join(dir, "할일_장부.csv"))[0].sync_state, "synced", "장부에도 sync 상태가 보인다");
  // 사람이 ERP에서 분류(→open) 후 장부 재import → 신규 아님이라 안 덮음(사람 편집 보존)
  store.db.prepare("UPDATE core_item SET status='open' WHERE id='mailtask:hA'").run();
  r = importNewTaskLedgers(store, { root });
  assert.equal(r.imported, 0, "기존 행은 auto-import 가 안 건드림");
  assert.equal(r.conflicts, 1, "저장소와 장부 hash 가 달라지면 conflict 로 보인다");
  const conflicted = store.db.prepare("SELECT status,sync_state,sync_error FROM core_item WHERE id='mailtask:hA'").get();
  assert.equal(conflicted.status, "open", "사람 분류 보존");
  assert.equal(conflicted.sync_state, "conflict");
  assert.equal(conflicted.sync_error, "existing_item_not_imported");
  rmSync(root, { recursive: true, force: true });
});

test("AUTOSYNC: 장부 현재 행을 재해시해 오래된 sync_hash 의 조용한 누락을 막는다", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
  const root = mkdtempSync(join(tmpdir(), "autosync-stale-hash-"));
  const dir = join(root, "_workmeta", "P26-014", "reports", "할일_장부");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "할일_장부.csv");
  writeFileSync(file, "﻿할일키,스키마버전,기록일,프로젝트코드,할일명,담당자,업무유형,상태,마감일,SE단계,연결유형,연결대상,완료기준,출처,관련메일이력키,관련메일소스ID,산출물참조,관련몬스터ID,다음액션,비고,원문복사여부\n"
    + "mailtask:stale,v0,,P26-014,원래 제목,kim,review,unclassified,,030_SRR,,,확인,mail,mailcsv:stale,mail-src-stale,,,,검토,아니오\n");

  let result = importNewTaskLedgers(store, { root });
  assert.equal(result.imported, 1);
  const before = store.db.prepare("SELECT title,sync_hash FROM core_item WHERE id='mailtask:stale'").get();
  assert.equal(before.title, "원래 제목");
  assert.equal(before.sync_hash.length, 64);

  const syncedCsv = readFileSync(file, "utf8");
  writeFileSync(file, syncedCsv.replace("원래 제목", "장부 손편집 제목"));
  result = importNewTaskLedgers(store, { root });
  assert.equal(result.imported, 0);
  assert.equal(result.conflicts, 1, "저장된 sync_hash 가 오래돼도 현재 행 내용 차이를 conflict 로 잡는다");
  const after = store.db.prepare("SELECT title,sync_state,sync_error FROM core_item WHERE id='mailtask:stale'").get();
  assert.equal(after.title, "원래 제목", "장부 손편집이 기존 ERP 행을 덮지 않음");
  assert.equal(after.sync_state, "conflict");
  assert.equal(after.sync_error, "existing_item_not_imported");
  const [ledgerRow] = readTaskLedgerRows(file);
  assert.equal(ledgerRow.title, "장부 손편집 제목");
  assert.equal(ledgerRow.sync_state, "conflict");
  assert.equal(ledgerRow.sync_error, "existing_item_not_imported");
  rmSync(root, { recursive: true, force: true });
});

test("TASK-LEDGER CLI: --apply 도 sync 상태·충돌을 장부와 DB에 남긴다", () => {
  const root = mkdtempSync(join(tmpdir(), "task-ledger-cli-"));
  const wm = join(root, "_workmeta");
  const dbPath = join(root, "dev-erp.db");
  const dir = join(wm, "P26-014", "reports", "할일_장부");
  mkdirSync(dir, { recursive: true });
  const taskCsv = join(dir, "할일_장부.csv");
  writeFileSync(taskCsv,
    "﻿할일키,스키마버전,기록일,프로젝트코드,할일명,담당자,업무유형,상태,마감일,SE단계,연결유형,연결대상,완료기준,출처,관련메일이력키,관련메일소스ID,산출물참조,관련몬스터ID,다음액션,비고,원문복사여부,소스계보,동기화상태\n"
    + "mailtask:hCli,v0,,P26-014,CLI 적용 확인,kim,review,unclassified,,030_SRR,,,확인 완료,mail,mailcsv:hCli,mail-src-cli,,,,검토사유,아니오,mailcsv:hCli,pending\n");

  execFileSync(process.execPath, [join(APP_DIR, "tools", "task_ledger.mjs"), "--apply", "--db", dbPath, "--out", wm], { cwd: APP_DIR, encoding: "utf8" });
  let store = openStore(dbPath);
  let item = store.db.prepare("SELECT sync_state,sync_hash,source_lineage_ref FROM core_item WHERE id='mailtask:hCli'").get();
  assert.equal(item.sync_state, "synced");
  assert.equal(item.sync_hash.length, 64);
  assert.equal(item.source_lineage_ref, "mailcsv:hCli");
  store.db.prepare("UPDATE core_item SET source_lineage_ref='mailcsv:hCli:edited' WHERE id='mailtask:hCli'").run();
  store.db.close();

  execFileSync(process.execPath, [join(APP_DIR, "tools", "task_ledger.mjs"), "--apply", "--db", dbPath, "--out", wm], { cwd: APP_DIR, encoding: "utf8" });
  store = openStore(dbPath);
  item = store.db.prepare("SELECT sync_state,sync_error FROM core_item WHERE id='mailtask:hCli'").get();
  assert.equal(item.sync_state, "conflict");
  assert.equal(item.sync_error, "existing_item_not_imported");
  store.db.close();
  const [ledgerRow] = readTaskLedgerRows(taskCsv);
  assert.equal(ledgerRow.sync_state, "conflict");
  assert.equal(ledgerRow.sync_error, "existing_item_not_imported");
  rmSync(root, { recursive: true, force: true });
});

test("MAIL-TASK-GEN: 메일 후보 → 할일_장부 자동화 메타데이터 컬럼 생성", () => {
  const root = mkdtempSync(join(tmpdir(), "mailtask-gen-"));
  const wm = join(root, "_workmeta");
  const mailDir = join(wm, "P26-014", "reports", "메일_이력");
  mkdirSync(mailDir, { recursive: true });
  writeFileSync(join(mailDir, "메일_이력.csv"),
    "﻿이력키,제목,메일수신시각,발신자,메일소스ID,스레드키,그룹키,메일함\n"
    + "h1,검토 요청,2026-06-16T09:00:00+09:00,alpha,mail-src-1,thread-1,group-1,owner@corp.com\n"
    + "h2,개인 알림,2026-06-16T10:00:00+09:00,beta,mail-src-2,thread-2,group-2,\n"
    + "h3,메일함 기본 제안,2026-06-16T11:00:00+09:00,gamma,mail-src-3,thread-3,group-3,TEAM@Corp.com\n");
  const candPath = join(root, "candidates.json");
  writeFileSync(candPath, JSON.stringify({
    h1: {
      title: "검토 요청 처리",
      work_type: "review",
      completion_criteria: "검토 의견 회신",
      assignee_ref: "kim",
      review_reason: "LLM 저신뢰",
      route_confidence: 0.7,
      required_role: "SE",
      required_capability: "review",
      suggested_assignee_ref: "kim",
      assignee_confidence: "high",
      assignee_reason: "관련 담당",
      source_candidate_ref: "cand-1"
    },
    h2: {
      title: "개인 알림 제외",
      route_candidate: "none/personal",
      source_candidate_ref: "/tmp/private-candidate",
      source_lineage_ref: "/private/raw-mail",
      suggested_assignee_ref: "/etc/passwd"
    },
    h3: {
      title: "메일함 기본 제안 처리",
      work_type: "answer",
      completion_criteria: "수신자 확인 후 회신"
    }
  }));
  execFileSync(process.execPath, [join(APP_DIR, "tools", "mail_to_task_ledger.mjs"),
    "--project", "P26-014", "--workmeta", wm, "--candidates", candPath, "--stage", "030_SRR",
    "--run-id", "run-test", "--apply"], { cwd: APP_DIR, encoding: "utf8" });
  const taskCsv = join(wm, "P26-014", "reports", "할일_장부", "할일_장부.csv");
  const raw = readFileSync(taskCsv, "utf8");
  for (const h of ["검토상태", "검토사유", "라우트후보", "제안담당자", "소스스레드키", "생성런", "동기화상태"]) {
    assert.ok(raw.includes(h), `${h} 헤더 생성`);
  }
  assert.equal(raw.includes("/tmp/private-candidate"), false);
  assert.equal(raw.includes("/private/raw-mail"), false);
  assert.equal(raw.includes("/etc/passwd"), false);
  const rows = readTaskLedgerRows(taskCsv);
  const row = rows.find((entry) => entry.id === "mailtask:h1");
  const nonWorkRow = rows.find((entry) => entry.id === "mailtask:h2");
  const mailboxRow = rows.find((entry) => entry.id === "mailtask:h3");
  assert.equal(row.id, "mailtask:h1");
  assert.equal(row.assignee_ref, "kim");
  assert.equal(row.review_status, "needs_review");
  assert.equal(row.review_reason, "LLM 저신뢰");
  assert.equal(row.route_candidate, "P26-014");
  assert.equal(row.route_confidence, "review");
  assert.equal(row.source_mail_source_id, "mail-src-1");
  assert.equal(row.source_thread_ref, "thread-1");
  assert.equal(row.source_group_ref, "group-1");
  assert.equal(row.generation_run_ref, "run-test");
  assert.equal(row.generation_rule_ref, "mail_history_to_task_generation_rule");
  assert.equal(row.sync_state, "pending");
  assert.equal(nonWorkRow.route_candidate, "none/personal");
  assert.equal(nonWorkRow.route_confidence, "none");
  assert.equal(nonWorkRow.source_candidate_ref, "");
  assert.equal(nonWorkRow.source_lineage_ref, "");
  assert.equal(nonWorkRow.suggested_assignee_ref, "");
  assert.equal(mailboxRow.assignee_ref, "", "메일함 수신자는 기본 확정 담당자로 넣지 않음");
  assert.equal(mailboxRow.suggested_assignee_ref, "team@corp.com", "메일함은 제안 담당자로만 기본 사용");
  assert.equal(mailboxRow.assignee_confidence, "low");
  assert.ok(mailboxRow.review_reason.includes("메일함 수신자 기본 제안"), "메일함 기본 제안은 검토사유에 남김");
  rmSync(root, { recursive: true, force: true });
});

test("MAIL-TASK-GEN: --assign-mailbox-owner 사용 시 메일함을 확정 담당자로도 기록", () => {
  const root = mkdtempSync(join(tmpdir(), "mailtask-assign-mailbox-"));
  const wm = join(root, "_workmeta");
  const mailDir = join(wm, "P26-014", "reports", "메일_이력");
  mkdirSync(mailDir, { recursive: true });
  writeFileSync(join(mailDir, "메일_이력.csv"),
    "﻿이력키,제목,메일수신시각,발신자,메일소스ID,메일함\n"
    + "h1,회신 요청,2026-06-16T09:00:00+09:00,alpha,mail-src-1,owner@corp.com\n");
  const candPath = join(root, "candidates.json");
  writeFileSync(candPath, JSON.stringify({
    h1: { title: "회신 요청 처리", work_type: "answer", completion_criteria: "회신 완료" }
  }));
  execFileSync(process.execPath, [join(APP_DIR, "tools", "mail_to_task_ledger.mjs"),
    "--project", "P26-014", "--workmeta", wm, "--candidates", candPath, "--stage", "030_SRR",
    "--assign-mailbox-owner", "--apply"], { cwd: APP_DIR, encoding: "utf8" });
  const rows = readTaskLedgerRows(join(wm, "P26-014", "reports", "할일_장부", "할일_장부.csv"));
  assert.equal(rows[0].assignee_ref, "owner@corp.com");
  assert.equal(rows[0].suggested_assignee_ref, "owner@corp.com");
  assert.equal(rows[0].assignee_confidence, "low");
  rmSync(root, { recursive: true, force: true });
});

test("MAIL-TASK-GEN: skeleton 검토작업은 제목 기한 우선, 없으면 메일+3일·리마인드+2일", () => {
  const root = mkdtempSync(join(tmpdir(), "mailtask-review-policy-"));
  const wm = join(root, "_workmeta");
  const mailDir = join(wm, "P26-014", "reports", "메일_이력");
  mkdirSync(mailDir, { recursive: true });
  writeFileSync(join(mailDir, "메일_이력.csv"),
    "﻿이력키,제목,메일수신시각,발신자,메일소스ID,메일함,스레드\n"
    + "h1,자료 검토 요청(~6/20),2026-06-16T09:00:00+09:00,alpha,mail-src-1,owner@corp.com,thread-legacy\n"
    + "h2,후속 일정 확인 요청,2026-06-16T10:00:00+09:00,beta,mail-src-2,owner@corp.com,thread-default\n");
  execFileSync(process.execPath, [join(APP_DIR, "tools", "mail_to_task_ledger.mjs"),
    "--project", "P26-014", "--workmeta", wm, "--skeleton", "--skeleton-review-tasks",
    "--default-review-days", "3", "--reminder-days", "2", "--stage", "030_SRR", "--auto-open", "--apply"], { cwd: APP_DIR, encoding: "utf8" });
  const taskCsv = join(wm, "P26-014", "reports", "할일_장부", "할일_장부.csv");
  const rows = readTaskLedgerRows(taskCsv);
  const dueRow = rows.find((entry) => entry.id === "mailtask:h1");
  const defaultRow = rows.find((entry) => entry.id === "mailtask:h2");
  assert.equal(dueRow.title, "메일 검토: 자료 검토 요청(~6/20)");
  assert.equal(dueRow.work_type, "review");
  assert.equal(dueRow.status, "open");
  assert.equal(dueRow.due, "2026-06-20", "제목의 명시 기한 우선");
  assert.equal(dueRow.source_thread_ref, "thread-legacy", "기존 메일 이력 '스레드' 헤더도 추적");
  assert.match(dueRow.source_lineage_ref, /^mailhistory:P26-014\/reports\/메일_이력\/메일_이력\.csv#h1@[0-9a-f]{16}$/);
  assert.equal(defaultRow.due, "2026-06-19", "기한 없으면 메일 수신일+3일");
  assert.match(defaultRow.completion_criteria, /후속 조치/);
  const raw = readFileSync(taskCsv, "utf8");
  assert.match(raw, /리마인드=2026-06-21/, "기본 검토기한+2일 리마인드 기록");
  assert.match(raw, /2026-06-21까지 후속일\/담당자\/완료기준 미확정 시 급한 일로 재검토/);
  rmSync(root, { recursive: true, force: true });
});

test("MAIL-STAGE: 메일→할일 SE단계=프로젝트 현재상태(메일 추론 금지) + 없으면 미분류", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "K", stage_current: "120_CDR", data_label: "real" });
  store.upsertMail({ id: "m1", project_id: "P26-014", at: "2026-06-15", subject: "회신 요청", data_label: "real" });
  const r = store.promoteMail("m1", "owner");
  assert.equal(r.ok, true);
  assert.equal(r.item.anchor_stage_code, "120_CDR", "SE단계 = 프로젝트 현재상태");
  assert.equal(r.item.status, "unclassified", "업무유형 없어 여전히 미분류(분류/검토 대기)");
  store.upsertProject({ id: "P99-001", title: "N", data_label: "real" });
  assert.equal(store.projectCurrentStage("P99-001"), null);
  store.upsertStage({ id: "P99-001-T-030", project_id: "P99-001", title: "030", stage_code: "030_SRR", seq: 1, status: "open" });
  assert.equal(store.projectCurrentStage("P99-001"), "030_SRR");
  assert.equal(store.projectCurrentStage("P26-014"), "120_CDR", "stage_current 우선");
  store.upsertProject({ id: "P88-001", title: "X", data_label: "real" });
  store.upsertMail({ id: "m2", project_id: "P88-001", at: "2026-06-15", subject: "안내", data_label: "real" });
  assert.equal(store.promoteMail("m2", "owner").item.anchor_stage_code, null);
});

test("DELIV-SPAWN: 일정→할일 — 산출물에서 할일 생성(앵커·마감 상속·분류완료·멱등)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "120_CDR", deliverable_no: "125",
    name: "HW설계기술서(HDD)", completion_criteria: "03_Out 결과물", due: "2026-08-01" });
  const id = "P26-014:120_CDR:125";
  const r = store.spawnTaskFromDeliverable(id);
  assert.equal(r.ok, true);
  const it = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(r.item.id);
  assert.equal(it.title, "HW설계기술서(HDD)");
  assert.equal(it.status, "open", "일정→할일은 SE앵커 있어 분류완료(open)");
  assert.equal(it.anchor_stage_code, "120_CDR");
  assert.equal(it.link_kind, "artifact");
  assert.equal(it.work_type, "author");
  assert.equal(it.due, "2026-08-01", "산출물 마감(언제) 상속");
  assert.equal(it.completion_criteria, "03_Out 결과물");
  assert.equal(it.origin, "schedule");
  assert.equal(store.coreDeliverables({ project: "P26-014" })[0].task_id, r.item.id);
  const dup = store.spawnTaskFromDeliverable(id);
  assert.equal(dup.error, "already_spawned");
  assert.equal(dup.item_id, r.item.id);
  assert.equal(store.spawnTaskFromDeliverable("nope").error, "deliverable_not_found");
});

test("TASK-LEDGER-HARDEN: 멱등 보존·due override·SE격리·출처enum·절대경로·created_at (검토 반영)", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" });
  // 1) 멱등 보존: 풍부한 행 ingest 후 빈 컬럼 행 재-ingest → 기존값 안 지워짐(COALESCE)
  store.ingestTaskItem({ id: "k1", project_code: "P26-014", title: "검토", assignee_ref: "kim", work_type: "review",
    link_kind: "artifact", link_ref: "회로도", completion_criteria: "회신", anchor_stage_code: "120_CDR", status: "doing", origin: "manual" });
  store.ingestTaskItem({ id: "k1", project_code: "P26-014", title: "검토(제목만 수정)" }); // 나머지 빈칸
  const k1 = store.db.prepare("SELECT * FROM core_item WHERE id='k1'").get();
  assert.equal(k1.title, "검토(제목만 수정)");
  assert.equal(k1.assignee_ref, "kim", "빈칸 재-ingest 가 담당자 안 지움");
  assert.equal(k1.work_type, "review"); assert.equal(k1.completion_criteria, "회신"); assert.equal(k1.status, "doing");
  // 2) created_at 자동 채움
  assert.ok(k1.created_at && /^\d{4}-\d{2}-\d{2}/.test(k1.created_at), "생성시각 채워짐");
  // 3) owner 마감 수정(due_overridden=1)은 stale 장부가 못 되돌림
  store.db.prepare("UPDATE core_item SET due='2026-09-01', due_overridden=1 WHERE id='k1'").run();
  store.ingestTaskItem({ id: "k1", project_code: "P26-014", title: "검토", due: "2026-07-01" });
  assert.equal(store.db.prepare("SELECT due FROM core_item WHERE id='k1'").get().due, "2026-09-01", "owner 마감 보존");
  // 4) SE 격리: 인입(mail) 출처 + 앵커/업무유형 없이 status open 으로 와도 unclassified 강제
  store.ingestTaskItem({ id: "k2", project_code: "P26-014", title: "메일할일", status: "open", origin: "mail" });
  assert.equal(store.db.prepare("SELECT status FROM core_item WHERE id='k2'").get().status, "unclassified");
  // ledger 출처는 그대로 honored
  store.ingestTaskItem({ id: "k3", project_code: "P26-014", title: "장부할일", status: "open", origin: "ledger" });
  assert.equal(store.db.prepare("SELECT status FROM core_item WHERE id='k3'").get().status, "open");
  // 5) 출처 enum 폴백
  store.ingestTaskItem({ id: "k4", project_code: "P26-014", title: "x", origin: "maill" });
  assert.equal(store.db.prepare("SELECT origin FROM core_item WHERE id='k4'").get().origin, "ledger");
  // 6) 절대경로 포인터 드롭(헌장)
  const volumePath = ["", "Volumes", "local-only", "file.hwp"].join("/");
  const tmpPath = ["", "tmp", "local-only.hwp"].join("/");
  const winPath = ["C:", "local-only", "file.hwp"].join("\\");
  store.ingestTaskItem({ id: "k5", project_code: "P26-014", title: "x", link_kind: "artifact", link_ref: volumePath });
  assert.equal(store.db.prepare("SELECT link_ref FROM core_item WHERE id='k5'").get().link_ref, null, "절대경로 드롭");
  store.ingestTaskItem({ id: "k6", project_code: "P26-014", title: "x", link_kind: "artifact", link_ref: "_workspaces/P26-014/도면" });
  assert.equal(store.db.prepare("SELECT link_ref FROM core_item WHERE id='k6'").get().link_ref, "_workspaces/P26-014/도면", "상대경로 보존");
  store.ingestTaskItem({ id: "k7", project_code: "P26-014", title: "x", link_kind: "artifact", link_ref: tmpPath });
  assert.equal(store.db.prepare("SELECT link_ref FROM core_item WHERE id='k7'").get().link_ref, null, "일반 Unix 절대경로 드롭");
  store.ingestTaskItem({ id: "k8", project_code: "P26-014", title: "x", link_kind: "artifact", link_ref: winPath });
  assert.equal(store.db.prepare("SELECT link_ref FROM core_item WHERE id='k8'").get().link_ref, null, "Windows 절대경로 드롭");
  // 7) 관련메일이력키는 순수 이력키 입력도 core_mail id 네임스페이스로 정규화한다.
  store.ingestTaskItem({ id: "k9", project_code: "P26-014", title: "메일연결", origin_mail_id: "hist-001" });
  assert.equal(store.db.prepare("SELECT origin_mail_id FROM core_item WHERE id='k9'").get().origin_mail_id, "mailcsv:hist-001");
  store.ingestTaskItem({ id: "k10", project_code: "P26-014", title: "메일연결2", origin_mail_id: "mailcsv:hist-002" });
  assert.equal(store.db.prepare("SELECT origin_mail_id FROM core_item WHERE id='k10'").get().origin_mail_id, "mailcsv:hist-002");
  store.ingestTaskItem({ id: "k11", project_code: "P26-014", title: "메일연결3", origin_mail_id: "mail_manual_001" });
  assert.equal(store.db.prepare("SELECT origin_mail_id FROM core_item WHERE id='k11'").get().origin_mail_id, "mail_manual_001");
});

test("THROUGHPUT: 최근 N일 완료(→done) 일별 집계(done만·다른kind 제외·과제필터)", () => {
  const store = freshStore();
  const today = new Date().toISOString().slice(0, 10);
  store.appendEvent({ kind: "item_status", to: "done", project_ref: "P1", data_label: "real", at: today + "T10:00:00Z" });
  store.appendEvent({ kind: "item_status", to: "done", project_ref: "P1", data_label: "real", at: today + "T11:00:00Z" });
  store.appendEvent({ kind: "item_status", to: "doing", project_ref: "P1", data_label: "real", at: today + "T12:00:00Z" }); // done 아님
  store.appendEvent({ kind: "item_promote", to: "done", project_ref: "P1", data_label: "real", at: today + "T13:00:00Z" }); // 다른 kind
  const t = store.throughput({ days: 7 });
  assert.equal(t.daily.length, 7);
  assert.equal(t.daily[t.daily.length - 1].d, today);
  assert.equal(t.daily[t.daily.length - 1].n, 2, "오늘 완료 2건(done·item_status만)");
  assert.equal(t.total, 2);
  assert.equal(t.max, 2);
  store.appendEvent({ kind: "item_status", to: "done", project_ref: "P2", data_label: "real", at: today + "T10:00:00Z" });
  assert.equal(store.throughput({ days: 7, project: "P1" }).total, 2, "과제필터 P1");
  assert.equal(store.throughput({ days: 7 }).total, 3, "전체");
});

test("MINE: 내 일 필터 — assignee_any(로그인명/사람이름) 매칭 + accountIdentities", () => {
  const store = freshStore();
  store.upsertProject({ id: "PRJ-A", title: "A", data_label: "real" });
  store.upsertPerson({ id: "p-kim", name: "김철수" });
  store.createItem({ project_id: "PRJ-A", title: "내것(로그인명)", assignee_ref: "kim" });
  store.createItem({ project_id: "PRJ-A", title: "내것(이름)", assignee_ref: "김철수" });
  store.createItem({ project_id: "PRJ-A", title: "남의것", assignee_ref: "박영희" });
  store.createItem({ project_id: "PRJ-A", title: "무담당" });
  // 두 식별자 중 하나라도 매칭 → 내 일 2건
  const mine = store.items({ assignee_any: ["kim", "김철수"] });
  assert.equal(mine.length, 2);
  assert.ok(mine.every((i) => ["kim", "김철수"].includes(i.assignee_ref)));
  // 빈 식별자(익명) → 빈 결과(전체 노출 아님)
  assert.equal(store.items({ assignee_any: [] }).length, 0);
  // 필터 없음(전체) → 4건
  assert.equal(store.items({}).length, 4);
  // accountIdentities: 로그인명 + 연결된 사람 이름
  assert.deepEqual(store.accountIdentities({ username: "kim", person_id: "p-kim" }), ["kim", "김철수"]);
  assert.deepEqual(store.accountIdentities(null), []);
  assert.deepEqual(store.accountIdentities({ username: "solo" }), ["solo"]);
});

test("DELIV-REVIEW: 완료게이트 본인→팀→리드 진행 + 파일없으면 차단 + 재-ingest 보존", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-014", title: "P26-014", data_label: "real" });
  // produced 산출물 → review_stage 1(작성됨)
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "030_SRR", deliverable_no: "040", name: "SSRS", produced: 1 });
  const id = "P26-014:030_SRR:040";
  assert.equal(store.coreDeliverables({ project: "P26-014" })[0].review_stage, 1);
  // 1→2→3→4 진행
  assert.equal(store.setDeliverableReview(id, 2).review_stage, 2);
  assert.equal(store.setDeliverableReview(id, 3).review_stage, 3);
  assert.equal(store.setDeliverableReview(id, 4).review_stage, 4);
  // 되돌리기
  assert.equal(store.setDeliverableReview(id, 3).review_stage, 3);
  // 범위/없는id
  assert.equal(store.setDeliverableReview(id, 5).error, "review_stage_range");
  assert.equal(store.setDeliverableReview("nope", 2).error, "deliverable_not_found");
  // 파일(03_Out) 없는 산출물은 검토 2 이상 차단
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "060_PDR", deliverable_no: "070", name: "초안", produced: 0 });
  assert.equal(store.setDeliverableReview("P26-014:060_PDR:070", 2).error, "needs_produced");
  // 재-ingest: 사람이 올린 검토(>=2)는 보존, 산출물명(뭘)은 갱신
  store.upsertCoreDeliverable({ project_id: "P26-014", stage_code: "030_SRR", deliverable_no: "040", name: "SSRS v2", produced: 1 });
  const row = store.coreDeliverables({ project: "P26-014", stage: "030_SRR" })[0];
  assert.equal(row.name, "SSRS v2");
  assert.equal(row.review_stage, 3, "사람 검토단계(>=2)는 재-ingest 가 덮지 않음");
});

test("MAIL-INGEST: 메일 장부 한 행 → core_mail(단계·소스·예약인박스·stub과제·제목폴백·멱등)", () => {
  const store = freshStore();
  // 미등록 과제코드 → stub 과제 생성 + 메일 1건(단계/소스 보존), 신규
  const r = store.ingestMail({ id: "mailcsv:k1", project_code: "P21-062", at: "2026-05-01 09:30:00",
    subject: "회신 요청", counterpart: "갑사 담당", stage_code: "030_SRR", source_ref: "src-1" });
  assert.equal(r.ok, true);
  assert.equal(r.project_id, "P21-062");
  assert.equal(r.isNew, true);
  const row = store.db.prepare("SELECT * FROM core_mail WHERE id='mailcsv:k1'").get();
  assert.equal(row.stage_code, "030_SRR");
  assert.equal(row.source_ref, "src-1");
  assert.equal(row.subject, "회신 요청");
  assert.ok(store.db.prepare("SELECT 1 FROM core_project WHERE id='P21-062'").get(), "미등록 과제는 stub 생성");
  // 기존 과제 제목은 ingest 가 덮지 않음
  store.upsertProject({ id: "P26-014", title: "KVDS 기뢰탐색", data_label: "real" });
  store.ingestMail({ id: "mailcsv:k2", project_code: "P26-014", at: "2026-05-02", subject: "" });
  assert.equal(store.db.prepare("SELECT title FROM core_project WHERE id='P26-014'").get().title, "KVDS 기뢰탐색", "기존 제목 보존");
  assert.equal(store.db.prepare("SELECT subject FROM core_mail WHERE id='mailcsv:k2'").get().subject, "(제목 없음)", "제목 폴백");
  // 인박스/미배정: project_code 없으면 project_id null
  const inbox = store.ingestMail({ id: "mailcsv:k3", project_code: null, at: "2026-05-03", subject: "안내" });
  assert.equal(inbox.project_id, null);
  const reservedInbox = store.ingestMail({ id: "mailcsv:k4", project_code: "P00-000_INBOX", at: "2026-05-04", subject: "회사 일반 안내" });
  assert.equal(reservedInbox.project_id, "P00-000_INBOX");
  const reservedProject = store.db.prepare("SELECT title,class FROM core_project WHERE id='P00-000_INBOX'").get();
  assert.equal(reservedProject.title, "미분류 메일함");
  assert.equal(reservedProject.class, "inbox");
  // 날짜 없으면 거부(at NOT NULL 보호)
  assert.equal(store.ingestMail({ id: "mailcsv:x", project_code: null, at: "", subject: "x" }).error, "at_required");
  // 멱등: 같은 id 재-ingest → 신규 아님 + 필드 갱신
  const again = store.ingestMail({ id: "mailcsv:k1", project_code: "P21-062", at: "2026-05-01", subject: "회신 요청(수정)", stage_code: "060_PDR", source_ref: "src-1" });
  assert.equal(again.isNew, false);
  assert.equal(store.db.prepare("SELECT subject FROM core_mail WHERE id='mailcsv:k1'").get().subject, "회신 요청(수정)");
  assert.equal(store.db.prepare("SELECT stage_code FROM core_mail WHERE id='mailcsv:k1'").get().stage_code, "060_PDR");
});

test("MAIL-INGEST: scan_mail_ledger 가 메일함 컬럼을 core_mail.mailbox 로 보존", () => {
  const root = mkdtempSync(join(tmpdir(), "scan-mailbox-"));
  const wm = join(root, "_workmeta");
  const dbPath = join(root, "dev-erp.db");
  const mailDir = join(wm, "P26-014", "reports", "메일_이력");
  mkdirSync(mailDir, { recursive: true });
  writeFileSync(join(mailDir, "메일_이력.csv"),
    "﻿이력키,발생시각,프로젝트코드,단계,메일소스ID,메일수신시각,제목,발신자,이벤트유형,메일함\n"
    + "hist-1,2026-06-16T09:00:00+09:00,P26-014,received,mail-src-1,2026-06-16T09:00:00+09:00,검토 요청,alpha,수신,TEAM@Corp.com\n");
  execFileSync(process.execPath, [join(APP_DIR, "tools", "scan_mail_ledger.mjs"),
    "--apply", "--db", dbPath, "--workmeta", wm, "--project", "P26-014"], { cwd: APP_DIR, encoding: "utf8" });
  const store = openStore(dbPath);
  const row = store.db.prepare("SELECT mailbox,direction FROM core_mail WHERE id='mailcsv:hist-1'").get();
  assert.equal(row.mailbox, "team@corp.com");
  assert.equal(row.direction, "in");
  store.db.close();
  rmSync(root, { recursive: true, force: true });
});

test("B5: 라벨 감사기 — 커버리지 집계 + 결손 주입 검출", async () => {
  const { audit, auditSince } = await import("../tools/label_audit.mjs");
  const good = (id, kind) => ({ id, kind, actor_ref: "owner", used_refs: '["items"]', data_label: "real", project_ref: "P1" });
  // 전부 정상
  const clean = audit([good(1, "item_create"), good(2, "mail_assign")]);
  assert.equal(clean.coverage.used_refs, 1);
  assert.equal(clean.coverage.project_ref, 1);
  assert.equal(clean.coverage.data_label, 1);
  // 결손 주입: refs 빈 배열 / project_ref null / data_label null / 깨진 JSON
  const dirty = audit([
    good(1, "a"),
    { id: 2, kind: "b", actor_ref: "x", used_refs: "[]", data_label: "real", project_ref: null },
    { id: 3, kind: "c", actor_ref: null, used_refs: "not-json", data_label: null, project_ref: "P1" }
  ]);
  assert.equal(dirty.used_refs_present, 1);
  assert.equal(dirty.offenders.no_used_refs.length, 2);
  assert.deepEqual(dirty.offenders.no_project_ref, [2]);
  assert.deepEqual(dirty.offenders.no_data_label, [3]);
  assert.ok(dirty.coverage.used_refs < 0.4);
  // 도입 시점 이후만 따로 (id > 2)
  const recent = auditSince([good(1, "a"), good(3, "b"), { id: 4, kind: "c", used_refs: "[]", data_label: "real", project_ref: null }], 2);
  assert.equal(recent.total, 2);
  assert.equal(recent.offenders.no_used_refs.length, 1);
  // 빈 입력 안전
  assert.equal(audit([]).coverage.used_refs, 1);
});

// ---------- P2b: 계정·세션·권한·레이아웃 (TEST-P2b) ----------
import { hashPassword, verifyPassword } from "../src/store.mjs";

test("P2b: 비밀번호 해시 roundtrip (평문 미저장)", () => {
  const h = hashPassword("s3cret!");
  assert.ok(h.startsWith("scrypt$"), "scrypt 형식");
  assert.ok(!h.includes("s3cret"), "평문이 들어가면 안 됨");
  assert.equal(verifyPassword("s3cret!", h), true);
  assert.equal(verifyPassword("wrong", h), false);
});

test("P2b: 계정 생성·로그인·세션 검증/만료/삭제", () => {
  const store = freshStore();
  assert.equal(store.accountCount(), 0, "기본 익명(계정 0)");
  const r = store.createAccount({ username: "owner", password: "pw123", roles: [] });
  assert.ok(r.ok && r.id);
  assert.equal(store.createAccount({ username: "owner", password: "x" }).error, "username_taken");
  assert.equal(store.verifyLogin("owner", "pw123").username, "owner");
  assert.equal(store.verifyLogin("owner", "bad"), null);
  const tok = store.createSession(r.id);
  assert.equal(store.sessionAccount(tok).id, r.id);
  // 만료 세션
  const expTok = store.createSession(r.id, -1);
  assert.equal(store.sessionAccount(expTok), null, "만료 세션은 무효");
  store.deleteSession(tok);
  assert.equal(store.sessionAccount(tok), null, "삭제 후 무효(logout)");
});

test("P2b: RBAC visible-but-locked 권한 합집합", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "u", password: "p" }).id;
  store.upsertRole("member", "팀원");
  store.assignRole(a, "member");
  store.setPermission("member", "mod:gates", true, false);  // 보이되 잠김
  store.setPermission("member", "view:items", true, true);
  const perms = Object.fromEntries(store.permsFor(a).map((x) => [x.resource, x]));
  assert.equal(perms["mod:gates"].visible, true);
  assert.equal(perms["mod:gates"].access, false, "잠김");
  assert.equal(perms["view:items"].access, true);
});

test("P2b: 계정별 레이아웃 저장/로드 roundtrip", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "u2", password: "p" }).id;
  assert.equal(store.getLayout(a), null, "초기 없음 → 기본 사용");
  const layout = [{ id: "projects", x: 0, y: 0, w: 12, h: 12 }, { id: "kpi", x: 0, y: 12, w: 3, h: 7 }];
  store.setLayout(a, layout);
  assert.deepEqual(store.getLayout(a), layout, "저장→로드 동일(logout 내성)");
});

// ---------- P2b 엣지케이스 하드닝 (Run1 자율) ----------
test("P2b 엣지: 세션 토큰 빈값/오염/만료정리", () => {
  const store = freshStore();
  assert.equal(store.sessionAccount(null), null);
  assert.equal(store.sessionAccount(""), null);
  assert.equal(store.sessionAccount("nonexistent-token"), null);
  const a = store.createAccount({ username: "e1", password: "p" }).id;
  store.createSession(a, -1);           // 이미 만료
  const live = store.createSession(a);  // 유효
  const purged = store.purgeExpiredSessions();
  assert.ok(purged.removed >= 1, "만료 세션 정리");
  assert.equal(store.sessionAccount(live).id, a, "유효 세션은 보존");
});

test("P2b 엣지: 로그인 빈 입력·없는 사용자 안전", () => {
  const store = freshStore();
  assert.equal(store.verifyLogin("", ""), null);
  assert.equal(store.verifyLogin("ghost", "x"), null);
  assert.equal(store.createAccount({ username: "", password: "p" }).error, "username_password_required");
  assert.equal(store.createAccount({ username: "u", password: "" }).error, "username_password_required");
});

test("P2b 엣지: 레이아웃 비배열/오염 방어", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "e2", password: "p" }).id;
  store.setLayout(a, { not: "array" });          // 비배열 → []
  assert.deepEqual(store.getLayout(a), []);
  store.setLayout(a, null);                       // null → []
  assert.deepEqual(store.getLayout(a), []);
  // 오염 JSON 직접 주입 → getLayout null
  store.db.prepare("UPDATE user_dashboard_layout SET layout_json='{bad' WHERE account_id=?").run(a);
  assert.equal(store.getLayout(a), null);
});

test("P2b 엣지: 권한 다중역할 union(하나라도 access면 허용)", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "e3", password: "p" }).id;
  store.upsertRole("r_deny"); store.upsertRole("r_allow");
  store.assignRole(a, "r_deny"); store.assignRole(a, "r_allow");
  store.setPermission("r_deny", "mod:gates", true, false);
  store.setPermission("r_allow", "mod:gates", true, true);
  const p = store.permsFor(a).find((x) => x.resource === "mod:gates");
  assert.equal(p.access, true, "한 역할이라도 access면 union=허용");
  assert.equal(store.permsFor("no-such-account").length, 0, "역할 없으면 빈 권한");
});

// ---------- 회의록 메타 구조 (Run2 자율) ----------
test("회의록: 생성·목록·수동 액션아이템 링크 (원문/자동추출 없음)", () => {
  const store = freshStore();
  loadFixture(store);
  const projId = store.summary("2026-06-13", "2026-06-20")[0].id;
  assert.equal(store.createMeeting({ title: "" }).error, "title_required");
  const m = store.createMeeting({ title: "주간 회의", project_id: projId, at: "2026-06-13", attendees: "owner,팀원", summary_pointer: "_workmeta/.../notes.md" });
  assert.ok(m.ok && m.id);
  const list = store.meetings({});
  assert.ok(list.find((x) => x.id === m.id), "목록에 포함");
  assert.equal(store.meetings({ project: projId }).length >= 1, true);
  // 액션아이템: 기존 할일 수동 링크
  const item = store.createItem({ project_id: projId, title: "회의 후속 작업", created_by: "owner" });
  assert.equal(store.linkActionItem("no-mtg", item.item.id).error, "meeting_not_found");
  assert.equal(store.linkActionItem(m.id, "no-item").error, "item_not_found");
  assert.ok(store.linkActionItem(m.id, item.item.id).ok);
  const acts = store.meetingActions(m.id);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].title, "회의 후속 작업");
});

// ---------- 산출물 진행률 집계 (자율 main slice) ----------
test("guideSummary: 합성 가이드 시드 → 진행률 다양", () => {
  const store = freshStore();
  loadFixture(store);
  const sum = store.guideSummary();
  assert.ok(sum.length >= 3, "프로젝트별 가이드 집계");
  const a = sum.find((x) => x.project_id === "PRJ-A");
  assert.ok(a && a.artifacts === 2, "PRJ-A 산출물 2");
  assert.equal(a.steps_total, 14, "2 산출물 × 7 스텝");
  assert.equal(a.steps_done, 10, "7+3 done");
  assert.equal(a.pct, Math.round(10 / 14 * 100));
  const c = sum.find((x) => x.project_id === "PRJ-C");
  assert.equal(c.pct, 0, "PRJ-C 0%");
});

// ---------- A1/A2: 게이트 판정·강제 ----------
test("게이트: 판정(passable/reasons) + 기본 hard 강제", () => {
  const store = freshStore();
  loadFixture(store);
  const gates = store.gates({ project: "PRJ-A" });
  const s1 = gates.find((g) => g.id === "PRJ-A-S1");
  const s2 = gates.find((g) => g.id === "PRJ-A-S2");
  assert.equal(s1.status, "cleared");
  assert.equal(s1.passable, true, "cleared 스테이지는 통과 가능");
  assert.ok(s2.open_items > 0, "S2에 미완 할일 존재");
  assert.equal(s2.passable, false, "미완/차단 있으면 통과 불가");
  assert.ok(s2.reasons.some((r) => r.code === "open_items"), "사유에 open_items");
  // 기본 모드 = hard
  assert.equal(store.gateMode(), "hard");
  const blocked = store.clearStage("PRJ-A-S2");
  assert.equal(blocked.error, "gate_blocked", "hard 모드 미충족 통과 차단");
  // force 통과
  const forced = store.clearStage("PRJ-A-S2", { force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.forced, true);
});

test("게이트: soft 모드 전환 시 경고 후 통과 허용 + 이미 통과 처리", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.setGateMode("soft").mode, "soft");
  const r = store.clearStage("PRJ-B-S2"); // 미충족이지만 soft → 통과
  assert.equal(r.ok, true);
  assert.equal(r.forced, true, "soft 통과는 forced 플래그");
  assert.equal(store.clearStage("PRJ-B-S1").already, true, "이미 cleared");
  assert.equal(store.clearStage("no-such").error, "stage_not_found");
  assert.equal(store.setGateMode("hard").mode, "hard", "되돌리기 가능");
});

// ---------- A6: 보스 HP(잔여) 계산 ----------
test("게이트 보스 HP: 잔여 = 미완+차단+미완절차, cleared면 통과", () => {
  const store = freshStore();
  loadFixture(store);
  const s2 = store.gates({ project: "PRJ-A" }).find((g) => g.id === "PRJ-A-S2");
  assert.equal(s2.remaining, s2.open_items + s2.blocked_items + (s2.steps_total - s2.steps_done) + s2.required_missing);
  assert.ok(s2.remaining > 0, "미충족이면 보스 HP > 0");
  const s1 = store.gates({ project: "PRJ-A" }).find((g) => g.id === "PRJ-A-S1");
  assert.equal(s1.passable, true);
});

// ---------- A3: LLM 어댑터(메타/요약, 외부전송 0) ----------
import { buildMetaContext, contextToText, runLlm } from "../src/llm.mjs";

test("LLM 컨텍스트: 메타/요약만 — 원문/본문 필드 없음", () => {
  const store = freshStore();
  loadFixture(store);
  const ctx = buildMetaContext(store, { days: 90 });
  assert.equal(ctx.kind, "meta_summary_only");
  assert.ok(ctx.projects.length >= 1);
  // 메일 메타에 본문/첨부 필드가 없어야 함(원문 미포함 가드)
  for (const m of ctx.recent_mail_meta) {
    assert.deepEqual(Object.keys(m).sort(), ["at", "dir", "subject"]);
    assert.ok(!("body" in m) && !("raw" in m) && !("attachment" in m));
  }
  assert.ok(contextToText(ctx).includes("원문 미포함"));
});

test("LLM 어댑터: stub=외부전송0, codex_cli=미가용 폴백 + llm_call 이벤트", async () => {
  const store = freshStore();
  loadFixture(store);
  const ctx = buildMetaContext(store, {});
  const r1 = await runLlm({ provider: "stub", user: "현황 요약", context: ctx }, { store });
  assert.equal(r1.external, false);
  assert.ok(r1.text.includes("질문: 현황 요약"));
  const r2 = await runLlm({ provider: "codex_cli", user: "x", context: ctx }, { store });
  assert.equal(r2.external, true);
  assert.equal(r2.delivered, false, "sandbox는 외부 미수행(폴백)");
  const calls = store.recentEvents(10, null).filter((e) => e.kind === "llm_call");
  assert.ok(calls.length >= 2, "llm_call 이벤트 기록");
});

// ---------- A7: 챗봇 (메타 컨텍스트, stub) ----------
test("챗봇: 메타 컨텍스트로 stub 응답 + 빈 메시지 거부", async () => {
  const store = freshStore();
  loadFixture(store);
  const ctx = buildMetaContext(store, {});
  const r = await runLlm({ provider: "stub", user: "차단된 일 있어?", context: ctx }, { store });
  assert.ok(r.text.includes("차단된 일 있어?"));
  assert.equal(r.external, false);
});

// ---------- A4/A5: 업무일지·보고서 생성기 (메타 기반) ----------
test("업무일지 초안: 메타 이벤트 집계 + 원문 미사용 문구", () => {
  const store = freshStore();
  loadFixture(store);
  // 활동 몇 건 생성
  const it = store.createItem({ project_id: "PRJ-A", title: "자동화 테스트 작업", created_by: "owner" });
  store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "item_create", item_ref: it.item.id, to: it.item.title, project_ref: "PRJ-A", used_refs: ["items"], data_label: "real" });
  store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "item_status", item_ref: it.item.id, to: "done", project_ref: "PRJ-A", used_refs: ["items"], data_label: "real" });
  const w = store.worklogDraft({ days: 7 });
  assert.ok(w.counts.created >= 1 && w.counts.done >= 1);
  assert.ok(w.text.includes("업무일지 초안") && w.text.includes("원문 미사용"));
});

test("보고서/연구노트 초안: 과제 메타 + 산출물 포인터(원문 미포함)", () => {
  const store = freshStore();
  loadFixture(store);
  const r = store.reportDraft({ project: "PRJ-A", kind: "report" });
  assert.ok(r.text.includes("보고서 초안") && r.text.includes("PRJ-A"));
  assert.ok(r.text.includes("원문/첨부 미포함"));
  const n = store.reportDraft({ kind: "note" });
  assert.ok(n.text.includes("연구노트 초안"));
});

// ---------- 구매/발주 ----------
test("구매: 거래처 마스터 + 발주 체인 + 과제 N:N + 필터", () => {
  const store = freshStore();
  loadFixture(store);
  const vendors = store.parties({ kind: "vendor" });
  assert.ok(vendors.length >= 3, "거래처 마스터 시드");
  const all = store.purchases({});
  assert.ok(all.length >= 4, "발주 시드");
  // 과제 N:N: po-002는 PRJ-A·PRJ-B 둘 다
  const po2 = all.find((p) => p.id === "po-002");
  assert.deepEqual(po2.projects.sort(), ["PRJ-A", "PRJ-B"]);
  assert.ok(po2.party_name, "거래처명 조인");
  // 과제 필터: PRJ-A 발주 = po-001,002,003
  const aPos = store.purchases({ project: "PRJ-A" }).map((p) => p.id).sort();
  assert.deepEqual(aPos, ["po-001", "po-002", "po-003"]);
  // 체인 진행
  assert.equal(store.setPurchaseStage("po-001", "receive").to, "receive");
  assert.equal(store.setPurchaseStage("po-001", "bad").error, "bad_stage");
  assert.equal(store.setPurchaseStage("nope", "order").error, "purchase_not_found");
});

test("구매: 생성 + 과제 링크 가드", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.createPurchase({ title: "" }).error, "title_required");
  const r = store.createPurchase({ title: "신규 발주", party_id: "vendor-a", projects: ["PRJ-C"] });
  assert.ok(r.ok);
  assert.deepEqual(store.purchaseProjects(r.id), ["PRJ-C"]);
  assert.equal(store.linkPurchaseProject(r.id, "no-proj").error, "project_not_found");
});

// ---------- 파일 첨부(메타 포인터) + 배치 제안 ----------
test("첨부: 포인터 등록(원문 미저장) + 배치 제안(자동적용 아님)", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.addAttachment({ entity_type: "project", entity_id: "PRJ-A", name: "", pointer: "x" }).error, "name_pointer_required");
  assert.equal(store.addAttachment({ entity_type: "bad", entity_id: "x", name: "a.pdf", pointer: "p" }).error, "bad_entity_type");
  const r = store.addAttachment({ entity_type: "project", entity_id: "PRJ-A", name: "요구사항.pdf", pointer: "_ws/PRJ-A/req.pdf" });
  assert.ok(r.ok);
  assert.equal(r.suggested.category, "doc", "pdf→문서 제안");
  assert.equal(r.suggested.proposed, true, "제안일 뿐(자동적용 아님)");
  const list = store.attachments({ entity_type: "project", entity_id: "PRJ-A" });
  assert.equal(list.length, 1);
  assert.equal(list[0].pointer, "_ws/PRJ-A/req.pdf");
  assert.ok(!("content" in list[0]) && !("blob" in list[0]), "원문 미저장");
  // 배치 제안 분류
  assert.equal(store.suggestPlacement("board.step").category, "drawing");
  assert.equal(store.suggestPlacement("data.xlsx").category, "sheet");
  assert.equal(store.suggestPlacement("noext").category, "etc");
});

// ---------- 거래처별 거래이력 집계 ----------
test("거래처 거래이력: 발주 건수·총액·진행/완료 집계", () => {
  const store = freshStore();
  loadFixture(store);
  const led = store.partyLedger();
  const a = led.find((x) => x.party_id === "vendor-a");
  assert.equal(a.count, 2, "A상사 발주 2건(po-001,po-004)");
  assert.equal(a.total_amount, 1250000 + 9100000);
  assert.equal(a.open, 2, "둘 다 미완(order·inspect)");
  // 총액 내림차순 정렬
  assert.ok(led[0].total_amount >= led[led.length - 1].total_amount);
});

// ---------- 연락처 마스터 ----------
test("연락처: 생성 + 거래처/과제 링크 + 필터", () => {
  const store = freshStore();
  loadFixture(store);
  const all = store.contacts({});
  assert.ok(all.length >= 3, "연락처 시드");
  const c2 = all.find((c) => c.id === "ct-002");
  assert.equal(c2.party_name, "B테크", "거래처 조인");
  assert.deepEqual(c2.projects.sort(), ["PRJ-A", "PRJ-B"], "과제 N:N");
  assert.deepEqual(store.contacts({ project: "PRJ-A" }).map((c) => c.id).sort(), ["ct-001", "ct-002", "ct-003"]);
  assert.deepEqual(store.contacts({ party: "vendor-a" }).map((c) => c.id), ["ct-001"]);
  assert.equal(store.createContact({ name: "" }).error, "name_required");
  const r = store.createContact({ name: "새연락처", projects: ["PRJ-C"] });
  assert.ok(r.ok);
  assert.equal(store.linkContactProject(r.id, "no-proj").error, "project_not_found");
});

// ---------- 생성기 다듬기: 업무일지 과제별 섹션 ----------
test("업무일지: 과제별 완료/신규 섹션 + by_project", () => {
  const store = freshStore();
  loadFixture(store);
  const it = store.createItem({ project_id: "PRJ-A", title: "과제별 테스트", created_by: "owner" });
  store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "item_create", item_ref: it.item.id, to: it.item.title, project_ref: "PRJ-A", used_refs: ["items"], data_label: "real" });
  store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "item_status", item_ref: it.item.id, to: "done", project_ref: "PRJ-A", used_refs: ["items"], data_label: "real" });
  const w = store.worklogDraft({ days: 7 });
  assert.ok(w.by_project["PRJ-A"], "PRJ-A 과제별 집계");
  assert.equal(w.by_project["PRJ-A"].created, 1);
  assert.equal(w.by_project["PRJ-A"].done, 1);
  assert.ok(w.text.includes("## 과제별") && w.text.includes("PRJ-A: 완료 1, 신규 1"));
});

// ---------- P3 재고/BOM/부품 ----------
test("P3: 부품 마스터·BOM·재고·부족 판정(내부)·과제 사용 링크", () => {
  const store = freshStore();
  loadFixture(store);
  // 부품 마스터(공유)
  const parts = store.parts({});
  assert.ok(parts.length >= 5, "부품 시드");
  const board = parts.find((p) => p.id === "pt-board");
  assert.equal(board.type, "board");
  assert.equal(board.on_hand, 1, "보드 가용 1(비가상)");
  assert.deepEqual(board.projects, ["PRJ-A"], "과제 사용 링크");
  // BOM
  const bom = store.bom("pt-board");
  assert.equal(bom.length, 4, "보드 BOM 4행");
  assert.equal(bom.find((b) => b.child_part_id === "pt-r1").qty, 4);
  // 가상위치 제외 가용: ic = bin1 12 (repair 5 제외)
  assert.equal(store.stockOnHand("pt-ic1"), 12, "수리중(가상) 5 제외");
  // 재고 부족(내부 판정): board(1<2), c1(40<100), conn(8<20) = 3건; r1·ic1 충분
  const low = store.stockLow().map((p) => p.id).sort();
  assert.deepEqual(low, ["pt-board", "pt-c1", "pt-conn"]);
  // BOM 변경 이벤트
  assert.ok(store.bomChanges(50).length >= 4, "bom_change 이벤트 기록");
  // 가드
  assert.equal(store.addBomEdge("pt-board", "pt-board").error, "self_reference");
  assert.equal(store.upsertPart({ name: "" }).error, "name_required");
  assert.equal(store.setStock("nope", "loc-bin1", 5).error, "part_not_found");
});

test("P3: purgeSynthetic 가 재고/BOM/부품 synthetic 정리(FK 안전)", () => {
  const store = freshStore();
  loadFixture(store);
  const removed = store.purgeSynthetic();
  assert.ok(removed > 0);
  assert.equal(store.parts({}).length, 0, "synthetic 부품 제거");
  assert.equal(store.locations().length, 0);
});

// ---------- 챗봇 검색지향(추론 X) + 질문 로그 ----------
test("챗봇: FAQ 검색 매칭 답변 + 미응답 로그/큐", () => {
  const store = freshStore();
  loadFixture(store);
  // 매칭
  const r1 = store.chatAnswer({ question: "게이트 통과 어떻게 해?", thread_id: "t1" });
  assert.equal(r1.matched, true);
  assert.equal(r1.source.id, "faq-gate");
  assert.ok(r1.text.includes("통과 가능"));
  // 미매칭 → 끊기지 않는 사람형 안내 + 미응답 큐 적재
  const r2 = store.chatAnswer({ question: "점심 우주여행 추천", thread_id: "t1" });
  assert.equal(r2.matched, false);
  assert.ok(r2.text.includes("매뉴얼"), "사람형 안내 텍스트");
  const un = store.unansweredQueries(10);
  assert.ok(un.some((u) => u.question.includes("우주여행")), "미응답이 큐에 집계");
  assert.equal(store.chatAnswer({ question: "" }).error, "question_required");
  // 질문 로그 저장됨(매칭 1 + 미매칭 1)
  const cnt = store.db.prepare("SELECT COUNT(*) c FROM chat_query_log").get().c;
  assert.ok(cnt >= 2, "질문 로그 누적");
});

// 퍼지 검색: 단어가 글자그대로 같지 않아도(조사/부분일치) 후보를 찾는다.
test("챗봇: 퍼지 부분일치 + 후보 제시(끊기지 않음)", () => {
  const store = freshStore();
  loadFixture(store);
  // "재고부족"은 FAQ엔 "부족"/"재고"로 쪼개져 있음 — 부분일치로 잡혀야 함
  const many = store.retrieveFaqMany("재고부족 판정 기준", 3);
  assert.ok(many.length > 0, "부분일치로 후보 검색");
  // 약매칭이라도 matched=false면 candidates 가 채워져 되묻기 가능
  const r = store.chatAnswer({ question: "보드 관련 자료" });
  assert.ok(Array.isArray(r.candidates), "후보 배열 반환");
});

// RAG 진입점: provider=stub 이면 외부전송 0, 검색 폴백 유지(llm=false).
test("챗봇: answerFromManual stub=외부0 폴백", async () => {
  const { answerFromManual } = await import("../src/llm.mjs");
  const store = freshStore();
  loadFixture(store);
  const r = await answerFromManual({ store, question: "게이트 통과 어떻게 해?", provider: "stub" });
  assert.equal(r.external, false, "외부전송 0");
  assert.equal(r.llm, false, "stub=LLM 표현 미사용");
  assert.equal(r.matched, true, "검색 매칭은 유지");
});

// #13 캘린더 .ics 내보내기 — 마감 있는 미완 항목만 종일 VEVENT, person 필터(원문 미포함).
test("calendar: .ics 피드 VEVENT 구조 + person 필터", () => {
  const store = freshStore();
  loadFixture(store);
  const r = store.createItem({ project_id: "PRJ-A", title: "ICS 검증 항목", assignee_ref: "p-icsuser", due: "2030-01-15", origin: "test", created_by: "test" });
  assert.ok(r.ok, "테스트 항목 생성");
  const ics = store.calendarIcs({});
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/, "VCALENDAR 헤더");
  assert.match(ics, /END:VCALENDAR\r\n$/, "VCALENDAR 종료 + CRLF");
  assert.match(ics, /DTSTART;VALUE=DATE:20300115/, "종일 DTSTART 날짜");
  assert.match(ics, /SUMMARY:ICS 검증 항목/, "SUMMARY 본문");
  const mine = store.calendarFeed({ person: "p-icsuser" });
  assert.equal(mine.length, 1, "person 필터 1건");
  assert.equal(mine[0].assignee_ref, "p-icsuser", "담당 일치");
  const all = store.calendarFeed({});
  assert.ok(all.length >= 1, "전체 피드 ≥1");
  assert.ok(all.every((x) => x.due), "마감 없는 항목 미포함");
});

// U-1d: gateEval required_artifacts_missing 가 보드별 detail 을 동봉(렌더가 폴침으로 표시).
test("U-1d: gateEval reason 에 보드별 detail 동봉", () => {
  const store = freshStore();
  loadFixture(store);
  const stage = store.gates({ project: "PRJ-A" }).find((s) => s.stage_code === "상세설계");
  assert.ok(stage, "상세설계 단계 존재");
  const r = stage.reasons.find((x) => x.code === "required_artifacts_missing");
  assert.ok(r, "required_artifacts_missing reason 존재");
  assert.equal(r.n, 6, "누락 6종");
  assert.ok(Array.isArray(r.detail) && r.detail[0].missing.length > 0, "보드별 detail 동봉");
  assert.ok(r.detail[0].board && Array.isArray(r.detail[0].missing), "detail 구조 board/missing");
});

// P-13: docRecipes 가 ARTIFACT_FLOW 7스텝·required_input 반환 + 모드 전환.
test("P-13: docRecipes 7스텝·required_input·모드 전환", async () => {
  const { docRecipes, ARTIFACT_FLOW } = await import("../src/guide.mjs");
  const r = docRecipes("business");
  assert.ok(r.length >= 1, "레시피 ≥1");
  assert.equal(r[0].steps.length, 7, "7스텝");
  assert.ok(r[0].required_input.length >= 1, "필요 입력 ≥1");
  const f = docRecipes("fantasy");
  assert.notEqual(f[0].name, r[0].name, "모드별 명칭 전환");
  // flow_key 가 ARTIFACT_FLOW 키와 1:1
  const keys = r[0].steps.map((s) => s.flow_key).sort();
  assert.deepEqual(keys, ARTIFACT_FLOW.map((s) => s.key).sort(), "flow_key 1:1 매핑");
});

// P-18: embed URL 화이트리스트(Smartsheet 만) + 필수 필드.
test("P-18: embed URL 화이트리스트", () => {
  const store = freshStore();
  assert.equal(store.upsertEmbed({ title: "일정", url: "https://app.smartsheet.com/b/publish?x=1" }).ok, true, "smartsheet 허용");
  assert.equal(store.upsertEmbed({ title: "bad", url: "https://evil.example.com/x" }).error, "url_not_allowed", "비-smartsheet 거부");
  assert.equal(store.upsertEmbed({ title: "no-url", url: "" }).error, "title_url_required", "url 필수");
});

// P-18: listEmbeds 조회 + project 필터.
test("P-18: listEmbeds 조회·project 필터", () => {
  const store = freshStore();
  loadFixture(store);
  store.upsertEmbed({ title: "a", url: "https://app.smartsheet.com/b/1", project_id: "PRJ-A" });
  store.upsertEmbed({ title: "b", url: "https://app.smartsheet.com/b/2" });
  assert.equal(store.listEmbeds({}).length, 2, "전체 2건");
  assert.equal(store.listEmbeds({ project: "PRJ-A" }).length, 1, "project 필터 1건");
});

// P-18: embed_view DDL 멱등 + 같은 id upsert 멱등.
test("P-18: embed_view DDL·upsert 멱등", () => {
  const a = freshStore(); const b = freshStore(); // openStore 2회 스키마 에러 0
  assert.ok(a && b);
  const r1 = a.upsertEmbed({ id: "emb-x", title: "t", url: "https://app.smartsheet.com/b/1" });
  const r2 = a.upsertEmbed({ id: "emb-x", title: "t2", url: "https://app.smartsheet.com/b/2" });
  assert.equal(r1.ok, true); assert.equal(r2.ok, true);
  assert.equal(a.listEmbeds({}).length, 1, "같은 id=1행(ON CONFLICT)");
});

// P-8: items 가 due 를 노출하고, 템플릿 적용이 마감 있는 할일을 늘린다(마감 버킷 소스).
test("P-8: items due 노출 + 템플릿 적용으로 마감 항목 증가", () => {
  const store = freshStore();
  loadFixture(store);
  assert.ok(store.items({}).some((i) => "due" in i), "items 가 due 필드 노출");
  const before = store.items({}).filter((i) => i.due).length;
  store.applyTemplate("PRJ-A", "120_CDR", { anchorDates: { "120": "2026-08-01" } });
  const after = store.items({}).filter((i) => i.due).length;
  assert.ok(after > before, "템플릿 적용 후 마감 항목 증가");
});

// P-12: worklogDraft/reportDraft 가 위젯 미리보기 텍스트를 제공(자동발신 0, 미리보기만).
test("P-12: worklogDraft/reportDraft 텍스트 제공", () => {
  const store = freshStore();
  loadFixture(store);
  const d = store.worklogDraft({ days: 7 });
  assert.ok(typeof d.text === "string" && d.text.length > 0, "worklog 초안 텍스트");
  assert.ok(store.reportDraft({ kind: "report" }).text.length > 0, "report 초안 텍스트");
});

// P-5: item_blocking 규칙 + 차단 할일 → reason blocking_items_open + passable=false.
test("P-5: item_blocking 규칙+차단할일 → 하드 차단", () => {
  const store = freshStore();
  loadFixture(store);
  store.upsertStage({ id: "st-p5", project_id: "PRJ-A", title: "상세설계", stage_code: "120", seq: 1 });
  const it = store.createItem({ project_id: "PRJ-A", title: "블록작업" });
  store.db.prepare("UPDATE core_item SET stage_id='st-p5', status='blocked' WHERE id=?").run(it.item.id);
  store.setArtifactRequirement({ scope_kind: "item_blocking", scope_key: "120", artifact_type: "any", label: "차단", mode: "hard" });
  const stage = store.gates({ project: "PRJ-A" }).find((s) => s.id === "st-p5");
  assert.equal(stage.reasons.find((x) => x.code === "blocking_items_open")?.n, 1, "차단 사유 n=1");
  assert.equal(stage.passable, false, "passable=false");
});

// P-5: 규칙 없으면 blocking_items_open 미발생(하위호환).
test("P-5: item_blocking 규칙 없으면 미발생(회귀 0)", () => {
  const store = freshStore();
  loadFixture(store);
  store.upsertStage({ id: "st-p5b", project_id: "PRJ-A", title: "상세설계", stage_code: "121", seq: 1 });
  const it = store.createItem({ project_id: "PRJ-A", title: "블록작업" });
  store.db.prepare("UPDATE core_item SET stage_id='st-p5b', status='blocked' WHERE id=?").run(it.item.id);
  const stage = store.gates({ project: "PRJ-A" }).find((s) => s.id === "st-p5b");
  assert.ok(!stage.reasons.find((x) => x.code === "blocking_items_open"), "blocking_items_open 없음");
  assert.ok(stage.reasons.find((x) => x.code === "blocked_items"), "기존 blocked_items 는 유지");
});

// P-5: hard 모드 item_blocking 미해결 → clearStage gate_blocked, 해결 후 통과.
test("P-5: hard 모드 차단 → clearStage gate_blocked → 해결 후 통과", () => {
  const store = freshStore();
  loadFixture(store);
  store.upsertStage({ id: "st-p5c", project_id: "PRJ-A", title: "상세설계", stage_code: "122", seq: 1 });
  const it = store.createItem({ project_id: "PRJ-A", title: "블록작업" });
  store.db.prepare("UPDATE core_item SET stage_id='st-p5c', status='blocked' WHERE id=?").run(it.item.id);
  store.setArtifactRequirement({ scope_kind: "item_blocking", scope_key: "122", artifact_type: "any", label: "차단", mode: "hard" });
  store.setGateMode("hard");
  const r = store.clearStage("st-p5c");
  assert.equal(r.error, "gate_blocked", "하드 차단");
  assert.ok(r.reasons.find((x) => x.code === "blocking_items_open"), "차단 사유 포함");
  store.setItemStatus(it.item.id, "done");
  // 차단 할일 해결 → blocking_items_open 제거(P-5 본연). (PRJ-A 보드 미완결은 별도 사유라 force 로 통과 확인)
  const stage2 = store.gates({ project: "PRJ-A" }).find((s) => s.id === "st-p5c");
  assert.ok(!stage2.reasons.find((x) => x.code === "blocking_items_open"), "해결 후 차단 사유 제거");
  assert.equal(store.clearStage("st-p5c", { force: true }).ok, true, "force 통과");
});

// P-5: lexicon 양 모드 라벨 존재.
test("P-5: gate_reason_blocking_items_open 양 모드 라벨", () => {
  assert.ok(getLexicon("business").gate_reason_blocking_items_open, "business 라벨");
  assert.ok(getLexicon("fantasy").gate_reason_blocking_items_open, "fantasy 라벨");
});

// P-9: 연체→critical, 여유→ok 제외, days_left 오름차순(read-only severity).
test("P-9: 연체→critical, 여유 제외, 오름차순", () => {
  const store = freshStore();
  loadFixture(store);
  store.createItem({ project_id: "PRJ-A", title: "연체작업", due: "2026-07-20" });
  store.createItem({ project_id: "PRJ-A", title: "여유작업", due: "2026-12-01" });
  const r = store.riskAlerts({ today: "2026-08-01" });
  assert.equal(r.find((x) => x.due === "2026-07-20")?.severity, "critical", "연체=critical");
  assert.ok(!r.find((x) => x.due === "2026-12-01"), "여유=ok 제외");
  for (let i = 1; i < r.length; i++) assert.ok(r[i].days_left >= r[i - 1].days_left, "days_left 오름차순");
});

// P-9: 마일스톤(anchor_stage_code) severity 한 단계 상향.
test("P-9: 마일스톤 severity 상향", () => {
  const store = freshStore();
  loadFixture(store);
  const today = "2026-08-01", due = "2026-08-06"; // days_left=5, PRJ-C pct=0 → base risk
  const a = store.createItem({ project_id: "PRJ-C", title: "비마일스톤", due });
  const b = store.createItem({ project_id: "PRJ-C", title: "마일스톤", due });
  store.db.prepare("UPDATE core_item SET anchor_stage_code='120' WHERE id=?").run(b.item.id);
  const r = store.riskAlerts({ today });
  const ORDER = ["ok", "watch", "risk", "critical"];
  const sa = r.find((x) => x.item_id === a.item.id), sb = r.find((x) => x.item_id === b.item.id);
  assert.equal(sa?.severity, "risk", "비마일스톤=risk");
  assert.equal(sb?.severity, "critical", "마일스톤=한 단계 상향");
  assert.ok(ORDER.indexOf(sb.severity) >= ORDER.indexOf(sa.severity), "마일스톤 같거나 높음");
});

// P-9: riskAlerts 는 DB 미저장(read-only).
test("P-9: riskAlerts 미저장", () => {
  const store = freshStore();
  loadFixture(store);
  const ev = store.recentEvents(1000).length, items = store.counts().items;
  store.riskAlerts({});
  assert.equal(store.recentEvents(1000).length, ev, "이벤트 증가 0");
  assert.equal(store.counts().items, items, "항목 증가 0");
});

// P-9: pct 결합 — 진행률 높으면 위험 완화(같은 due 라도 severity 낮음/제외).
test("P-9: pct 높으면 위험 완화", () => {
  const store = freshStore();
  loadFixture(store);
  const today = "2026-08-01", due = "2026-08-04"; // days_left=3
  const high = store.createItem({ project_id: "PRJ-A", title: "고진행", due }); // PRJ-A pct=71
  const low = store.createItem({ project_id: "PRJ-C", title: "저진행", due });  // PRJ-C pct=0
  const r = store.riskAlerts({ today });
  const sl = r.find((x) => x.item_id === low.item.id), sh = r.find((x) => x.item_id === high.item.id);
  assert.equal(sl?.severity, "risk", "저진행=risk");
  assert.ok(!sh, "고진행(pct71)=ok 로 제외(완화)");
});

// U-1c: items() 가 anchor_stage_code/anchor_date/offset_days 노출(허브 일정 탭 소스).
test("U-1c: items 가 anchor 필드 노출", () => {
  const store = freshStore();
  loadFixture(store);
  store.applyTemplate("PRJ-A", "120_CDR", { anchorDates: { "120": "2026-08-01" } });
  const rows = store.items({ project: "PRJ-A" });
  assert.ok(rows.some((r) => r.anchor_stage_code), "anchor_stage_code 노출");
  assert.ok(rows.some((r) => "offset_days" in r), "offset_days 노출");
});

// U-1c: setAnchor 가 같은 앵커만 전파, 완료·사람수정(due_overridden) 보호.
test("U-1c: setAnchor 1-hop 전파 + 완료·수정 보호", () => {
  const store = freshStore();
  loadFixture(store);
  store.applyTemplate("PRJ-A", "120_CDR", { anchorDates: { "120": "2026-08-01" } });
  const rows = store.items({ project: "PRJ-A" }).filter((r) => r.anchor_stage_code === "120");
  assert.ok(rows.length >= 2, "앵커 산출물 ≥2");
  store.setItemStatus(rows[0].id, "done");
  store.db.prepare("UPDATE core_item SET due_overridden=1 WHERE id=?").run(rows[1].id);
  const r = store.setAnchor("PRJ-A", "120", "2026-09-01");
  assert.equal(r.shifted, rows.length - 2, "완료·수정 항목 제외하고 전파");
});

// P-4-ai-A: createProposal 은 pending 으로만 적재(도메인 쓰기 0).
test("P-4-ai: createProposal 은 pending 으로만 적재", () => {
  const store = freshStore();
  loadFixture(store);
  const N = store.items({ project: "PRJ-A" }).length;
  store.createProposal({ source: "manual", kind: "create_item", payload: { project_id: "PRJ-A", title: "제안된 할일" } });
  assert.equal(store.items({ project: "PRJ-A" }).length, N, "도메인 쓰기 0");
  assert.equal(store.proposals({ status: "pending" }).length, 1, "pending 1건");
});

// P-4-ai-A: approveProposal 만이 실제 도메인 쓰기 + 사람 이벤트 1건.
test("P-4-ai: approveProposal 만이 실제 쓰기", () => {
  const store = freshStore();
  loadFixture(store);
  store.createProposal({ source: "manual", kind: "create_item", payload: { project_id: "PRJ-A", title: "제안된 할일" } });
  const p = store.proposals()[0];
  const r = store.approveProposal(p.id);
  assert.ok(r.ok, "승인 ok");
  assert.equal(store.items({ project: "PRJ-A" }).filter((i) => i.title === "제안된 할일").length, 1, "승인 후 1건 생성");
  assert.equal(store.proposals({ status: "pending" }).length, 0, "pending 비움");
  const [ev] = store.recentEvents(1);
  assert.equal(ev.kind, "ai_proposal_approve", "승인 이벤트");
  assert.equal(ev.actor_kind, "human", "사람 승인");
});

// P-4-ai-A: reject 쓰기 없음 + 미지원 kind 거부 + 없는 id.
test("P-4-ai: reject·미지원 kind·없는 id", () => {
  const store = freshStore();
  loadFixture(store);
  store.createProposal({ source: "manual", kind: "create_item", payload: { project_id: "PRJ-A", title: "반려될 것" } });
  const pid = store.proposals()[0].id;
  assert.ok(store.rejectProposal(pid, { reason: "중복" }).ok, "반려 ok");
  assert.equal(store.items({ project: "PRJ-A" }).filter((i) => i.title === "반려될 것").length, 0, "반려는 쓰기 0");
  assert.equal(store.createProposal({ source: "x", kind: "drop_table", payload: {} }).error, "unknown_proposal_kind", "미지원 kind 거부");
  assert.equal(store.approveProposal("nope").error, "proposal_not_found", "없는 id");
});

// P-14: deliverable_input 미충족 fulfilled=false, 입력 첨부 후 true(read-only).
test("P-14: inputFulfillment 충족 판정", () => {
  const store = freshStore();
  loadFixture(store);
  store.setArtifactRequirement({ scope_kind: "deliverable_input", scope_key: "CDR 패키지", artifact_type: "schematic", label: "회로도", mode: "soft" });
  store.setArtifactRequirement({ scope_kind: "deliverable_input", scope_key: "CDR 패키지", artifact_type: "bom", label: "BOM", mode: "soft" });
  let f = store.inputFulfillment("PRJ-A").find((d) => d.scope_key === "CDR 패키지");
  assert.equal(f.required.length, 2, "필요 2");
  assert.equal(f.fulfilled, false, "미충족");
  assert.equal(f.missing.length, 2, "누락 2");
  store.addAttachment({ entity_type: "part", entity_id: "pt-board", name: "s.f", pointer: "/s", artifact_type: "schematic" });
  store.addAttachment({ entity_type: "part", entity_id: "pt-board", name: "b.f", pointer: "/b", artifact_type: "bom" });
  assert.equal(store.inputFulfillment("PRJ-A").find((d) => d.scope_key === "CDR 패키지").fulfilled, true, "충족");
});

// P-14: inputFulfillment 는 자동 생성 0(read-only).
test("P-14: inputFulfillment read-only", () => {
  const store = freshStore();
  loadFixture(store);
  store.setArtifactRequirement({ scope_kind: "deliverable_input", scope_key: "CDR 패키지", artifact_type: "schematic", label: "회로도", mode: "soft" });
  const before = store.counts().items;
  store.inputFulfillment("PRJ-A");
  assert.equal(store.counts().items, before, "항목 생성 0");
});

// P-14: deliverable_input artifact_type 어휘 ⊂ 6종 사전.
test("P-14: deliverable_input 어휘 정합(6종)", () => {
  const store = freshStore();
  loadFixture(store);
  store.setArtifactRequirement({ scope_kind: "deliverable_input", scope_key: "CDR 패키지", artifact_type: "schematic", label: "회로도", mode: "soft" });
  const inputs = store.artifactRequirements({ scope_kind: "deliverable_input" }).map((r) => r.artifact_type);
  assert.ok(inputs.every((t) => ["bom", "gerber", "digikey", "schematic", "pcb", "block_diagram"].includes(t)), "6종 사전 내");
});

// P-14: 키스톤 통합 — 충족 시 generate 는 자동 생성 대신 ai_proposal 큐 적재(승인 전 쓰기 0).
test("P-14: generate 충족 시 ai_proposal 큐 적재(자동생성 0)", () => {
  const store = freshStore();
  loadFixture(store);
  store.setArtifactRequirement({ scope_kind: "deliverable_input", scope_key: "CDR 패키지", artifact_type: "schematic", label: "회로도", mode: "soft" });
  store.addAttachment({ entity_type: "part", entity_id: "pt-board", name: "s.f", pointer: "/s", artifact_type: "schematic" });
  const before = store.counts().items;
  // generate 경로 모사: 충족 → createProposal(pending), 항목 생성 0
  const f = store.inputFulfillment("PRJ-A").find((d) => d.scope_key === "CDR 패키지");
  assert.equal(f.fulfilled, true, "충족");
  const r = store.createProposal({ source: "input_fulfillment", kind: "create_item", payload: { project_id: "PRJ-A", title: "CDR 패키지 초안" }, used_refs: ["inputs"] });
  assert.ok(r.ok && r.status === "pending", "제안 pending 적재");
  assert.equal(store.counts().items, before, "승인 전 항목 생성 0");
  assert.equal(store.proposals({ status: "pending" }).filter((p) => p.kind === "create_item").length, 1, "pending 1건");
});

// P-14: lexicon 양 모드 input_generate_btn.
test("P-14: input_generate_btn 양 모드", () => {
  assert.ok(getLexicon("business").input_generate_btn && getLexicon("fantasy").input_generate_btn, "양 모드 라벨");
});

// P-19: scanScheduleGaps 는 제안만 적재(자동 spawn 0).
test("P-19: scanScheduleGaps 제안만 적재", () => {
  const store = freshStore();
  loadFixture(store);
  const before = store.items({ project: "PRJ-A" }).length;
  store.scanScheduleGaps("PRJ-A");
  assert.equal(store.items({ project: "PRJ-A" }).length, before, "자동 spawn 0");
  assert.ok(store.proposals({ status: "pending" }).length > 0, "제안 적재됨");
});

// P-19: 추천→승인 고리 — 승인해야 실제 쓰기.
test("P-19: 추천→승인해야 실제 쓰기", () => {
  const store = freshStore();
  loadFixture(store);
  store.scanScheduleGaps("PRJ-A");
  const p = store.proposals({ status: "pending" }).find((x) => x.payload?.project_id === "PRJ-A");
  const before = store.items({ project: "PRJ-A" }).length;
  store.approveProposal(p.id);
  assert.equal(store.items({ project: "PRJ-A" }).length, before + 1, "승인 후 1건 생성");
});

// P-19: runRecommenders 도메인 쓰기 0 + system 이벤트.
test("P-19: runRecommenders 쓰기 0·system 이벤트", () => {
  const store = freshStore();
  loadFixture(store);
  const itemsBefore = store.counts().items;
  const r = store.runRecommenders({ scope: "all" });
  assert.equal(typeof r.proposed, "number", "proposed 수 반환");
  assert.equal(store.counts().items, itemsBefore, "도메인 쓰기 0");
  const [ev] = store.recentEvents(1);
  assert.equal(ev.kind, "recommender_run", "recommender_run 이벤트");
  assert.equal(ev.actor_kind, "system", "system 트리거");
});

// P-19: 추천 dedup — 두 번 스캔해도 중복 제안 0.
test("P-19: scanScheduleGaps dedup", () => {
  const store = freshStore();
  loadFixture(store);
  store.scanScheduleGaps("PRJ-A");
  const after1 = store.proposals({ status: "pending" }).length;
  store.scanScheduleGaps("PRJ-A");
  assert.equal(store.proposals({ status: "pending" }).length, after1, "재스캔 중복 0");
});

// 자동 팔로업(영상 D): 마감 지난 미완 발주 → '팔로업 할 일' 제안(자동 쓰기 0, 승인 후 생성).
test("자동 팔로업: 발주 정체→팔로업 제안→승인 시 생성", () => {
  const store = freshStore();
  loadFixture(store);
  store.createPurchase({ title: "지연 발주", stage: "order", due: "2020-01-01", projects: ["PRJ-A"] });
  const before = store.items({ project: "PRJ-A" }).length;
  const r = store.scanFollowups("2026-08-01");
  assert.ok(r.proposed >= 1, "팔로업 제안 생성");
  assert.equal(store.items({ project: "PRJ-A" }).length, before, "자동 쓰기 0(제안만)");
  const p = store.proposals({ status: "pending" }).find((x) => x.source === "followup");
  assert.ok(p, "followup 제안 존재");
  const cnt = store.proposals({ status: "pending" }).filter((x) => x.source === "followup").length;
  store.scanFollowups("2026-08-01");
  assert.equal(store.proposals({ status: "pending" }).filter((x) => x.source === "followup").length, cnt, "재스캔 dedup 0");
  store.approveProposal(p.id);
  assert.equal(store.items({ project: "PRJ-A" }).length, before + 1, "승인 후 팔로업 할일 생성");
});

// 자동 팔로업: 마감 안 지난/완료 단계 발주는 제안 안 함(오탐 0).
test("자동 팔로업: 정상 발주는 미제안", () => {
  const store = freshStore();
  loadFixture(store);
  store.createPurchase({ title: "정상 발주", stage: "order", due: "2099-01-01", projects: ["PRJ-A"] }); // 마감 미래
  store.createPurchase({ title: "마감지남 수령", stage: "receive", due: "2020-01-01", projects: ["PRJ-A"] }); // 단계가 미완 아님
  store.scanFollowups("2026-08-01");
  const fu = store.proposals({ status: "pending" }).filter((x) => x.source === "followup").map((x) => x.payload?.title);
  assert.ok(!fu.some((t) => /정상 발주|마감지남 수령/.test(t)), "정상/완료단계 발주는 팔로업 미제안");
});

// ───────── P2b 팀: 계정·인증·관리자·보기범위(TEAM-ACCT) ─────────
// 계정 생성 — 이메일/표기명 저장, 기본 역할 '팀원', 중복(아이디/이메일)·형식 거부.
test("TEAM-ACCT: createAccount 이메일·표기명·역할 + 중복/형식 가드", () => {
  const store = freshStore();
  const r = store.createAccount({ username: "u1", password: "pw123456", email: "U1@Corp.com", display_name: "김철수" });
  assert.ok(r.ok, "생성 ok");
  const prof = store.accountProfile(store.verifyLogin("u1", "pw123456"));
  assert.equal(prof.email, "u1@corp.com", "이메일 소문자 정규화");
  assert.equal(prof.display_name, "김철수", "실제 가입 이름");
  assert.deepEqual(prof.roles, ["member"], "기본 역할 팀원");
  assert.equal(prof.is_admin, false);
  assert.equal(store.createAccount({ username: "u1", password: "x12345" }).error, "username_taken", "아이디 중복 거부");
  assert.equal(store.createAccount({ username: "u2", password: "x12345", email: "u1@corp.com" }).error, "email_taken", "이메일 중복 거부");
  assert.equal(store.createAccount({ username: "u3", password: "x12345", email: "bad-email" }).error, "email_format", "이메일 형식 거부");
});

// 관리자 — admin 역할이면 isAdmin/accountProfile.is_admin true.
test("TEAM-ACCT: 관리자 역할 + 로그인 검증 + 세션 왕복", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "boss", password: "secret77", email: "boss@corp.com", display_name: "이대표", roles: ["admin"] });
  assert.ok(store.isAdmin(a.id), "admin 역할");
  assert.equal(store.accountProfile(store.sessionAccount(store.createSession(a.id))).is_admin, true);
  assert.equal(store.verifyLogin("boss", "wrong"), null, "틀린 비번 거부");
  const me = store.verifyLogin("boss", "secret77");
  assert.equal(me.display_name, "이대표");
  const sess = store.sessionAccount(store.createSession(a.id));
  assert.equal(sess.email, "boss@corp.com", "세션이 이메일 전달");
});

// 표기명 폴백 — display_name 없으면 username.
test("TEAM-ACCT: 표기명 폴백(display_name→username) + listAccounts 해시 제외", () => {
  const store = freshStore();
  store.createAccount({ username: "noname", password: "pw123456" });
  const prof = store.accountProfile(store.verifyLogin("noname", "pw123456"));
  assert.equal(prof.display_name, "noname", "표기명 없으면 username");
  const list = store.listAccounts();
  assert.equal(list.length, 1);
  assert.ok(!("pw_hash" in list[0]), "목록에 해시 미포함");
  assert.deepEqual(list[0].roles, ["member"]);
});

// 계정 수정 — 이메일/역할 변경, 이메일 중복 거부.
test("TEAM-ACCT: updateAccount 이메일·역할 변경 + 중복 거부", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "a", password: "pw123456", email: "a@corp.com" });
  const b = store.createAccount({ username: "b", password: "pw123456", email: "b@corp.com" });
  assert.equal(store.updateAccount(a.id, { email: "b@corp.com" }).error, "email_taken", "타계정 이메일 거부");
  assert.ok(store.updateAccount(a.id, { email: "a2@corp.com", role: "admin" }).ok);
  assert.equal(store.accountByEmail("A2@CORP.COM").id, a.id, "이메일 대소문자 무시 조회");
  assert.ok(store.isAdmin(a.id), "역할 admin 승격");
  assert.ok(!store.isAdmin(b.id));
});

// 계정별 메일함 등록 메타데이터 — secret 값 없이 provider/env ref/status 만 저장.
test("TEAM-ACCT: mailbox metadata update/list + 상대 env ref/secret 가드", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "mailu", password: "pw123456", email: "mailu@corp.com" });
  assert.equal(store.updateAccountMailbox(a.id, { provider: "gmail", enabled: true, env_ref: "private-state/mail/mailu.env", status: "ready",
    last_fetch_at: "2026-06-17T09:00:00+09:00", last_summary_ref: "_workmeta/system/mail/mailu-summary.json" }).ok, true);
  const cfg = store.accountMailboxConfig(a.id);
  assert.equal(cfg.mailbox_provider, "gmail");
  assert.equal(cfg.mailbox_env_ref, "private-state/mail/mailu.env");
  assert.equal(cfg.mailbox_enabled, true);
  assert.equal(cfg.mailbox_status, "ready");
  assert.equal(cfg.mailbox_last_summary_ref, "_workmeta/system/mail/mailu-summary.json");
  const listed = store.listAccountMailboxConfigs()[0];
  assert.equal(listed.mailbox_provider, "gmail");
  assert.ok(!("pw_hash" in listed), "메일함 목록도 해시 미포함");
  assert.ok(!("refresh_token" in listed) && !("access_token" in listed), "secret 필드 미노출");

  for (const bad of ["/tmp/mail.env", "../mail.env", "mail/../mail.env", "C:\\mail.env", "\\\\server\\share\\mail.env", "file:///mail.env", "MAIL_TOKEN=secret"]) {
    assert.equal(store.updateAccountMailbox(a.id, { provider: "gmail", enabled: true, env_ref: bad }).error, "mailbox_env_ref_invalid", `거부: ${bad}`);
  }
  assert.equal(store.updateAccountMailbox(a.id, { provider: "gmail", enabled: true, env_ref: "" }).error, "mailbox_env_ref_required");
  assert.equal(store.updateAccountMailbox(a.id, { provider: "imap", enabled: true, env_ref: "private-state/mail/mailu.env" }).error, "mailbox_provider_invalid");
  assert.equal(store.updateAccountMailbox(a.id, { provider: "gmail", enabled: true, env_ref: "private-state/mail/mailu.env", refresh_token: "secret" }).error, "mailbox_secret_not_allowed");

  assert.equal(store.updateAccountMailbox(a.id, { provider: "none", enabled: true, env_ref: "private-state/mail/mailu.env" }).ok, true);
  const disabled = store.accountMailboxConfig(a.id);
  assert.equal(disabled.mailbox_provider, "none");
  assert.equal(disabled.mailbox_enabled, false);
  assert.equal(disabled.mailbox_env_ref, null);
  assert.equal(disabled.mailbox_status, "disabled");
});

test("TEAM-ACCT: teamReadiness 가 팀 사용 전 계정·메일함·장부 누락을 집계", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-001", title: "팀 준비", data_label: "real" });
  store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
  const readyMember = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
  const missingMailbox = store.createAccount({ username: "mail-b", password: "pw123456", email: "mail-b@corp.com", display_name: "메일B" });
  const disabled = store.createAccount({ username: "disabled", password: "pw123456", email: "disabled@corp.com", display_name: "비활성" });
  store.setAccountStatus(disabled.id, "disabled");
  assert.equal(store.updateAccountMailbox(readyMember.id, {
    provider: "gmail",
    enabled: true,
    env_ref: "private-state/mail/mail-a.env",
    last_fetch_at: "2026-06-17T09:00:00+09:00",
  }).ok, true);
  store.ingestMail({ id: "m-ready", project_code: "P26-001", at: "2026-06-17T09:30:00+09:00", subject: "준비 메일", mailbox: "mail-a@corp.com" });
  store.createItem({ project_id: "P26-001", title: "A 담당 실행", assignee_ref: "mail-a@corp.com" });
  store.ingestTaskItem({ id: "mailtask:triage-old", project_code: "P26-001", title: "분류 대기", origin: "mail", due: "2026-06-16" });

  const ready = store.teamReadiness({ target_members: 3, today: "2026-06-17" });
  assert.equal(ready.ready, false, "메일함 누락이 있으면 팀 메일 자동화 준비 완료가 아님");
  assert.deepEqual(ready.counts.active_admin_count, 1);
  assert.deepEqual(ready.counts.active_member_count, 2);
  assert.deepEqual(ready.counts.configured_mailbox_count, 1);
  assert.ok(ready.warnings.some((x) => x.code === "target_members_short" && x.actual === 2 && x.expected === 3), "목표 팀원 수 미달은 경고");
  assert.ok(ready.warnings.some((x) => x.code === "unclassified_queue" && x.count >= 1), "공용 분류 큐는 경고");
  assert.ok(ready.warnings.some((x) => x.code === "unclassified_overdue" && x.count >= 1), "기한 지난 미분류도 경고");
  assert.ok(ready.blockers.some((x) => x.code === "account_mailbox_disabled" && x.account_label === "메일B"), "팀원 메일함 미설정은 차단");
  const a = ready.accounts.find((x) => x.username === "mail-a");
  assert.equal(a.mail_count, 1);
  assert.equal(a.open_item_count, 1);
  assert.equal(a.ready, true);
  const b = ready.accounts.find((x) => x.username === "mail-b");
  assert.deepEqual(b.issues.map((x) => x.code), ["mailbox_disabled"]);
  assert.equal(ready.accounts.find((x) => x.username === "disabled").issues.length, 0, "비활성 계정은 팀 사용 준비 차단 사유에서 제외");
});

// 계정 비활성 — 세션 무효화.
test("TEAM-ACCT: setAccountStatus disabled → 세션 무효 + 로그인 차단", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "x", password: "pw123456" });
  const tok = store.createSession(a.id);
  assert.ok(store.sessionAccount(tok), "활성 세션");
  store.setAccountStatus(a.id, "disabled");
  assert.equal(store.sessionAccount(tok), null, "비활성 후 세션 무효");
  assert.equal(store.verifyLogin("x", "pw123456"), null, "비활성 계정 로그인 차단");
});

// 담당자 식별자 — 로그인명·표기명·이메일·사람이름 모두 매칭 키.
test("TEAM-ACCT: accountIdentities = 로그인명+표기명+이메일(+사람이름)", () => {
  const store = freshStore();
  store.upsertPerson({ id: "p1", name: "박영희" });
  const a = store.createAccount({ username: "yh", password: "pw123456", email: "yh@corp.com", display_name: "영희", person_id: "p1" });
  const acc = store.sessionAccount(store.createSession(a.id));
  const ids = store.accountIdentities(acc);
  for (const k of ["yh", "영희", "yh@corp.com", "박영희"]) assert.ok(ids.includes(k), `${k} 매칭 키 포함`);
});

// 메일함(mailbox) — 계정 이메일별 메일 이력 분리. team/미지정은 전체.
test("TEAM-ACCT: 메일 mailbox 필터 — 담당자별 메일 이력 분리", () => {
  const store = freshStore();
  store.ingestMail({ id: "m-a1", project_code: "P26-001", at: "2026-06-10", subject: "A 메일", mailbox: "a@corp.com" });
  store.ingestMail({ id: "m-b1", project_code: "P26-001", at: "2026-06-11", subject: "B 메일", mailbox: "B@Corp.com" });
  store.ingestMail({ id: "m-x1", project_code: "P26-001", at: "2026-06-12", subject: "공용 메일" }); // mailbox 없음
  assert.equal(store.mail({ mailbox: "a@corp.com" }).length, 1, "A 메일함 1건");
  assert.equal(store.mail({ mailbox: "b@corp.com" }).length, 1, "B 메일함 소문자 매칭 1건");
  assert.equal(store.mail({ mailbox: "team" }).length, 3, "team 전체");
  assert.equal(store.mail({}).length, 3, "미지정 전체");
  const manual = store.createMail({ subject: "직접 등록 메일", mailbox: "Manual@Corp.com" });
  assert.equal(manual.mail.mailbox, "manual@corp.com", "직접 등록 메일도 메일함 정규화 보존");
});

// 팀원 기본 검색은 자기 할일/자기 메일함으로 좁힌다. 관리자는 옵션 없이 전체를 볼 수 있다.
test("TEAM-ACCT: crossSearch 범위 — 팀원은 자기 할일·메일함만", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-001", title: "범위 테스트", data_label: "real" });
  store.createItem({ project_id: "P26-001", title: "범위 확인 A", assignee_ref: "a@corp.com" });
  store.createItem({ project_id: "P26-001", title: "범위 확인 B", assignee_ref: "b@corp.com" });
  store.ingestMail({ id: "m-a-scope", project_code: "P26-001", at: "2026-06-10", subject: "범위 확인 메일", mailbox: "a@corp.com" });
  store.ingestMail({ id: "m-b-scope", project_code: "P26-001", at: "2026-06-11", subject: "범위 확인 메일", mailbox: "b@corp.com" });

  const scoped = crossSearch(store, "범위 확인", { mailbox: "a@corp.com", assignee_any: ["a@corp.com"] });
  assert.deepEqual(scoped.mail.map((m) => m.id), ["m-a-scope"], "A 메일함만 검색");
  assert.deepEqual(scoped.items.map((i) => i.assignee_ref), ["a@corp.com"], "A 담당 할일만 검색");

  const all = crossSearch(store, "범위 확인");
  assert.equal(all.mail.length, 2, "관리자/단독 전체 검색은 전체 메일");
  assert.equal(all.items.length, 2, "관리자/단독 전체 검색은 전체 할일");

  store.ingestTaskItem({
    id: "mailtask:trace-shared",
    project_code: "P26-001",
    title: "출처 추적 공유",
    origin: "mail",
    source_mail_ref: "mailcsv:trace-1",
    source_mail_source_id: "mail-source-1",
    source_thread_ref: "thread-1",
    source_lineage_ref: "lineage-1"
  });
  store.ingestMail({
    id: "mailcsv:trace-1",
    project_code: "P26-001",
    at: "2026-06-12",
    subject: "추적 메일",
    source_ref: "mail-source-1",
    mailbox: "a@corp.com"
  });
  const sourceScoped = crossSearch(store, "mail-source-1", { mailbox: "a@corp.com", assignee_any: ["a@corp.com"] });
  assert.equal(sourceScoped.items[0].id, "mailtask:trace-shared", "팀원 검색에서도 미분류 공용 큐 출처 추적 가능");
  assert.equal(sourceScoped.mail[0].id, "mailcsv:trace-1", "메일 source_ref 검색 가능");
});

test("TEAM-ACCT: summary/events/nudges/workload/risk 범위 — 팀원 대시보드 보조 표면도 자기 범위만", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-001", title: "범위 테스트", data_label: "real" });
  const aItem = store.createItem({ project_id: "P26-001", title: "A 담당", assignee_ref: "a@corp.com", due: "2026-06-10" }).item;
  const bItem = store.createItem({ project_id: "P26-001", title: "B 담당", assignee_ref: "b@corp.com", due: "2026-06-10" }).item;
  store.ingestMail({ id: "m-a-dash", project_code: "P26-001", at: "2026-06-10T09:00:00Z", subject: "A 메일 제목", mailbox: "a@corp.com" });
  store.ingestMail({ id: "m-b-dash", project_code: "P26-001", at: "2026-06-11T09:00:00Z", subject: "B 메일 제목", mailbox: "b@corp.com" });
  store.appendEvent({ actor_ref: "other", actor_kind: "human", kind: "item_status", item_ref: aItem.id, to: "done", project_ref: "P26-001", used_refs: ["items"], data_label: "real" });
  store.appendEvent({ actor_ref: "other", actor_kind: "human", kind: "item_status", item_ref: bItem.id, to: "done", project_ref: "P26-001", used_refs: ["items"], data_label: "real" });
  store.appendEvent({ actor_ref: "other", actor_kind: "human", kind: "mail_register", item_ref: "m-a-dash", to: "A 메일 제목", project_ref: "P26-001", used_refs: ["mail"], data_label: "real" });
  store.appendEvent({ actor_ref: "other", actor_kind: "human", kind: "mail_register", item_ref: "m-b-dash", to: "B 메일 제목", project_ref: "P26-001", used_refs: ["mail"], data_label: "real" });

  const scope = { actor: "a", assignee_any: ["a@corp.com"], mailbox: "a@corp.com" };
  const scopedProject = store.summary("2026-06-12", "2026-06-18", scope).find((p) => p.id === "P26-001");
  assert.equal(scopedProject.open, 1, "A 담당 할일만 집계");
  assert.equal(scopedProject.mail_cnt, 1, "A 메일함만 집계");
  assert.equal(scopedProject.last_mail_subject, "A 메일 제목", "B 메일 제목 미노출");

  const recent = store.recentEvents(20, null, scope);
  assert.ok(recent.some((e) => e.item_ref === aItem.id), "A 담당 할일 이벤트는 보임");
  assert.ok(recent.some((e) => e.item_ref === "m-a-dash"), "A 메일 이벤트는 보임");
  assert.equal(recent.some((e) => e.item_ref === bItem.id), false, "B 담당 할일 이벤트 숨김");
  assert.equal(recent.some((e) => e.item_ref === "m-b-dash" || e.to_val === "B 메일 제목"), false, "B 메일 이벤트 숨김");

  const nudges = store.nudges({ limit: 10, assignee_any: scope.assignee_any });
  assert.ok(nudges.some((n) => n.id === aItem.id), "A 담당 추천은 보임");
  assert.equal(nudges.some((n) => n.id === bItem.id || n.title === "B 담당"), false, "B 담당 추천 숨김");

  const workload = store.workload("2026-06-12", { assignee_any: scope.assignee_any });
  assert.deepEqual(workload.map((w) => w.assignee_ref), ["a@corp.com"], "업무량도 A 담당 버킷만");

  const risks = store.riskAlerts({ today: "2026-06-12", assignee_any: scope.assignee_any });
  assert.ok(risks.some((r) => r.item_id === aItem.id), "A 담당 위험 알림은 보임");
  assert.equal(risks.some((r) => r.item_id === bItem.id || r.item_title === "B 담당"), false, "B 담당 위험 알림 숨김");

  const worklog = store.worklogDraft({ days: 7, scope, assignee_any: scope.assignee_any, mailbox: scope.mailbox });
  assert.match(worklog.text, /A 담당/, "업무일지 초안에는 A 담당 제목 포함");
  assert.doesNotMatch(worklog.text, /B 담당|B 메일 제목/, "업무일지 초안에서 B 제목 숨김");

  const ics = store.calendarIcs({ assignee_any: scope.assignee_any });
  assert.match(ics, /A 담당/, "캘린더 내보내기에는 A 담당 일정 포함");
  assert.doesNotMatch(ics, /B 담당/, "캘린더 내보내기에서 B 담당 일정 숨김");

  const meeting = store.createMeeting({ title: "범위 회의", project_id: "P26-001" });
  store.linkActionItem(meeting.id, aItem.id);
  store.linkActionItem(meeting.id, bItem.id);
  const actions = store.meetingActions(meeting.id, { assignee_any: scope.assignee_any });
  assert.deepEqual(actions.map((i) => i.id), [aItem.id], "회의 액션 목록도 A 담당만");
  const meetingRollup = store.meetingOpenRollup({ assignee_any: scope.assignee_any }).find((m) => m.meeting_id === meeting.id);
  assert.equal(meetingRollup.open_actions, 1, "회의 미결 롤업도 A 담당 액션만 집계");
});

test("TEAM-ACCT: export_team_mailboxes 가 ERP 계정 메타에서 metadata-only 등록부 생성", () => {
  const root = mkdtempSync(join(tmpdir(), "team-mailboxes-export-"));
  const dbPath = join(root, "dev-erp.db");
  const outPath = join(root, "team_mailboxes.json");
  const store = openStore(dbPath);
  const active = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
  const disabled = store.createAccount({ username: "mail-b", password: "pw123456", email: "mail-b@corp.com", display_name: "메일B" });
  const noRef = store.createAccount({ username: "mail-c", password: "pw123456", email: "mail-c@corp.com", display_name: "메일C" });
  assert.equal(store.updateAccountMailbox(active.id, { provider: "gmail", enabled: true, env_ref: "guild_hall/state/gateway/mailbox/state/mail-a.env" }).ok, true);
  assert.equal(store.updateAccountMailbox(disabled.id, { provider: "hiworks", enabled: false, env_ref: "guild_hall/state/gateway/mailbox/state/mail-b.env" }).ok, true);
  assert.equal(store.updateAccountMailbox(noRef.id, { provider: "gmail", enabled: false }).ok, true);
  store.db.close();

  execFileSync(process.execPath, [join(APP_DIR, "tools", "export_team_mailboxes.mjs"), "--db", dbPath, "--out", outPath, "--apply"], { cwd: APP_DIR, encoding: "utf8" });
  const payload = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(payload.schema_version, "email.fetch.team_mailbox_register.v1");
  assert.equal(payload.mailboxes.length, 1, "enabled + env ref 있는 계정만 export");
  assert.equal(payload.mailboxes[0].email, "mail-a@corp.com");
  assert.equal(payload.mailboxes[0].provider, "gmail");
  assert.equal(payload.mailboxes[0].env_file, "guild_hall/state/gateway/mailbox/state/mail-a.env");
  const raw = JSON.stringify(payload);
  assert.equal(/password|refresh_token|access_token|client_secret/i.test(raw), false, "secret 필드 없음");
  rmSync(root, { recursive: true, force: true });
});

// ───────── 다중 사용자 로컬 LLM 동시성 게이트(LLM-QUEUE) ─────────
// 동시 질문이 몰려도 로컬 모델 호출은 동시 실행 수 제한(기본 1)으로 직렬화.
test("LLM-QUEUE: 동시 질문 직렬화 — peak ≤ concurrency", async () => {
  let active = 0, peak = 0;
  const task = async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 12)); active--; return { ok: true }; };
  await Promise.all([runQueued(task), runQueued(task), runQueued(task), runQueued(task)]);
  assert.ok(peak <= llmQueueStats().concurrency, `peak ${peak} ≤ 동시한도 ${llmQueueStats().concurrency}`);
  assert.equal(llmQueueStats().active, 0, "끝나면 슬롯 0");
  assert.equal(llmQueueStats().waiting, 0, "대기열 비움");
});

// 대기 한도를 넘으면 검색 폴백 신호(queued_timeout) — 무한 대기 방지.
test("LLM-QUEUE: 대기 초과 → queued_timeout(폴백)", async () => {
  let release;
  const hold = runQueued(() => new Promise((r) => { release = r; })); // 슬롯 점유(미해제)
  await new Promise((r) => setTimeout(r, 5));
  const r = await runQueued(() => Promise.resolve({ ok: true }), { waitMs: 15 });
  assert.equal(r.queued_timeout, true, "대기 초과 시 폴백 신호");
  release({ ok: true }); await hold;                 // 정리: 점유 해제
  assert.equal(llmQueueStats().active, 0, "정리 후 슬롯 0");
});

// F6: app.js 가 참조하는 사전 키가 모두 존재하는지(?? 한글 폴백 누수 방지). 키 패리티는 TEST-003 가 담당.
test("lexicon: app.js 참조 키가 사전에 모두 존재", () => {
  const app = readFileSync(join(import.meta.dirname, "..", "static", "app.js"), "utf8");
  const refs = new Set();
  for (const m of app.matchAll(/(?:state\.lex|\bL|\blex)\.([A-Za-z_][A-Za-z0-9_]*)/g)) refs.add(m[1]);
  const biz = new Set(Object.keys(LEXICON.business));
  const missing = [...refs].filter((k) => !biz.has(k));
  assert.deepEqual(missing, [], "사전에 없는 참조 키: " + missing.join(","));
});
