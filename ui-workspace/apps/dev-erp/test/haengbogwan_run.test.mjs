import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  MAIL_LEDGER_RELATIVE_PATH,
  TASK_LEDGER_RELATIVE_PATH,
} from "../tools/haengbogwan_context_packet.mjs";
import { PROJECT_CONTEXT_FILES } from "../tools/haengbogwan_project_context.mjs";
import { HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH } from "../tools/mail_to_task_pending.mjs";
import { HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH } from "../tools/haengbogwan_task_decisions.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_run.mjs");
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
  writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`);
}

function makeTempWorkmeta() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-run-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeRunFixture(root, project = "P26-014", taskRows = []) {
  const projectRoot = join(root, project);
  writeCsv(
    join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
    MAIL_HEADERS,
    [
      {
        [MAIL_HEADERS[0]]: "M001",
        [MAIL_HEADERS[1]]: "FYI test report",
        [MAIL_HEADERS[2]]: "sender-a@example.test",
        [MAIL_HEADERS[3]]: "2026-06-27T11:00:00+09:00",
        [MAIL_HEADERS[4]]: "team@example.test",
        [MAIL_HEADERS[5]]: "SRC-1",
        [MAIL_HEADERS[6]]: "",
      },
      {
        [MAIL_HEADERS[0]]: "M002",
        [MAIL_HEADERS[1]]: "reply response requested",
        [MAIL_HEADERS[2]]: "sender-b@example.test",
        [MAIL_HEADERS[3]]: "2026-06-27T10:00:00+09:00",
        [MAIL_HEADERS[4]]: "team@example.test",
        [MAIL_HEADERS[5]]: "SRC-2",
        [MAIL_HEADERS[6]]: "",
      },
    ]
  );
  writeCsv(
    join(projectRoot, TASK_LEDGER_RELATIVE_PATH),
    TASK_HEADERS,
    taskRows
  );
}

function runTool(workmetaRoot, project, extraArgs = []) {
  return spawnSync(process.execPath, [
    TOOL,
    "--workmeta-root",
    workmetaRoot,
    "--project",
    project,
    "--today",
    "2026-06-27",
    "--limit",
    "1",
    "--json",
    ...extraArgs,
  ], { encoding: "utf8" });
}

test("HAENGBOGWAN-RUN: dry-run summarizes snapshot and candidates without writing receipts", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeRunFixture(tmp.root, project);

    const result = runTool(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply, false);
    assert.equal(report.body_access, "metadata_only");
    assert.equal(report.project_count, 1);
    assert.equal(report.totals.pending_mail_count, 2);
    assert.equal(report.totals.candidate_count, 0);
    assert.equal(report.totals.reference_only_skip_count, 1);
    assert.equal(report.totals.reference_receipt_written, 0);
    assert.equal(existsSync(join(tmp.root, project, HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH)), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-RUN: apply writes reference receipt and next dry-run reaches following mail", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeRunFixture(tmp.root, project);

    const first = runTool(tmp.root, project, ["--apply"]);
    assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout);
    assert.equal(firstReport.totals.candidate_count, 0);
    assert.equal(firstReport.totals.reference_receipt_written, 1);

    const receiptText = readFileSync(join(tmp.root, project, HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH), "utf8");
    assert.equal(receiptText.includes("mailreceipt:M001:reference_only"), true);

    const second = runTool(tmp.root, project);
    assert.equal(second.status, 0, second.stderr);
    const secondReport = JSON.parse(second.stdout);
    assert.equal(secondReport.totals.pending_mail_count, 1);
    assert.equal(secondReport.totals.candidate_count, 1);
    assert.deepEqual(secondReport.projects[0].apply_report.candidate_keys, ["M002"]);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-RUN: triage queue ranks overdue unclassified task rows", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeRunFixture(tmp.root, project, [
      {
        [TASK_HEADERS[0]]: "T-overdue",
        [TASK_HEADERS[1]]: project,
        [TASK_HEADERS[2]]: "late triage item",
        [TASK_HEADERS[3]]: "",
        [TASK_HEADERS[4]]: "",
        [TASK_HEADERS[5]]: "open",
        [TASK_HEADERS[6]]: "2026-06-26",
        [TASK_HEADERS[7]]: "",
        [TASK_HEADERS[8]]: "needs_review",
        [TASK_HEADERS[9]]: "",
      },
    ]);

    const result = runTool(tmp.root, project, ["--triage-limit", "5"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.totals.triage_queue_count, 1);
    const [item] = report.projects[0].triage_queue;
    assert.equal(item.task_key, "T-overdue");
    assert.equal(item.score, 110);
    assert.deepEqual(item.reasons.sort(), ["missing_assignee", "overdue", "unclassified"].sort());
    assert.match(item.next_action, /today|snooze|close/i);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-RUN: apply-context updates project_context from metadata mail and task state", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeRunFixture(tmp.root, project, [
      {
        [TASK_HEADERS[0]]: "T-context",
        [TASK_HEADERS[1]]: project,
        [TASK_HEADERS[2]]: "context sync triage item",
        [TASK_HEADERS[3]]: "",
        [TASK_HEADERS[4]]: "",
        [TASK_HEADERS[5]]: "open",
        [TASK_HEADERS[6]]: "2026-06-26",
        [TASK_HEADERS[7]]: "",
        [TASK_HEADERS[8]]: "needs_review",
        [TASK_HEADERS[9]]: "mailcsv:M001",
      },
    ]);

    const result = runTool(tmp.root, project, ["--triage-limit", "5", "--apply-context"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply_context, true);
    assert.equal(report.projects[0].context_report.apply, true);
    assert.equal(report.projects[0].context_report.context_event_count > 0, true);
    assert.equal(report.totals.context_apply_project_count, 1);

    const projectRoot = join(tmp.root, project);
    const sourcesText = readFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.sources), "utf8");
    const nodesText = readFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.nodes), "utf8");
    assert.equal(sourcesText.includes("metadata_only"), true);
    assert.equal(nodesText.includes("task_candidate"), true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-RUN: active snooze receipts remove tasks from current triage queue", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeRunFixture(tmp.root, project, [
      {
        [TASK_HEADERS[0]]: "T-snoozed",
        [TASK_HEADERS[1]]: project,
        [TASK_HEADERS[2]]: "snoozed late item",
        [TASK_HEADERS[3]]: "",
        [TASK_HEADERS[4]]: "",
        [TASK_HEADERS[5]]: "open",
        [TASK_HEADERS[6]]: "2026-06-26",
        [TASK_HEADERS[7]]: "",
        [TASK_HEADERS[8]]: "needs_review",
        [TASK_HEADERS[9]]: "",
      },
    ]);
    writeCsv(
      join(tmp.root, project, HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH),
      ["decision_key", "project_id", "task_key", "decision", "status", "snooze_until", "reason", "decided_at", "decided_by", "body_access"],
      [
        { decision_key: "taskdecision:T-snoozed:snooze:2026-06-30", project_id: project, task_key: "T-snoozed", decision: "snooze", status: "active", snooze_until: "2026-06-30", reason: "owner reviewed", decided_at: "2026-06-27T00:00:00.000Z", decided_by: "owner", body_access: "metadata_only" },
      ]
    );

    const result = runTool(tmp.root, project, ["--triage-limit", "5"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.totals.active_snooze_count, 1);
    assert.equal(report.totals.triage_queue_count, 0);
    assert.deepEqual(report.projects[0].triage_queue, []);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-RUN: help smoke", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run is the default/);
});
