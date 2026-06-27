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
import { ledgerExitCode } from "../tools/haengbogwan_apply.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_apply.mjs");
const RAW_SENTINEL = "RAW_BODY_SENTINEL_MUST_NOT_APPEAR";

const MAIL_HEADERS = ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID", "마감일", "본문경로"];
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
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-apply-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function taskLedgerPath(root, project) {
  return join(root, project, TASK_LEDGER_RELATIVE_PATH);
}

function readTaskLedger(root, project) {
  return readFileSync(taskLedgerPath(root, project), "utf8");
}

function writeApplyFixture(root, project = "P26-014", taskRows = []) {
  const projectRoot = join(root, project);
  const rawPayload = join(root, "_workspaces", project, "raw-mail.eml");
  mkdirSync(dirname(rawPayload), { recursive: true });
  writeFileSync(rawPayload, RAW_SENTINEL);

  writeCsv(
    join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
    MAIL_HEADERS,
    [
      {
        이력키: "M001",
        제목: "deadline review",
        발신자: "sender-a@example.test",
        메일수신시각: "2026-06-26T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-1",
        마감일: "2026-07-03",
        본문경로: rawPayload,
      },
      {
        이력키: "M002",
        제목: "ordinary review",
        발신자: "sender-b@example.test",
        메일수신시각: "2026-06-27T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-2",
        마감일: "",
        본문경로: "",
      },
    ]
  );
  writeCsv(join(projectRoot, TASK_LEDGER_RELATIVE_PATH), TASK_HEADERS, taskRows);
}

function runApply(workmetaRoot, project, extraArgs = []) {
  return spawnSync(process.execPath, [
    TOOL,
    "--workmeta-root",
    workmetaRoot,
    "--project",
    project,
    "--today",
    "2026-06-27",
    "--limit",
    "10",
    "--json",
    ...extraArgs,
  ], { encoding: "utf8" });
}

test("HAENGBOGWAN-APPLY: dry-run reports candidates and leaves task ledger untouched", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeApplyFixture(tmp.root, project);

    const result = runApply(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.project_id, project);
    assert.equal(report.apply, false);
    assert.equal(report.body_access, "metadata_only");
    assert.equal(report.candidate_count, 2);
    assert.deepEqual(report.candidate_keys, ["M001", "M002"]);
    assert.equal(report.context_boundary.metadata_only, true);
    assert.equal(report.ledger_exit_code, 0);
    assert.equal(report.ledger_args_summary.invoked, true);
    assert.equal(report.ledger_args_summary.forwarded.auto_open, false);
    assert.equal(report.ledger_args_summary.forwarded.apply, false);
    assert.match(report.ledger_stdout, /dry-run/);
    assert.equal(JSON.stringify(report).includes(RAW_SENTINEL), false);
    assert.equal(JSON.stringify(report).includes(tmp.root), false);
    assert.equal(report.ledger_stdout.includes(tmp.root), false);

    const taskText = readTaskLedger(tmp.root, project);
    assert.equal(taskText.includes("mailtask:"), false);
    assert.equal(taskText.includes(RAW_SENTINEL), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-APPLY: apply forwards explicit flags and writes only temp fixture task rows", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeApplyFixture(tmp.root, project);

    const result = runApply(tmp.root, project, ["--apply", "--stage", "CDR", "--auto-open"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apply, true);
    assert.equal(report.candidate_count, 2);
    assert.equal(report.ledger_exit_code, 0);
    assert.equal(report.ledger_args_summary.forwarded.stage, "CDR");
    assert.equal(report.ledger_args_summary.forwarded.auto_open, true);
    assert.match(report.ledger_stdout, /\[apply\]/);
    assert.equal(JSON.stringify(report).includes(tmp.root), false);

    const taskText = readTaskLedger(tmp.root, project);
    assert.equal(taskText.includes("mailtask:M001"), true);
    assert.equal(taskText.includes("mailtask:M002"), true);
    assert.equal(taskText.includes(RAW_SENTINEL), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-APPLY: no candidates skip ledger subprocess", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeApplyFixture(tmp.root, project, [
      {
        할일키: "mailtask:M001",
        프로젝트코드: project,
        할일명: "converted one",
        담당자: "team:dev",
        업무유형: "review",
        상태: "open",
        마감일: "2026-07-03",
        완료기준: "tracked",
        검토상태: "ready",
        관련메일이력키: "mailcsv:M001",
      },
      {
        할일키: "mailtask:M002",
        프로젝트코드: project,
        할일명: "converted two",
        담당자: "team:dev",
        업무유형: "review",
        상태: "open",
        마감일: "",
        완료기준: "tracked",
        검토상태: "ready",
        관련메일이력키: "mailcsv:M002",
      },
    ]);

    const result = runApply(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.candidate_count, 0);
    assert.deepEqual(report.candidate_keys, []);
    assert.equal(report.skipped_reason, "no_candidates");
    assert.equal(report.ledger_exit_code, null);
    assert.equal(report.ledger_stdout, "");
    assert.equal(report.ledger_stderr, "");
    assert.equal(report.ledger_args_summary.invoked, false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-APPLY: CLI help smoke", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run is the default/);
});

test("HAENGBOGWAN-APPLY: signal-terminated ledger subprocess is not reported as success", () => {
  assert.equal(ledgerExitCode({ status: 0, signal: null }), 0);
  assert.equal(ledgerExitCode({ status: 2, signal: null }), 2);
  assert.equal(ledgerExitCode({ status: null, signal: "SIGTERM" }), 1);
  assert.equal(ledgerExitCode({ status: undefined, error: new Error("spawn failed") }), 1);
});
