import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import {
  MAIL_LEDGER_RELATIVE_PATH,
  TASK_LEDGER_RELATIVE_PATH,
} from "../tools/haengbogwan_context_packet.mjs";
import {
  PROJECT_CONTEXT_FILES,
} from "../tools/haengbogwan_project_context.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_run.mjs");
const PRIVATE_SENTINEL = "PRIVATE_READING_RUN_BODY_SENTINEL_DO_NOT_EMIT";

const MAIL_HEADERS = ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID", "마감일"];
const TASK_HEADERS = ["할일키", "프로젝트코드", "할일명", "담당자", "업무유형", "상태", "마감일", "완료기준", "검토상태", "관련메일이력키"];

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(filePath, headers, rows) {
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

function makeTempRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-reading-run-"));
  return {
    root,
    repoRoot: join(root, "runtime"),
    workmetaRoot: join(root, "_workmeta"),
    dbPath: join(root, "dev-erp.db"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeEventSink(repoRoot) {
  const eventPath = join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "mail", "events", "hiworks", "2026", "2026-06.jsonl");
  mkdirSync(dirname(eventPath), { recursive: true });
  const row = {
    schema_version: "email.fetch.event.v1",
    event_id: "evt-run-001",
    source: "hiworks",
    provider_message_id: "synthetic-run-001",
    thread_id: "thread-run-a",
    subject: "[KVDS] CSCI SDD submit request",
    from: [{ name: "Customer", address: "customer@example.test" }],
    to: [{ name: "Owner", address: "owner@example.test" }],
    cc: [],
    received_at: "2026-06-24T09:00:00+09:00",
    body_text: `${PRIVATE_SENTINEL}\nPlease prepare and send the KVDS CSCI SDD document by 2026-07-03.`,
    body_html: "",
    attachments: [{ name: "private-attachment-name.zip", size: 1234 }],
  };
  writeFileSync(eventPath, `${JSON.stringify(row)}\n`, "utf8");
}

function writeMailDb(dbPath) {
  const store = openStore(dbPath);
  try {
    const result = store.ingestMail({
      id: "MAIL-RUN-1",
      project_code: "P26-014",
      at: "2026-06-24T09:00:00+09:00",
      subject: "[KVDS] CSCI SDD submit request",
      counterpart: "customer@example.test",
      source_ref: "evt-run-001",
      pointer_ref: "_workmeta/P26-014/reports/메일_이력/메일_이력.csv#M001",
      mailbox: "owner@example.test",
      body_preview: "",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  } finally {
    store.db.close();
  }
}

function writeWorkmetaLedgers(workmetaRoot, project = "P26-014") {
  const projectRoot = join(workmetaRoot, project);
  writeCsv(
    join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
    MAIL_HEADERS,
    [{
      이력키: "M001",
      제목: "[KVDS] CSCI SDD submit request",
      발신자: "customer@example.test",
      메일수신시각: "2026-06-24T09:00:00+09:00",
      메일함: "owner@example.test",
      메일소스ID: "evt-run-001",
      마감일: "",
    }],
  );
  writeCsv(join(projectRoot, TASK_LEDGER_RELATIVE_PATH), TASK_HEADERS, []);
}

function runTool(tmp, extraArgs = []) {
  return spawnSync(process.execPath, [
    TOOL,
    "--project", "P26-014",
    "--db", tmp.dbPath,
    "--repo-root", tmp.repoRoot,
    "--workmeta-root", tmp.workmetaRoot,
    "--limit", "5",
    "--body-mode", "two_stage",
    "--json",
    ...extraArgs,
  ], { encoding: "utf8" });
}

test("HAENGBOGWAN-READING-RUN: dry-run links reading candidates to task/context plans without leaking body", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);
    writeWorkmetaLedgers(tmp.workmetaRoot);

    const result = runTool(tmp);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(PRIVATE_SENTINEL), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply.tasks, false);
    assert.equal(report.apply.context, false);
    assert.equal(report.counts.mail, 1);
    assert.equal(report.counts.event_body_read, 1);
    assert.equal(report.counts.candidate_mail, 1);
    assert.equal(report.task_ledger.invoked, true);
    assert.equal(report.task_ledger.ledger_exit_code, 0);
    assert.equal(report.project_context.accepted_event_count, 1);
    assert.equal(report.project_context.apply, false);
    assert.equal(existsSync(join(tmp.workmetaRoot, "P26-014", "project_context")), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING-RUN: apply writes task ledger and project_context metadata only", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);
    writeWorkmetaLedgers(tmp.workmetaRoot);

    const result = runTool(tmp, ["--apply-tasks", "--apply-context", "--stage", "CDR", "--auto-open", "--write-report"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(PRIVATE_SENTINEL), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply.tasks, true);
    assert.equal(report.apply.context, true);
    assert.equal(report.task_ledger.ledger_exit_code, 0);
    assert.equal(report.project_context.accepted_event_count, 1);
    assert.equal(report.report_write.written, true);

    const projectRoot = join(tmp.workmetaRoot, "P26-014");
    const taskText = readFileSync(join(projectRoot, TASK_LEDGER_RELATIVE_PATH), "utf8");
    const contextText = readFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.sources), "utf8")
      + readFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.nodes), "utf8")
      + readFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.judgments), "utf8")
      + readFileSync(join(projectRoot, report.report_write.relpath), "utf8");
    assert.equal(taskText.includes("mailtask:M001"), true);
    assert.equal(contextText.includes("source_event"), true);
    assert.equal(contextText.includes("task_candidate"), true);
    assert.equal(taskText.includes(PRIVATE_SENTINEL), false);
    assert.equal(contextText.includes(PRIVATE_SENTINEL), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING-RUN: apply-knowledge-candidates records only deferred metadata", () => {
  const tmp = makeTempRuntime();
  try {
    tmp.repoRoot = tmp.root;
    tmp.workmetaRoot = join(tmp.root, "_workmeta");
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);
    writeWorkmetaLedgers(tmp.workmetaRoot);

    const result = runTool(tmp, ["--apply-context", "--apply-knowledge-candidates"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(PRIVATE_SENTINEL), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply.knowledge_candidates, true);
    assert.equal(report.knowledge_candidates.appended_count, 1);
    const ledgerText = readFileSync(join(tmp.repoRoot, report.knowledge_candidates.ledger_ref), "utf8");
    assert.equal(ledgerText.includes("knowledge_rag_candidate"), true);
    assert.equal(ledgerText.includes(PRIVATE_SENTINEL), false);
    assert.equal(ledgerText.includes("body_text"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING-RUN: CLI help works", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reading packet/);
  assert.match(result.stdout, /apply-knowledge-candidates/);
});
