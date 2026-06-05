import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";

import {
  buildAssistantDashboard,
  defaultAssistantDashboardPath,
  resolveAssistantDashboardOutputPath,
  validateAssistantDashboard,
  writeAssistantDashboard,
} from "./dashboard.mjs";
import { buildSnapshot } from "../snapshot/producer.mjs";

test("assistant dashboard builds a read-only metadata rollup from project ledgers", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", [
    ["DWL-P00-1", "P00-000_INBOX", "mail", "mail_candidate:p00", "AUV due", "follow_up", "2026-05-30", "~5/30", "subject_date", "open", "Owner", "", "", "", "0", "", "observed", "false", "2026-05-31T00:00:00.000Z", "2026-05-31T00:00:00.000Z"],
    ["DWL-P00-2", "P00-000_INBOX", "mail", "mail_candidate:p00_today", "AUV due today", "follow_up", "2026-05-31T15:00:00+09:00", "~5/31 15:00", "subject_date", "open", "Owner", "", "", "", "0", "", "observed", "false", "2026-05-31T00:00:00.000Z", "2026-05-31T00:00:00.000Z"],
  ]);
  await writeDeadlineRegister(repoRoot, "P26-014", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  await writeReminderLog(repoRoot, "P26-014");
  await writeOpenActions(repoRoot, "P26-014");
  await writeWorkLedger(repoRoot, "P26-014");
  await writeJson(path.join(repoRoot, "guild_hall/state/gateway/mail_work_status/latest.json"), {
    generated_at: "2026-05-31T00:00:00.000Z",
  });
  await writeJson(path.join(repoRoot, "guild_hall/state/gateway/mail_work_status/priority_latest.json"), {
    generated_at: "2026-05-31T00:00:00.000Z",
  });
  await writeSnapshotFixture(repoRoot, "2026-05-28T00:00:00.000Z");

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });
  const validation = validateAssistantDashboard(dashboard);

  assert.equal(validation.ok, true);
  assert.equal(dashboard.status, "ok");
  assert.equal(dashboard.summary.active_deadline_count, 2);
  assert.equal(dashboard.summary.overdue_deadline_count, 1);
  assert.equal(dashboard.summary.due_today_deadline_count, 1);
  assert.equal(dashboard.summary.active_open_action_count, 2);
  assert.equal(dashboard.summary.p00_unresolved_deadline_count, 2);
  assert.equal(dashboard.sections.projects.some((project) => project.project_code === "P26-014"), true);
  assert.equal(dashboard.sections.ai_data_health.find((row) => row.id === "snapshot").status, "stale");
  assert.equal(dashboard.boundary.project_ledgers_are_truth, true);
  assert.equal(dashboard.boundary.raw_mail_body_read, false);
});

test("assistant dashboard writes and validates local state output", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });
  const outputPath = defaultAssistantDashboardPath(repoRoot);
  await writeAssistantDashboard(dashboard, outputPath, { repoRoot });
  const written = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(written.schema_version, "soulforge.assistant_dashboard.v0");
  assert.equal(written.sections.ai_data_health.find((row) => row.id === "snapshot").status, "missing");
  assert.equal(validateAssistantDashboard(written).ok, true);
});

test("assistant dashboard degrades when fresh snapshot violates the snapshot contract", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  await writeJson(path.join(repoRoot, "guild_hall/state/snapshot/soulforge_snapshot.json"), {
    schema_version: "soulforge.snapshot.v0",
    generated_at: "2026-05-31T00:00:00.000Z",
  });

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });
  const snapshotHealth = dashboard.sections.ai_data_health.find((row) => row.id === "snapshot");

  assert.equal(dashboard.status, "degraded");
  assert.equal(snapshotHealth.status, "invalid");
  assert.equal(snapshotHealth.generated_at, "2026-05-31T00:00:00.000Z");
  assert.equal(snapshotHealth.age_hours, 1);
  assert.equal(snapshotHealth.max_age_hours, 48);
  assert.equal(snapshotHealth.reason, "snapshot_contract_invalid");
  assert.equal(snapshotHealth.error_count > 0, true);
  assert.deepEqual(Object.keys(snapshotHealth).sort(), [
    "age_hours",
    "error_count",
    "generated_at",
    "id",
    "max_age_hours",
    "reason",
    "source_ref",
    "status",
  ].sort());
  assert.equal(validateAssistantDashboard(dashboard).ok, true);
  assert.doesNotMatch(JSON.stringify(snapshotHealth), /operation_board|projects|missions|body_text|provider_payload|token/u);
});

test("assistant dashboard keeps valid fresh snapshot health fresh", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  await writeSnapshotFixture(repoRoot, "2026-05-31T00:00:00.000Z");

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });

  assert.equal(dashboard.status, "ok");
  assert.equal(dashboard.sections.ai_data_health.find((row) => row.id === "snapshot").status, "fresh");
  assert.equal(validateAssistantDashboard(dashboard).ok, true);
});

test("assistant dashboard refuses output outside local assistant dashboard state", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });

  assert.throws(
    () => resolveAssistantDashboardOutputPath(repoRoot, "docs/assistant-dashboard.json"),
    /must stay under guild_hall\/state\/assistant_dashboard/,
  );
  await assert.rejects(
    writeAssistantDashboard(dashboard, path.join(repoRoot, "docs/assistant-dashboard.json"), { repoRoot }),
    /must stay under guild_hall\/state\/assistant_dashboard/,
  );
});

test("assistant dashboard degrades and skips unsafe open-action/work text", async () => {
  const repoRoot = await createRepoRoot();
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  await writeUnsafeOpenActions(repoRoot, "P26-014");
  await writeUnsafeWorkLedger(repoRoot, "P26-014");

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });

  assert.equal(dashboard.status, "degraded");
  assert.equal(dashboard.validation.project_ledgers.status, "degraded");
  assert.equal(dashboard.validation.project_ledgers.error_count, 2);
  assert.equal(dashboard.summary.active_open_action_count, 0);
  assert.equal(dashboard.summary.recent_done_count, 0);
  assert.equal(validateAssistantDashboard(dashboard).ok, true);
  assert.doesNotMatch(JSON.stringify(dashboard), /body_text|provider_payload|credential|credentials|api_key|authorization|bearer|session_id|session_cookie|session_token|session_secret|token/u);
});

test("assistant dashboard degrades and skips alias-only unsafe open-action/work text", async () => {
  const repoRoot = await createRepoRoot();
  const openActionAliases = ["credential", "authorization", "bearer", "session_id"];
  const workLedgerAliases = ["credentials", "api_key", "session_cookie", "session_token", "session_secret"];
  await writeDeadlineRegister(repoRoot, "P00-000_INBOX", []);
  await writeReminderLog(repoRoot, "P00-000_INBOX");
  await writeAliasOnlyUnsafeOpenActions(repoRoot, "P26-014", openActionAliases);
  await writeAliasOnlyUnsafeWorkLedger(repoRoot, "P26-014", workLedgerAliases);

  const dashboard = await buildAssistantDashboard({
    repoRoot,
    now: "2026-05-31T10:00:00+09:00",
  });

  assert.equal(dashboard.status, "degraded");
  assert.equal(dashboard.validation.project_ledgers.status, "degraded");
  assert.equal(dashboard.validation.project_ledgers.error_count, openActionAliases.length + workLedgerAliases.length);
  assert.equal(dashboard.summary.active_open_action_count, 0);
  assert.equal(dashboard.summary.recent_done_count, 0);
  assert.equal(validateAssistantDashboard(dashboard).ok, true);
  assert.doesNotMatch(JSON.stringify(dashboard), /credential|credentials|api_key|authorization|bearer|session_id|session_cookie|session_token|session_secret/u);
});

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-assistant-dashboard-"));
}

async function writeDeadlineRegister(repoRoot, projectCode, rows) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "deadline_watch", "deadline_register.csv");
  const header = "deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at";
  await writeText(filePath, `${[header, ...rows.map((row) => row.map(csvEscape).join(","))].join("\n")}\n`);
}

async function writeReminderLog(repoRoot, projectCode) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "deadline_watch", "reminder_event_log.jsonl");
  await writeText(filePath, `${JSON.stringify({
    event_type: "ledger_initialized",
    project_code: projectCode,
    raw_payload_copied: false,
  })}\n`);
}

async function writeOpenActions(repoRoot, projectCode) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "open_actions", "open_action_register.md");
  await writeText(filePath, [
    "# Open Actions",
    "",
    "| ID | Date opened | Priority | Item | Status | Owner/Contact | Next action | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| OA-1 | 2026-05-30 | High | Review input packet | open | User | Review metadata packet | ref |",
    "| OA-2 | 2026-05-29 | Medium | Wait for reply | waiting | Partner | Wait for safe reply evidence | ref |",
    "",
  ].join("\n"));
}

async function writeUnsafeOpenActions(repoRoot, projectCode) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "open_actions", "open_action_register.md");
  await writeText(filePath, [
    "# Open Actions",
    "",
    "| ID | Date opened | Priority | Item | Status | Owner/Contact | Next action | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| OA-raw | 2026-05-30 | High | body_text credential authorization bearer session_id copied here | open | User | Review metadata packet | ref |",
    "",
  ].join("\n"));
}

async function writeAliasOnlyUnsafeOpenActions(repoRoot, projectCode, aliases) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "open_actions", "open_action_register.md");
  const rows = aliases.map((alias, index) => `| OA-alias-${index + 1} | 2026-05-30 | High | ${alias} | open | User | Review metadata packet | ref |`);
  await writeText(filePath, [
    "# Open Actions",
    "",
    "| ID | Date opened | Priority | Item | Status | Owner/Contact | Next action | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n"));
}

async function writeWorkLedger(repoRoot, projectCode) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "작업_장부", "작업_장부.csv");
  await writeText(filePath, [
    "작업키,스키마버전,기록일,시작시각,종료시각,프로젝트코드,담당자,역할,작업구분,작업명,상태,완료여부,완료확인시각,완료확인자,관련메일이력키,관련메일소스ID,관련몬스터ID,관련미션ID,입력참조,산출물참조,다음액션,비고,원문복사여부",
    `DONE-1,soulforge.project_work_ledger.private.v1,2026-05-30,,,${projectCode},User,,history,Recent done,done,true,,,,,,,,,,,false`,
    "",
  ].join("\n"));
}

async function writeUnsafeWorkLedger(repoRoot, projectCode) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "작업_장부", "작업_장부.csv");
  await writeText(filePath, [
    "작업키,스키마버전,기록일,시작시각,종료시각,프로젝트코드,담당자,역할,작업구분,작업명,상태,완료여부,완료확인시각,완료확인자,관련메일이력키,관련메일소스ID,관련몬스터ID,관련미션ID,입력참조,산출물참조,다음액션,비고,원문복사여부",
    `RAW-1,soulforge.project_work_ledger.private.v1,2026-05-30,,,${projectCode},User,,history,provider_payload credentials api_key session_cookie session_token session_secret copied,done,true,,,,,,,,,,,false`,
    "",
  ].join("\n"));
}

async function writeAliasOnlyUnsafeWorkLedger(repoRoot, projectCode, aliases) {
  const filePath = path.join(repoRoot, "_workmeta", projectCode, "reports", "작업_장부", "작업_장부.csv");
  const rows = aliases.map((alias, index) => (
    `ALIAS-${index + 1},soulforge.project_work_ledger.private.v1,2026-05-30,,,${projectCode},User,,history,${alias},done,true,,,,,,,,,,,false`
  ));
  await writeText(filePath, [
    "작업키,스키마버전,기록일,시작시각,종료시각,프로젝트코드,담당자,역할,작업구분,작업명,상태,완료여부,완료확인시각,완료확인자,관련메일이력키,관련메일소스ID,관련몬스터ID,관련미션ID,입력참조,산출물참조,다음액션,비고,원문복사여부",
    ...rows,
    "",
  ].join("\n"));
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeSnapshotFixture(repoRoot, generatedAt) {
  const snapshot = await buildSnapshot({ repoRoot, generatedAt });
  await writeJson(path.join(repoRoot, "guild_hall/state/snapshot/soulforge_snapshot.json"), snapshot);
  return snapshot;
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
