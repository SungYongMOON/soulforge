import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { validateRelPointer, safeSegment, safeWorkspacePath, safeUploadTarget, commitUpload } from "../src/filevault.mjs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore, deriveStartYear } from "../src/store.mjs";
import { sanitizeCodexConfigServiceTier } from "../src/codex_bridge.mjs";
import { importNewTaskLedgers, writeTaskToLedger, readTaskLedgerRows, importNewInputLedgers, writeInputToLedger, readInputLedgerRows } from "../src/autosync.mjs";
import { pendingForProject, scanPending } from "../tools/mail_to_task_pending.mjs";
import { safeAccountEnvName, mailboxEnvRelPath, upsertEnv, hiworksEnvUpdates, writeMailboxEnv, deleteMailboxEnv, parseMailTestResult } from "../src/mailbox_env.mjs";
import { loadFixture } from "../src/fixture.mjs";
import { ingestNormalized, mapSoulforgeSnapshot } from "../src/adapter.mjs";
import { getLexicon, LEXICON } from "../src/lexicon.mjs";
import { crossSearch } from "../src/search.mjs";
import { runQueued, llmQueueStats, suggestSplit } from "../src/llm.mjs";
import { loadPartyMonsterTypes, partyForMonsterType } from "../src/party_match.mjs";
import { chatPipelineConfig, runManualAnswerPipeline } from "../src/chat_pipeline.mjs";
import { buildCodexAppServerArgs, buildCodexTurnInput, buildTaskDeveloperInstructions, buildTaskPrompt, buildTaskThreadTitle, codexAppServerServiceTierOverride } from "../src/codex_bridge.mjs";
import {
  KNOWLEDGE_SHELL_CONTRACT_KIND,
  KNOWLEDGE_SHELL_SCHEMA,
  scanKnowledgeLedgers,
  scanKnowledgeShellContract,
  scanKnowledgeSpaces,
  scanRagRoutes,
  scanRagWorkCards,
  scanWikiPageRefs,
} from "../src/knowledge_shell.mjs";
import { parseRosterText, planTeamRosterImport, applyTeamRosterImport } from "../tools/import_team_roster.mjs";
import { buildTeamHostPreflight } from "../tools/team_preflight.mjs";
import { applyRuntimeCorrections, planRuntimeCorrections } from "../tools/runtime_corrections.mjs";
import { backupRuntimeDb, restoreTestRuntimeDb, runtimeHealthCheck } from "../tools/runtime_ops.mjs";
import { runRuntimeReleaseAudit } from "../tools/runtime_release_audit.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function freshStore() {
  return openStore(":memory:");
}

function loadManualFaq(store) {
  const manual = JSON.parse(readFileSync(join(APP_DIR, "manual", "manual_faq.json"), "utf8"));
  for (const item of manual) store.upsertFaq({ ...item, data_label: "manual" });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

function testServerEnv(extra = {}) {
  const env = { ...process.env, DEV_ERP_AUTOSYNC: "0", ...extra };
  if (!("DEV_ERP_ALLOW_SELF_REGISTER" in extra)) delete env.DEV_ERP_ALLOW_SELF_REGISTER;
  if (!("DEV_ERP_COOKIE_SECURE" in extra)) delete env.DEV_ERP_COOKIE_SECURE;
  return env;
}

function makeKnowledgeShellFixture() {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-knowledge-shell-"));
  mkdirSync(join(root, ".registry", "knowledge", "public_entry"), { recursive: true });
  mkdirSync(join(root, "_workspaces", "knowledge", "P26-014", "wiki", "chunks"), { recursive: true });
  mkdirSync(join(root, "_workspaces", "not_allowed", "wiki"), { recursive: true });
  mkdirSync(join(root, "guild_hall", "rag", "routes"), { recursive: true });
  mkdirSync(join(root, "guild_hall", "rag", "work_cards"), { recursive: true });
  mkdirSync(join(root, "guild_hall", "knowledge_access", "ledger"), { recursive: true });
  mkdirSync(join(root, "_workmeta", "system", "knowledge_rag_candidate_ledger", "runs"), { recursive: true });
  mkdirSync(join(root, "_workmeta", "system", "reports", "rag", "operator_health"), { recursive: true });
  mkdirSync(join(root, "_workmeta", "system", "runs", "knowledge_shell_test"), { recursive: true });

  writeFileSync(join(root, ".registry", "knowledge", "public_entry", "knowledge.yaml"), "title: registry metadata\nbody: REGISTRY_BODY_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workspaces", "knowledge", "P26-014", "wiki", "page.md"), "# page\nRAW_BODY_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workspaces", "knowledge", "P26-014", "wiki", "chunks", "chunk-001.txt"), "CHUNK_BODY_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workspaces", "knowledge", "P26-014", "wiki", ".env"), "TOKEN=SECRET_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workspaces", "not_allowed", "wiki", "outside.md"), "OUTSIDE_ALLOWLIST_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "guild_hall", "rag", "routes", "project.route.yaml"), "answer_text: NOTEBOOKLM_ANSWER_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "guild_hall", "rag", "work_cards", "project.source_card.json"), JSON.stringify({ body: "SOURCE_CARD_BODY_SHOULD_NOT_LEAK" }));
  writeFileSync(join(root, "guild_hall", "knowledge_access", "ledger", "access_ledger.md"), "QUERY_TEXT_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workmeta", "system", "knowledge_rag_candidate_ledger", "runs", "candidate_packet.yaml"), "raw: CANDIDATE_RAW_SHOULD_NOT_LEAK\n");
  writeFileSync(join(root, "_workmeta", "system", "reports", "rag", "operator_health", "health_report.json"), "{\"body\":\"RAG_REPORT_BODY_SHOULD_NOT_LEAK\"}\n");
  writeFileSync(join(root, "_workmeta", "system", "runs", "knowledge_shell_test", "NIGHT_WORK_HANDOFF.md"), "handoff: HANDOFF_BODY_SHOULD_NOT_LEAK\n");
  return root;
}

function assertKnowledgeShellSafe(payload) {
  const raw = JSON.stringify(payload);
  for (const forbidden of [
    "REGISTRY_BODY_SHOULD_NOT_LEAK",
    "RAW_BODY_SHOULD_NOT_LEAK",
    "CHUNK_BODY_SHOULD_NOT_LEAK",
    "SECRET_SHOULD_NOT_LEAK",
    "OUTSIDE_ALLOWLIST_SHOULD_NOT_LEAK",
    "NOTEBOOKLM_ANSWER_SHOULD_NOT_LEAK",
    "SOURCE_CARD_BODY_SHOULD_NOT_LEAK",
    "QUERY_TEXT_SHOULD_NOT_LEAK",
    "CANDIDATE_RAW_SHOULD_NOT_LEAK",
    "RAG_REPORT_BODY_SHOULD_NOT_LEAK",
    "HANDOFF_BODY_SHOULD_NOT_LEAK",
    "chunk-001.txt",
    ".env",
  ]) {
    assert.equal(raw.includes(forbidden), false, `metadata shell leaked ${forbidden}`);
  }
}

function isSymlinkPrivilegeError(err) {
  return ["EPERM", "EACCES", "ENOTSUP"].includes(err?.code);
}

async function startDevErpServer(args = [], env = {}) {
  const child = spawn(process.execPath, ["server.mjs", ...args], {
    cwd: APP_DIR,
    env: testServerEnv(env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  child.stdout.resume();
  child.stderr.resume();
  return {
    child,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    },
    stderr: () => stderr,
  };
}

async function waitForHttp(url, child, stderrFn) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${stderrFn()}`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // retry while the server starts
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server_not_ready:${stderrFn()}`);
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

test("store: Codex task binding keeps item id as durable thread key", () => {
  const store = freshStore();
  loadFixture(store);
  const first = store.createItem({ project_id: "PRJ-A", title: "테스트 대화", created_by: "tester" }).item;
  const second = store.createItem({ project_id: "PRJ-A", title: "테스트 대화", created_by: "tester" }).item;
  assert.match(store.codexThreadTitle(second), /^\[PRJ-A\] 테스트 대화 · /);

  const title = store.codexThreadTitle(first);
  const up = store.upsertCodexTaskBinding({ item_id: first.id, thread_id: "thread_test_1", thread_title: title, mode: "mock" });
  assert.equal(up.ok, true);
  assert.equal(up.binding.thread_id, "thread_test_1");
  assert.equal(up.binding.item_id, first.id);
  assert.equal(up.binding.data_label, "meta");

  store.appendCodexTaskMessage({ item_id: first.id, thread_id: "thread_test_1", role: "user", text: "진행해줘", actor_ref: "tester", mode: "mock" });
  store.appendCodexTaskMessage({ item_id: first.id, thread_id: "thread_test_1", role: "assistant", text: "확인했습니다.", actor_ref: "codex", mode: "mock" });
  assert.deepEqual(store.codexTaskMessages(first.id).map((m) => m.role), ["user", "assistant"]);

  store.updateItem(first.id, { title: "바뀐 할일명" });
  assert.equal(store.codexTaskBinding(first.id).thread_id, "thread_test_1");
});

test("store: item lists expose Codex task reply metadata without message text", () => {
  const store = freshStore();
  loadFixture(store);
  const item = store.createItem({ project_id: "PRJ-A", title: "codex reply marker", created_by: "tester" }).item;
  store.upsertCodexTaskBinding({ item_id: item.id, thread_id: "thread_reply_1", mode: "mock" });
  store.appendCodexTaskMessage({ item_id: item.id, thread_id: "thread_reply_1", role: "user", text: "what should I do", actor_ref: "tester", mode: "mock" });
  let row = store.items({ project: "PRJ-A", q: "codex reply marker" }).find((r) => r.id === item.id);
  assert.equal(row.codex_waiting_reply, 1);
  assert.equal(row.codex_has_reply, 0);

  store.appendCodexTaskMessage({ item_id: item.id, thread_id: "thread_reply_1", role: "assistant", text: "check the acceptance criteria first", actor_ref: "codex", mode: "mock" });
  row = store.itemsPage({ project: "PRJ-A", q: "codex reply marker", limit: 10 }).rows.find((r) => r.id === item.id);
  assert.equal(row.codex_thread_id, "thread_reply_1");
  assert.equal(row.codex_last_message_role, "assistant");
  assert.equal(row.codex_has_reply, 1);
  assert.ok(row.codex_last_message_id > 0);
  assert.equal("text" in row, false);
  assert.equal("codex_last_message_text" in row, false);
});

test("분해 S1: 부모-자식 생성·검증 + 자식 done/total 진행률 rollup", () => {
  const store = freshStore();
  loadFixture(store);
  const parent = store.createItem({ project_id: "PRJ-A", title: "부모 할일", created_by: "t" }).item;
  const c1 = store.createItem({ project_id: "PRJ-A", title: "자식1", parent_item_id: parent.id, created_by: "t" });
  const c2 = store.createItem({ project_id: "PRJ-A", title: "자식2", parent_item_id: parent.id, created_by: "t" });
  assert.equal(c1.item.parent_item_id, parent.id);
  assert.equal(c2.item.parent_item_id, parent.id);
  // childItems: 부모의 자식 2개
  assert.equal(store.childItems(parent.id).length, 2);
  // rollup: 처음 0/2
  let prow = store.items({ project: "PRJ-A" }).find((r) => r.id === parent.id);
  assert.equal(prow.child_total, 2);
  assert.equal(prow.child_done, 0);
  // 자식1 완료 → 1/2
  store.setItemStatus(c1.item.id, "done");
  prow = store.itemsPage({ project: "PRJ-A", limit: 500 }).rows.find((r) => r.id === parent.id);
  assert.equal(prow.child_total, 2);
  assert.equal(prow.child_done, 1);
  // 자식엔 자식 없음(0/0)
  const crow = store.items({ project: "PRJ-A" }).find((r) => r.id === c2.item.id);
  assert.equal(crow.child_total, 0);
  // 검증: 없는 부모 / 1단계 초과(자식의 자식) / 다른 프로젝트
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "x", parent_item_id: "nope" }).error, "parent_not_found");
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "손주", parent_item_id: c1.item.id }).error, "parent_is_child");
  assert.equal(store.createItem({ project_id: "PRJ-B", title: "y", parent_item_id: parent.id }).error, "parent_project_mismatch");
});

test("분해 S2: 수동 나누기 버튼·모달·와이어링 + 자식 들여쓰기 렌더", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  assert.match(app, /function openSplitModal/);                         // 분해 모달
  assert.match(app, /data-split="\$\{esc\(i\.id\)\}"/);                 // 나누기 버튼
  assert.match(app, /i\.parent_item_id \? "" :/);                       // 자식엔 버튼 미표시(1단계)
  assert.match(app, /\.split\[data-split\]/);                           // wireItemEdit 와이어링
  assert.match(app, /parent_item_id: itemId/);                          // 자식 생성 시 부모 연결
  assert.match(app, /tr class="\$\{i\.parent_item_id && !orphanIds\.has\(i\.id\) \? "item-child" : ""\}"/); // 자식 행 클래스(orphan 제외)
  assert.match(app, /child-prog/);                                      // 부모 진행률 배지
  assert.match(css, /tr\.item-child/);                                  // 들여쓰기 스타일
});

test("분해 S5: 파티 monster_type 역인덱스 로드 + createItem party_ref 기록", () => {
  const root = join(APP_DIR, "..", "..", "..");
  const { types, typeToParty } = loadPartyMonsterTypes(root);
  assert.ok(types.length >= 5, "여러 monster_type 로드");
  assert.equal(typeToParty["se_assistant_request"], "systems_engineering_cell");
  assert.equal(typeToParty["skill_authoring_request"], "guild_master_cell");
  assert.equal(partyForMonsterType(typeToParty, "se_assistant_request"), "systems_engineering_cell");
  assert.equal(partyForMonsterType(typeToParty, "nope"), null);
  // createItem 이 party_ref 를 저장
  const store = freshStore();
  loadFixture(store);
  const it = store.createItem({ project_id: "PRJ-A", title: "파티 자식", party_ref: "systems_engineering_cell" }).item;
  assert.equal(it.party_ref, "systems_engineering_cell");
});

test("분해 S4: suggestSplit — stub provider는 외부호출 없이 제안 없음(안전 폴백)", async () => {
  const r = await suggestSplit({ title: "예시", project_id: "PRJ-A" }, ["se_assistant_request"], { provider: "stub" });
  assert.equal(r.should_split, false);
  assert.equal(r.reason, "llm_unavailable");
  assert.deepEqual(r.sub_tasks, []);
  // 서버 엔드포인트·프론트 와이어링 존재(소스 스캔)
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const server = readFileSync(join(APP_DIR, "server.mjs"), "utf8");
  assert.match(server, /\/api\/items\/split-suggest/);
  assert.match(server, /suggestSplit\(item, types/);
  assert.match(app, /\/api\/items\/split-suggest/);
  assert.match(app, /aiMap\[title\]/);                 // AI 제안분만 party_ref 전달
});

test("분해 버그수정: 헌트 5건 회귀 가드 (rollup 필터·overlay·aiMap trim·orphan·HTTP검사)", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const storeSrc = readFileSync(join(APP_DIR, "src", "store.mjs"), "utf8");
  const llmSrc = readFileSync(join(APP_DIR, "src", "llm.mjs"), "utf8");
  // Fix5: 자식 진행률 rollup이 archived/unclassified 제외
  assert.match(storeSrc, /parent_item_id IN \(\$\{marks\}\) AND status NOT IN \('archived','unclassified'\)/);
  // Fix3: 분해 모달 중복 오버레이 제거
  assert.match(app, /openSplitModal[\s\S]{0,200}\.ui-confirm-overlay"\)\?\.remove\(\)/);
  // Fix4: aiMap 키를 trim 해 textarea 줄과 일치(공백 불일치로 party 유실 방지)
  assert.match(app, /aiMap\[String\(s\.title\)\.trim\(\)\]/);
  // Fix1: orphan 자식(부모 부재)은 평면 처리
  assert.match(app, /const orphanIds = new Set\(\)/);
  assert.match(app, /orphanIds\.has\(i\.id\)/);
  // Fix2: ollama HTTP 에러를 성공으로 위장하지 않음
  assert.match(llmSrc, /if \(resp\.ok === false\)/);
});

test("분해 버그수정 Fix5(기능): rollup이 archived 자식을 빼고 센다", () => {
  const store = freshStore();
  loadFixture(store);
  const parent = store.createItem({ project_id: "PRJ-A", title: "P", created_by: "t" }).item;
  const c1 = store.createItem({ project_id: "PRJ-A", title: "c1", parent_item_id: parent.id }).item;
  store.createItem({ project_id: "PRJ-A", title: "c2", parent_item_id: parent.id });
  let prow = store.items({ project: "PRJ-A" }).find((r) => r.id === parent.id);
  assert.equal(prow.child_total, 2);
  store.archiveItem(c1.id);  // 자식 하나 보관 → total 에서 빠져야
  prow = store.items({ project: "PRJ-A" }).find((r) => r.id === parent.id);
  assert.equal(prow.child_total, 1);
});

test("분해 버그수정 2R: archive/restore 자식 cascade + party_ref 검증 + 일괄 부분실패", () => {
  const store = freshStore();
  loadFixture(store);
  const parent = store.createItem({ project_id: "PRJ-A", title: "P", created_by: "t" }).item;
  const c1 = store.createItem({ project_id: "PRJ-A", title: "c1", parent_item_id: parent.id }).item;
  const c2 = store.createItem({ project_id: "PRJ-A", title: "c2", parent_item_id: parent.id }).item;
  // 부모 보관 → 자식도 보관(cascade)
  store.archiveItem(parent.id);
  assert.equal(store.itemById(c1.id).status, "archived");
  assert.equal(store.itemById(c2.id).status, "archived");
  // 부모 복구 → 함께 보관됐던 자식도 복구(대칭)
  store.restoreItem(parent.id);
  assert.equal(store.itemById(parent.id).status, "open");
  assert.equal(store.itemById(c1.id).status, "open");
  // party_ref 검증: 허용목록 주입 후 임의 문자열 거부, 정본 파티만 통과
  store.setValidParties(new Set(["systems_engineering_cell"]));
  assert.equal(store.createItem({ project_id: "PRJ-A", title: "bad", party_ref: "nonexistent" }).error, "party_ref_invalid");
  assert.ok(store.createItem({ project_id: "PRJ-A", title: "good", party_ref: "systems_engineering_cell" }).item);
  // 프론트: 일괄생성 부분실패 수집 + 응답바디 소비(커넥션 누수 방지)
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.match(app, /const failed = \[\]/);
  assert.match(app, /await r\.json\(\)\.catch/);
  assert.match(app, /failed\.push\(\{ title, error: data\.error \}\)/);
});

test("분해 버그수정 3R: done뷰 orphan·Esc닫기·regex경계·빈types조기반환·프롬프트JSON", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const llmSrc = readFileSync(join(APP_DIR, "src", "llm.mjs"), "utf8");
  const pm = readFileSync(join(APP_DIR, "src", "party_match.mjs"), "utf8");
  assert.match(app, /const topIds0 = new Set/);                    // orphanIds를 done 포함 모든 뷰 공통 계산
  assert.match(app, /const escClose = \(e\) =>/);                  // 분해 모달 Esc 닫기
  assert.match(pm, /\[A-Za-z0-9_-\]\+:/);                          // YAML 키 경계(하이픈/숫자 포함)
  assert.match(llmSrc, /party_match_unavailable/);                 // 빈 monster_types 조기반환(모순 프롬프트 방지)
  assert.match(llmSrc, /const itemData = JSON\.stringify/);        // 사용자 필드 JSON 인코딩(프롬프트 인젝션 방지)
});

test("분해 버그수정 3R(기능): suggestSplit — 파티 어휘 없으면 호출 없이 party_match_unavailable", async () => {
  const r = await suggestSplit({ title: "x" }, [], { provider: "ollama" });
  assert.equal(r.should_split, false);
  assert.equal(r.reason, "party_match_unavailable");
});

test("분해 autosync: ingestTaskItem 이 parent_item_id·party_ref 보존(INSERT 정렬) + 재ingest COALESCE 멱등", () => {
  const store = freshStore();
  loadFixture(store);
  store.ingestTaskItem({ id: "itm_parent", project_code: "P26-014", title: "부모", origin: "manual" });
  const r = store.ingestTaskItem({ id: "itm_child", project_code: "P26-014", title: "자식", origin: "manual", parent_item_id: "itm_parent", party_ref: "systems_engineering_cell" });
  assert.ok(!r.error, "ingest ok");
  const child = store.itemById("itm_child");
  assert.equal(child.parent_item_id, "itm_parent");   // INSERT 컬럼·VALUES·run 정렬 정상
  assert.equal(child.party_ref, "systems_engineering_cell");
  store.ingestTaskItem({ id: "itm_child", project_code: "P26-014", title: "자식", origin: "manual" }); // 빈값 재-ingest
  const child2 = store.itemById("itm_child");
  assert.equal(child2.parent_item_id, "itm_parent");  // COALESCE 보존(멱등)
  assert.equal(child2.party_ref, "systems_engineering_cell");
  const autosyncSrc = readFileSync(join(APP_DIR, "src", "autosync.mjs"), "utf8");
  assert.match(autosyncSrc, /부모할일ID", "parent_item_id"/); // CSV 헤더 round-trip
  assert.match(autosyncSrc, /parent_item_id: obj\.parent_item_id/); // stableTaskHash 포함
});

test("분해 버그수정 4R: ingest 무효부모 드롭 + 제출버튼 가드 + party 줄-regex 하이픈", () => {
  const store = freshStore();
  loadFixture(store);
  store.ingestTaskItem({ id: "itm_p2", project_code: "P26-014", title: "부모2", origin: "manual" });
  store.ingestTaskItem({ id: "itm_bad", project_code: "P26-014", title: "나쁜자식", origin: "manual", parent_item_id: "nonexistent" });
  assert.equal(store.itemById("itm_bad").parent_item_id, null);     // 무효 부모(존재X) 조용히 드롭
  store.ingestTaskItem({ id: "itm_good", project_code: "P26-014", title: "좋은자식", origin: "manual", parent_item_id: "itm_p2" });
  assert.equal(store.itemById("itm_good").parent_item_id, "itm_p2"); // 유효 부모 유지
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const pm = readFileSync(join(APP_DIR, "src", "party_match.mjs"), "utf8");
  assert.match(app, /okBtn\.disabled = true/);                      // 만들기 중복 제출 방지
  assert.ok((pm.match(/\[A-Za-z0-9_-\]/g) || []).length >= 2, "블록+줄 regex 모두 하이픈 허용");
});

test("분해 버그수정 5R: suggestSplit monster_type 허용목록 필터 + escClose ov부착(누수방지)", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const llmSrc = readFileSync(join(APP_DIR, "src", "llm.mjs"), "utf8");
  assert.match(llmSrc, /monsterTypes\.includes\(s\.monster_type\)/);  // LLM 할루시네이션 타입 제외
  assert.match(app, /ov\.addEventListener\("keydown", escClose\)/);   // document 아닌 ov에 부착(GC)
  assert.doesNotMatch(app, /document\.addEventListener\("keydown", escClose\)/); // 누수 패턴 제거 확인
});

test("분해 버그수정 6R: 부분 실패 후 성공분 textarea 제거(재클릭 중복 생성 방지)", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.match(app, /const failedTitles = new Set\(failed\.map/);
  assert.match(app, /ta\.value = lines\.filter\(\(l\) => failedTitles\.has\(l\)\)/);
});

test("codex bridge: task metadata is hidden from visible user prompts", () => {
  const item = { id: "itm_1", project_id: "P26-001", title: "자료 검토", status: "open", due: "2026-06-30" };
  assert.equal(buildTaskThreadTitle(item), "[P26-001] 자료 검토");
  const prompt = buildTaskPrompt(item, "스킬 써서 검토해줘");
  assert.equal(prompt, "스킬 써서 검토해줘");
  assert.doesNotMatch(prompt, /item_id: itm_1/);
  assert.doesNotMatch(prompt, /Task metadata|User message:/);
  assert.doesNotMatch(prompt, /attachment body|mail body/i);
  const initial = buildTaskPrompt(item, "", { initial: true });
  assert.doesNotMatch(initial, /item_id: itm_1|Task metadata|User message:/);

  const instructions = buildTaskDeveloperInstructions(item);
  assert.match(instructions, /item_id: itm_1/);
  assert.match(instructions, /Do not claim raw mail/);
});

test("codex bridge: app-server turn input can carry skill and localImage items", () => {
  const input = buildCodexTurnInput({
    text: "$soulforge-shield-wall 이미지 확인",
    skills: [{ name: "soulforge-shield-wall", path: "C:\\Users\\user\\.codex\\skills\\soulforge-shield-wall\\SKILL.md" }],
    localImages: [{ path: "C:\\Soulforge\\_workspaces\\system\\dev-erp\\codex-task-attachments\\IT-001\\shot.png" }],
  });
  assert.deepEqual(input.map((x) => x.type), ["skill", "text", "localImage"]);
  assert.equal(input[0].name, "soulforge-shield-wall");
  assert.equal(input[1].text, "$soulforge-shield-wall 이미지 확인");
  assert.doesNotMatch(input[1].text, /Task metadata|item_id:/);
  assert.match(input[2].path, /shot\.png$/);
});

test("codex bridge: app-server service tier override is opt-in", () => {
  assert.deepEqual(buildCodexAppServerArgs(), ["app-server"]);
  assert.equal(codexAppServerServiceTierOverride("flex"), null);
  assert.deepEqual(buildCodexAppServerArgs({ serviceTier: "flex" }), ["app-server"]);
  assert.deepEqual(buildCodexAppServerArgs({ serviceTier: "fast" }), ["app-server", "-c", "service_tier=fast"]);
});

test("runtime corrections: project names dry-run, backup, meta/db apply", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-runtime-corrections-"));
  try {
    const workspaces = join(root, "_workspaces");
    const data = join(root, "data");
    const backups = join(data, "backups");
    mkdirSync(join(workspaces, "P24-049 저주파SAS"), { recursive: true });
    mkdirSync(data, { recursive: true });
    const metaPath = join(data, "real_meta.json");
    const dbPath = join(data, "dev-erp.db");
    writeFileSync(metaPath, JSON.stringify({ projects: [{ id: "P24-049", title: "P24-049", health: "ok", class: "active" }] }, null, 2));
    const store = openStore(dbPath);
    store.upsertProject({ id: "P24-049", title: "P24-049", health: "ok", class: "active", data_label: "real" });
    store.db.close();

    const options = { workspacesDir: workspaces, metaPath, dbPath, backupDir: backups };
    const planned = planRuntimeCorrections(options);
    assert.equal(planned.errors.length, 0);
    assert.equal(planned.plan.project_names.meta.changes.length, 1);
    assert.equal(planned.plan.project_names.db.changes.length, 1);

    const applied = applyRuntimeCorrections({ ...options, apply: true });
    assert.equal(applied.applied, true);
    assert.ok(applied.backup);
    assert.equal(existsSync(applied.backup), true);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.equal(meta.projects[0].title, "저주파SAS");
    const verify = openStore(dbPath);
    assert.equal(verify.db.prepare("SELECT title FROM core_project WHERE id='P24-049'").get().title, "저주파SAS");
    assert.equal(verify.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(verify.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='project_name_sync'").get().n, 1);
    verify.db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime release audit: read-only DB/meta gate passes a synced pilot DB", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-runtime-audit-pass-"));
  try {
    const workspaces = join(root, "_workspaces");
    const data = join(root, "data");
    mkdirSync(join(workspaces, "P24-049 Project Alpha"), { recursive: true });
    mkdirSync(data, { recursive: true });
    const metaPath = join(data, "real_meta.json");
    const dbPath = join(data, "dev-erp.db");
    writeFileSync(metaPath, JSON.stringify({
      projects: [{ id: "P24-049", title: "Project Alpha", health: "ok", class: "active", data_label: "real" }],
      items: [],
      mail: [{ id: "mail-1", project_id: "P24-049", at: "2026-06-18T09:00:00+09:00", subject: "metadata only" }],
      artifacts: [],
    }, null, 2));

    const store = openStore(dbPath);
    store.upsertProject({ id: "P24-049", title: "Project Alpha", health: "ok", class: "active", data_label: "real" });
    store.ingestMail({ id: "mail-1", project_code: "P24-049", at: "2026-06-18T09:00:00+09:00", subject: "metadata only", data_label: "real" });
    store.createAccount({ username: "admin", password: "pw123456", roles: ["admin"] });
    store.db.close();

    const result = await runRuntimeReleaseAudit({
      sourceRoot: root,
      runtimeRoot: root,
      appRoot: APP_DIR,
      dbPath,
      metaPath,
      workspacesDir: workspaces,
      nasRoot: false,
      skipGit: true,
      skipNas: true,
      targetMembers: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.checks.real_meta.project_id_diff.meta_only, 0);
    assert.equal(result.checks.real_meta.mail_id_diff.db_only, 0);
    assert.equal(result.checks.workspace_projects.count, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime release audit: blocks anonymous runtime and missing NAS latest backup", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-runtime-audit-block-"));
  try {
    const data = join(root, "data");
    const nas = join(root, "nas");
    mkdirSync(data, { recursive: true });
    mkdirSync(nas, { recursive: true });
    const metaPath = join(data, "real_meta.json");
    const dbPath = join(data, "dev-erp.db");
    writeFileSync(metaPath, JSON.stringify({ projects: [], items: [], mail: [], artifacts: [] }, null, 2));
    const store = openStore(dbPath);
    store.db.close();

    const result = await runRuntimeReleaseAudit({
      sourceRoot: root,
      runtimeRoot: root,
      appRoot: APP_DIR,
      dbPath,
      metaPath,
      workspacesDir: join(root, "_workspaces"),
      nasRoot: nas,
      skipGit: true,
      targetMembers: 0,
    });
    const codes = result.blockers.map((issue) => issue.code);
    assert.ok(codes.includes("auth_anonymous_mode"));
    assert.ok(codes.includes("nas_latest_db_backup_missing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime ops: health check classifies ok and down states", async () => {
  const ok = await runtimeHealthCheck({
    url: "http://unit.test/api/health",
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, schema: "dev_erp.health.v1" }),
    }),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "ok");
  assert.equal(ok.http_status, 200);

  const down = await runtimeHealthCheck({
    url: "http://unit.test/api/health",
    fetcher: async () => {
      throw new Error("connection refused");
    },
  });
  assert.equal(down.ok, false);
  assert.equal(down.status, "down");
});

test("runtime ops: SQLite backup and restore test write metadata-only reports", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-runtime-ops-"));
  try {
    const data = join(root, "data");
    const scheduled = join(root, "nas", "01_db_backups", "scheduled");
    const latest = join(root, "nas", "01_db_backups", "latest", "runtime_live");
    const restoreReports = join(root, "nas", "02_restore_tests");
    mkdirSync(data, { recursive: true });
    mkdirSync(latest, { recursive: true });
    const dbPath = join(data, "dev-erp.db");
    const latestPath = join(latest, "dev-erp.db");
    writeFileSync(`${latestPath}-wal`, "stale wal sidecar");
    writeFileSync(`${latestPath}-shm`, "stale shm sidecar");
    const store = openStore(dbPath);
    store.upsertProject({ id: "P26-001", title: "Project One", health: "ok", class: "active", data_label: "real" });
    store.createAccount({ username: "admin", password: "pw123456", roles: ["admin"] });
    store.db.close();

    const backup = backupRuntimeDb({
      dbPath,
      outDir: scheduled,
      latestDir: latest,
      tag: "unit",
      now: new Date("2026-06-18T00:00:00Z"),
    });
    assert.equal(backup.ok, true);
    assert.equal(backup.kind, "backup_db");
    assert.equal(existsSync(backup.backupPath), true);
    assert.equal(existsSync(backup.latestPath), true);
    assert.equal(existsSync(`${backup.latestPath}-wal`), false);
    assert.equal(existsSync(`${backup.latestPath}-shm`), false);
    assert.equal(existsSync(backup.manifestPath), true);
    assert.equal(existsSync(backup.latestManifestPath), true);
    assert.match(backup.sha256, /^[a-f0-9]{64}$/);

    const restore = restoreTestRuntimeDb({
      backupPath: backup.latestPath,
      reportDir: restoreReports,
      now: new Date("2026-06-18T00:05:00Z"),
    });
    assert.equal(restore.ok, true);
    assert.equal(restore.quick_check, "ok");
    assert.equal(restore.schema_version, "dev_erp.v1");
    assert.equal(existsSync(restore.reportPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  const { writeFileSync, rmSync, existsSync, mkdirSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const seedPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "se_process_seed.json");
  if (existsSync(seedPath)) return; // Codex 실파일이 있으면 합성 테스트 건너뜀(실파일 보호)
  const seed = {
    templates: [{ key: "t_test", name: "테스트", stages: [{ stage_code: "130", seq: 1, is_milestone: true }],
      deliverables: [{ anchor_stage_code: "130", offset_days: 3, name: "테스트산출물", artifact_type: "bom" }] }], // name/artifact_type 변형
    board_requirements: [{ board_type: "수신부", artifacts: [{ artifact_type: "gerber", label: "거버" }] }], // 중첩 변형
  };
  mkdirSync(dirname(seedPath), { recursive: true });
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

test("knowledge shell: scanners expose allowlisted metadata only", () => {
  const root = makeKnowledgeShellFixture();
  try {
    const spaces = scanKnowledgeSpaces({ root });
    const pages = scanWikiPageRefs({ root });
    const routes = scanRagRoutes({ root });
    const workCards = scanRagWorkCards({ root });
    const ledgers = scanKnowledgeLedgers({ root });
    const contract = scanKnowledgeShellContract({ root });
    const payload = { spaces, pages, routes, workCards, ledgers, contract };

    for (const part of Object.values(payload)) {
      assert.equal(part.schema, KNOWLEDGE_SHELL_SCHEMA);
      assert.equal(part.content_policy, "metadata_only");
      assert.equal(part.body_included, false);
    }
    assert.ok(spaces.spaces.some((x) => x.path === "_workspaces/knowledge/P26-014"), "allowlisted knowledge space is visible");
    assert.ok(pages.pages.some((x) => x.page_ref === "_workspaces/knowledge/P26-014/wiki/page.md"), "wiki page ref is visible");
    assert.ok(routes.routes.some((x) => x.route_ref === "guild_hall/rag/routes/project.route.yaml"), "RAG route ref is visible");
    assert.ok(workCards.work_cards.some((x) => x.work_card_ref === "guild_hall/rag/work_cards/project.source_card.json" && x.chunk_count === 0), "work-card ref has no chunks");
    assert.ok(ledgers.ledgers.some((x) => x.ledger_ref === "guild_hall/knowledge_access/ledger/access_ledger.md"), "ledger ref is visible");
    assert.ok(ledgers.ledgers.some((x) => x.ledger_ref === "_workmeta/system/reports/rag/operator_health/health_report.json"), "narrow RAG report ledger ref is visible");
    assert.equal(contract.kind, KNOWLEDGE_SHELL_CONTRACT_KIND);
    assert.equal(contract.contract.llm_runtime_policy.karpathy_llm_runtime_required, false);
    assert.equal(contract.contract.llm_runtime_policy.karpathy_reference_role, "wiki_operating_pattern_only");
    assert.equal(contract.contract.erp_role.reads_source_bodies, false);
    assert.equal(contract.contract.wiki_role.default_workflow, "knowledge_wiki_pipeline_v0");

    const raw = JSON.stringify(payload);
    assert.equal(raw.includes("_workspaces/not_allowed"), false, "non-allowlisted root is not scanned");
    assert.equal(raw.includes("_workmeta/system/runs"), false, "broad system runs are not exposed");
    assertKnowledgeShellSafe(payload);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("knowledge shell: API routes return metadata-only shapes", async () => {
  const root = makeKnowledgeShellFixture();
  const port = await freePort();
  const dbPath = join(root, "dev-erp.db");
  const srv = await startDevErpServer(["--db", dbPath, "--port", String(port), "--knowledge_shell_root", root]);
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${base}/api/health`, srv.child, srv.stderr);
    const registry = await fetch(`${base}/api/knowledge/registry`);
    assert.equal(registry.status, 200, "legacy registry route");
    assert.ok(Array.isArray((await registry.json()).groups), "legacy registry groups");
    const contractResponse = await fetch(`${base}/api/knowledge/shell/contract`);
    assert.equal(contractResponse.status, 200, "knowledge shell contract route");
    const contract = await contractResponse.json();
    assert.equal(contract.schema, KNOWLEDGE_SHELL_SCHEMA);
    assert.equal(contract.kind, KNOWLEDGE_SHELL_CONTRACT_KIND);
    assert.equal(contract.content_policy, "metadata_only");
    assert.equal(contract.body_included, false);
    assert.equal(contract.contract.llm_runtime_policy.karpathy_llm_runtime_required, false);
    assert.equal(contract.contract.erp_role.role, "metadata_shell_consumer");
    assertKnowledgeShellSafe(contract);
    const endpoints = [
      ["/api/knowledge/spaces", "spaces"],
      ["/api/knowledge/wiki/pages", "pages"],
      ["/api/knowledge/rag/routes", "routes"],
      ["/api/knowledge/rag/work-cards", "work_cards"],
      ["/api/knowledge/ledgers", "ledgers"],
    ];
    for (const [endpoint, field] of endpoints) {
      const r = await fetch(`${base}${endpoint}`);
      assert.equal(r.status, 200, endpoint);
      const body = await r.json();
      assert.equal(body.schema, KNOWLEDGE_SHELL_SCHEMA);
      assert.equal(body.content_policy, "metadata_only");
      assert.equal(body.body_included, false);
      assert.ok(Array.isArray(body[field]), `${field} array`);
      assert.ok(body.counts && typeof body.counts === "object", "counts object");
      assertKnowledgeShellSafe(body);
    }
  } finally {
    await srv.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("server: shared skin directory serves fantasy backgrounds before local fallback", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-skins-"));
  try {
    const skinsDir = join(root, "skins");
    mkdirSync(skinsDir, { recursive: true });
    writeFileSync(join(skinsDir, "main.png"), Buffer.from("shared-main-skin"));
    const port = await freePort();
    const srv = await startDevErpServer(["--db", join(root, "dev-erp.db"), "--port", String(port), "--skins_dir", skinsDir]);
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/health`, srv.child, srv.stderr);
      const r = await fetch(`${base}/skins/main.png`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /^image\/png/);
      assert.equal(await r.text(), "shared-main-skin");
    } finally {
      await srv.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("server: empty DB stays empty unless fixture loading is explicit", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-empty-fixture-"));
  try {
    const port = await freePort();
    const srv = await startDevErpServer(["--db", join(root, "empty.db"), "--port", String(port)]);
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/health`, srv.child, srv.stderr);
      const body = await (await fetch(`${base}/api/health`)).json();
      assert.equal(body.counts.projects, 0);
      assert.equal(body.counts.items, 0);
    } finally {
      await srv.stop();
    }

    const fixturePort = await freePort();
    const fixtureSrv = await startDevErpServer(["--db", join(root, "fixture.db"), "--port", String(fixturePort), "--fixture"]);
    const fixtureBase = `http://127.0.0.1:${fixturePort}`;
    try {
      await waitForHttp(`${fixtureBase}/api/health`, fixtureSrv.child, fixtureSrv.stderr);
      const body = await (await fetch(`${fixtureBase}/api/health`)).json();
      assert.ok(body.counts.projects > 0);
      assert.ok(body.counts.items > 0);
    } finally {
      await fixtureSrv.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("server: Codex task mock bridge opens a separate task thread API", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-codex-task-"));
  try {
    const codexHome = join(root, "codex-home");
    mkdirSync(join(codexHome, "skills", "test-skill"), { recursive: true });
    writeFileSync(join(codexHome, "skills", "test-skill", "SKILL.md"), "---\nname: test-skill\ndescription: Test skill for ERP task chat.\n---\n");
    const port = await freePort();
    const srv = await startDevErpServer(["--db", join(root, "codex-task.db"), "--port", String(port), "--fixture"], {
      DEV_ERP_CODEX_TASK_BRIDGE: "mock",
      DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: join(root, "codex-task-attachments"),
      DEV_ERP_CODEX_TASK_ALLOW_FAST: "0",
      DEV_ERP_CODEX_TASK_MODEL: "gpt-5.5",
      DEV_ERP_CODEX_TASK_EFFORT: "medium",
      DEV_ERP_CODEX_TASK_SERVICE_TIER: "flex",
      DEV_ERP_CODEX_SERVICE_TIER: "",
      CODEX_HOME: codexHome,
    });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/health`, srv.child, srv.stderr);
      const version = await (await fetch(`${base}/api/version`)).json();
      assert.equal(version.runtime.codex_task.mode, "mock");
      assert.equal("cwd" in version.runtime.codex_task, false);

      const items = await (await fetch(`${base}/api/items`)).json();
      const item = items.find((x) => x.status !== "archived");
      assert.ok(item?.id);

      let caps = await (await fetch(`${base}/api/codex-task/capabilities`)).json();
      assert.deepEqual(caps.defaults, { model: "gpt-5.5", effort: "medium", service_tier: "" });
      assert.deepEqual(caps.model_options, ["gpt-5.5", "gpt-5.4", "gpt-5.3"]);
      assert.deepEqual(caps.effort_options, ["low", "medium", "high", "xhigh"]);
      assert.deepEqual(caps.service_tier_options, []); // 속도(tier) 제거 — codex 기본값
      assert.equal(caps.attachments.local_image, true);
      assert.equal(caps.attachments.arbitrary_file, false);
      assert.ok(caps.skills.some((s) => s.name === "test-skill"));

      let r = await fetch(`${base}/api/codex-task/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      let body = await r.json();
      assert.equal(r.status, 200);
      assert.equal(body.binding.thread_id, `mock_${item.id}`);
      assert.ok(body.messages.some((m) => m.role === "assistant"));

      r = await fetch(`${base}/api/codex-task/attachment?item_id=${encodeURIComponent(item.id)}&filename=test.png`, {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      });
      const upload = await r.json();
      assert.equal(r.status, 200);
      assert.equal(upload.attachment.type, "localImage");
      assert.match(upload.attachment.path, /codex-task-attachments/);

      r = await fetch(`${base}/api/codex-task/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          message: "/test-skill 다음 액션 정리해줘",
          model: "gpt-5.5",
          effort: "xhigh",
          service_tier: "fast",
          attachments: [upload.attachment],
        }),
      });
      body = await r.json();
      assert.equal(r.status, 200);
      assert.deepEqual(body.messages.slice(-2).map((m) => m.role), ["user", "assistant"]);
      assert.equal(body.binding.item_id, item.id);
    } finally {
      await srv.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("server: Codex task service tier 제거 — ALLOW_FAST 여도 tier 옵션 없음(fast 못 켬)", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-codex-tier-"));
  try {
    const port = await freePort();
    const srv = await startDevErpServer(["--db", join(root, "codex-tier.db"), "--port", String(port), "--fixture"], {
      DEV_ERP_CODEX_TASK_BRIDGE: "mock",
      DEV_ERP_CODEX_TASK_ALLOW_FAST: "1",
    });
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/health`, srv.child, srv.stderr);
      const caps = await (await fetch(`${base}/api/codex-task/capabilities`)).json();
      // 속도(tier) 선택 자체를 제거 → ALLOW_FAST=1 이어도 옵션 없음. codex 기본 tier 사용.
      assert.deepEqual(caps.defaults.service_tier, "");
      assert.deepEqual(caps.service_tier_options, []);
    } finally {
      await srv.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test("mail UI: assign keeps the operator in mail history", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const start = app.indexOf("const doAssign = async");
  const end = app.indexOf("$(\"#assignGo\")", start);
  assert.ok(start > 0 && end > start, "doAssign block must be present");
  const block = app.slice(start, end);
  assert.match(block, /post\("\/api\/mail\/assign"/);
  assert.match(block, /state\.mailSel = nextSel/); // #10: 일반 분류는 nextSel 기본 null(해제), '분류하고 다음'은 다음 메일 — 어느 쪽도 메일 뷰 유지(허브로 안 튐)
  assert.doesNotMatch(block, /state\.view\s*=\s*"project"/);
  assert.doesNotMatch(block, /state\.hubProject\s*=\s*target/);
  assert.doesNotMatch(block, /state\.hubTab/);
});

test("mail UI: project mail promote buttons surface result state", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  const hubStart = app.indexOf("async function hubMail");
  const hubEnd = app.indexOf("async function hubHistory", hubStart);
  assert.ok(hubStart > 0 && hubEnd > hubStart, "hubMail block must be present");
  const block = app.slice(hubStart, hubEnd);
  assert.match(app, /function mailPromoteErrorText/);
  assert.match(app, /async function promoteMailToItem/);
  assert.match(app, /mail_project_missing/);
  assert.match(app, /already_promoted/);
  assert.match(app, /mail_forbidden/);
  assert.match(block, /state\._promotedMails/);
  assert.match(block, /data-promote-msg/);
  assert.match(block, /promoteMailToItem\(mailId/);
  assert.match(block, /e\.stopPropagation\(\)/);
  assert.match(block, /setTimeout\(render, 250\)/);
  assert.match(css, /\.mail-promote-msg/);
  assert.match(css, /\.mail-promote-msg\.error/);
});

test("mail UI: history exposes page selection controls", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  const mailStart = app.indexOf("async function renderMail()");
  const mailEnd = app.indexOf("async function renderAuditLog()", mailStart);
  assert.ok(mailStart > 0 && mailEnd > mailStart, "renderMail block must be present");
  const block = app.slice(mailStart, mailEnd);
  assert.match(block, /mailSelectPage/);
  assert.match(block, /mailClearPage/);
  assert.match(block, /mailClearAll/);
  assert.match(block, /data-pick/);
  assert.match(block, /pageIds = mail\.map/);
  assert.match(css, /\.mail-selectbar/);
  assert.match(css, /\.mail-pick/);
});

test("mail UI: history shows metadata preview and thread grouping without storing bodies", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  const mailStart = app.indexOf("async function renderMail()");
  const mailEnd = app.indexOf("async function renderAuditLog()", mailStart);
  assert.ok(mailStart > 0 && mailEnd > mailStart, "renderMail block must be present");
  const block = app.slice(mailStart, mailEnd);
  assert.match(app, /MAIL_THREAD_PREFIX_RE/);
  assert.match(app, /function mailPreviewLine/);
  assert.match(block, /mail_group_thread/);
  assert.match(block, /f\.groupBy === "thread"/);
  assert.match(block, /mailThreadSubject\(m\.subject\)/);
  assert.match(block, /mail-preview/);
  assert.match(block, /mail-dupe/);
  assert.match(block, /sel\.source_ref/);
  assert.match(block, /sel\.mailbox/);
  assert.match(css, /\.mail-preview/);
  assert.match(css, /\.mail-row\.thread-child/);
  assert.equal(LEXICON.business.mail_group_thread, "대화별");
  assert.equal(LEXICON.business.mail_preview_meta, "식별 정보");
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
  try {
    symlinkSync(join(root, "secret"), join(root, "_workspaces", "P26-014", "evil"));
    assert.equal(safeWorkspacePath(root, "_workspaces/P26-014/evil/passwd").error, "symlink_escape", "심볼릭 탈출 차단");
  } catch (err) {
    if (!isSymlinkPrivilegeError(err)) throw err;
  }
  rmSync(root, { recursive: true, force: true });
});

test("FILEVAULT: 정상 심볼릭 과제(OneDrive식)는 허용", () => {
  const root = mkdtempSync(join(tmpdir(), "fv2-"));
  mkdirSync(join(root, "_workspaces"), { recursive: true });
  mkdirSync(join(root, "onedrive", "P26-014", "01_In"), { recursive: true });
  writeFileSync(join(root, "onedrive", "P26-014", "01_In", "a.pdf"), "X");
  try {
    symlinkSync(join(root, "onedrive", "P26-014"), join(root, "_workspaces", "P26-014")); // 과제=심볼릭(실환경)
    const r = safeWorkspacePath(root, "_workspaces/P26-014/01_In/a.pdf");
    assert.ok(r.ok, "심볼릭 과제 내부 파일은 허용(realBase=심볼릭 타깃)");
  } catch (err) {
    if (!isSymlinkPrivilegeError(err)) throw err;
  }
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
  store.ingestMail({ id: "P00-000_INBOX:assigned", project_code: "P26-014", at: "2026-06-18", subject: "already assigned" });
  const inboxAgain = store.ingestMail({ id: "P00-000_INBOX:assigned", project_code: "P00-000_INBOX", at: "2026-06-18", subject: "already assigned", source_ref: "src-assigned" });
  assert.equal(inboxAgain.project_id, "P26-014");
  const assigned = store.db.prepare("SELECT project_id,source_ref FROM core_mail WHERE id='P00-000_INBOX:assigned'").get();
  assert.equal(assigned.project_id, "P26-014");
  assert.equal(assigned.source_ref, "src-assigned");
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
  const row = store.db.prepare("SELECT mailbox,direction FROM core_mail WHERE id='P26-014:hist-1'").get();
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
  const r = store.createAccount({ username: "owner", password: "pw1234", roles: [] });
  assert.ok(r.ok && r.id);
  assert.equal(store.createAccount({ username: "owner", password: "x" }).error, "username_taken");
  assert.equal(store.createAccount({ username: "short", password: "12345" }).error, "password_too_short");
  assert.equal(store.verifyLogin("owner", "pw1234").username, "owner");
  assert.equal(store.verifyLogin("owner", "bad"), null);
  const tok = store.createSession(r.id);
  assert.equal(store.sessionAccount(tok).id, r.id);
  // 만료 세션
  const expTok = store.createSession(r.id, -1);
  assert.equal(store.sessionAccount(expTok), null, "만료 세션은 무효");
  store.deleteSession(tok);
  assert.equal(store.sessionAccount(tok), null, "삭제 후 무효(logout)");
});

test("P2b: 팀 공개 기본값은 자가 가입 차단, 명시 옵션일 때만 허용", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-auth-"));
  try {
    const dbPath = join(root, "dev-erp.db");
    const port = await freePort();
    const srv = await startDevErpServer(["--db", dbPath, "--port", String(port)]);
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/me`, srv.child, srv.stderr);
      let r = await fetch(`${base}/api/me`);
      let body = await r.json();
      assert.equal(body.allow_self_register, false);

      r = await fetch(`${base}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "ownerpass", display_name: "Owner" }),
      });
      assert.equal(r.status, 200);
      body = await r.json();
      const ownerCookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      r = await fetch(`${base}/api/accounts/update`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ id: body.account.id, role: "member" }),
      });
      body = await r.json();
      assert.equal(r.status, 400);
      assert.equal(body.error, "cannot_change_own_role");

      r = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "member", password: "memberpass" }),
      });
      body = await r.json();
      assert.equal(r.status, 403);
      assert.equal(body.error, "self_register_disabled");
    } finally {
      await srv.stop();
    }

    const dbPath2 = join(root, "dev-erp-open.db");
    const port2 = await freePort();
    const srv2 = await startDevErpServer(["--db", dbPath2, "--port", String(port2), "--allow-self-register"]);
    const base2 = `http://127.0.0.1:${port2}`;
    try {
      await waitForHttp(`${base2}/api/me`, srv2.child, srv2.stderr);
      let r = await fetch(`${base2}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "ownerpass", display_name: "Owner" }),
      });
      assert.equal(r.status, 200);
      r = await fetch(`${base2}/api/me`);
      const me = await r.json();
      assert.equal(me.allow_self_register, true);

      r = await fetch(`${base2}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "member", password: "memberpass", display_name: "Member" }),
      });
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.account.username, "member");
    } finally {
      await srv2.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-ACCT: 팀원은 공유 설정/운영성 쓰기를 직접 변경할 수 없다", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-shared-write-"));
  try {
    const dbPath = join(root, "dev-erp.db");
    const port = await freePort();
    const srv = await startDevErpServer(["--db", dbPath, "--port", String(port), "--fixture"]);
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/api/me`, srv.child, srv.stderr);
      let r = await fetch(`${base}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "ownerpass", display_name: "Owner" }),
      });
      assert.equal(r.status, 200);
      const ownerCookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      r = await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ username: "member", password: "memberpass", display_name: "Member", role: "member" }),
      });
      assert.equal(r.status, 200);
      r = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "member", password: "memberpass" }),
      });
      assert.equal(r.status, 200);
      const memberCookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";

      for (const [endpoint, body] of [
        ["/api/faq", { topic: "운영", question: "q", answer: "a" }],
        ["/api/schedule/anchor", { project_id: "PRJ-A", anchor_stage_code: "030", date: "2026-06-19" }],
        ["/api/proposals", { source: "unit", kind: "create_item", payload: { project_id: "PRJ-A", title: "x" } }],
        ["/api/parts", { id: "pt-new", name: "신규 부품" }],
        ["/api/purchases", { title: "신규 발주" }],
        ["/api/guide/step", { artifact_id: 1, step_key: "draft", on: true }],
        ["/api/labels", { name: "중요", color: "#ff0000" }],
        ["/api/people/skill", { person_id: "p-kim", capability_label: "review" }],
      ]) {
        const denied = await fetch(`${base}${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: memberCookie },
          body: JSON.stringify(body),
        });
        const deniedBody = await denied.json();
        assert.equal(denied.status, 403, `${endpoint} must be admin-only for members`);
        assert.equal(deniedBody.error, "admin_only");
      }

      const ok = await fetch(`${base}/api/faq`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ topic: "운영", question: "관리자 q", answer: "관리자 a" }),
      });
      assert.equal(ok.status, 200);
    } finally {
      await srv.stop();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("P2b: 팀원 비밀번호 변경·관리자 초기화 — 평문 미저장, 기존 비번 거부", () => {
  const store = freshStore();
  const r = store.createAccount({ username: "member1", password: "oldpass", roles: ["member"] });
  const live = store.createSession(r.id);
  assert.equal(store.changeAccountPassword(r.id, { current_password: "wrong", new_password: "newpass1" }).error, "current_password_invalid");
  assert.equal(store.changeAccountPassword(r.id, { current_password: "oldpass", new_password: "123" }).error, "password_too_short");
  assert.equal(store.changeAccountPassword(r.id, { current_password: "oldpass", new_password: "newpass1" }).ok, true);
  assert.equal(store.verifyLogin("member1", "oldpass"), null, "기존 비밀번호는 더 이상 안 됨");
  assert.equal(store.verifyLogin("member1", "newpass1").username, "member1");
  assert.equal(store.sessionAccount(live).id, r.id, "저장 계층 변경만으로 현재 세션은 보존");
  assert.equal(store.setAccountPassword(r.id, "reset77").ok, true);
  store.deleteAccountSessions(r.id);
  assert.equal(store.sessionAccount(live), null, "관리자 초기화 후 기존 세션 삭제 가능");
  assert.equal(store.verifyLogin("member1", "reset77").username, "member1");
});

test("P2b: RBAC visible-but-locked 권한 합집합", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "u", password: "p12345" }).id;
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
  const a = store.createAccount({ username: "u2", password: "p12345" }).id;
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
  const a = store.createAccount({ username: "e1", password: "p12345" }).id;
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
  assert.equal(store.createAccount({ username: "", password: "p12345" }).error, "username_password_required");
  assert.equal(store.createAccount({ username: "u", password: "" }).error, "username_password_required");
  assert.equal(store.createAccount({ username: "short", password: "12345" }).error, "password_too_short");
});

test("P2b 엣지: 레이아웃 비배열/오염 방어", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "e2", password: "p12345" }).id;
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
  const a = store.createAccount({ username: "e3", password: "p12345" }).id;
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
  const r1 = store.chatAnswer({ question: "게이트 통과 어떻게 해?", thread_id: "t1", actor_ref: "alice" });
  assert.equal(r1.matched, true);
  assert.equal(r1.source.id, "faq-gate");
  assert.ok(r1.text.includes("통과 가능"));
  assert.equal(r1.pipeline.id, "manual_chat_pipeline_v1");
  assert.ok(r1.pipeline.steps.some((s) => s.id === "retrieve"), "검색 단계 trace");
  assert.ok(r1.pipeline.steps.some((s) => s.id === "log"), "로그 단계 trace");
  // 미매칭 → 끊기지 않는 사람형 안내 + 미응답 큐 적재
  const r2 = store.chatAnswer({ question: "점심 우주여행 추천", thread_id: "t1", actor_ref: "alice" });
  assert.equal(r2.matched, false);
  assert.ok(r2.text.includes("매뉴얼"), "사람형 안내 텍스트");
  const un = store.unansweredQueries(10);
  assert.ok(un.some((u) => u.question.includes("우주여행")), "미응답이 큐에 집계");
  assert.equal(store.chatAnswer({ question: "" }).error, "question_required");
  // 질문 로그 저장됨(매칭 1 + 미매칭 1)
  const cnt = store.db.prepare("SELECT COUNT(*) c FROM chat_query_log").get().c;
  assert.ok(cnt >= 2, "질문 로그 누적");
  const saved = store.db.prepare("SELECT actor_ref, thread_id FROM chat_query_log ORDER BY id LIMIT 1").get();
  assert.equal(saved.actor_ref, "alice", "질문자 저장");
  assert.equal(saved.thread_id, "t1", "대화방 저장");
});

test("챗봇: 같은 팀원·같은 대화의 최근 질문만 이어묻기 문맥으로 쓴다", () => {
  const store = freshStore();
  loadManualFaq(store);

  store.chatAnswer({ question: "게이트 통과가 무슨 뜻이에요?", thread_id: "alice-th", actor_ref: "alice" });
  const follow = store.chatAnswer({ question: "그럼 막히면요?", thread_id: "alice-th", actor_ref: "alice" });
  assert.equal(follow.context_used, true, "같은 대화의 이전 질문을 해석 보조로 사용");
  assert.equal(follow.source.id, "man-gate-blocked-next");
  assert.equal(follow.pipeline.config.context_turns, 5, "기본 문맥 턴은 pipeline 설정으로 관리");

  const bob = store.chatAnswer({ question: "그럼 막히면요?", thread_id: "alice-th", actor_ref: "bob" });
  assert.equal(bob.context_used, false, "다른 팀원의 질문 이력은 섞지 않음");
  assert.equal(bob.matched, false, "남의 문맥 없이 단독 확답하지 않음");

  const freshThread = store.chatAnswer({ question: "그럼 막히면요?", thread_id: "alice-new", actor_ref: "alice" });
  assert.equal(freshThread.context_used, false, "새 대화는 이전 대화 문맥을 이어받지 않음");
});

test("챗봇 파이프라인: ERP_CHAT_CONTEXT_TURNS=0 이면 이어묻기 문맥을 끈다", () => {
  const store = freshStore();
  loadManualFaq(store);
  const oldTurns = process.env.ERP_CHAT_CONTEXT_TURNS;
  try {
    process.env.ERP_CHAT_CONTEXT_TURNS = "0";
    const cfg = chatPipelineConfig();
    assert.equal(cfg.context_turns, 0);
    store.chatAnswer({ question: "게이트 통과가 무슨 뜻이에요?", thread_id: "alice-th", actor_ref: "alice" });
    const follow = store.chatAnswer({ question: "그럼 막히면요?", thread_id: "alice-th", actor_ref: "alice" });
    assert.equal(follow.context_used, false);
    assert.equal(follow.matched, false);
    assert.equal(follow.pipeline.steps.find((s) => s.id === "context").enabled, false);
  } finally {
    if (oldTurns === undefined) delete process.env.ERP_CHAT_CONTEXT_TURNS;
    else process.env.ERP_CHAT_CONTEXT_TURNS = oldTurns;
  }
});

test("챗봇 파이프라인: reasoning 품질 모드는 매뉴얼 후보 기본값을 늘린다", () => {
  const oldThink = process.env.ERP_CHAT_THINK;
  const oldReasoning = process.env.ERP_CHAT_REASONING;
  const oldLimit = process.env.ERP_CHAT_RETRIEVAL_LIMIT;
  try {
    process.env.ERP_CHAT_THINK = "1";
    delete process.env.ERP_CHAT_REASONING;
    delete process.env.ERP_CHAT_RETRIEVAL_LIMIT;
    const cfg = chatPipelineConfig();
    assert.equal(cfg.reasoning, true);
    assert.equal(cfg.retrieval_limit, 5);
  } finally {
    if (oldThink === undefined) delete process.env.ERP_CHAT_THINK;
    else process.env.ERP_CHAT_THINK = oldThink;
    if (oldReasoning === undefined) delete process.env.ERP_CHAT_REASONING;
    else process.env.ERP_CHAT_REASONING = oldReasoning;
    if (oldLimit === undefined) delete process.env.ERP_CHAT_RETRIEVAL_LIMIT;
    else process.env.ERP_CHAT_RETRIEVAL_LIMIT = oldLimit;
  }
});

test("챗봇 파이프라인: 이어묻기는 단독 검색 오답보다 같은 대화 주제를 우선한다", () => {
  const store = freshStore();
  loadManualFaq(store);
  store.chatAnswer({ question: "게이트 통과가 무슨 뜻이에요?", thread_id: "th-gate", actor_ref: "alice" });
  store.chatAnswer({ question: "게이트에서 막히면 제가 뭘 해야 해요?", thread_id: "th-gate", actor_ref: "alice" });
  const gateFollow = store.chatAnswer({ question: "그럼 다시 통과는요?", thread_id: "th-gate", actor_ref: "alice" });
  assert.equal(gateFollow.context_used, true);
  assert.notEqual(gateFollow.source.id, "man-audit-filters", "단독 검색의 감사로그 오답을 피함");
  assert.ok(["man-gate-rerun-review", "man-gate-blocked-next"].includes(gateFollow.source.id));
  assert.equal(gateFollow.pipeline.steps.find((s) => s.id === "context_retrieve").status, "ok");

  const switched = freshStore();
  loadManualFaq(switched);
  switched.chatAnswer({ question: "게이트 통과가 무슨 뜻이에요?", thread_id: "th-switch", actor_ref: "alice" });
  switched.chatAnswer({ question: "회의 액션아이템은 자동으로 할 일이 돼요?", thread_id: "th-switch", actor_ref: "alice" });
  const meetingFollow = switched.chatAnswer({ question: "그거 다시 하려면 어디서 해요?", thread_id: "th-switch", actor_ref: "alice" });
  assert.equal(meetingFollow.context_used, true);
  assert.equal(meetingFollow.source.id, "man-meeting-action-items", "주제 전환 뒤에는 최신 회의 주제를 우선");

  const currentStrong = freshStore();
  loadManualFaq(currentStrong);
  currentStrong.chatAnswer({ question: "회의 액션아이템은 자동으로 할 일이 돼요?", thread_id: "th-current", actor_ref: "alice" });
  currentStrong.chatAnswer({ question: "실수했거나 누가 바꿨는지 확인하려면 어디를 봐요?", thread_id: "th-current", actor_ref: "alice" });
  const gateMeaning = currentStrong.chatAnswer({ question: "게이트 통과가 무슨 뜻이에요?", thread_id: "th-current", actor_ref: "alice" });
  assert.equal(gateMeaning.source.id, "man-gate-meaning", "현재 질문이 강하게 맞으면 이전 문맥이 source를 덮지 않음");
  assert.equal(gateMeaning.context_used, false);
});

test("챗봇: 기존 DB에도 질문자 로그 컬럼을 마이그레이션한다", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-chatlog-migration-"));
  const dbPath = join(root, "legacy.db");
  let store = null;
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE chat_query_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        thread_id TEXT,
        question TEXT NOT NULL,
        matched_faq_id TEXT,
        data_label TEXT NOT NULL DEFAULT 'real'
      );
    `);
    legacy.close();

    store = openStore(dbPath);
    const cols = store.db.prepare("PRAGMA table_info(chat_query_log)").all().map((c) => c.name);
    assert.ok(cols.includes("actor_ref"), "actor_ref 컬럼 추가");
    store.logChatQuery({ actor_ref: "alice", thread_id: "t1", question: "테스트" });
    const row = store.db.prepare("SELECT actor_ref, thread_id, question FROM chat_query_log").get();
    assert.equal(row.actor_ref, "alice");
    assert.equal(row.thread_id, "t1");
    assert.equal(row.question, "테스트");
    store.db.close();
    store = null;
  } finally {
    try { store?.db.close(); } catch { /* already closed */ }
    rmSync(root, { recursive: true, force: true });
  }
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

test("챗봇: 초보 팀원 질문은 매뉴얼 FAQ로 안정 매칭된다", () => {
  const store = freshStore();
  loadManualFaq(store);
  const cases = [
    ["처음 ERP 들어가려면 어디서 로그인해요?", "man-login-entry-help"],
    ["ERP를 잘 쓰고 싶은데 처음에 뭘 보면 돼요?", "man-onboarding-start-here"],
    ["로그인이 안돼요. 비번을 까먹은 것 같아요.", "man-password-reset"],
    ["로그인은 되는데 화면이 비어 보여요.", "man-login-entry-help"],
    ["팀원이 자기 것만 보게 권한을 줄 수 있나요?", "man-role-visibility"],
    ["오늘 제가 해야 할 일만 볼 수 있나요?", "man-today-my-work"],
    ["오늘 제 할 일과 마감 지난 일은 어디서 봐요?", "man-today-my-work"],
    ["오늘 내 일 확인하고 메일로 온 일을 처리하는 기본 흐름 알려줘요.", "man-basic-daily-flow"],
    ["이 과제가 제 담당인지 어떻게 알아요?", "man-assignee-check"],
    ["내가 맡은 과제랑 다른 사람이 맡은 과제를 어떻게 구분해요?", "man-assignee-check"],
    ["마감 지난 할 일은 어디에 표시돼요?", "man-today-my-work"],
    ["제가 과제를 수정할 수 있는 사람인지 어떻게 알아요?", "man-permission-edit-request"],
    ["다른 팀 자료를 봐도 되는 건가요?", "man-permission-edit-request"],
    ["메일로 온 일을 과제로 어떻게 등록해요?", "man-mail-to-project-task"],
    ["메일 첨부파일도 과제에 같이 붙나요?", "man-mail-attachment-boundary"],
    ["메일에서 만든 할 일의 담당자는 누가 되나요?", "man-mail-task-assignee"],
    ["작업한 파일은 어디에 올려야 하나요?", "man-deliverable-file-review-start"],
    ["산출물 파일을 어디에 올리고 검토 요청하나요?", "man-deliverable-file-review-start"],
    ["작업 파일을 올리고 검토까지 넘기는 흐름을 한 번에 알려줘요.", "man-deliverable-review-flow"],
    ["03_Out 산출물을 올리고 본인검토, 팀검토, 반려 후 재검토까지 어떻게 돌려요?", "man-deliverable-review-loop"],
    ["검토 요청은 어떤 버튼으로 보내요?", "man-deliverable-file-review-start"],
    ["검토 반려되면 뭘 고쳐야 하는지 어디서 봐요?", "man-review-reject-comments"],
    ["BOM 파일은 어디에 넣어야 해요?", "man-boards-bom-add"],
    ["refdes가 뭔지 몰라도 입력해야 하나요?", "man-refdes-help"],
    ["input 파일이 여러 개인데 어떤 걸 기준으로 삼아요?", "man-input-latest-source"],
    ["게이트 통과가 무슨 뜻이에요?", "man-gate-meaning"],
    ["게이트에서 막히면 제가 뭘 해야 해요?", "man-gate-blocked-next"],
    ["게이트를 다시 실행하거나 재검토 요청할 수 있나요?", "man-gate-rerun-review"],
    ["AI가 자동으로 바꾼 내용은 어디서 확인해요?", "man-ai-change-approval"],
    ["AI가 제 허락 없이 파일이나 데이터를 바꾸나요?", "man-ai-change-approval"],
    ["AI한테 맡겨도 되는 일과 맡기면 안 되는 일이 뭐예요?", "man-ai-appropriate-use"],
    ["AI 제안이 올라오면 검토, 승인, 취소, 이력 확인까지 어떤 순서로 보면 돼요?", "man-ai-proposal-lifecycle"],
    ["AI가 바꾼 내용을 취소할 수 있나요?", "man-ai-change-undo"],
    ["제게 온 알림은 어디서 확인해요?", "man-alerts-supported"],
    ["마감 전에 알림을 받을 수 있나요?", "man-alerts-deadline"],
    ["회의록을 과제랑 연결할 수 있나요?", "man-meeting-project-link"],
    ["회의록에서 나온 액션 아이템을 할 일로 만들 수 있나요?", "man-meeting-action-items"],
    ["회의 액션아이템은 자동으로 할 일이 돼요?", "man-meeting-action-items"],
    ["회의 액션아이템을 과제 할 일로 연결하고 나중에 감사로그로 확인하려면 어떻게 해요?", "man-meeting-action-audit-flow"],
    ["누가 언제 수정했는지 볼 수 있나요?", "man-audit-who-when"],
    ["실수했거나 누가 바꿨는지 확인하려면 어디를 봐요?", "man-audit-mistake-check"],
    ["예전에 올린 파일이나 과제를 어떻게 검색해요?", "man-search-files-projects"],
    ["카카오톡이나 슬랙 알림도 보내나요?", "man-alerts-supported"],
    ["올라마나 젬마가 너무 느릴 때는 어떻게 해요?", "man-llm-slow"],
  ];
  for (const [question, expectedId] of cases) {
    const top = store.retrieveFaqMany(question, 1)[0];
    assert.equal(top?.faq.id, expectedId, question);
    assert.equal(store.chatAnswer({ question }).source?.id, expectedId, question);
  }
});

test("챗봇 LLM 프롬프트: FAQ 끼워맞춤 대신 런타임 원칙으로 자유 발화를 해석한다", async () => {
  const { buildManualPrompt } = await import("../src/llm.mjs");
  const store = freshStore();
  loadManualFaq(store);
  const hits = store.retrieveFaqMany("그런건 내가 설정할수 있는게 아닌데?", 3);
  const prompt = buildManualPrompt("그런건 내가 설정할수 있는게 아닌데?", hits, ["챗봇이 너무 느려요"], { matched: false, mode: "assist" });
  assert.match(prompt, /챗봇 런타임 원칙/);
  assert.match(prompt, /끼워 맞추지 마라/);
  assert.match(prompt, /관리자\/운영자에게 전달할 항목/);
  assert.match(prompt, /강한 매뉴얼 매칭은 없음/);
  assert.match(prompt, /반드시 자연스러운 한국어/);
  assert.match(prompt, /현재 사용자 의도 힌트가 있으면/);
  assert.match(buildManualPrompt("답변이 너무 빠르고 질이 떨어져. 추론 켜면 안돼?", [], [], { matched: false }), /챗봇 답변 품질과 추론\/품질 모드/);
  assert.match(buildManualPrompt("답변이 너무 빠르고 질이 떨어져. 추론 켜면 안돼?", [], [], { matched: false }), /operator setting/);
  assert.match(prompt, /단순 상태 확인/);
  assert.match(prompt, /멈춤·오류 대응은 사용자가 실제로 멈춤\/오류를 말할 때만/);
  assert.match(prompt, /연속으로 계속 보내지 말기/);
  assert.match(prompt, /한 문단으로 길게 붙여 쓰지 마라/);
  assert.match(prompt, /짧은 문단 2~3개/);
  assert.match(prompt, /250자 안팎/);
  assert.match(prompt, /400~600자/);
  assert.doesNotMatch(JSON.stringify(store.faqs()), /man-chatbot-alive|man-chatbot-too-fast-or-short|man-chatbot-settings-not-mine/);
});

test("챗봇: 자유 발화는 특정 FAQ 없이 LLM assist 단계로 처리된다", async () => {
  const { buildManualPrompt } = await import("../src/llm.mjs");
  const store = freshStore();
  loadManualFaq(store);
  const questions = ["그런건 내가 설정할수 있는게 아닌데?", "계속 질문하니 멈추네.", "이거 어떻게 사용해야해?"];
  for (const question of questions) {
    let prompt = "";
    const r = await runManualAnswerPipeline({
      store,
      question,
      provider: "ollama",
      buildPrompt: buildManualPrompt,
      runLlm: async ({ user }) => {
        prompt = user;
        return { delivered: true, text: "런타임 원칙으로 답변", external: false, model: "fake-local" };
      },
    });
    assert.equal(r.llm, true, question);
    assert.equal(r.handled_by_llm, true, question);
    assert.equal(r.mode, "llm_assist", question);
    assert.equal(r.source, null, "자유 발화를 FAQ source에 끼워맞추지 않음");
    assert.match(prompt, /런타임 원칙/);
  }
});

test("챗봇: 답변 품질·추론 모드 질문은 매뉴얼 FAQ가 아니라 런타임 원칙으로 직접 답한다", async () => {
  const store = freshStore();
  loadManualFaq(store);
  let called = false;
  const r = await runManualAnswerPipeline({
    store,
    question: "답변이 너무 빠르고 질이 떨어져. 추론 켜면 안돼?",
    provider: "ollama",
    buildPrompt: () => "unused",
    runLlm: async () => {
      called = true;
      return { delivered: true, text: "should not be used", external: false, model: "fake" };
    },
  });
  assert.equal(called, false);
  assert.equal(r.mode, "runtime_direct");
  assert.equal(r.handled_by_runtime, true);
  assert.equal(r.source, null);
  assert.match(r.text, /ERP_CHAT_THINK=1/);
  assert.match(r.text, /운영자/);
});

test("챗봇: stub 약매칭은 LLM 없이 후보만 제시한다", async () => {
  const { answerFromManual } = await import("../src/llm.mjs");
  const store = freshStore();
  loadManualFaq(store);
  const r = await answerFromManual({ store, question: "처음 와서 좀 막막해요", provider: "stub" });
  assert.equal(r.llm, false);
  assert.equal(r.matched, false);
  assert.ok(r.candidates.length > 0, "약매칭 후보는 유지");
  const llmCalls = store.db.prepare("SELECT COUNT(*) c FROM event_log WHERE kind='llm_call'").get().c;
  assert.equal(llmCalls, 0, "stub 약매칭은 LLM 호출 자체를 하지 않음");
});

test("챗봇 파이프라인: 생존 확인 질문은 LLM을 거치지 않고 즉답한다", async () => {
  const store = freshStore();
  loadManualFaq(store);
  let called = false;
  const r = await runManualAnswerPipeline({
    store,
    question: "되니?",
    thread_id: "alive-th",
    actor_ref: "alice",
    provider: "ollama",
    buildPrompt: () => "should-not-build",
    runLlm: async () => { called = true; return { delivered: true, text: "bad" }; },
  });
  assert.equal(called, false);
  assert.equal(r.mode, "runtime_direct");
  assert.equal(r.handled_by_runtime, true);
  assert.equal(r.llm, false);
  assert.match(r.text, /응답하고 있어요/);
  assert.ok(r.pipeline.steps.some((s) => s.id === "llm_gate" && s.status === "skipped"));
});

test("LLM 어댑터: Ollama 호출은 thinking 출력을 끄고 모델 태그를 기록한다", async () => {
  const { runLlm } = await import("../src/llm.mjs");
  const oldFetch = globalThis.fetch;
  const oldModel = process.env.ERP_CHAT_MODEL;
  const oldThink = process.env.ERP_CHAT_THINK;
  const oldReasoning = process.env.ERP_CHAT_REASONING;
  let body = null;
  try {
    process.env.ERP_CHAT_MODEL = "gemma4:e4b";
    process.env.ERP_CHAT_THINK = "0";
    delete process.env.ERP_CHAT_REASONING;
    globalThis.fetch = async (_url, opts) => {
      body = JSON.parse(opts.body);
      return { json: async () => ({ response: "<think>숨은 사고</think>\n근거 기반 답변" }) };
    };
    const store = freshStore();
    const r = await runLlm({ provider: "ollama", user: "prompt" }, { store });
    assert.equal(r.delivered, true);
    assert.equal(r.model, "gemma4:e4b");
    assert.equal(body.think, false);
    assert.equal(body.model, "gemma4:e4b");
    assert.equal(r.text, "근거 기반 답변");
    const note = store.db.prepare("SELECT note FROM event_log WHERE kind='llm_call'").get().note;
    assert.match(note, /model=gemma4:e4b/);
    assert.match(note, /think=false/);
    assert.match(note, /delivered=true/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldModel === undefined) delete process.env.ERP_CHAT_MODEL;
    else process.env.ERP_CHAT_MODEL = oldModel;
    if (oldThink === undefined) delete process.env.ERP_CHAT_THINK;
    else process.env.ERP_CHAT_THINK = oldThink;
    if (oldReasoning === undefined) delete process.env.ERP_CHAT_REASONING;
    else process.env.ERP_CHAT_REASONING = oldReasoning;
  }
});

test("LLM 어댑터: ERP_CHAT_THINK=1 이면 reasoning 품질 모드로 Ollama를 호출한다", async () => {
  const { runLlm } = await import("../src/llm.mjs");
  const oldFetch = globalThis.fetch;
  const oldModel = process.env.ERP_CHAT_MODEL;
  const oldThink = process.env.ERP_CHAT_THINK;
  const oldReasoning = process.env.ERP_CHAT_REASONING;
  const oldMax = process.env.ERP_CHAT_MAX_TOKENS;
  const oldTimeout = process.env.ERP_CHAT_TIMEOUT_MS;
  const oldTemp = process.env.ERP_CHAT_TEMPERATURE;
  let body = null;
  try {
    process.env.ERP_CHAT_MODEL = "gemma4:e4b";
    process.env.ERP_CHAT_THINK = "1";
    delete process.env.ERP_CHAT_REASONING;
    delete process.env.ERP_CHAT_MAX_TOKENS;
    delete process.env.ERP_CHAT_TIMEOUT_MS;
    delete process.env.ERP_CHAT_TEMPERATURE;
    globalThis.fetch = async (_url, opts) => {
      body = JSON.parse(opts.body);
      return { json: async () => ({ response: "<think>내부 추론</think>\n추론 후 답변" }) };
    };
    const store = freshStore();
    const r = await runLlm({ provider: "ollama", user: "prompt" }, { store });
    assert.equal(r.delivered, true);
    assert.equal(r.reasoning, true);
    assert.equal(body.think, true);
    assert.equal(body.options.num_predict, 1536);
    assert.equal(body.options.temperature, 0.15);
    assert.equal(r.text, "추론 후 답변");
    const note = store.db.prepare("SELECT note FROM event_log WHERE kind='llm_call'").get().note;
    assert.match(note, /think=true/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldModel === undefined) delete process.env.ERP_CHAT_MODEL;
    else process.env.ERP_CHAT_MODEL = oldModel;
    if (oldThink === undefined) delete process.env.ERP_CHAT_THINK;
    else process.env.ERP_CHAT_THINK = oldThink;
    if (oldReasoning === undefined) delete process.env.ERP_CHAT_REASONING;
    else process.env.ERP_CHAT_REASONING = oldReasoning;
    if (oldMax === undefined) delete process.env.ERP_CHAT_MAX_TOKENS;
    else process.env.ERP_CHAT_MAX_TOKENS = oldMax;
    if (oldTimeout === undefined) delete process.env.ERP_CHAT_TIMEOUT_MS;
    else process.env.ERP_CHAT_TIMEOUT_MS = oldTimeout;
    if (oldTemp === undefined) delete process.env.ERP_CHAT_TEMPERATURE;
    else process.env.ERP_CHAT_TEMPERATURE = oldTemp;
  }
});

test("LLM 어댑터: thinking 모델이 내부 사고만 반환하면 최종 답변을 한 번 재시도한다", async () => {
  const { runLlm } = await import("../src/llm.mjs");
  const oldFetch = globalThis.fetch;
  const oldModel = process.env.ERP_CHAT_MODEL;
  const oldThink = process.env.ERP_CHAT_THINK;
  let calls = [];
  try {
    process.env.ERP_CHAT_MODEL = "gemma4:e4b";
    process.env.ERP_CHAT_THINK = "1";
    globalThis.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push(body);
      if (calls.length === 1) return { json: async () => ({ response: "", thinking: "내부 추론만 있음" }) };
      return { json: async () => ({ response: "최종 답변만 출력" }) };
    };
    const r = await runLlm({ provider: "ollama", user: "prompt" }, {});
    assert.equal(r.delivered, true);
    assert.equal(r.reasoning, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].think, true);
    assert.equal(calls[1].think, false);
    assert.match(calls[1].prompt, /최종 답변만 한국어/);
    assert.equal(r.text, "최종 답변만 출력");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldModel === undefined) delete process.env.ERP_CHAT_MODEL;
    else process.env.ERP_CHAT_MODEL = oldModel;
    if (oldThink === undefined) delete process.env.ERP_CHAT_THINK;
    else process.env.ERP_CHAT_THINK = oldThink;
  }
});

test("챗봇 UI: 새 대화 thread id 는 timestamp 단독이 아니라 랜덤 suffix 를 포함한다", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.match(app, /function newChatThreadId\(\)/);
  assert.match(app, /crypto\.getRandomValues|Math\.random/);
  assert.doesNotMatch(app, /state\.chatThread = `th_\$\{Date\.now\(\)\.toString\(36\)\}`/);
});

test("챗봇 UI: 추천 질문은 말풍선 밖에 두고 응답 중 중복 전송을 막는다", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  assert.match(app, /let pending = false/);
  assert.match(app, /sendBtn\.disabled = v/);
  assert.match(app, /chat-status/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /role="log" aria-live="polite" aria-busy="false"/);
  assert.match(app, /chat_wait_queued_status/);
  assert.match(app, /chat_wait_preparing_status/);
  assert.match(app, /chat_wait_slow_status/);
  assert.match(app, /CHAT_PENDING_MIN_MS = 700/);
  assert.match(app, /nextPaintFrame/);
  assert.match(app, /waitPendingMinimum/);
  assert.match(app, /await nextPaintFrame\(\)/);
  assert.match(app, /await waitPendingMinimum\(pendingStartedAt\)/);
  assert.match(app, /waitTimers = \[/);
  assert.match(app, /replacePending/);
  assert.match(app, /CHAT_REQUEST_TIMEOUT_MS = 130000/);
  assert.match(app, /postJsonWithTimeout/);
  assert.match(app, /AbortController/);
  assert.match(app, /postJsonWithTimeout\("\/api\/chat"/);
  assert.match(app, /chat_done_status/);
  assert.match(app, /chat_timeout_retry/);
  assert.match(app, /chat_login_required/);
  assert.match(app, /if \(finalStatus\) statusEl\.textContent = finalStatus/);
  assert.match(app, /chat-typing/);
  assert.match(app, /readableChatText/);
  assert.match(app, /wrapLongText/);
  assert.match(app, /readableChatText\(m\.text, m\.role\)/);
  assert.match(app, /chatMeta/);
  assert.match(app, /handled_by_llm/);
  assert.match(app, /handled_by_runtime/);
  assert.match(app, /!m\.handled_by_llm && !m\.handled_by_runtime/);
  assert.match(app, /saveChatLog/);
  assert.match(app, /restoreChatLog/);
  assert.match(app, /startFreshChatThread/);
  assert.match(app, /e\.isComposing/);
  assert.match(app, /e\.preventDefault\(\)/);
  assert.match(app, /<div class="chat-row \$\{m\.role\}"><div class="chat-msg \$\{m\.role\}">/);
  assert.doesNotMatch(app, /\$\{src\}\$\{cand\}<\/div>`/, "후보 버튼을 말풍선 내부에 붙이지 않음");
  assert.match(css, /\.chat-row/);
  assert.match(css, /\.chat-msg \{[^}]*line-height: 1\.55/s);
  assert.match(css, /\.chat-msg \{[^}]*overflow-wrap: anywhere/s);
  assert.match(css, /\.chat-msg\.pending/);
  assert.match(css, /@keyframes chatTyping/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.chat-meta/);
  assert.match(css, /\.chat-cands \{[^}]*flex-wrap: wrap/s);
  assert.match(css, /\.chat-input \{[^}]*flex: 0 0 auto/s);
});

test("Codex task UI: 대기 중 단계와 경과시간을 보여준다", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  assert.match(app, /taskCodexWaitStages/);
  assert.match(app, /elapsedLabel/);
  assert.match(app, /paintPendingStatus/);
  assert.match(app, /setPending\(true, "open"\)/);
  assert.match(app, /setPending\(true, "send"\)/);
  assert.match(app, /taskCodexOverlays/);
  assert.match(app, /function closeMobileFloatingOverlays/);
  assert.match(app, /closeMobileFloatingOverlays\(\{ keepTaskCodexItemId: itemId \}\)/);
  assert.match(app, /bringTaskCodexToFront/);
  assert.match(app, /tileTaskCodexPanels/);
  assert.match(app, /saveTaskCodexDockFor/);
  assert.doesNotMatch(app, /document\.querySelector\("\.task-codex-overlay"\)\?\.remove\(\)/);
  assert.match(app, /clampDock/);
  assert.match(app, /restoreDockPosition/);
  assert.match(app, /task-codex-tile/);
  assert.match(app, /task-codex-resize/);
  assert.match(app, /resizeDrag/);
  assert.match(app, /window\.addEventListener\("resize", restoreDockPosition/);
  assert.match(app, /window\.removeEventListener\("resize", restoreDockPosition\)/);
  assert.match(app, /\/api\/codex-task\/capabilities/);
  assert.match(app, /\/api\/codex-task\/attachment/);
  assert.match(app, /taskCodexModel/);
  assert.match(app, /taskCodexEffort/);
  assert.doesNotMatch(app, /taskCodexTier/); // 속도(tier) 드롭다운 제거됨
  assert.match(app, /defaults: \{ model: "gpt-5\.5", effort: "medium" \}/);
  assert.match(app, /describeTaskCodexOptions/);
  assert.match(app, /loadCapabilities\(\)\.then\(load\)/);
  assert.match(app, /service_tier: opt\.service_tier \|\| null/);
  assert.match(app, /taskCodexImage/);
  assert.match(app, /renderSkillSuggest/);
  assert.match(app, /data-skill/);
  assert.match(app, /Codex 응답 작성 중/);
  assert.match(app, /스킬이나 파일 확인/);
  assert.match(app, /task-codex-progress/);
  assert.match(css, /\.task-codex-status\.is-pending/);
  assert.match(css, /\.task-codex-progress/);
  assert.match(css, /\.task-codex-tools/);
  assert.match(css, /\.task-codex-suggest/);
  assert.match(css, /\.task-codex-attachments/);
  assert.match(css, /\.task-codex-actions/);
  assert.match(css, /\.task-codex-tile/);
  assert.match(css, /\.task-codex-resize/);
  assert.match(css, /\.task-codex-status \{[^}]*font-size: 12\.5px/s);
  assert.match(css, /\.task-codex-status small \{[^}]*font-size: 12px/s);
  assert.match(css, /\.task-codex-overlay \{[^}]*72vh/s);
  assert.match(css, /\.task-codex-input \{[^}]*flex: 0 0 auto/s);
});

test("Codex task UI: home rows show reply state and open task chat", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  assert.match(app, /function codexTaskIndicatorHtml/);
  assert.match(app, /function codexTaskBadgeHtml/);
  assert.match(app, /function updateTaskCodexRowBadge/);
  assert.match(app, /function wireTaskCodexButtons/);
  assert.match(app, /function markTaskCodexSeen/);
  assert.match(app, /dev_erp_task_codex_seen/);
  assert.match(app, /latestAssistantMessageIdFromPayload/);
  assert.match(app, /codex_last_message_role/);
  assert.match(app, /updateTaskCodexRowBadge\(itemId, "waiting"\)/);
  assert.match(app, /updateTaskCodexRowBadge\(itemId, "reply"\)/);
  assert.match(app, /updateTaskCodexRowBadge\(itemId, "error"\)/);
  assert.match(app, /codex-task-badge/);
  assert.match(app, /codex-task-spin/);
  assert.match(app, /itemActionsHtml\(i\)\}\$\{codexTaskButtonHtml\(i\.id, "mini", itemStarted\(i\)\)\}/);
  assert.match(app, /function itemStarted/); // 시작 전(open/unclassified)엔 대화 잠금
  assert.match(app, /codex-task-locked/);    // 잠금 버튼 마크업
  assert.match(app, /codex_chat_locked/);    // 잠금 안내는 사전 경유
  assert.match(css, /\.codex-task-locked/);  // 잠금 스타일
  assert.match(app, /dataset\.actionBound/);
  assert.match(app, /dataset\.codexBound/);
  assert.match(app, /wireTaskCodexButtons\(\$\("#view"\)\)/);
  assert.match(app, /wireTaskCodexButtons\(ov\)/);
  assert.match(app, /wireItemActions\(ov\)/);
  assert.match(css, /\.codex-task-badge/);
  assert.match(css, /\.codex-task-badge\.fresh/);
  assert.match(css, /\.codex-task-spin/);
  assert.match(css, /@keyframes codex-task-spin/);
  assert.match(css, /\.mini-actions/);
  assert.match(css, /\.act-btn\.mini/);
});

// 자가검증(기능): 라이브 app.js에서 순수 함수를 추출·실행해 동작을 검증(패턴매칭이 아닌 실제 결과).
// 락 게이트(itemStarted/codexTaskButtonHtml), DnD payload(dndPayload), 담당자 레인(claimDropBarHtml) 회귀 방지.
test("자가검증: 락 게이트·DnD payload·담당자 레인 함수 동작 (라이브 추출 실행)", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const sliceA = app.slice(app.indexOf("function itemStarted"), app.indexOf("function wireTaskCodexButtons"));
  const sliceB = app.slice(app.indexOf("function dndPayload"), app.indexOf("async function renderMail"));
  assert.ok(sliceA.includes("codexTaskButtonHtml") && sliceB.includes("claimDropBarHtml"), "함수 슬라이스 추출");
  const esc = (x) => String(x ?? "");
  const state = { account: { id: "me", display_name: "나" }, lex: {}, _scopes: [] };
  // 직접 eval(외부 esc/state 참조), 함수는 반환객체로 회수
  const A = eval(sliceA + "\n;({ itemStarted, codexTaskButtonHtml });");
  const B = eval(sliceB + "\n;({ dndPayload, claimDropBarHtml });");

  // 락 게이트: open/unclassified=미시작(잠금), 그 외=시작됨(열림)
  assert.equal(A.itemStarted({ status: "open" }), false);
  assert.equal(A.itemStarted({ status: "unclassified" }), false);
  assert.equal(A.itemStarted({ status: "doing" }), true);
  assert.equal(A.itemStarted({ status: "done" }), true);
  const locked = A.codexTaskButtonHtml("x", "", false);
  const open = A.codexTaskButtonHtml("x", "", true);
  assert.match(locked, /codex-task-locked/);
  assert.match(locked, /disabled/);
  assert.doesNotMatch(locked, /codex-task-chat/);   // 잠금엔 클릭 클래스 없음
  assert.doesNotMatch(locked, /data-codex-task/);    // 핸들러 미바인딩 보장
  assert.match(open, /codex-task-chat/);
  assert.match(open, /data-codex-task="x"/);

  // DnD payload: item→claim-item, mail/data-m→claim-mail, 없으면 빈 문자열
  assert.equal(B.dndPayload({ dataset: { item: "i1" } }), "claim-item:i1");
  assert.equal(B.dndPayload({ dataset: { mail: "m1" } }), "claim-mail:m1");
  assert.equal(B.dndPayload({ dataset: { m: "m2" } }), "claim-mail:m2");
  assert.equal(B.dndPayload({ dataset: {} }), "");

  // 담당자 레인: 멤버 있으면 레인 렌더, scopes 비면 빈 문자열(가드)
  state.account = { id: "me" };
  state._scopes = [{ id: "team", label: "팀" }, { id: "u1", label: "김철수" }];
  const bar = B.claimDropBarHtml();
  assert.match(bar, /claim-lane/);
  assert.match(bar, /data-assignee="김철수"/);
  assert.match(bar, /data-assignee="__UNASSIGN__"/); // 미배정 레인 항상 포함
  state._scopes = [];
  const barNoMembers = B.claimDropBarHtml();
  assert.match(barNoMembers, /data-assignee="__UNASSIGN__"/); // 멤버 0이어도 미배정 레인은 제공(드롭 가능)
  assert.doesNotMatch(barNoMembers, /data-assignee="김철수"/);
});

test("챗봇 UI: ERP와 챗봇 릴리즈 번호를 별도 컴포넌트 버전으로 표시한다", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  const html = readFileSync(join(APP_DIR, "static", "index.html"), "utf8");
  const server = readFileSync(join(APP_DIR, "server.mjs"), "utf8");
  const llm = readFileSync(join(APP_DIR, "src", "llm.mjs"), "utf8");
  assert.doesNotMatch(app, /const ERP_RELEASE_VERSION/);
  assert.doesNotMatch(app, /const ERP_UI_VERSION/);
  assert.doesNotMatch(app, /const ERP_CHATBOT_RELEASE_VERSION/);
  assert.doesNotMatch(app, /const ERP_CHATBOT_UI_VERSION/);
  assert.match(llm, /export const CHATBOT_VERSION = Object\.freeze/);
  assert.match(llm, /export function llmThinkEnabled/);
  assert.match(server, /CHATBOT_VERSION/);
  assert.match(server, /llmThinkEnabled/);
  assert.match(server, /if \(path === "\/api\/version"\)/);
  assert.match(server, /chatbot: CHATBOT_VERSION/);
  assert.match(server, /chatbot_version: CHATBOT_VERSION/);
  assert.match(server, /runtime: runtimeVersion\(\)\.runtime/);
  assert.match(server, /thinking: llmThinkEnabled\(\)/);
  assert.match(server, /"\/api\/version"/);
  assert.match(app, /api\("\/api\/version"\)\.catch\(\(\) => VERSION_FALLBACK\)/);
  assert.match(app, /function versionPart/);
  assert.match(app, /versionPart\("erp"\)/);
  assert.match(app, /versionPart\("chatbot"\)/);
  assert.match(app, /function codexBridgePart/);
  assert.doesNotMatch(app, /ERP_CHATBOT_RELEASE_VERSION/);
  assert.doesNotMatch(app, /v1\.0\.1/i);
  assert.match(app, /function browserVersionText/);
  assert.match(app, /Edg\\\/\(\[\\d\.\]\+\)/);
  assert.match(app, /Chrome\\\/\(\[\\d\.\]\+\)/);
  assert.match(app, /erpReleaseTitle/);
  assert.match(app, /chatbotReleaseTitle/);
  assert.match(app, /bridgeReleaseTitle/);
  assert.match(app, /runtime\.codex_task/);
  assert.match(app, /runtime\.checkout/);
  assert.match(app, /llm\.provider/);
  assert.match(app, /thinking=\$\{llm\.thinking === true\}/);
  assert.match(app, /ERP \$\{esc\(erpVersion\.release\)\}/);
  assert.match(app, /\$\{esc\(state\.lex\.chat_version_label\)\} \$\{esc\(chatbotVersion\.release\)\}/);
  assert.match(app, /브리지 \$\{esc\(bridgeVersion\.release\)\}/);
  assert.match(app, /브리지 \$\{bridgeVersion\.release\}/);
  assert.match(app, /\$\{esc\(L\.chat_version_label\)\} \$\{esc\(chatVersion\.release\)\}/);
  assert.match(app, /L\.chat_version_label/);
  assert.match(app, /\$\("#appVersionChips"\)\.innerHTML/);
  assert.doesNotMatch(app, /\$\("#appTitle"\)\.innerHTML[^\n]*version-chip/);
  assert.match(html, /id="appVersionChips"/);
  assert.ok(html.indexOf('class="util-bar"') < html.indexOf('id="appVersionChips"'), "version chips must live in the top utility bar");
  assert.ok(html.indexOf('id="appVersionChips"') < html.indexOf('class="brand-bar"'), "version chips must stay above the brand/menu bar");
  assert.match(css, /\.version-strip/);
  assert.match(css, /\.util-bar \.version-strip/);
  assert.match(app, /class="version-chip"/);
  assert.match(app, /class="chat-ver"/);
  assert.equal(LEXICON.business.app_version_label, "UI");
  assert.equal(LEXICON.business.browser_version_label, "브라우저");
  assert.equal(LEXICON.business.chat_version_label, "챗봇");
  assert.equal(LEXICON.fantasy.chat_version_label, "조언자");
  assert.match(css, /\.version-chip \{[^}]*text-overflow: ellipsis/s);
  assert.match(css, /\.chat-ver \{[^}]*text-overflow: ellipsis/s);
  assert.match(css, /\.chat-head \.dim \{[^}]*min-width: 0/s);
});

test("docs: 릴리즈 런북은 /api/version과 4300/4310 포트 경계를 안내한다", () => {
  const chatbotDoc = readFileSync(join(APP_DIR, "docs", "CHATBOT_LLM_SETUP.md"), "utf8");
  const remoteDoc = readFileSync(join(APP_DIR, "docs", "REMOTE_PC_RUNBOOK.md"), "utf8");
  const browserQa = readFileSync(join(APP_DIR, "docs", "BROWSER_QA_PROCEDURE.md"), "utf8");
  const readme = readFileSync(join(APP_DIR, "README.md"), "utf8");
  const contract = readFileSync(join(APP_DIR, "docs", "RUNTIME_OPERATING_CONTRACT_20260617.md"), "utf8");
  const runbook = readFileSync(join(APP_DIR, "docs", "RUNTIME_MAINTENANCE_RUNBOOK_20260618.md"), "utf8");
  const audit = readFileSync(join(APP_DIR, "tools", "runtime_release_audit.mjs"), "utf8");
  assert.match(chatbotDoc, /\/api\/version/);
  assert.match(chatbotDoc, /erp\.release\/build\/source/);
  assert.match(chatbotDoc, /chatbot\.release\/build\/source/);
  assert.match(chatbotDoc, /runtime\.checkout/);
  assert.match(chatbotDoc, /runtime\.port/);
  assert.doesNotMatch(chatbotDoc, /ERP_UI_VERSION/);
  assert.doesNotMatch(chatbotDoc, /release-visible|quality\.7/);
  assert.match(remoteDoc, /node server\.mjs --port 4310/);
  assert.match(remoteDoc, /http:\/\/127\.0\.0\.1:4310/);
  assert.doesNotMatch(remoteDoc, /node server\.mjs --port 4300/);
  assert.match(browserQa, /모바일/);
  assert.match(browserQa, /태블릿/);
  assert.match(browserQa, /챗봇/);
  assert.match(browserQa, /Codex task panel/);
  assert.match(browserQa, /gpt-5\.5 \/ medium \/ flex/);
  assert.match(readme, /--require-live/);
  assert.match(contract, /--require-live/);
  assert.match(runbook, /--require-live/);
  assert.doesNotMatch(readme, /--live --allow-lan-http/);
  assert.doesNotMatch(contract, /--live --allow-lan-http/);
  assert.doesNotMatch(runbook, /--live --allow-lan-http/);
  assert.match(runbook, /-HostName 127\.0\.0\.1/);
  assert.match(runbook, /-CookieSecure 0/);
  assert.match(audit, /requireNas \? "blocker" : "warning"/);
  assert.match(audit, /requireLive \? "blocker" : "warning", "lan_http_exposure_observed"/);
  assert.match(audit, /strict: options\.requireLive/);
  assert.doesNotMatch(audit, /join\(nasRoot, "DB_BACKUP", "latest"/);
  assert.doesNotMatch(audit, /join\(nasRoot, "RESTORE_TEST"\)/);
});

test("server: 운영 4300은 runtime checkout 전용이고 개발 기본 포트는 4310이다", () => {
  const server = readFileSync(join(APP_DIR, "server.mjs"), "utf8");
  const startBat = readFileSync(join(APP_DIR, "start-windows.bat"), "utf8");
  const tailscaleBat = readFileSync(join(APP_DIR, "start-tailscale-windows.bat"), "utf8");
  const watchdog = readFileSync(join(APP_DIR, "ops", "dev-erp-watchdog.ps1"), "utf8");
  const nssm = readFileSync(join(APP_DIR, "ops", "install-dev-erp-nssm.ps1"), "utf8");
  assert.match(server, /Soulforge-runtime/);
  assert.match(server, /DEV_PORT = Number\(process\.env\.DEV_ERP_DEV_PORT \|\| 4310\)/);
  assert.match(server, /PORT === RUNTIME_PORT && !IS_RUNTIME_CHECKOUT/);
  assert.match(server, /DEV_ERP_ALLOW_DEV_4300/);
  assert.match(server, /port \$\{RUNTIME_PORT\} is reserved/);
  assert.match(server, /const SID_BASE = "dev_erp_sid"/);
  assert.match(server, /const SID = `\$\{SID_BASE\}_\$\{PORT\}`/);
  assert.match(server, /clearLegacy/);
  assert.match(startBat, /set "DEV_ERP_PORT=4310"/);
  assert.match(startBat, /Soulforge-runtime/);
  assert.match(startBat, /ERP_CHAT_PROVIDER=ollama/);
  assert.match(startBat, /ERP_CHAT_MODEL=gemma4:e4b/);
  assert.match(startBat, /ERP_CHAT_THINK=1/);
  assert.match(startBat, /--port %DEV_ERP_PORT%/);
  assert.match(watchdog, /\$ChatThink = 1/);
  assert.match(watchdog, /set ERP_CHAT_THINK=\$ChatThink/);
  assert.match(watchdog, /\[string\]\$HostName = "127\.0\.0\.1"/);
  assert.match(watchdog, /\[int\]\$CookieSecure = 1/);
  assert.match(watchdog, /set DEV_ERP_COOKIE_SECURE=\$CookieSecure/);
  assert.match(nssm, /\$ChatThink = 1/);
  assert.match(nssm, /ERP_CHAT_THINK=\$ChatThink/);
  assert.match(nssm, /\[string\]\$HostName = "127\.0\.0\.1"/);
  assert.match(nssm, /\[int\]\$CookieSecure = 1/);
  assert.match(nssm, /DEV_ERP_COOKIE_SECURE=\$CookieSecure/);
  assert.match(tailscaleBat, /Tailscale backend 4300 must be started from the runtime checkout/);
});

test("챗봇 API: 처리 예외가 나도 사용자에게 안전한 JSON 폴백을 주는 경로가 있다", () => {
  const server = readFileSync(join(APP_DIR, "server.mjs"), "utf8");
  assert.match(server, /\[dev-erp\] chat failed:/);
  assert.match(server, /chat_error_fallback/);
  assert.match(server, /챗봇 응답이 잠깐 실패했어요/);
});

test("챗봇 UI: 플로팅 패널은 이동·접기·크기조절이 가능하고 화면 작업을 막지 않는다", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  const css = readFileSync(join(APP_DIR, "static", "style.css"), "utf8");
  const chat = app.slice(app.indexOf("function openChat()"), app.indexOf("function uiConfirm("));
  assert.match(app, /dev_erp_chat_dock/);
  assert.match(chat, /class="chat-collapse"/);
  assert.match(chat, /class="chat-resize"/);
  assert.match(chat, /addEventListener\("pointerdown"/);
  assert.match(chat, /addEventListener\("pointermove"/);
  assert.match(chat, /resizeDock/);
  assert.match(chat, /ResizeObserver/);
  assert.match(app, /closeMobileFloatingOverlays\(\{ keepChat: true \}\)/);
  assert.match(app, /document\.querySelector\("\.chat-overlay"\)\?\.remove\(\)/);
  assert.doesNotMatch(chat, /if \(e\.target === ov\) close\(\)/, "챗봇은 패널 밖 클릭으로 닫히지 않아야 함");
  assert.match(css, /\.chat-overlay \{[^}]*pointer-events: none/s);
  assert.match(css, /\.chat-panel \{[^}]*resize: none/s);
  assert.match(css, /\.chat-panel\.collapsed/);
  assert.match(css, /\.chat-head \{[^}]*cursor: move/s);
  assert.match(css, /\.chat-resize \{[^}]*cursor: nwse-resize/s);
  assert.match(css, /\.chat-resize \{[^}]*pointer-events: auto/s);
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

test("CONCURRENCY-GUARD: busy_timeout PRAGMA + origin_mail_id/email UNIQUE 백스톱 (race 수렴)", () => {
  const store = freshStore();
  loadFixture(store);
  // 1) 멀티 writer 대비 busy_timeout
  assert.equal(store.db.prepare("PRAGMA busy_timeout").get().timeout, 5000, "busy_timeout=5000 설정");
  // 2) DB 레벨 백스톱 UNIQUE 인덱스 2종 생성
  const idx = store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_item_origin_mail_unique','idx_account_email_unique')"
  ).all().map((r) => r.name).sort();
  assert.deepEqual(idx, ["idx_account_email_unique", "idx_item_origin_mail_unique"], "origin_mail_id·email UNIQUE 백스톱 생성");
  // 3) 같은 origin_mail_id 중복 생성 → already_promoted 로 수렴 (앱가드 우회한 createItem 직접 호출도 DB UNIQUE 가 막아 기존 할일로 수렴)
  const pid = store.db.prepare("SELECT id FROM core_project LIMIT 1").get().id;
  const r1 = store.createItem({ project_id: pid, title: "메일승격", origin: "mail", origin_mail_id: "mailx-1" });
  assert.ok(r1.ok, "최초 승격 ok");
  const r2 = store.createItem({ project_id: pid, title: "중복승격", origin: "mail", origin_mail_id: "mailx-1" });
  assert.equal(r2.error, "already_promoted", "같은 origin_mail_id 중복은 already_promoted 로 수렴");
  assert.equal(r2.item_id, r1.item.id, "기존 할일로 수렴(중복 INSERT 아님)");
  // 4) email 중복 직접 INSERT → DB 백스톱이 거부 (앱레벨 email_taken 과 이중 방어)
  assert.ok(store.createAccount({ username: "ea", password: "pw123456", email: "dup@corp.com" }).ok);
  assert.equal(store.createAccount({ username: "eb", password: "pw123456", email: "dup@corp.com" }).error, "email_taken", "앱레벨 email_taken");
  assert.throws(
    () => store.db.prepare(
      "INSERT INTO core_account(id,username,pw_hash,status,created_at,email) VALUES('xacc','xuser','h','active','2026-01-01T00:00:00Z','dup@corp.com')"
    ).run(),
    /UNIQUE|constraint/i,
    "email UNIQUE 백스톱이 앱가드 우회한 직접 중복 INSERT 도 거부"
  );
});

test("ITEM-DONE: 완료 시 done_at 기록, 되돌리면 초기화 ('요일별 한 일' 근거)", () => {
  const store = freshStore();
  loadFixture(store);
  const pid = store.db.prepare("SELECT id FROM core_project LIMIT 1").get().id;
  const it = store.createItem({ project_id: pid, title: "완료테스트", origin: "manual" });
  assert.ok(it.ok);
  const id = it.item.id;
  assert.equal(store.db.prepare("SELECT done_at FROM core_item WHERE id=?").get(id).done_at, null, "초기 done_at 없음");
  store.setItemStatus(id, "done");
  const after = store.db.prepare("SELECT status, done_at FROM core_item WHERE id=?").get(id);
  assert.equal(after.status, "done");
  assert.ok(after.done_at, "완료 시 done_at 기록");
  store.setItemStatus(id, "open");
  const reopened = store.db.prepare("SELECT status, done_at FROM core_item WHERE id=?").get(id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.done_at, null, "되돌리면(다시 열기) done_at 초기화");
});

test("MAIL-PROMOTED: unclassified 승격분도 promotedMailIds 진실원에 잡힌다 (메일 ✓ 판정)", () => {
  const store = freshStore();
  loadFixture(store);
  const pid = store.db.prepare("SELECT id FROM core_project LIMIT 1").get().id;
  const it = store.createItem({ project_id: pid, title: "승격건", origin: "mail", origin_mail_id: "mail-promo-1" });
  assert.ok(it.ok);
  assert.equal(it.item.status, "unclassified", "메일 승격은 unclassified 로 생성");
  // 일반 items() 는 unclassified 격리로 이 항목을 제외 → 기존 /api/items 재사용 ✓ 판정이 놓치던 지점(버그 조건 재현)
  assert.equal(store.items({ project: pid }).some((i) => i.origin_mail_id === "mail-promo-1"), false, "unclassified 격리로 일반 목록 제외");
  // 전용 진실원은 격리·스코프와 무관하게 잡는다
  assert.ok(store.promotedMailIds().includes("mail-promo-1"), "promotedMailIds 가 unclassified 승격분 포함");
  assert.ok(store.promotedMailIds(pid).includes("mail-promo-1"), "project 스코프도 포함");
});

test("ITEM-DONE: done→보관→복구 후 done_at 초기화 (status≠done ↔ done_at NULL 불변식)", () => {
  const store = freshStore();
  loadFixture(store);
  const pid = store.db.prepare("SELECT id FROM core_project LIMIT 1").get().id;
  const id = store.createItem({ project_id: pid, title: "보관복구", origin: "manual" }).item.id;
  store.setItemStatus(id, "done");
  assert.ok(store.db.prepare("SELECT done_at FROM core_item WHERE id=?").get(id).done_at, "완료 시 done_at");
  store.archiveItem(id);
  store.restoreItem(id);
  const row = store.db.prepare("SELECT status, done_at FROM core_item WHERE id=?").get(id);
  assert.equal(row.status, "open");
  assert.equal(row.done_at, null, "복구 후 done_at 초기화");
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

test("TEAM-ACCT: last active admin role cannot be removed", () => {
  const store = freshStore();
  const owner = store.createAccount({ username: "owner-admin", password: "pw123456", roles: ["admin"] });
  assert.equal(store.updateAccount(owner.id, { role: "member" }).error, "last_admin_role_required");
  assert.ok(store.isAdmin(owner.id));

  const backup = store.createAccount({ username: "backup-admin", password: "pw123456", roles: ["admin"] });
  assert.equal(store.updateAccount(owner.id, { role: "member" }).ok, true);
  assert.equal(store.isAdmin(owner.id), false);
  assert.equal(store.isAdmin(backup.id), true);
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

test("TEAM-ROSTER: private roster dry-run/apply — 계정·메일함 메타 일괄 등록, 비밀번호 출력 금지", () => {
  const store = freshStore();
  const rows = parseRosterText(JSON.stringify({
    accounts: [
      {
        username: "mail-a",
        display_name: "메일A",
        email: "mail-a@corp.com",
        role: "member",
        temp_password: "temp-pass-a",
        mailbox_provider: "gmail",
        mailbox_enabled: true,
        mailbox_env_ref: "private-state/mail/mail-a.env",
      },
      {
        username: "mail-b",
        display_name: "메일B",
        email: "mail-b@corp.com",
        role: "member",
        password: "temp-pass-b",
        provider: "hiworks",
        enabled: "yes",
        env_ref: "private-state/mail/mail-b.env",
      },
    ],
  }), "team_roster.json");

  const dry = planTeamRosterImport(store, rows);
  assert.equal(dry.apply_ready, true);
  assert.equal(dry.totals.create, 2);
  assert.equal(dry.totals.mailbox_update, 2);
  assert.equal(dry.entries[0].mailbox_env_ref, "[relative-ref]");
  assert.equal(JSON.stringify(dry).includes("temp-pass-a"), false, "dry-run output must not leak temp password");
  assert.equal(JSON.stringify(dry).includes("private-state/mail/mail-a.env"), false, "dry-run output must not echo private env ref");

  const applied = applyTeamRosterImport(store, rows);
  assert.equal(applied.applied, true);
  assert.equal(applied.entries[1].mailbox_env_ref, "[relative-ref]");
  assert.equal(JSON.stringify(applied).includes("temp-pass-b"), false, "apply output must not leak temp password");
  assert.equal(JSON.stringify(applied).includes("private-state/mail/mail-b.env"), false, "apply output must not echo private env ref");
  assert.equal(store.verifyLogin("mail-a", "temp-pass-a").email, "mail-a@corp.com");
  assert.equal(store.verifyLogin("mail-b", "temp-pass-b").email, "mail-b@corp.com");
  const mb = store.accountMailboxConfig(store.verifyLogin("mail-b", "temp-pass-b").id);
  assert.equal(mb.mailbox_provider, "hiworks");
  assert.equal(mb.mailbox_enabled, true);
  assert.equal(mb.mailbox_env_ref, "private-state/mail/mail-b.env");

  const resetPlan = planTeamRosterImport(store, [{ username: "mail-a", email: "mail-a@corp.com", password: "new-pass-a" }]);
  assert.equal(resetPlan.entries[0].password_action, "ignored");
  assert.ok(resetPlan.entries[0].warnings.includes("password_ignored_without_reset_passwords"));
  applyTeamRosterImport(store, [{ username: "mail-a", email: "mail-a@corp.com", password: "new-pass-a" }]);
  assert.equal(store.verifyLogin("mail-a", "temp-pass-a").username, "mail-a", "existing password is unchanged without reset flag");
  assert.equal(store.verifyLogin("mail-a", "new-pass-a"), null);

  const reset = applyTeamRosterImport(store, [{ username: "mail-a", email: "mail-a@corp.com", password: "new-pass-a" }], { resetPasswords: true });
  assert.equal(reset.applied, true);
  assert.equal(store.verifyLogin("mail-a", "temp-pass-a"), null);
  assert.equal(store.verifyLogin("mail-a", "new-pass-a").username, "mail-a");
});

test("TEAM-ROSTER: admin role and mailbox refs require explicit safe inputs", () => {
  const store = freshStore();
  const blocked = planTeamRosterImport(store, [{ username: "boss", password: "secret1", role: "admin" }]);
  assert.ok(blocked.entries[0].errors.includes("admin_role_requires_allow_admin"));
  const badRef = planTeamRosterImport(store, [{
    username: "mail-c",
    password: "secret1",
    email: "mail-c@corp.com",
    provider: "gmail",
    enabled: true,
    env_ref: "../mail-c.env",
  }]);
  assert.ok(badRef.entries[0].errors.includes("mailbox_env_ref_invalid"));
});

test("TEAM-ROSTER: existing account role is preserved unless role is explicit", () => {
  const store = freshStore();
  const created = store.createAccount({ username: "lead", password: "leadpass", roles: ["admin"], email: "lead@corp.com" });
  const backup = store.createAccount({ username: "backup", password: "leadpass", roles: ["admin"], email: "backup@corp.com" });
  assert.ok(created.ok);
  assert.ok(backup.ok);

  const plan = planTeamRosterImport(store, [{ username: "lead", display_name: "Lead", email: "lead@corp.com" }]);
  assert.equal(plan.entries[0].role_action, "unchanged");
  applyTeamRosterImport(store, [{ username: "lead", display_name: "Lead", email: "lead@corp.com" }]);
  assert.equal(store.isAdmin(created.id), true, "omitted role must not demote an existing admin");

  const demote = applyTeamRosterImport(store, [{ username: "lead", email: "lead@corp.com", role: "member" }]);
  assert.equal(demote.entries[0].role_action, "update");
  assert.equal(store.isAdmin(created.id), false, "explicit role can update the account");
});

test("TEAM-ROSTER: blank CSV role cell does not demote existing admin", () => {
  const store = freshStore();
  const created = store.createAccount({ username: "leadcsv", password: "leadpass", roles: ["admin"], email: "leadcsv@corp.com" });
  assert.ok(created.ok);
  const rows = parseRosterText("username,email,role\nleadcsv,leadcsv@corp.com,\n", "team_roster.csv");
  const plan = planTeamRosterImport(store, rows);
  assert.equal(plan.entries[0].role_supplied, false);
  assert.equal(plan.entries[0].role_action, "unchanged");
  applyTeamRosterImport(store, rows);
  assert.equal(store.isAdmin(created.id), true);
});

test("TEAM-ACCT: teamReadiness 가 팀 사용 전 계정·메일함·장부 누락을 집계", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-001", title: "팀 준비", data_label: "real" });
  store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
  const readyMember = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
  const missingMailbox = store.createAccount({ username: "mail-b", password: "pw123456", email: "mail-b@corp.com", display_name: "메일B" });
  const errorMailbox = store.createAccount({ username: "mail-c", password: "pw123456", email: "mail-c@corp.com", display_name: "메일C" });
  const disabled = store.createAccount({ username: "disabled", password: "pw123456", email: "disabled@corp.com", display_name: "비활성" });
  store.setAccountStatus(disabled.id, "disabled");
  assert.equal(store.updateAccountMailbox(readyMember.id, {
    provider: "gmail",
    enabled: true,
    env_ref: "private-state/mail/mail-a.env",
    last_fetch_at: "2026-06-17T09:00:00+09:00",
  }).ok, true);
  assert.equal(store.updateAccountMailbox(errorMailbox.id, {
    provider: "gmail",
    enabled: true,
    env_ref: "private-state/mail/mail-c.env",
    status: "error",
  }).ok, true);
  store.ingestMail({ id: "m-ready", project_code: "P26-001", at: "2026-06-17T09:30:00+09:00", subject: "준비 메일", mailbox: "mail-a@corp.com/받은 편지함" });
  store.createItem({ project_id: "P26-001", title: "A 담당 실행", assignee_ref: "mail-a@corp.com" });
  store.ingestTaskItem({ id: "mailtask:triage-old", project_code: "P26-001", title: "분류 대기", origin: "mail", due: "2026-06-16" });

  const ready = store.teamReadiness({ target_members: 3, today: "2026-06-17" });
  assert.equal(ready.ready, false, "메일함 누락이 있으면 팀 메일 자동화 준비 완료가 아님");
  assert.deepEqual(ready.counts.active_admin_count, 1);
  assert.deepEqual(ready.counts.active_member_count, 3);
  assert.deepEqual(ready.counts.configured_mailbox_count, 2);
  assert.ok(ready.warnings.some((x) => x.code === "unclassified_queue" && x.count >= 1), "공용 분류 큐는 경고");
  assert.ok(ready.warnings.some((x) => x.code === "unclassified_overdue" && x.count >= 1), "기한 지난 미분류도 경고");
  assert.ok(ready.blockers.some((x) => x.code === "account_mailbox_disabled" && x.account_label === "메일B"), "팀원 메일함 미설정은 차단");
  assert.ok(ready.blockers.some((x) => x.code === "account_mailbox_error" && x.account_label === "메일C"), "팀원 메일함 오류는 차단");
  assert.ok(ready.next_actions.some((x) => x.code === "fix_member_mailbox_errors" && x.count === 1), "메일함 오류 다음 행동");
  assert.ok(ready.next_actions.some((x) => x.code === "configure_member_mailboxes" && x.actual === 2 && x.expected === 3), "메일함 설정 다음 행동");
  assert.ok(ready.next_actions.some((x) => x.code === "triage_overdue_unclassified" && x.count >= 1), "기한 지난 분류 큐 다음 행동");
  assert.equal(ready.next_actions.some((x) => x.code === "ready_for_team_pilot"), false, "차단 사유가 있으면 파일럿 가능 액션을 내지 않음");
  const a = ready.accounts.find((x) => x.username === "mail-a");
  assert.equal(a.mail_count, 1);
  assert.equal(a.open_item_count, 1);
  assert.equal(a.ready, true);
  const b = ready.accounts.find((x) => x.username === "mail-b");
  assert.deepEqual(b.issues.map((x) => x.code), ["mailbox_disabled"]);
  assert.equal(ready.accounts.find((x) => x.username === "disabled").issues.length, 0, "비활성 계정은 팀 사용 준비 차단 사유에서 제외");
});

test("TEAM-PREFLIGHT: 회사 PC 호스트 점검은 env 파일 존재만 확인하고 비밀값·경로를 출력하지 않음", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-"));
  try {
    mkdirSync(join(root, "private-state", "mail", "team"), { recursive: true });
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    writeFileSync(join(root, "private-state", "mail", "team", "mail-a.env"), "MAIL_PASSWORD=do-not-leak\n");
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "mail-a",
        email: "mail-a@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/mail-a.env",
      }],
    }));

    const store = freshStore();
    store.upsertProject({ id: "P26-001", title: "팀 준비", data_label: "real" });
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
      last_fetch_at: "2026-06-17T09:00:00+09:00",
    }).ok, true);
    store.ingestMail({ id: "m-ready-preflight", project_code: "P26-001", at: "2026-06-17T09:30:00+09:00", subject: "준비 메일", mailbox: "mail-a@corp.com/받은 편지함" });

    const result = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(result.configuration_ready, true);
    assert.equal(result.team_use_ready, true);
    assert.equal(result.host_model, "company_pc_shared_host");
    assert.ok(result.next_actions.some((x) => x.code === "ready_for_company_pc_team_use"));
    const account = result.accounts.find((x) => x.username === "mail-a");
    assert.equal(account.env_ref_present, true);
    assert.equal(account.env_file_present, true);
    const text = JSON.stringify(result);
    assert.equal(text.includes("private-state/mail/team/mail-a.env"), false, "preflight output must not echo private env ref");
    assert.equal(text.includes("do-not-leak"), false, "preflight output must not leak env file contents");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-PREFLIGHT: 회사 PC에 메일 env 파일이 없으면 차단 사유로 보고", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-missing-"));
  try {
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "mail-a",
        email: "mail-a@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/mail-a.env",
      }],
    }));

    const store = freshStore();
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
    }).ok, true);

    const result = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(result.configuration_ready, false);
    assert.equal(result.team_use_ready, false);
    assert.ok(result.blockers.some((x) => x.code === "mailbox_env_file_missing" && x.account_label === "메일A"));
    assert.ok(result.next_actions.some((x) => x.code === "create_company_pc_mail_env_files"));
    assert.equal(JSON.stringify(result).includes("private-state/mail/team/mail-a.env"), false, "missing path is still redacted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-PREFLIGHT: 등록부 개수만 맞고 다른 메일함이면 차단", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-stale-register-"));
  try {
    mkdirSync(join(root, "private-state", "mail", "team"), { recursive: true });
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    writeFileSync(join(root, "private-state", "mail", "team", "mail-a.env"), "MAIL_PASSWORD=do-not-leak\n");
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "stale",
        email: "stale@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/stale.env",
      }],
    }));

    const store = freshStore();
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
      last_fetch_at: "2026-06-17T09:00:00+09:00",
    }).ok, true);

    const result = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(result.configuration_ready, false);
    assert.equal(result.team_use_ready, false);
    assert.ok(result.blockers.some((x) => x.code === "team_mailbox_register_account_missing" && x.account_label === "메일A"));
    assert.ok(result.next_actions.some((x) => x.code === "refresh_team_mailbox_register"));
    assert.equal(JSON.stringify(result).includes("stale@corp.com"), false, "stale register email is not echoed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-PREFLIGHT: 등록부 메일함은 같아도 env_file 이 DB 포인터와 다르면 차단", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-env-mismatch-"));
  try {
    mkdirSync(join(root, "private-state", "mail", "team"), { recursive: true });
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    writeFileSync(join(root, "private-state", "mail", "team", "mail-a.env"), "MAIL_PASSWORD=do-not-leak\n");
    writeFileSync(join(root, "private-state", "mail", "team", "old.env"), "MAIL_PASSWORD=old-secret\n");
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "mail-a",
        email: "mail-a@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/old.env",
      }],
    }));

    const store = freshStore();
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
      last_fetch_at: "2026-06-17T09:00:00+09:00",
    }).ok, true);

    const result = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(result.configuration_ready, false);
    assert.equal(result.team_use_ready, false);
    assert.ok(result.blockers.some((x) => x.code === "team_mailbox_register_env_ref_mismatch" && x.account_label === "메일A"));
    assert.ok(result.next_actions.some((x) => x.code === "refresh_team_mailbox_register"));
    const text = JSON.stringify(result);
    assert.equal(text.includes("private-state/mail/team/old.env"), false, "stale register env path is not echoed");
    assert.equal(text.includes("old-secret"), false, "stale register env contents are not read or echoed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-PREFLIGHT: 설정은 맞아도 메일 수집 관측 전에는 팀 사용 준비로 닫지 않음", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-unfetched-"));
  try {
    mkdirSync(join(root, "private-state", "mail", "team"), { recursive: true });
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    writeFileSync(join(root, "private-state", "mail", "team", "mail-a.env"), "MAIL_PASSWORD=do-not-leak\n");
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "mail-a",
        email: "mail-a@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/mail-a.env",
      }],
    }));

    const store = freshStore();
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
    }).ok, true);

    const result = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(result.configuration_ready, true, "계정/등록부/env 설정 자체는 통과");
    assert.equal(result.mail_fetch_observed, false);
    assert.equal(result.team_use_ready, false, "실제 수집 전에는 팀 사용 준비 완료가 아님");
    assert.ok(result.next_actions.some((x) => x.code === "run_team_mail_fetch"));
    assert.equal(result.next_actions.some((x) => x.code === "ready_for_company_pc_team_use"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TEAM-PREFLIGHT: 기본 목표 5명 미만이면 명시적으로 막고 1명 파일럿은 목표를 낮춰야 함", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-preflight-target-"));
  try {
    mkdirSync(join(root, "private-state", "mail", "team"), { recursive: true });
    mkdirSync(join(root, "guild_hall", "state", "gateway", "mailbox", "state"), { recursive: true });
    writeFileSync(join(root, "private-state", "mail", "team", "mail-a.env"), "MAIL_PASSWORD=do-not-leak\n");
    const registerPath = join(root, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
    writeFileSync(registerPath, JSON.stringify({
      schema_version: "email.fetch.team_mailbox_register.v1",
      mailboxes: [{
        id: "mail-a",
        email: "mail-a@corp.com",
        provider: "gmail",
        enabled: true,
        env_file: "private-state/mail/team/mail-a.env",
      }],
    }));

    const store = freshStore();
    store.upsertProject({ id: "P26-001", title: "팀 준비", data_label: "real" });
    store.createAccount({ username: "admin", password: "pw123456", email: "admin@corp.com", roles: ["admin"] });
    const member = store.createAccount({ username: "mail-a", password: "pw123456", email: "mail-a@corp.com", display_name: "메일A" });
    assert.equal(store.updateAccountMailbox(member.id, {
      provider: "gmail",
      enabled: true,
      env_ref: "private-state/mail/team/mail-a.env",
      last_fetch_at: "2026-06-17T09:00:00+09:00",
    }).ok, true);
    store.ingestMail({ id: "m-target", project_code: "P26-001", at: "2026-06-17T09:30:00+09:00", subject: "준비 메일", mailbox: "mail-a@corp.com" });

    const defaultTarget = buildTeamHostPreflight(store, { root, registerPath, today: "2026-06-17" });
    assert.equal(defaultTarget.configuration_ready, false);
    assert.ok(defaultTarget.blockers.some((x) => x.code === "target_members_short" && x.expected === 5 && x.actual === 1));

    const oneMemberPilot = buildTeamHostPreflight(store, { root, targetMembers: 1, registerPath, today: "2026-06-17" });
    assert.equal(oneMemberPilot.configuration_ready, true);
    assert.equal(oneMemberPilot.team_use_ready, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  store.ingestMail({ id: "m-a2", project_code: "P26-001", at: "2026-06-10T01:00:00Z", subject: "A 폴더 메일", mailbox: "a@corp.com/받은 편지함" });
  store.ingestMail({ id: "m-b1", project_code: "P26-001", at: "2026-06-11", subject: "B 메일", mailbox: "B@Corp.com" });
  store.ingestMail({ id: "m-b2", project_code: "P26-001", at: "2026-06-11T01:00:00Z", subject: "B 폴더 메일", mailbox: "B@Corp.com\\보낸 편지함" });
  store.ingestMail({ id: "m-x1", project_code: "P26-001", at: "2026-06-12", subject: "공용 메일" }); // mailbox 없음
  assert.equal(store.mailboxMatches("a@corp.com/받은 편지함", "a@corp.com"), true, "이메일 하위 폴더도 같은 계정 mailbox");
  assert.equal(store.mailboxMatches("b@corp.com\\보낸 편지함", "b@corp.com"), true, "역슬래시 폴더도 같은 계정 mailbox");
  assert.equal(store.mail({ mailbox: "a@corp.com" }).length, 2, "A 메일함 exact+폴더 2건");
  assert.equal(store.mail({ mailbox: "b@corp.com" }).length, 2, "B 메일함 소문자+폴더 매칭 2건");
  assert.equal(store.mail({ mailbox: "__none__" }).length, 0, "메일함 없는 계정은 전체 메일로 풀리지 않음");
  assert.equal(store.mail({ mailbox: "team" }).length, 5, "team 전체");
  assert.equal(store.mail({}).length, 5, "미지정 전체");
  const manual = store.createMail({ subject: "직접 등록 메일", mailbox: "Manual@Corp.com" });
  assert.equal(manual.mail.mailbox, "manual@corp.com", "직접 등록 메일도 메일함 정규화 보존");
});

// 팀원 기본 검색은 자기 할일/자기 메일함으로 좁힌다. 관리자는 옵션 없이 전체를 볼 수 있다.
test("TEAM-ACCT: crossSearch 범위 — 팀원은 자기 할일·메일함만", () => {
  const store = freshStore();
  store.upsertProject({ id: "P26-001", title: "범위 테스트", data_label: "real" });
  store.createItem({ project_id: "P26-001", title: "범위 확인 A", assignee_ref: "a@corp.com" });
  store.createItem({ project_id: "P26-001", title: "범위 확인 B", assignee_ref: "b@corp.com" });
  store.ingestMail({ id: "m-a-scope", project_code: "P26-001", at: "2026-06-10", subject: "범위 확인 메일", mailbox: "a@corp.com/받은 편지함" });
  store.ingestMail({ id: "m-b-scope", project_code: "P26-001", at: "2026-06-11", subject: "범위 확인 메일", mailbox: "b@corp.com\\보낸 편지함" });

  const scoped = crossSearch(store, "범위 확인", { mailbox: "a@corp.com", assignee_any: ["a@corp.com"] });
  assert.deepEqual(scoped.mail.map((m) => m.id), ["m-a-scope"], "A 메일함만 검색");
  assert.deepEqual(scoped.items.map((i) => i.assignee_ref), ["a@corp.com"], "A 담당 할일만 검색");
  const none = crossSearch(store, "범위 확인", { mailbox: "__none__", assignee_any: [] });
  assert.deepEqual(none.mail.map((m) => m.id), [], "메일함 없는 계정 검색은 전체 메일로 풀리지 않음");
  assert.deepEqual(none.items.map((i) => i.status), [], "담당자 없는 검색은 미분류 외 할일을 보여주지 않음");

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
test("chatbot UI: keeps one local thread until explicit new chat", () => {
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.match(app, /function ensureChatThread/);
  assert.match(app, /encodeURIComponent\(String\(raw\)\)/);
  assert.match(app, /localStorage\.getItem\(chatThreadStorageKey\(\)\)/);
  assert.match(app, /localStorage\.setItem\(chatThreadStorageKey\(\), state\.chatThread\)/);
  assert.match(app, /function startFreshChatThread/);
  assert.match(app, /startFreshChatThread\(\); paint\(\)/);
  assert.match(app, /if \(msg === "\/new"\) \{ startFreshChatThread\(\);/);
  assert.match(app, /function restoreChatLog/);
  assert.match(app, /function saveChatLog/);
  assert.match(app, /context_used: r\.context_used/);
});

test("chatbot context: short imperative follow-up keeps the same thread context", () => {
  const store = freshStore();
  loadManualFaq(store);
  store.chatAnswer({ question: "개발요청함은 어디에 쓰는 건가요?", thread_id: "ctx-keep", actor_ref: "alice" });
  const follow = store.chatAnswer({ question: "너가 직접 적어줘.", thread_id: "ctx-keep", actor_ref: "alice" });
  assert.equal(follow.context_used, true);
  assert.match(follow.effective_question, /개발요청함/);

  const fresh = store.chatAnswer({ question: "너가 직접 적어줘.", thread_id: "ctx-new", actor_ref: "alice" });
  assert.equal(fresh.context_used, false);
});

test("chatbot runtime: memory and new-chat questions explain the actual context rule", () => {
  const store = freshStore();
  loadManualFaq(store);
  store.chatAnswer({ question: "할일을 챗봇이 지워주는 기능을 개발요청함에 작성해줘", thread_id: "ctx-memory", actor_ref: "alice" });
  const r = store.chatAnswer({ question: "실제 문맥을 몇개나 기억하는거야? 계속 새로운 채팅을 여는것 같은데.", thread_id: "ctx-memory", actor_ref: "alice" });
  assert.equal(r.runtime_direct, true);
  assert.equal(r.matched, false);
  assert.equal(r.context_used, true);
  assert.match(r.text, /최근 5개 질문/);
  assert.match(r.text, /새 대화 버튼/);
});

// ── MAIL-PENDING: 메일→할일 미변환 델타 검출기(LLM 판단 입력 한정용) ──
function writeMailTaskFixtures(dir, { mailRows, taskRows = [] }) {
  const mailDir = join(dir, "reports", "메일_이력");
  const taskDir = join(dir, "reports", "할일_장부");
  mkdirSync(mailDir, { recursive: true });
  mkdirSync(taskDir, { recursive: true });
  const mailHeader = ["이력키", "제목", "메일수신시각", "발신자", "메일소스ID", "메일함", "마감일"];
  const mailCsv = [mailHeader.join(","), ...mailRows.map((r) => mailHeader.map((h) => r[h] ?? "").join(","))].join("\n");
  writeFileSync(join(mailDir, "메일_이력.csv"), "﻿" + mailCsv + "\n");
  const taskHeader = ["할일키", "할일명", "관련메일이력키"];
  const taskCsv = [taskHeader.join(","), ...taskRows.map((r) => taskHeader.map((h) => r[h] ?? "").join(","))].join("\n");
  writeFileSync(join(taskDir, "할일_장부.csv"), "﻿" + taskCsv + "\n");
  return { mailCsv: join(mailDir, "메일_이력.csv"), taskCsv: join(taskDir, "할일_장부.csv") };
}

test("MAIL-PENDING: 변환된 메일(mailtask:키)은 빠지고 미변환만 남는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "mail-pending-"));
  try {
    const { mailCsv, taskCsv } = writeMailTaskFixtures(dir, {
      mailRows: [
        { 이력키: "mh001", 제목: "견적 회신 요청", 발신자: "a@x.com", 메일함: "me@sonartech.com", 메일소스ID: "s1" },
        { 이력키: "mh002", 제목: "도면 검토 요청", 발신자: "b@x.com", 메일함: "me@sonartech.com", 메일소스ID: "s2" },
        { 이력키: "mh003", 제목: "뉴스레터", 발신자: "news@x.com", 메일함: "me@sonartech.com", 메일소스ID: "s3" },
      ],
      taskRows: [
        { 할일키: "mailtask:mh001", 할일명: "견적 회신", 관련메일이력키: "mailcsv:mh001" }, // mh001 변환됨
      ],
    });
    const pending = pendingForProject(mailCsv, taskCsv);
    assert.equal(pending.length, 2, "mh001 제외, mh002·mh003 미변환");
    assert.deepEqual(pending.map((p) => p.history_key).sort(), ["mh002", "mh003"]);
    const p2 = pending.find((p) => p.history_key === "mh002");
    assert.equal(p2.subject, "도면 검토 요청");
    assert.equal(p2.mailbox, "me@sonartech.com");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("MAIL-PENDING: split(mailtask:키:n)도 변환됨으로 인정", () => {
  const dir = mkdtempSync(join(tmpdir(), "mail-pending-"));
  try {
    const { mailCsv, taskCsv } = writeMailTaskFixtures(dir, {
      mailRows: [{ 이력키: "mh010", 제목: "복수 액션 메일", 발신자: "a@x.com", 메일함: "me@x.com" }],
      taskRows: [
        { 할일키: "mailtask:mh010:1", 할일명: "액션1" },
        { 할일키: "mailtask:mh010:2", 할일명: "액션2" },
      ],
    });
    assert.equal(pendingForProject(mailCsv, taskCsv).length, 0, "split 변환된 메일은 미변환 아님");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("MAIL-PENDING: 할일_장부 없으면 전건 미변환, scanPending 은 프로젝트별 집계", () => {
  const root = mkdtempSync(join(tmpdir(), "mail-pending-wm-"));
  try {
    const wm = join(root, "_workmeta");
    const projDir = join(wm, "P26-014");
    writeMailTaskFixtures(projDir, {
      mailRows: [
        { 이력키: "mh001", 제목: "A", 발신자: "a@x.com", 메일함: "me@x.com" },
        { 이력키: "mh002", 제목: "B", 발신자: "b@x.com", 메일함: "me@x.com" },
      ],
      taskRows: [],
    });
    // 할일_장부.csv 를 비워 미변환 전건 처리 — writeMailTaskFixtures 가 빈 task csv 생성함
    const scanned = scanPending(wm, {});
    assert.equal(scanned.length, 1);
    assert.equal(scanned[0].project, "P26-014");
    assert.equal(scanned[0].pending.length, 2, "할일_장부 비어있으면 전건 미변환");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── REAL-META-TASKS: 할일_장부가 운영본(real_meta ingest)까지 full-fidelity로 도달 ──
test("REAL-META-TASKS: 할일류 item 은 ingestTaskItem 라우팅으로 full 필드 보존(upsertItem 손실 방지)", () => {
  const store = freshStore();
  const r = ingestNormalized(store, { items: [{
    id: "mailtask:mhX1", project_id: "P26-014", title: "메일 검토: 견적",
    origin: "mail", work_type: "answer", completion_criteria: "견적 회신",
    origin_mail_id: "mailcsv:mhX1", anchor_stage_code: "설계", status: "open", due: "2026-06-25",
  }] }, { label: "real" });
  assert.equal(r.items, 1, "할일류 item ingest 성공");
  const it = store.db.prepare("SELECT * FROM core_item WHERE id=?").get("mailtask:mhX1");
  assert.ok(it, "아이템 생성됨");
  assert.equal(it.work_type, "answer", "work_type 보존(upsertItem이면 누락)");
  assert.equal(it.completion_criteria, "견적 회신", "완료기준 보존");
  assert.ok(String(it.origin_mail_id || "").includes("mhX1"), "origin_mail_id 보존(메일 역추적)");
  assert.equal(it.anchor_stage_code, "설계", "SE단계 보존");
  assert.equal(it.status, "open", "mail 출처+anchor+work_type 충족 → open 유지(검토격리 아님)");
});

test("REAL-META-TASKS: build_real_meta 가 할일_장부를 items 에 싣는다", () => {
  const repo = mkdtempSync(join(tmpdir(), "brm-"));
  try {
    const tdir = join(repo, "_workmeta", "P26-014", "reports", "할일_장부");
    mkdirSync(tdir, { recursive: true });
    const header = "할일키,스키마버전,기록일,프로젝트코드,할일명,담당자,업무유형,상태,마감일,SE단계,연결유형,연결대상,완료기준,출처,관련메일이력키";
    const row = "mailtask:mhZ1,soulforge.project_task_ledger.private.v0,2026-06-17,P26-014,견적 회신,,answer,open,2026-06-25,설계,,,견적 작성 후 회신,mail,mailcsv:mhZ1";
    writeFileSync(join(tdir, "할일_장부.csv"), "﻿" + header + "\n" + row + "\n");
    const out = join(repo, "real_meta.json");
    const toolPath = fileURLToPath(new URL("../tools/build_real_meta.mjs", import.meta.url));
    execFileSync(process.execPath, [toolPath, "--repo", repo, "--out", out], { encoding: "utf8" });
    const rm = JSON.parse(readFileSync(out, "utf8"));
    const task = rm.items.find((x) => x.id === "mailtask:mhZ1");
    assert.ok(task, "할일_장부 행이 real_meta.items 에 실림");
    assert.equal(task.work_type, "answer");
    assert.equal(task.completion_criteria, "견적 작성 후 회신");
    assert.equal(task.project_id, "P26-014");
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

// ── MAILBOX-ENV: ERP에서 입력한 메일 자격증명을 env 파일에 기록(DB 아님) ──
test("MAILBOX-ENV: 경로 파생·env upsert·hiworks 키 묶음", () => {
  assert.equal(safeAccountEnvName("Kim.Lee@x.com"), "acct_kim.lee_x.com.env");
  assert.match(mailboxEnvRelPath("kim"), /guild_hall\/state\/gateway\/mailbox\/state\/acct_kim\.env$/);
  const merged = upsertEnv("# c\nHIWORKS_POP3_HOST=old\nOTHER=keep\n", { HIWORKS_POP3_HOST: "pop3s.hiworks.com", HIWORKS_POP3_PASSWORD: "pw" });
  assert.match(merged, /HIWORKS_POP3_HOST=pop3s\.hiworks\.com/);
  assert.match(merged, /OTHER=keep/);                // 타 키 보존
  assert.match(merged, /# c/);                        // 주석 보존
  assert.match(merged, /HIWORKS_POP3_PASSWORD=pw/);   // 새 키 추가
  const u = hiworksEnvUpdates({ host: "pop3s.hiworks.com", username: "u@x", password: "secret123" });
  assert.equal(u.HIWORKS_POP3_PASSWORD, "secret123");
  assert.equal(u.EMAIL_FETCH_SOURCE_HIWORKS_ENABLED, "true");
  assert.equal(u.EMAIL_FETCH_SOURCE_GMAIL_ENABLED, "false");
  // 보내기(SMTP)도 같은 자격증명으로 묶임 + 호스트 유추(pop3s→smtps)
  assert.equal(u.EMAIL_SEND_PROVIDER, "hiworks");
  assert.equal(u.HIWORKS_SMTP_HOST, "smtps.hiworks.com");
  assert.equal(u.HIWORKS_SMTP_PORT, "465");
  assert.equal(u.HIWORKS_SMTP_USERNAME, "u@x");
  assert.equal(u.HIWORKS_SMTP_PASSWORD, "secret123");
  assert.equal(u.HIWORKS_SMTP_FROM, "u@x");
});

test("MAILBOX-ENV: 계정 id 기반 고유 파일명 — 한글/비ASCII 이름도 계정마다 분리(충돌 방지)", () => {
  // 호출부는 acct.id 를 넘긴다 → ASCII·고유 → 사람마다 다른 파일.
  assert.notEqual(mailboxEnvRelPath("acc_279211a373"), mailboxEnvRelPath("acc_145a8edf2e"));
  assert.equal(safeAccountEnvName("acc_279211a373"), "acct_acc_279211a373.env");
  // 방어: 한글 username 을 직접 넘겨도 sanitize 후 빈 문자열이면 해시로 고유화 → 더 이상 공용 acct_mailbox.env 로 뭉치지 않음.
  assert.notEqual(safeAccountEnvName("차오름"), safeAccountEnvName("문성용"));
  assert.doesNotMatch(safeAccountEnvName("차오름"), /acct_mailbox\.env$/);
  assert.doesNotMatch(safeAccountEnvName("문성용"), /acct_mailbox\.env$/);
  assert.match(safeAccountEnvName("차오름"), /^acct_x[0-9a-f]{12}\.env$/); // 해시 폴백 형식
});

test("MAILBOX-TEST: 수집기 dry-run JSON → 연결 성공/인증실패 판정", () => {
  const ok = parseMailTestResult(JSON.stringify({ sources: [{ source: "hiworks", fetched: 3, errors: [] }] }));
  assert.equal(ok.ok, true); assert.equal(ok.fetched, 3);
  const fail = parseMailTestResult(JSON.stringify({ sources: [{ source: "hiworks", fetched: 0, errors: [{ code: "auth_failed", message: "Access denied" }] }] }));
  assert.equal(fail.ok, false); assert.equal(fail.error, "auth_failed");
  assert.equal(parseMailTestResult("not json").ok, false);
});

test("MAIL-COLLECT: enabled 메일함 없으면 자식프로세스 없이 조기반환 + 락 해제", async () => {
  const { collectAllMailboxes, isCollecting } = await import("../src/mail_collect.mjs");
  assert.equal(typeof collectAllMailboxes, "function");
  assert.equal(isCollecting(), false);
  const store = openStore(":memory:");
  const r = await collectAllMailboxes(store, { repoRoot: ".", appDir: "." });
  assert.equal(r.ok, true);
  assert.equal(r.note, "no_enabled_mailbox");
  assert.equal(r.fetch, null);          // 조기반환 — fetch/ingest 자식 프로세스 미실행
  assert.equal(r.ingest, null);
  assert.equal(isCollecting(), false); // 조기반환 후 락 해제
});

test("MAIL-COLLECT: 서버 엔드포인트 + 자동 인터벌 env + UI 버튼 배선", () => {
  const srv = readFileSync(join(APP_DIR, "server.mjs"), "utf8");
  assert.match(srv, /path === "\/api\/mail\/collect"/);
  assert.match(srv, /DEV_ERP_MAIL_COLLECT_SEC/);
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.match(app, /data-collect/);              // 수집 버튼
  assert.match(app, /\/api\/mail\/collect/);      // 버튼 → 엔드포인트 호출
});

test("MAILBOX-ENV: 허용 디렉터리에만 atomic 기록, traversal/타 경로 거부, 비번은 파일에만", () => {
  const root = mkdtempSync(join(tmpdir(), "mbenv-"));
  try {
    const r = writeMailboxEnv(root, mailboxEnvRelPath("kim"), hiworksEnvUpdates({ host: "pop3s.hiworks.com", username: "kim@x.com", password: "p@ss!" }));
    assert.equal(r.ok, true);
    const written = readFileSync(r.path, "utf-8");
    assert.match(written, /HIWORKS_POP3_PASSWORD=p@ss!/);       // 비번은 env 파일에
    assert.match(written, /HIWORKS_POP3_USERNAME=kim@x\.com/);
    assert.equal(writeMailboxEnv(root, "../../../etc/evil.env", { X: "1" }).error, "mailbox_env_path_unsafe");
    assert.equal(writeMailboxEnv(root, "ui-workspace/apps/dev-erp/data/x.env", { X: "1" }).error, "mailbox_env_path_unsafe");
    // 삭제: 허용 디렉터리 내 파일은 지우고, 밖이면 거부
    assert.equal(deleteMailboxEnv(root, mailboxEnvRelPath("kim")).deleted, true);
    assert.equal(deleteMailboxEnv(root, mailboxEnvRelPath("kim")).deleted, false); // 이미 없음
    assert.equal(deleteMailboxEnv(root, "../../../etc/evil.env").error, "mailbox_env_path_unsafe");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── ACCOUNT-DELETE: 계정 영구 삭제 — 연결 데이터 제거, 메일·할일 보존, 마지막 관리자 보호 ──
test("ACCOUNT-DELETE: 계정·세션·역할·대시보드 제거 / 메일·할일 보존 / 마지막 관리자 보호", () => {
  const store = freshStore();
  store.createAccount({ username: "admin1", password: "pw123456", roles: ["admin"], display_name: "관리자1" });
  store.createAccount({ username: "kim", password: "pw123456", roles: ["member"], email: "kim@x.com" });
  const adminId = store.listAccounts().find((a) => a.username === "admin1").id;
  const memberId = store.listAccounts().find((a) => a.username === "kim").id;
  store.db.prepare("INSERT INTO auth_session(token,account_id,created_at,expires_at) VALUES('tk1',?,?,?)").run(memberId, "2026-01-01", "2030-01-01");
  store.db.prepare("INSERT INTO user_dashboard_layout(account_id,layout_json,updated_at) VALUES(?,?,?)").run(memberId, "{}", "2026-01-01");
  store.upsertProject({ id: "P26-014", title: "KVDS", data_label: "real" }); // FK 대상 프로젝트 선등록
  store.upsertMail({ id: "m1", project_id: "P26-014", at: "2026-06-01", subject: "s", mailbox: "kim@x.com", data_label: "real" });
  store.upsertItem({ id: "it1", project_id: "P26-014", title: "t", assignee_ref: "kim", status: "open", data_label: "real" });

  // 마지막 활성 관리자(admin1) 삭제 거부
  assert.equal(store.deleteAccount(adminId).error, "cannot_delete_last_admin");
  // member 삭제 성공
  assert.equal(store.deleteAccount(memberId).ok, true);
  assert.equal(store.listAccounts().some((a) => a.username === "kim"), false);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM auth_session WHERE account_id=?").get(memberId).n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM rbac_account_role WHERE account_id=?").get(memberId).n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM user_dashboard_layout WHERE account_id=?").get(memberId).n, 0);
  // 메일·할일은 보존(전 담당 라벨로 남음)
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_mail WHERE id='m1'").get().n, 1);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_item WHERE id='it1'").get().n, 1);
});

// ── 담당자 메모리 누적 항목층(blob→항목·게이트·retrieve 주입) ──
test("memory: 누적 항목 게이트 ADD/UPDATE/NOOP (MEM-001)", () => {
  const store = freshStore();
  const r1 = store.addMemoryItem("문성용", { text: "회신 메일은 정중하게 세 문장 이내로 작성" });
  assert.equal(r1.action, "add");
  const r2 = store.addMemoryItem("문성용", { text: "회신 메일은 정중하게 세 문장 이내로 작성." }); // 거의 동일 → NOOP
  assert.equal(r2.action, "noop");
  assert.equal(r2.id, r1.id);
  const r3 = store.addMemoryItem("문성용", { text: "교반기 도면 검토는 차오름과 함께" }); // 다른 주제 → ADD
  assert.equal(r3.action, "add");
  assert.notEqual(r3.id, r1.id);
  const r4 = store.addMemoryItem("문성용", { text: "교반기 도면 검토는 차오름과 함께 진행하고 결과 보고" }); // 같은 주제 보강 → UPDATE
  assert.equal(r4.action, "update");
  assert.equal(r4.id, r3.id);
  assert.equal(store.listMemoryItems("문성용").length, 2, "중복이 쌓이지 않아야 함");
  const updated = store.listMemoryItems("문성용").find((it) => it.id === r3.id);
  assert.match(updated.text, /결과 보고/, "UPDATE 는 새 내용으로 갱신");
});

test("memory: retrieve 주입은 절단이 아니라 상위 항목 선택 + 예산 바운드 (MEM-002)", () => {
  const store = freshStore();
  for (let i = 0; i < 12; i++) store.addMemoryItem("김민재", { text: `규칙항목번호${i} ` + "가".repeat(40) });
  const few = store.retrieveMemoryItems("김민재", { budget: 120 });
  assert.ok(few.length >= 1 && few.length < 12, `예산 내 일부만 선택: ${few.length}`);
  assert.equal(store.retrieveMemoryItems("김민재", { budget: 100000, max: 100 }).length, 12);
  store.addMemoryItem("김민재", { text: "아주 중요한 새 규칙", salience: 1 }); // 최신+고salience
  const top = store.retrieveMemoryItems("김민재", { budget: 100000, max: 100 })[0];
  assert.match(top.text, /중요한 새 규칙/, "최신+고salience 가 상위");
});

test("memory: 주입 = core blob + 누적 항목, 항목 없으면 core 만 (MEM-003)", () => {
  const store = freshStore();
  store.setAssigneeMemory("차오름", "나는 오전에 집중 업무를 한다");
  assert.equal(store.memoryForInjection("차오름"), "나는 오전에 집중 업무를 한다", "항목 없으면 core 그대로");
  store.addMemoryItem("차오름", { text: "발주 메일은 첨부 확인 후 회신" });
  const inj = store.memoryForInjection("차오름");
  assert.match(inj, /오전에 집중/, "core 포함");
  assert.match(inj, /누적 메모리/, "누적 항목 섹션");
  assert.match(inj, /발주 메일은 첨부/, "항목 포함");
});

test("memory: append API 는 항목층으로 라우팅(blob 무증식) + soft delete (MEM-004)", () => {
  const store = freshStore();
  store.appendAssigneeMemory("김민재", "포인터 mailcsv:abc 관련 메모");
  assert.equal(store.getAssigneeMemory("김민재") || "", "", "core blob 은 증식하지 않음(항목으로 감)");
  const items = store.listMemoryItems("김민재");
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "fact");
  const del = store.deleteMemoryItem("김민재", items[0].id);
  assert.ok(del.ok);
  assert.equal(store.retrieveMemoryItems("김민재", { budget: 10000 }).length, 0, "archived 는 주입 제외");
  assert.equal(store.listMemoryItems("김민재", { status: "archived" }).length, 1, "archived 보존");
});

test("mail: 다중수신 중복은 canonical 1건만 노출 + 수신자 수 + retro (MAIL-DEDUP)", () => {
  const store = freshStore();
  const base = { project_code: "P00-000_INBOX", at: "2026-06-24T00:14:34+00:00", subject: "FW: 일정변경 영향성 확인", direction: "in", data_label: "real" };
  const r1 = store.ingestMail({ ...base, id: "m-a", mailbox: "seabot@x" });
  const r2 = store.ingestMail({ ...base, id: "m-b", mailbox: "mjkim@x" });
  const r3 = store.ingestMail({ ...base, id: "m-c", mailbox: "cha@x" });
  assert.equal(r1.dup_of, null, "첫 건이 canonical");
  assert.equal(r2.dup_of, "m-a", "둘째는 dup");
  assert.equal(r3.dup_of, "m-a", "셋째도 dup");
  const shown = store.mail({ project: "P00-000_INBOX" }).filter((m) => m.subject === base.subject);
  assert.equal(shown.length, 1, "중복은 목록에 1건만(hidden 필터)");
  assert.equal(shown[0].id, "m-a");
  assert.equal(shown[0].recipients, 3, "canonical 수신자 수=3");
  // 서로 다른 메일은 안 묶임
  store.ingestMail({ ...base, id: "m-x", subject: "다른 메일", mailbox: "seabot@x" });
  assert.equal(store.mail({ project: "P00-000_INBOX" }).filter((m) => m.subject === "다른 메일").length, 1);
  // retro: ingest dedup 우회(upsertMail 직접)로 만든 기존 중복도 정리
  const raw = { project_id: "P00-000_INBOX", at: "2026-06-20T01:00:00+00:00", direction: "in", subject: "기존중복", data_label: "real" };
  store.upsertMail({ ...raw, id: "old-1", mailbox: "a@x" });
  store.upsertMail({ ...raw, id: "old-2", mailbox: "b@x" });
  assert.equal(store.mail({ project: "P00-000_INBOX" }).filter((m) => m.subject === "기존중복").length, 2, "retro 전 2건");
  const res = store.dedupMailRetro({ ownerMailbox: "b@x" });
  assert.ok(res.collapsed >= 1, "retro 가 중복 접음");
  const after = store.mail({ project: "P00-000_INBOX" }).filter((m) => m.subject === "기존중복");
  assert.equal(after.length, 1, "retro 후 1건");
  assert.equal(after[0].id, "old-2", "ownerMailbox(b@x) 가 canonical");
  assert.equal(after[0].recipients, 2);
});

test("mail: 대화 단위 분류 — single_item 은 대표 1건만 할일 + 나머지 file (MAIL-CONV)", () => {
  const store = freshStore();
  // 같은 대화(정규화 제목 동일)지만 제목 변형이라 dedup 안 됨 — INBOX 3건
  store.ingestMail({ project_code: "P00-000_INBOX", id: "c1", at: "2026-06-24T01:00:00+00:00", subject: "RE: 규격 도면 재송부", direction: "in", mailbox: "a@x", data_label: "real" });
  store.ingestMail({ project_code: "P00-000_INBOX", id: "c2", at: "2026-06-24T01:01:00+00:00", subject: "RE: 규격 도면 재송부 (P.2)", direction: "in", mailbox: "a@x", data_label: "real" });
  store.ingestMail({ project_code: "P00-000_INBOX", id: "c3", at: "2026-06-24T01:02:00+00:00", subject: "FW: 규격 도면 재송부", direction: "in", mailbox: "a@x", data_label: "real" });
  store.upsertProject({ id: "general_work", title: "일반업무", class: "active", data_label: "real" });
  const r = store.assignMails(["c1", "c2", "c3"], "general_work", { make_items: true, assignee_ref: "문성용", open: true, single_item: true });
  assert.ok(r.ok);
  const items = store.db.prepare("SELECT origin_mail_id FROM core_item WHERE origin_mail_id IN ('c1','c2','c3')").all();
  assert.equal(items.length, 1, "대표 1건만 할일 생성(나머지는 file만)");
  assert.equal(items[0].origin_mail_id, "c1", "대표=첫 mail_id");
  const stillInbox = store.db.prepare("SELECT COUNT(*) AS c FROM core_mail WHERE id IN ('c1','c2','c3') AND project_id='P00-000_INBOX'").get().c;
  assert.equal(stillInbox, 0, "대화 메일 전부 인입함에서 빠짐");
});

test("codex: 미지원 service_tier(priority 등) 자동 중립화 + idempotent (CODEX-TIER)", () => {
  const dir = mkdtempSync(join(tmpdir(), "codexcfg-"));
  const cfg = join(dir, "config.toml");
  writeFileSync(cfg, 'model = "gpt-5.5"\nservice_tier = "priority"\nmodel_reasoning_effort = "xhigh"\ndefault-service-tier = "priority"\nservice_tier = "flex"\n', "utf8");
  const r = sanitizeCodexConfigServiceTier(cfg);
  assert.ok(r.ok); assert.equal(r.changed, 2, "priority 2줄(service_tier+default-service-tier) 중립화");
  const after = readFileSync(cfg, "utf8");
  assert.ok(after.includes('# service_tier = "priority"'), "service_tier=priority 주석화");
  assert.ok(after.includes('# default-service-tier = "priority"'), "default-service-tier=priority 주석화");
  assert.ok(after.includes('service_tier = "flex"') && !after.includes('# service_tier = "flex"'), "유효값 flex 유지");
  assert.ok(after.includes('model = "gpt-5.5"') && after.includes('model_reasoning_effort = "xhigh"'), "다른 설정 보존");
  assert.equal(sanitizeCodexConfigServiceTier(cfg).changed, 0, "재실행 변경 0(idempotent)");
  rmSync(dir, { recursive: true, force: true });
});

test("memory: 맥락 주입은 관련 항목을 우선(recency·salience 높아도) (MEM-005)", () => {
  const store = freshStore();
  const rel = store.addMemoryItem("문성용", { text: "P26-014 도면 검토는 차오름과 함께", salience: 0.3 }); // 먼저(오래됨)·낮은 salience
  const irrel = store.addMemoryItem("문성용", { text: "점심은 12시", salience: 1 }); // 최신+최고 salience but 무관
  assert.equal(store.retrieveMemoryItems("문성용", { budget: 100000 })[0].id, irrel.id, "맥락 없으면 최신+고salience 가 1위");
  const top = store.retrieveMemoryItems("문성용", { context: "P26-014 도면 작업", budget: 100000 })[0];
  assert.equal(top.id, rel.id, "맥락 주면 관련 항목이 최신+고salience 무관 항목을 앞선다");
});
