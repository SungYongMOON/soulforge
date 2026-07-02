// test/auto_intake_cycle.test.mjs — 자동 인입 사이클: LLM 분류 어댑터 검증 + 오케스트레이터 단위(자식/네트워크 0).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { classifyMailForTasks, intakeLlmProvider } from "../src/llm.mjs";
import { parseCycleArgs, acquireLock, releaseLock, runCycle } from "../tools/auto_intake_cycle.mjs";
import { autoIntakeConfig, shouldRunAutoIntake } from "../src/mail_collect.mjs";

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
    "이력키,제목,발신자,메일수신시각,메일함,메일소스ID\n20260701-001,[P99] 견적 검토 요청,vendor@example.com,2026-07-01T09:00:00,user@example.com,src-1\n");
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
