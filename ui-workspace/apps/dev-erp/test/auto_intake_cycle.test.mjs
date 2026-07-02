// test/auto_intake_cycle.test.mjs — 자동 인입 사이클: LLM 분류 어댑터 검증 + 오케스트레이터 단위(자식/네트워크 0).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { classifyMailForTasks, intakeLlmProvider } from "../src/llm.mjs";
import { parseCycleArgs, acquireLock, releaseLock, runCycle, buildProjectContextLines } from "../tools/auto_intake_cycle.mjs";
import { branchHintForProject, loadContextHintRules } from "../tools/haengbogwan_run.mjs";
import { autoIntakeConfig, shouldRunAutoIntake } from "../src/mail_collect.mjs";
import { pendingForProject } from "../tools/mail_to_task_pending.mjs";
import { fallbackThreadKey } from "../tools/mail_thread_key.mjs";

const PENDING = [
  { history_key: "20260701-001", subject: "[P99] 견적 검토 요청", from: "vendor@example.com", received_at: "2026-07-01T09:00:00", mailbox: "user@example.com", due_hint: "" },
  { history_key: "20260701-002", subject: "[광고] 뉴스레터", from: "news@example.com", received_at: "2026-07-01T10:00:00", mailbox: "user@example.com", due_hint: "" },
];

test("classifyMailForTasks: provider none 은 판단 없이 llm_unavailable", async () => {
  const r = await classifyMailForTasks(PENDING, { provider: "none" });
  assert.equal(r.reason, "llm_unavailable");
  assert.equal(r.judged, 0);
  assert.deepEqual(r.candidates, {});
});

test("classifyMailForTasks: is_task 후보는 검증된 필드로 candidates 에 매핑", async () => {
  const r = await classifyMailForTasks(PENDING, {
    provider: "ollama",
    generate: async (prompt, item) => item.history_key.endsWith("001")
      ? { is_task: true, title: "견적서를 검토하고 회신한다", work_type: "answer", completion_criteria: "회신 발송 완료", due: "2026-07-10", confidence: "high", reason: "요청 메일" }
      : { is_task: false, confidence: "high", reason: "광고" },
  });
  assert.equal(r.judged, 2);
  assert.equal(Object.keys(r.candidates).length, 1);
  const c = r.candidates["20260701-001"];
  assert.equal(c.work_type, "answer");
  assert.equal(c.due, "2026-07-10");
  assert.equal(c.review_status, undefined); // high 신뢰는 needs_review 플래그 없음
  assert.equal(r.skipped.filter((s) => s.reason === "not_task").length, 1);
});

test("classifyMailForTasks: 허용목록 밖 work_type 은 review 로 보수화 + 사유 기록", async () => {
  const r = await classifyMailForTasks([PENDING[0]], {
    provider: "ollama",
    generate: async () => ({ is_task: true, title: "t", work_type: "hack_the_db", completion_criteria: "c", due: "", confidence: "medium" }),
  });
  const c = r.candidates["20260701-001"];
  assert.equal(c.work_type, "review");
  assert.match(c.review_reason, /llm_invalid_work_type/);
  assert.equal(c.review_status, "needs_review");
});

test("classifyMailForTasks: 저신뢰(low)는 completion_criteria 를 비워 auto-open 차단", async () => {
  const r = await classifyMailForTasks([PENDING[0]], {
    provider: "ollama",
    generate: async () => ({ is_task: true, title: "t", work_type: "review", completion_criteria: "될 것 같음", due: "not-a-date", confidence: "low" }),
  });
  const c = r.candidates["20260701-001"];
  assert.equal(c.completion_criteria, undefined);
  assert.equal(c.due, undefined); // 잘못된 날짜 형식은 버림
  assert.equal(c.review_status, "needs_review");
});

test("classifyMailForTasks: generate 예외는 llm_error 로 격리(pending 유지)", async () => {
  const r = await classifyMailForTasks([PENDING[0]], {
    provider: "ollama",
    generate: async () => { throw new Error("boom"); },
  });
  assert.deepEqual(r.candidates, {});
  assert.equal(r.skipped[0].reason, "llm_error");
});

test("intakeLlmProvider: 명시적 ollama 만 켜지고 기본은 none", () => {
  assert.equal(intakeLlmProvider({}), "none");
  assert.equal(intakeLlmProvider({ DEV_ERP_INTAKE_LLM: "ollama" }), "ollama");
  assert.equal(intakeLlmProvider({ DEV_ERP_INTAKE_LLM: "gpt-cloud" }), "none");
});

function makeWorkmetaFixture(root) {
  const proj = join(root, "P99-001");
  mkdirSync(join(proj, "reports", "메일_이력"), { recursive: true });
  writeFileSync(join(proj, "reports", "메일_이력", "메일_이력.csv"),
    "이력키,제목,발신자,메일수신시각,메일함,메일소스ID,이벤트유형,스레드\n20260701-001,[P99] 견적 검토 요청,vendor@example.com,2026-07-01T09:00:00,user@example.com,src-1,mail_received,T-main\n");
  return proj;
}

function makeThreadFixture(root, { status = "open", mailThread = "T1", taskThread = "T1", eventType = "mail_received", historyKey = "20260701-002", subject = "[P99] 견적 검토 요청", from = "vendor@example.com" } = {}) {
  const proj = join(root, "P99-001");
  mkdirSync(join(proj, "reports", "메일_이력"), { recursive: true });
  mkdirSync(join(proj, "reports", "할일_장부"), { recursive: true });
  writeFileSync(join(proj, "reports", "메일_이력", "메일_이력.csv"),
    "이력키,제목,발신자,메일수신시각,메일함,메일소스ID,이벤트유형,스레드\n"
    + `${historyKey},${subject},${from},2026-07-01T09:05:00,user@example.com,src-2,${eventType},${mailThread}\n`);
  writeFileSync(join(proj, "reports", "할일_장부", "할일_장부.csv"),
    `할일키,상태,소스스레드키\nmailtask:20260701-001,${status},${taskThread}\n`);
  return proj;
}

test("runCycle dry-run: 자식 실행 0, 계획만 보고", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-cycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeWorkmetaFixture(root);
  const calls = [];
  const summary = await runCycle({
    apply: false, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: false, runId: "t1",
  }, {
    exec: async (cmd, args) => { calls.push(args[0]); return { stdout: "{}" }; },
    classify: async (items) => ({ judged: items.length, candidates: { [items[0].history_key]: { work_type: "review" } }, skipped: [], errors: [] }),
    appendEvent: null,
  });
  assert.equal(summary.pending_total, 1);
  assert.equal(summary.candidate_count, 1);
  assert.deepEqual(summary.ledger["P99-001"], { planned: 1 });
  // dry-run 은 ledger 자식을 실행하지 않고 context 도구도 쓰기 플래그 없이 못 돌게 함(여기선 호출 자체는 허용되나 --apply-context 미포함)
  assert.ok(!calls.includes("tools/mail_to_task_ledger.mjs"));
});

test("pendingForProject: thread 와 event_type 메타를 반환한다", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-pending-thread-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const proj = makeWorkmetaFixture(root);
  const pending = pendingForProject(
    join(proj, "reports", "메일_이력", "메일_이력.csv"),
    join(proj, "reports", "할일_장부", "할일_장부.csv"),
  );
  assert.equal(pending[0].thread, "T-main");
  assert.equal(pending[0].event_type, "mail_received");
});

test("runCycle apply: 열린 할일과 같은 스레드의 메일은 followup 영수증+event 로 귀속", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-thread-followup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeThreadFixture(root);
  let classified = false;
  const events = [];
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-thread",
  }, {
    classify: async () => { classified = true; return { judged: 0, candidates: {}, skipped: [], errors: [] }; },
    appendEvent: (event) => events.push(event),
  });
  assert.equal(classified, false);
  assert.equal(summary.pending_total, 0);
  assert.equal(summary.thread_dedup.followups, 1);
  assert.equal(summary.receipts.written, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "mail_followup");
  assert.equal(events[0].item_ref, "mailtask:20260701-001");
  const receipt = readFileSync(join(root, "P99-001", "reports", "haengbogwan_mail_receipts", "mail_receipts.csv"), "utf8");
  assert.match(receipt, /thread_followup:mailtask:20260701-001/);
});

test("runCycle: 같은 스레드라도 기존 할일이 done 이면 새로 판단한다", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-thread-done-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeThreadFixture(root, { status: "done" });
  let classifiedItems = [];
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-thread-done",
  }, {
    classify: async (items) => { classifiedItems = items; return { judged: items.length, candidates: {}, skipped: [], errors: [] }; },
    appendEvent: null,
  });
  assert.equal(summary.pending_total, 1);
  assert.equal(summary.thread_dedup.followups, 0);
  assert.equal(classifiedItems[0].history_key, "20260701-002");
});

test("runCycle: 스레드 빈 값은 제목+발신자 도메인 fallback 키로 귀속한다", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-thread-fallback-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fallback = fallbackThreadKey({ subject: "[P99] 견적 검토 요청", from: "vendor@example.com" });
  makeThreadFixture(root, { mailThread: "", taskThread: fallback });
  let classified = false;
  const summary = await runCycle({
    apply: false, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-thread-fallback",
  }, {
    classify: async () => { classified = true; return { judged: 0, candidates: {}, skipped: [], errors: [] }; },
    appendEvent: null,
  });
  assert.equal(classified, false);
  assert.equal(summary.pending_total, 0);
  assert.equal(summary.thread_dedup.followups, 1);
  assert.equal(summary.thread_dedup.receipts_planned, 1);
});

test("runCycle: 발신 메일은 영수증 없이 auto-intake 판단에서 제외한다", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-thread-outbound-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeThreadFixture(root, { eventType: "mail_sent_outlook_subject_match" });
  let classified = false;
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-thread-outbound",
  }, {
    classify: async () => { classified = true; return { judged: 0, candidates: {}, skipped: [], errors: [] }; },
    appendEvent: null,
  });
  assert.equal(classified, false);
  assert.equal(summary.pending_total, 0);
  assert.equal(summary.thread_dedup.outbound_skipped, 1);
  assert.equal(summary.receipts.written, 0);
  assert.equal(existsSync(join(root, "P99-001", "reports", "haengbogwan_mail_receipts", "mail_receipts.csv")), false);
});

test("runCycle apply: thread followup 재실행은 영수증과 event 를 중복 생성하지 않는다", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-thread-idem-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeThreadFixture(root);
  const events = [];
  const opts = {
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-thread-idem",
  };
  const deps = {
    classify: async () => ({ judged: 0, candidates: {}, skipped: [], errors: [] }),
    appendEvent: (event) => events.push(event),
  };
  const first = await runCycle(opts, deps);
  const second = await runCycle({ ...opts, runId: "t-thread-idem-2" }, deps);
  assert.equal(first.receipts.written, 1);
  assert.equal(second.pending_total, 0);
  assert.equal(second.receipts.written, 0);
  assert.equal(events.length, 1);
});

test("mail_to_task_ledger: 스레드 빈 값은 fallback 소스스레드키로 기록한다", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-ledger-thread-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const proj = join(root, "P99-001");
  mkdirSync(join(proj, "reports", "메일_이력"), { recursive: true });
  writeFileSync(join(proj, "reports", "메일_이력", "메일_이력.csv"),
    "이력키,제목,발신자,메일수신시각,메일함,메일소스ID,스레드\n"
    + "M001,[P99] 견적 검토 요청,vendor@example.com,2026-07-01T09:05:00,user@example.com,src-1,\n");
  const candidatesPath = join(root, "candidates.json");
  writeFileSync(candidatesPath, JSON.stringify({
    M001: { title: "메일 검토", work_type: "review", completion_criteria: "검토 완료" },
  }));
  const result = spawnSync(process.execPath, [
    "tools/mail_to_task_ledger.mjs",
    "--project", "P99-001",
    "--workmeta", root,
    "--candidates", candidatesPath,
    "--apply",
  ], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const taskText = readFileSync(join(proj, "reports", "할일_장부", "할일_장부.csv"), "utf8");
  assert.match(taskText, new RegExp(fallbackThreadKey({ subject: "[P99] 견적 검토 요청", from: "vendor@example.com" })));
});

test("runCycle apply: candidates 파일 작성 + ledger/haengbogwan 자식 인자 검증 + receipts 기록", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-cycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeWorkmetaFixture(root);
  const dataDir = join(root, "appdata");
  const calls = [];
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir,
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: true, skipContext: false, runId: "t2",
  }, {
    exec: async (cmd, args) => { calls.push(args); return { stdout: JSON.stringify({ totals: { context_accepted_event_count: 3, knowledge_candidate_appended_count: 1, candidate_count: 0 } }) }; },
    classify: async (items) => ({ judged: items.length, candidates: { [items[0].history_key]: { title: "검토", work_type: "review", completion_criteria: "완료" } }, skipped: [], errors: [] }),
    appendEvent: null,
  });
  assert.equal(summary.ok, true, JSON.stringify(summary.errors));
  const ledgerCall = calls.find((a) => a[0] === "tools/mail_to_task_ledger.mjs");
  assert.ok(ledgerCall, "ledger 자식 호출 필요");
  assert.ok(ledgerCall.includes("--auto-open") && ledgerCall.includes("--apply") && ledgerCall.includes("P99-001"));
  const candFile = ledgerCall[ledgerCall.indexOf("--candidates") + 1];
  assert.ok(existsSync(candFile));
  assert.equal(JSON.parse(readFileSync(candFile, "utf8"))["20260701-001"].work_type, "review");
  const hgCall = calls.find((a) => a[0] === "tools/haengbogwan_run.mjs");
  assert.ok(hgCall.includes("--apply-context") && hgCall.includes("--apply-knowledge-candidates"));
  assert.ok(!hgCall.includes("--apply"), "LLM 후보가 있으면 결정적 --apply 폴백은 없어야 함");
  assert.equal(summary.context.accepted_events, 3);
  assert.ok(existsSync(join(dataDir, "auto_intake_receipts.jsonl")));
});

test("runCycle: LLM 미가용 + fallback=deterministic 이면 haengbogwan --apply --auto-open 폴백", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-cycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeWorkmetaFixture(root);
  const calls = [];
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "none", fallback: "deterministic", knowledge: false, skipContext: false, runId: "t3",
  }, {
    exec: async (cmd, args) => { calls.push(args); return { stdout: JSON.stringify({ totals: { candidate_count: 1, context_accepted_event_count: 2, knowledge_candidate_appended_count: 0 } }) }; },
    appendEvent: null,
  });
  assert.equal(summary.candidate_count, 0);
  const hgCall = calls.find((a) => a[0] === "tools/haengbogwan_run.mjs");
  assert.ok(hgCall.includes("--apply") && hgCall.includes("--apply-context") && hgCall.includes("--auto-open"));
  assert.equal(summary.context.deterministic_fallback, true);
  assert.equal(summary.context.fallback_candidates, 1);
});

test("락: 이중 실행 방지 + stale 탈취", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const l1 = acquireLock(root);
  assert.ok(l1);
  assert.equal(acquireLock(root), null); // 활성 락 존재 → 실패
  const stale = Date.now() + 16 * 60 * 1000;
  assert.ok(acquireLock(root, { now: stale })); // 15분 지난 락은 탈취
  releaseLock(l1);
});

test("parseCycleArgs: 기본값과 env 매핑", () => {
  const o = parseCycleArgs(["--apply", "--project", "P99-001", "--limit", "5"], { DEV_ERP_INTAKE_LLM: "ollama", DEV_ERP_INTAKE_FALLBACK: "deterministic" });
  assert.equal(o.apply, true);
  assert.deepEqual(o.projects, ["P99-001"]);
  assert.equal(o.limit, 5);
  assert.equal(o.provider, "ollama");
  assert.equal(o.fallback, "deterministic");
});

test("branchHintForProject: 프로젝트 규칙 우선 → 계약 seed 폴백 → fallback", () => {
  const rules = [
    { branch: "KVDS towbody", priority: 100, keywords: ["towbody", "예인몸체"] },
    { branch: "KVDS SOW", priority: 120, keywords: ["sow"] },
  ];
  assert.equal(branchHintForProject("예인몸체 베인 검토 요청", { rules }), "KVDS towbody");
  assert.equal(branchHintForProject("SOW 초안 회신", { rules }), "KVDS SOW"); // 규칙이 seed(document_response)보다 우선
  assert.equal(branchHintForProject("수밀케이블 견적 송부", { rules }), "procurement"); // 규칙 미매칭 → 중립 seed
  assert.equal(branchHintForProject("납품 일정 공유", { rules: [] }), "delivery");
  assert.equal(branchHintForProject("잡담", { rules: [], fallback: "pending mail" }), "pending mail");
});

test("loadContextHintRules: 파일 없음/파손은 빈 배열, 정상 파일은 priority 정렬", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-rules-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(loadContextHintRules(root, "P77-000"), []);
  const rulesDir = join(root, "P77-000", "rules");
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, "haengbogwan_context_hint_rules.json"), JSON.stringify({
    rules: [
      { enabled: true, priority: 10, event_keywords: ["b"], target_object: "low" },
      { enabled: true, priority: 90, event_keywords: ["a"], target_object: "high" },
      { enabled: false, priority: 200, event_keywords: ["x"], target_object: "off" },
    ],
  }));
  const rules = loadContextHintRules(root, "P77-000");
  assert.deepEqual(rules.map((r) => r.branch), ["high", "low"]);
  writeFileSync(join(rulesDir, "haengbogwan_context_hint_rules.json"), "{broken");
  assert.deepEqual(loadContextHintRules(root, "P77-000"), []);
});

test("buildProjectContextLines: 규칙 branch + 상위 줄기 요약, 깨진 라벨 제외", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-ctx-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const proj = join(root, "P77-000");
  mkdirSync(join(proj, "rules"), { recursive: true });
  writeFileSync(join(proj, "rules", "haengbogwan_context_hint_rules.json"), JSON.stringify({
    rules: [{ enabled: true, priority: 1, event_keywords: ["sow"], target_object: "SOW 조율" }],
  }));
  mkdirSync(join(proj, "project_context", "summaries"), { recursive: true });
  writeFileSync(join(proj, "project_context", "summaries", "branch_summaries.csv"),
    "branch_id,project_code,branch_key,label,source_count,task_count,open_review_count,updated_at\n"
    + "b1,P77-000,k1,센서 검증,32,13,34,2026-06-28\n"
    + "b2,P77-000,k2,[기ㅇ탐ㅇㅇㅇㅇ] 깨진 라벨,5,0,5,2026-06-28\n"
    + "b3,P77-000,k3,실무협의,54,37,100,2026-06-28\n");
  const lines = buildProjectContextLines(root, "P77-000");
  assert.ok(lines[0].includes("SOW 조율"));
  assert.ok(lines.some((l) => l.includes("실무협의 (자료 54, 미결 100)")));
  assert.ok(lines.some((l) => l.includes("센서 검증")));
  assert.ok(!lines.some((l) => l.includes("깨진 라벨")));
});

test("classifyMailForTasks: projectContext 가 프롬프트에 주입되고 규칙보다 우선하지 않음이 명시됨", async () => {
  let seenPrompt = "";
  await classifyMailForTasks([PENDING[0]], {
    provider: "ollama",
    projectContext: ["진행 중 줄기: 센서 검증 (자료 32, 미결 34)"],
    generate: async (prompt) => { seenPrompt = prompt; return { is_task: false, confidence: "high" }; },
  });
  assert.ok(seenPrompt.includes("프로젝트 맥락"));
  assert.ok(seenPrompt.includes("센서 검증"));
  assert.ok(seenPrompt.includes("우선하지 않는다"));
});

test("runCycle apply: 고신뢰 not_task 는 no_action 영수증으로 기억되어 다음 사이클 pending 에서 제외", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-receipt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeWorkmetaFixture(root);
  const opts = {
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-receipt",
  };
  const deps = {
    exec: async () => ({ stdout: "{}" }),
    classify: async (items) => ({ judged: items.length, candidates: {}, skipped: items.map((i) => ({ history_key: i.history_key, reason: "not_task", confidence: "high", note: "광고" })), errors: [] }),
    appendEvent: null,
  };
  const first = await runCycle(opts, deps);
  assert.equal(first.skipped.not_task, 1);
  assert.equal(first.receipts.written, 1);
  const receiptCsv = join(root, "P99-001", "reports", "haengbogwan_mail_receipts", "mail_receipts.csv");
  assert.ok(existsSync(receiptCsv));
  assert.match(readFileSync(receiptCsv, "utf8"), /no_action/);
  const second = await runCycle({ ...opts, runId: "t-receipt-2" }, deps);
  assert.equal(second.pending_total, 0, "영수증 기록 후 재판단 없어야 함");
});

test("runCycle: 중간 신뢰 not_task 는 영수증 없이 pending 유지(재판단 허용)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ai-receipt2-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeWorkmetaFixture(root);
  const summary = await runCycle({
    apply: true, json: true, db: "data/dev-erp.db", workmeta: root, dataDir: join(root, "appdata"),
    projects: [], limit: 12, provider: "ollama", fallback: "skip", knowledge: false, skipContext: true,
    receipts: true, runId: "t-med",
  }, {
    exec: async () => ({ stdout: "{}" }),
    classify: async (items) => ({ judged: items.length, candidates: {}, skipped: items.map((i) => ({ history_key: i.history_key, reason: "not_task", confidence: "medium" })), errors: [] }),
    appendEvent: null,
  });
  assert.equal(summary.receipts.written, 0);
  assert.ok(!existsSync(join(root, "P99-001", "reports", "haengbogwan_mail_receipts", "mail_receipts.csv")));
});

test("shouldRunAutoIntake: 신규 유입 있을 때만(ALWAYS 로 상시)", () => {
  const off = { enabled: false, always: false };
  const on = { enabled: true, always: false };
  assert.equal(shouldRunAutoIntake({ ingest: { new: 3 } }, off), false);
  assert.equal(shouldRunAutoIntake({ ingest: { new: 0 }, fetch: { new_events: 0 } }, on), false);
  assert.equal(shouldRunAutoIntake({ ingest: { new: 2 } }, on), true);
  assert.equal(shouldRunAutoIntake({ route_backfill: { moved: 1 } }, on), true);
  assert.equal(shouldRunAutoIntake({}, { enabled: true, always: true }), true);
  assert.equal(autoIntakeConfig({ DEV_ERP_AUTO_INTAKE: "1" }).enabled, true);
  assert.equal(autoIntakeConfig({}).enabled, false);
});
