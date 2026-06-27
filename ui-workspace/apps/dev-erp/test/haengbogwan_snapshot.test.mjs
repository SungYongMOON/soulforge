import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  MAIL_LEDGER_RELATIVE_PATH,
  TASK_LEDGER_RELATIVE_PATH,
} from "../tools/haengbogwan_context_packet.mjs";
import { HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH } from "../tools/mail_to_task_pending.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_snapshot.mjs");

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
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function runSnapshot(workmetaRoot, project = "P26-014") {
  return spawnSync(process.execPath, [
    TOOL,
    "--workmeta-root",
    workmetaRoot,
    "--project",
    project,
    "--today",
    "2026-06-27",
    "--json",
  ], { encoding: "utf8" });
}

test("HAENGBOGWAN-SNAPSHOT: pending mail excludes converted rows and task buckets are deterministic", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    const projectRoot = join(tmp.root, project);
    writeCsv(
      join(projectRoot, "reports", "메일_이력", "메일_이력.csv"),
      ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID"],
      [
        { 이력키: "M001", 제목: "converted by mailtask", 발신자: "a@example.test", 메일수신시각: "2026-06-26T09:00:00+09:00", 메일함: "team@example.test", 메일소스ID: "SRC-1" },
        { 이력키: "M002", 제목: "still pending", 발신자: "b@example.test", 메일수신시각: "2026-06-26T10:00:00+09:00", 메일함: "team@example.test", 메일소스ID: "SRC-2" },
        { 이력키: "M003", 제목: "converted by mailcsv ref", 발신자: "c@example.test", 메일수신시각: "2026-06-26T11:00:00+09:00", 메일함: "team@example.test", 메일소스ID: "SRC-3" },
      ]
    );
    writeCsv(
      join(projectRoot, "reports", "할일_장부", "할일_장부.csv"),
      ["할일키", "프로젝트코드", "할일명", "담당자", "업무유형", "상태", "마감일", "완료기준", "관련메일이력키", "관련메일소스ID", "검토상태", "제안담당자", "비고"],
      [
        { 할일키: "mailtask:M001", 프로젝트코드: project, 할일명: "reply today", 담당자: "team:dev", 업무유형: "answer", 상태: "open", 마감일: "2026-06-27", 완료기준: "reply sent", 관련메일이력키: "mailcsv:M001", 관련메일소스ID: "SRC-1", 검토상태: "ready", 제안담당자: "", 비고: "" },
        { 할일키: "T-overdue", 프로젝트코드: project, 할일명: "late review", 담당자: "team:dev", 업무유형: "review", 상태: "open", 마감일: "2026-06-26", 완료기준: "review noted", 관련메일이력키: "", 관련메일소스ID: "", 검토상태: "ready", 제안담당자: "", 비고: "" },
        { 할일키: "T-unclassified", 프로젝트코드: project, 할일명: "needs owner triage", 담당자: "", 업무유형: "", 상태: "unclassified", 마감일: "", 완료기준: "", 관련메일이력키: "", 관련메일소스ID: "", 검토상태: "needs_review", 제안담당자: "", 비고: "" },
        { 할일키: "T-blocked", 프로젝트코드: project, 할일명: "blocked item", 담당자: "team:dev", 업무유형: "verify", 상태: "blocked", 마감일: "2026-06-28", 완료기준: "evidence checked", 관련메일이력키: "", 관련메일소스ID: "", 검토상태: "ready", 제안담당자: "", 비고: "" },
        { 할일키: "T-waiting", 프로젝트코드: project, 할일명: "waiting reply", 담당자: "team:dev", 업무유형: "answer", 상태: "open", 마감일: "2026-06-28", 완료기준: "customer reply logged", 관련메일이력키: "", 관련메일소스ID: "", 검토상태: "waiting_on_customer", 제안담당자: "", 비고: "" },
        { 할일키: "T-mailcsv", 프로젝트코드: project, 할일명: "converted side ref", 담당자: "team:dev", 업무유형: "review", 상태: "open", 마감일: "2026-06-28", 완료기준: "tracked", 관련메일이력키: "mailcsv:M003", 관련메일소스ID: "SRC-3", 검토상태: "ready", 제안담당자: "", 비고: "" },
      ]
    );

    const result = runSnapshot(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const [snapshot] = JSON.parse(result.stdout);
    assert.equal(snapshot.project_id, project);
    assert.equal(snapshot.pending_mail_count, 1);
    assert.equal(snapshot.unclassified_task_count, 1);
    assert.equal(snapshot.due_today_count, 1);
    assert.equal(snapshot.overdue_count, 1);
    assert.equal(snapshot.blocked_count, 1);
    assert.equal(snapshot.waiting_count, 1);
    assert.equal(snapshot.needs_quick_triage_count, 1);
    assert.deepEqual(snapshot.due_today.map((row) => row.task_key), ["mailtask:M001"]);
    assert.deepEqual(snapshot.overdue.map((row) => row.task_key), ["T-overdue"]);
    assert.deepEqual(snapshot.blocked.map((row) => row.task_key), ["T-blocked"]);
    assert.deepEqual(snapshot.waiting.map((row) => row.task_key), ["T-waiting"]);
    assert.equal(snapshot.needs_quick_triage.some((row) => row.task_key === "T-unclassified"), true);
    assert.deepEqual(
      snapshot.needs_quick_triage.find((row) => row.task_key === "T-unclassified").reasons,
      ["unclassified", "missing_due", "missing_assignee"]
    );
    assert.ok(snapshot.next_actions.includes("pending_mail:1:classify_mail_to_task"));
    assert.ok(snapshot.next_actions.includes("quick_triage:1:resolve_top_items"));
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-SNAPSHOT: pending mail excludes metadata-only reference receipts", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    const projectRoot = join(tmp.root, project);
    writeCsv(
      join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
      ["history_key", "title", "received_at", "mailbox", "mail_source_id"],
      [
        { history_key: "M001", title: "FYI test report", received_at: "2026-06-27T11:00:00+09:00", mailbox: "team@example.test", mail_source_id: "SRC-1" },
        { history_key: "M002", title: "reply response requested", received_at: "2026-06-27T10:00:00+09:00", mailbox: "team@example.test", mail_source_id: "SRC-2" },
      ]
    );
    writeCsv(
      join(projectRoot, TASK_LEDGER_RELATIVE_PATH),
      ["task_key", "title", "work_type", "status", "due", "completion_criteria", "source_mail_ref"],
      []
    );
    writeCsv(
      join(projectRoot, HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH),
      ["receipt_key", "history_key", "disposition", "status", "source_mail_ref", "body_access"],
      [
        { receipt_key: "mailreceipt:M001:reference_only", history_key: "M001", disposition: "reference_only", status: "reference_only", source_mail_ref: "mailcsv:M001", body_access: "metadata_only" },
      ]
    );

    const result = runSnapshot(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const [snapshot] = JSON.parse(result.stdout);
    assert.equal(snapshot.pending_mail_count, 1);
    assert.ok(snapshot.next_actions.includes("pending_mail:1:classify_mail_to_task"));
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-SNAPSHOT: raw pointers are reported as skipped metadata and project traversal is rejected", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    const rawRoot = join(tmp.root, "_workspaces", project);
    mkdirSync(rawRoot, { recursive: true });
    const rawPayload = join(rawRoot, "mail_body.eml");
    writeFileSync(rawPayload, "THIS_RAW_PAYLOAD_MUST_NOT_APPEAR");

    const projectRoot = join(tmp.root, project);
    writeCsv(
      join(projectRoot, "reports", "메일_이력", "메일_이력.csv"),
      ["이력키", "제목", "원문경로"],
      [{ 이력키: "M100", 제목: "raw pointer only", 원문경로: rawPayload }]
    );
    writeCsv(
      join(projectRoot, "reports", "할일_장부", "할일_장부.csv"),
      ["할일키", "할일명", "업무유형", "상태", "마감일", "완료기준", "연결대상"],
      [{ 할일키: "T-raw", 할일명: "metadata task", 업무유형: "review", 상태: "open", 마감일: "2026-06-27", 완료기준: "metadata checked", 연결대상: "_workspaces/P26-014/mail_body.eml" }]
    );

    const result = runSnapshot(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("THIS_RAW_PAYLOAD_MUST_NOT_APPEAR"), false);
    assert.equal(result.stdout.includes(rawPayload), false);
    const [snapshot] = JSON.parse(result.stdout);
    assert.equal(snapshot.raw_boundary_skip_count, 2);
    assert.ok(snapshot.raw_boundary_skips.some((skip) => skip.source === "mail_history" && skip.field === "원문경로"));
    assert.ok(snapshot.raw_boundary_skips.some((skip) => skip.source === "task_ledger" && skip.reason === "workspace_payload_not_read"));

    const traversal = runSnapshot(tmp.root, "..\\escape");
    assert.equal(traversal.status, 2);
    assert.match(traversal.stderr, /unsafe_project_id/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-SNAPSHOT: path-like assignees are not treated as real owners", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    const projectRoot = join(tmp.root, project);
    writeCsv(
      join(projectRoot, "reports", "할일_장부", "할일_장부.csv"),
      ["task_key", "title", "assignee_ref", "work_type", "status", "due", "completion_criteria", "review_status"],
      [
        {
          task_key: "T-path-assignee",
          title: "path-like assignee",
          assignee_ref: "_workmeta/P26-014/runs/imported_mail",
          work_type: "review",
          status: "open",
          due: "2026-06-28",
          completion_criteria: "metadata checked",
          review_status: "ready",
        },
        {
          task_key: "T-project-assignee",
          title: "project-code assignee",
          assignee_ref: "P26-014",
          work_type: "review",
          status: "open",
          due: "2026-06-28",
          completion_criteria: "metadata checked",
          review_status: "ready",
        },
      ]
    );

    const result = runSnapshot(tmp.root, project);
    assert.equal(result.status, 0, result.stderr);
    const [snapshot] = JSON.parse(result.stdout);
    assert.equal(snapshot.needs_quick_triage_count, 2);
    for (const taskKey of ["T-path-assignee", "T-project-assignee"]) {
      const triage = snapshot.needs_quick_triage.find((row) => row.task_key === taskKey);
      assert.ok(triage);
      assert.equal(triage.assignee, "");
      assert.deepEqual(triage.reasons, ["missing_assignee"]);
    }
  } finally {
    tmp.cleanup();
  }
});
