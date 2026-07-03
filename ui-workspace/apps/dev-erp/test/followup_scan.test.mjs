import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { parseFollowupArgs, runFollowupScan } from "../tools/followup_scan.mjs";
import { legacyFallbackThreadKey } from "../tools/mail_thread_key.mjs";

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(filePath, headers, rows) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`);
}

function makeProject(root, project = "P99-001", { mailRows = [], taskRows = [] } = {}) {
  const projectRoot = join(root, project);
  writeCsv(
    join(projectRoot, "reports", "메일_이력", "메일_이력.csv"),
    ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID", "이벤트유형", "스레드"],
    mailRows,
  );
  writeCsv(
    join(projectRoot, "reports", "할일_장부", "할일_장부.csv"),
    ["할일키", "상태", "소스스레드키", "마감일", "다음액션"],
    taskRows,
  );
  return projectRoot;
}

function sentRow(key, thread = `T-${key}`, at = "2026-07-01T09:00:00+09:00") {
  return {
    이력키: key,
    제목: `[P99] ${key} 회신 요청`,
    발신자: "owner@example.test",
    메일수신시각: at,
    메일함: "sent@example.test",
    메일소스ID: `src-${key}`,
    이벤트유형: "mail_sent",
    스레드: thread,
  };
}

function receivedRow(key, thread, at = "2026-07-03T09:00:00+09:00") {
  return {
    이력키: key,
    제목: `[P99] ${key} 회신`,
    발신자: "vendor@example.test",
    메일수신시각: at,
    메일함: "inbox@example.test",
    메일소스ID: `src-${key}`,
    이벤트유형: "mail_received",
    스레드: thread,
  };
}

function ledgerExec(root, seenCandidates) {
  return async (cmd, args) => {
    if (args[0] !== "tools/mail_to_task_ledger.mjs") return { stdout: "{}" };
    const project = args[args.indexOf("--project") + 1];
    const candFile = args[args.indexOf("--candidates") + 1];
    const candidates = JSON.parse(readFileSync(candFile, "utf8"));
    seenCandidates.push(candidates);
    const rows = Object.entries(candidates).map(([key, candidate]) => ({
      할일키: `mailtask:${key}`,
      상태: "unclassified",
      소스스레드키: candidate.source_thread_ref || "",
      마감일: candidate.due || "",
      다음액션: "",
    }));
    writeCsv(
      join(root, project, "reports", "할일_장부", "할일_장부.csv"),
      ["할일키", "상태", "소스스레드키", "마감일", "다음액션"],
      rows,
    );
    return { stdout: "{}" };
  };
}

test("parseFollowupArgs: defaults to K-2 3 calendar days and dry-run", () => {
  const opts = parseFollowupArgs(["--project", "P99-001", "--today", "2026-07-04"], {});
  assert.equal(opts.apply, false);
  assert.equal(opts.days, 3);
  assert.equal(opts.limit, 5);
  assert.deepEqual(opts.projects, ["P99-001"]);
});

test("followup_scan: no-reply sent mail creates one needs_review candidate and is idempotent after ledger apply", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-no-reply-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", { mailRows: [sentRow("S1", "T1")] });
  const seenCandidates = [];
  const opts = {
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    db: "data/dev-erp.db",
    today: "2026-07-04",
    days: 3,
    limit: 5,
    projects: ["P99-001"],
    runId: "followup-test",
  };
  const first = await runFollowupScan(opts, { exec: ledgerExec(root, seenCandidates), appendEvent: null });
  const second = await runFollowupScan({ ...opts, runId: "followup-test-2" }, { exec: ledgerExec(root, seenCandidates), appendEvent: null });

  assert.equal(first.no_reply_candidates, 1);
  assert.deepEqual(first.projects["P99-001"].candidate_keys, ["S1"]);
  assert.equal(seenCandidates[0].S1.work_type, "answer");
  assert.equal(seenCandidates[0].S1.review_status, "needs_review");
  assert.equal(seenCandidates[0].S1.suggested_assignee_ref, "owner@example.test");
  assert.equal(seenCandidates[0].S1.due, "2026-07-06");
  assert.equal(second.no_reply_candidates, 0);
});

test("followup_scan: later inbound mail in the same thread suppresses no-reply candidate", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-replied-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", { mailRows: [sentRow("S1", "T1"), receivedRow("R1", "T1")] });
  const summary = await runFollowupScan({
    apply: false,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
  });
  assert.equal(summary.no_reply_candidates, 0);
  assert.equal(summary.projects["P99-001"].skipped_replied, 1);
});

test("followup_scan: missing outbound direction signal disables no-reply track for that project", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-no-direction-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const unknown = sentRow("S1", "T1");
  for (const key of Object.keys(unknown)) {
    if (unknown[key] === "mail_sent") unknown[key] = "mail_archived";
    if (unknown[key] === "sent@example.test") unknown[key] = "archive@example.test";
  }
  makeProject(root, "P99-001", { mailRows: [unknown] });
  const summary = await runFollowupScan({
    apply: false,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
  });
  assert.equal(summary.track_a_enabled, false);
  assert.equal(summary.track_a_disabled_projects, 1);
  assert.equal(summary.no_reply_candidates, 0);
  assert.equal(summary.projects["P99-001"].track_a_enabled, false);
  assert.equal(summary.projects["P99-001"].track_a_disabled_reason, "no_outbound_direction_signal");
});

test("followup_scan: open task in same thread emits followup_due event only and cursor dedups", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-open-thread-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", {
    mailRows: [sentRow("S1", "T1")],
    taskRows: [{ 할일키: "mailtask:OLD", 상태: "open", 소스스레드키: "T1", 마감일: "", 다음액션: "" }],
  });
  const events = [];
  const opts = {
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
    runId: "event-only",
  };
  const first = await runFollowupScan(opts, { appendEvent: (event) => events.push(event) });
  const second = await runFollowupScan({ ...opts, runId: "event-only-2" }, { appendEvent: (event) => events.push(event) });
  assert.equal(first.no_reply_candidates, 0);
  assert.equal(first.no_reply_events, 1);
  assert.equal(second.no_reply_events, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "followup_due");
  assert.equal(events[0].item_ref, "mailtask:OLD");
  assert.ok(existsSync(join(root, "data", "followup_cursor.json")));
});

test("followup_scan: legacy fallback thread key aliases still match open tasks", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-legacy-thread-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const legacy = legacyFallbackThreadKey({ subject: "전달사항 검토 요청", from: "owner@example.test" });
  makeProject(root, "P99-001", {
    mailRows: [{ ...sentRow("S1", "", "2026-07-01T09:00:00+09:00"), 제목: "전달사항 검토 요청" }],
    taskRows: [{ 할일키: "mailtask:OLD", 상태: "open", 소스스레드키: legacy, 마감일: "", 다음액션: "" }],
  });
  const events = [];
  const summary = await runFollowupScan({
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
    runId: "legacy-thread",
  }, { appendEvent: (event) => events.push(event) });

  assert.equal(summary.no_reply_candidates, 0);
  assert.equal(summary.no_reply_events, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "followup_due");
  assert.equal(events[0].item_ref, "mailtask:OLD");
  assert.match(events[0].note, /thread=thread-fallback:/);
});

test("followup_scan: numeric-looking history keys do not partially match sibling mail", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-colon-key-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", {
    mailRows: [
      sentRow("outlook:sent", "T-base"),
      sentRow("outlook:sent:123", "T-numbered"),
    ],
    taskRows: [{ 할일키: "mailtask:outlook:sent:123", 상태: "done", 소스스레드키: "T-numbered", 마감일: "", 다음액션: "" }],
  });
  const summary = await runFollowupScan({
    apply: false,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
  });

  assert.equal(summary.no_reply_candidates, 1);
  assert.deepEqual(summary.projects["P99-001"].candidate_keys, ["outlook:sent"]);
});

test("followup_scan: converted no-reply mail attaches followup_due to existing task without duplicate", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-converted-open-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", {
    mailRows: [sentRow("S1", "", "2026-07-01T09:00:00+09:00")],
    taskRows: [{ 할일키: "mailtask:S1", 상태: "open", 소스스레드키: "", 마감일: "", 다음액션: "" }],
  });
  const events = [];
  const opts = {
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
    runId: "converted-open",
  };
  const first = await runFollowupScan(opts, { appendEvent: (event) => events.push(event) });
  const second = await runFollowupScan({ ...opts, runId: "converted-open-2" }, { appendEvent: (event) => events.push(event) });

  assert.equal(first.no_reply_candidates, 0);
  assert.equal(first.no_reply_events, 1);
  assert.equal(first.converted_no_reply_events, 1);
  assert.equal(first.projects["P99-001"].converted_no_reply_events, 1);
  assert.deepEqual(first.projects["P99-001"].candidate_keys, []);
  assert.equal(second.no_reply_events, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "followup_due");
  assert.equal(events[0].item_ref, "mailtask:S1");
});

test("followup_scan: converted closed no-reply mail is counted but not duplicated", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-converted-closed-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", {
    mailRows: [sentRow("S1", "", "2026-07-01T09:00:00+09:00")],
    taskRows: [{ 할일키: "mailtask:S1", 상태: "done", 소스스레드키: "", 마감일: "", 다음액션: "" }],
  });
  const summary = await runFollowupScan({
    apply: false,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    projects: ["P99-001"],
  });

  assert.equal(summary.no_reply_candidates, 0);
  assert.equal(summary.no_reply_events, 0);
  assert.equal(summary.converted_closed_no_reply, 1);
  assert.equal(summary.projects["P99-001"].converted_closed_no_reply, 1);
  assert.equal(summary.projects["P99-001"].skipped_converted, 1);
  assert.deepEqual(summary.projects["P99-001"].candidate_keys, []);
});

test("followup_scan: due reminder event is cursor-deduped", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-due-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", {
    taskRows: [{ 할일키: "T-due", 상태: "open", 소스스레드키: "", 마감일: "2026-07-05", 다음액션: "" }],
  });
  const events = [];
  const opts = {
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    reminderDays: 2,
    projects: ["P99-001"],
    runId: "due-reminder",
  };
  const first = await runFollowupScan(opts, { appendEvent: (event) => events.push(event) });
  const second = await runFollowupScan({ ...opts, runId: "due-reminder-2" }, { appendEvent: (event) => events.push(event) });
  assert.equal(first.due_reminders, 1);
  assert.equal(second.due_reminders, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "due_reminder");
  assert.equal(events[0].item_ref, "T-due");
});

test("followup_scan: due reminder cursor is not written when no event sink accepts it", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-due-no-sink-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001");
  writeCsv(
    join(root, "P99-001", "reports", "할일_장부", "할일_장부.csv"),
    ["id", "status", "source_thread_ref", "due", "next_action"],
    [{ id: "T-due", status: "open", source_thread_ref: "", due: "2026-07-05", next_action: "" }],
  );
  const summary = await runFollowupScan({
    apply: true,
    workmeta: root,
    dataDir: join(root, "data"),
    db: join(root, "missing.db"),
    today: "2026-07-04",
    reminderDays: 2,
    projects: ["P99-001"],
    runId: "due-no-sink",
  }, { appendEvent: null });
  assert.equal(summary.due_reminders, 1);
  assert.equal(summary.cursor_written, 0);
  assert.equal(existsSync(join(root, "data", "followup_cursor.json")), false);
});

test("followup_scan: per-project limit truncates no-reply candidate generation", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "sf-followup-limit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeProject(root, "P99-001", { mailRows: ["S1", "S2", "S3", "S4", "S5", "S6"].map((key) => sentRow(key, `T-${key}`)) });
  const summary = await runFollowupScan({
    apply: false,
    workmeta: root,
    dataDir: join(root, "data"),
    today: "2026-07-04",
    days: 3,
    limit: 5,
    projects: ["P99-001"],
  });
  assert.equal(summary.no_reply_candidates, 5);
  assert.equal(summary.truncated, 1);
  assert.equal(summary.projects["P99-001"].candidate_keys.length, 5);
});
