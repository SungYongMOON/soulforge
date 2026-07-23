import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildOutlookSentQueryOnlyPowerShellScript,
  formatOutlookSentQueryOnlyResult,
  parseOutlookSentQueryOnlyArgv,
  runOutlookMailReconcile,
  runOutlookSentQueryOnlyCanary,
  normalizeMailSubject,
  subjectFingerprint,
} from "./outlook_mail_reconcile.mjs";

const HEADERS = [
  "이력키",
  "스키마버전",
  "발생시각",
  "프로젝트코드",
  "단계",
  "몬스터ID",
  "후보ID",
  "이벤트유형",
  "메일소스ID",
  "메일메시지ID",
  "메일수신시각",
  "메일함",
  "수신역할",
  "스레드",
  "제목",
  "발신자",
  "첨부수",
  "작업상태",
  "게이트웨이몬스터참조",
  "프로젝트몬스터참조",
  "파일링패킷참조",
  "미션참조",
  "원문복사여부",
];

test("outlook reconcile applies sent metadata row by exact project subject match", async () => {
  const repoRoot = await createRepoRoot();
  const subject = "RE: [기0탐0000 체계] VOS 예인몸체 예인해석 파라미터 작성 요청의 건";
  await writeProjectMailHistory(repoRoot, "P26-014", [
    {
      "이력키": "received-existing-001",
      "스키마버전": "soulforge.project_mail_history.private.v1",
      "발생시각": "2026-06-12T06:00:00.000Z",
      "프로젝트코드": "P26-014",
      "단계": "mail_received",
      "몬스터ID": "monster_received_001",
      "후보ID": "",
      "이벤트유형": "mail_received",
      "메일소스ID": "outlook:received:existing001",
      "메일수신시각": "2026-06-12T15:00:00+09:00",
      "메일함": "inbox",
      "스레드": "conversation:test",
      "제목": subject,
      "발신자": "sender:fingerprint",
      "첨부수": "1",
      "작업상태": "needs_reply",
      "게이트웨이몬스터참조": "",
      "프로젝트몬스터참조": "",
      "파일링패킷참조": "",
      "미션참조": "",
      "원문복사여부": "false",
    },
  ]);
  await writeProjectMailHistory(repoRoot, "P00-000_INBOX", [
    {
      "이력키": "holding-001",
      "스키마버전": "soulforge.project_mail_history.private.v1",
      "발생시각": "2026-06-21T00:00:00.000Z",
      "프로젝트코드": "P00-000_INBOX",
      "제목": subject,
    },
  ]);
  const fixturePath = path.join(repoRoot, "fixture_outlook.json");
  const normalized = normalizeMailSubject(subject);
  await writeFile(
    fixturePath,
    JSON.stringify({
      outlook_source_alias: "seabot.moon@sonartech.com",
      sent: [
        {
          subject: `RE: ${subject}`,
          subject_normalized: normalized,
          subject_fingerprint: subjectFingerprint(normalized),
          conversation_fingerprint: "conversation:abc123",
          attachment_count: 1,
          message_size_bucket: "200k_1m",
          source_entry_fingerprint: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
          source_folder_alias: "seabot.moon@sonartech.com/보낸 편지함",
          source_id: "outlook:sent:abc123abc123abcd",
          provider_message_id: "<outlook-sent-abc123@example.test>",
          sent_at: "2026-06-21T17:38:43.000+09:00",
          sender_account_alias: "seabot.moon@sonartech.com",
          recipient_count: 2,
          recipient_domain_fingerprints: [],
        },
      ],
      received: [
        {
          received_at: "2026-06-21T17:40:00.000+09:00",
          subject,
          subject_normalized: normalized,
          subject_fingerprint: subjectFingerprint(normalized),
          conversation_fingerprint: "conversation:abc123",
          sender_alias_or_fingerprint: "sender:hash",
          recipient_account_alias: "seabot.moon@sonartech.com",
          attachment_count: 0,
          message_size_bucket: "lt50k",
          source_entry_fingerprint: "def456def456def456def456def456def456def456def456def456def456def4",
          source_folder_alias: "받은 편지함",
          source_id: "outlook:received:def456def456def4",
        },
      ],
    }),
    "utf8",
  );

  const result = await runOutlookMailReconcile({
    repoRoot,
    fixtureOutlookPath: fixturePath,
    apply: true,
    sendReceive: true,
    now: "2026-06-21T09:00:00.000Z",
    windowStart: "2026-06-21T00:00:00.000Z",
    runId: "outlook_mail_reconcile_test_apply",
  });

  assert.equal(result.sent_metadata_rows, 1);
  assert.equal(result.sent_candidate_rows, 1);
  assert.equal(result.sent_applied_rows, 1);
  assert.deepEqual(result.selected_project_codes, ["P26-014"]);
  assert.equal(result.owner_followup_rows, 0);

  const csv = await readFile(path.join(repoRoot, "_workmeta", "P26-014", "reports", "메일_이력", "메일_이력.csv"), "utf8");
  assert.match(csv, /mail_sent_outlook_reconcile/u);
  assert.match(csv, /outlook:sent:abc123abc123abcd/u);
  assert.match(csv, /<outlook-sent-abc123@example.test>/u);
  assert.match(csv, /VOS 예인몸체/u);
  assert.doesNotMatch(csv, /body|body_html|secret|attachment_payload/u);

  const summary = JSON.parse(await readFile(path.join(repoRoot, "_workmeta", "system", "runs", "outlook_mail_reconcile_test_apply", "reconciliation_summary.json"), "utf8"));
  assert.equal(summary.preflight_send_receive.result, "fixture_skipped");
  assert.equal(summary.sent_applied_rows, 1);
});

test("outlook reconcile dry run does not mutate project ledgers", async () => {
  const repoRoot = await createRepoRoot();
  const subject = "[군집] 자료송부 - PMOD 보드 부품발주용 회로도";
  await writeProjectMailHistory(repoRoot, "P24-049", [
    {
      "이력키": "received-existing-001",
      "스키마버전": "soulforge.project_mail_history.private.v1",
      "발생시각": "2026-06-19T00:00:00.000Z",
      "프로젝트코드": "P24-049",
      "이벤트유형": "mail_received",
      "메일소스ID": "outlook:received:old",
      "제목": subject,
      "원문복사여부": "false",
    },
  ]);
  const fixturePath = path.join(repoRoot, "fixture_outlook.json");
  await writeFile(
    fixturePath,
    JSON.stringify({
      sent: [
        {
          subject,
          source_id: "outlook:sent:dryrun001",
          source_entry_fingerprint: "dryrun001dryrun001dryrun001dryrun001dryrun001dryrun001dryrun001d",
          sent_at: "2026-06-21T10:00:00.000+09:00",
          source_folder_alias: "보낸 편지함",
          sender_account_alias: "seabot.moon@sonartech.com",
          attachment_count: 0,
        },
      ],
    }),
    "utf8",
  );
  const before = await readFile(path.join(repoRoot, "_workmeta", "P24-049", "reports", "메일_이력", "메일_이력.csv"), "utf8");
  const result = await runOutlookMailReconcile({
    repoRoot,
    fixtureOutlookPath: fixturePath,
    apply: false,
    now: "2026-06-21T09:00:00.000Z",
    windowStart: "2026-06-21T00:00:00.000Z",
    runId: "outlook_mail_reconcile_test_dry_run",
  });
  const after = await readFile(path.join(repoRoot, "_workmeta", "P24-049", "reports", "메일_이력", "메일_이력.csv"), "utf8");
  assert.equal(result.sent_candidate_rows, 1);
  assert.equal(result.sent_applied_rows, 0);
  assert.equal(after, before);
});

test("sent query-only formatter returns only redacted aggregates and writes nothing", async () => {
  const repoRoot = await createRepoRoot();
  const markerPath = path.join(repoRoot, "marker.txt");
  await writeFile(markerPath, "unchanged\n", "utf8");
  const before = await snapshotTree(repoRoot);

  const result = formatOutlookSentQueryOnlyResult(
    {
      observed_at: "2026-07-22T13:00:01.000Z",
      outlook_available: true,
      sent_items_observed: 3,
      scanned_items: 7,
      truncated_by_max_items: false,
      latest_sent_at: "2026-07-22T12:55:00.000Z",
      earliest_sent_at: "2026-07-22T12:10:00.000Z",
      subject: "LEAK-SENTINEL-SUBJECT",
      source_folder_alias: "LEAK-SENTINEL-FOLDER",
      raw_rows: [{ body: "LEAK-SENTINEL-BODY" }],
    },
    {
      dateWindow: {
        start: "2026-07-22T12:00:00.000Z",
        end: "2026-07-22T13:00:00.000Z",
        duration_hours: 1,
      },
      maxItems: 25,
    },
  );

  const after = await snapshotTree(repoRoot);
  const serialized = JSON.stringify(result);
  assert.deepEqual(after, before);
  assert.equal(result.mode, "query_only_no_persistence");
  assert.equal(result.sent_items_observed, 3);
  assert.equal(result.safety.repository_writes, 0);
  assert.equal(result.safety.temporary_files_created, 0);
  assert.equal(result.safety.inbox_queried, false);
  assert.equal(result.safety.raw_rows_returned, false);
  assert.doesNotMatch(serialized, /LEAK-SENTINEL/u);
  assert.equal(Object.hasOwn(result, "subject"), false);
  assert.equal(Object.hasOwn(result, "source_folder_alias"), false);
  assert.equal(Object.hasOwn(result, "raw_rows"), false);
});

test("sent query-only canary production options reject every non-query key and implicit window", async () => {
  const base = {
    windowStart: "2026-07-22T12:00:00.000Z",
    windowEnd: "2026-07-22T13:00:00.000Z",
  };
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, apply: true }),
    /sent_query_only_forbidden_options:apply/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, sendReceive: true }),
    /sent_query_only_forbidden_options:sendReceive/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, includeInboxSubfolders: true }),
    /sent_query_only_forbidden_options:includeInboxSubfolders/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, projectCodes: ["P26-014"] }),
    /sent_query_only_forbidden_options:projectCodes/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({}),
    /sent_query_only_requires_explicit_window/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, maxItems: true }),
    /sent_query_only_max_items_must_be_1_to_500/u,
  );
  await assert.rejects(
    () => runOutlookSentQueryOnlyCanary({ ...base, collectSentAggregate: async () => ({}) }),
    /sent_query_only_forbidden_options:collectSentAggregate/u,
  );
  for (const invalid of [
    { ...base, windowStart: "not-a-date" },
    { ...base, windowStart: base.windowEnd, windowEnd: base.windowStart },
    { ...base, windowEnd: "2026-07-30T13:00:00.000Z" },
  ]) {
    await assert.rejects(
      () => runOutlookSentQueryOnlyCanary(invalid),
      /sent_query_only_(?:invalid_window|window_exceeds_168_hours)/u,
    );
  }
  for (const maxItems of [0, 501, 1.5, "not-an-integer"]) {
    await assert.rejects(
      () => runOutlookSentQueryOnlyCanary({ ...base, maxItems }),
      /sent_query_only_max_items_must_be_1_to_500/u,
    );
  }
});

test("sent query-only argv parser rejects unknown, positional, duplicate, and missing values", () => {
  assert.deepEqual(
    parseOutlookSentQueryOnlyArgv([
      "--window-start",
      "2026-07-22T12:00:00.000Z",
      "--window-end",
      "2026-07-22T13:00:00.000Z",
      "--max-items",
      "25",
    ]),
    {
      windowStart: "2026-07-22T12:00:00.000Z",
      windowEnd: "2026-07-22T13:00:00.000Z",
      maxItems: "25",
    },
  );
  assert.throws(() => parseOutlookSentQueryOnlyArgv(["unexpected"]), /sent_query_only_positional_argument/u);
  assert.throws(() => parseOutlookSentQueryOnlyArgv(["--output-file", "x"]), /sent_query_only_unknown_option/u);
  assert.throws(() => parseOutlookSentQueryOnlyArgv(["--apply"]), /sent_query_only_unknown_option/u);
  assert.throws(
    () => parseOutlookSentQueryOnlyArgv(["--window-start", "x", "--window-start", "y"]),
    /sent_query_only_duplicate_option/u,
  );
  assert.throws(() => parseOutlookSentQueryOnlyArgv(["--max-items"]), /sent_query_only_missing_value/u);
});

test("sent query-only CLI rejects forbidden and malformed arguments before Outlook access", () => {
  const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.mjs");
  for (const args of [
    ["--apply"],
    ["--send-receive"],
    ["--output-file", "x"],
    ["--max-items"],
    ["positional"],
  ]) {
    const result = spawnSync(process.execPath, [cliPath, "outlook-sent-query-only", ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(String(result.stderr), /sent_query_only_(?:unknown_option|missing_value|positional_argument)/u);
    assert.doesNotMatch(String(result.stdout), /outlook_available|sent_items_observed/u);
  }
});

test("sent query-only PowerShell attaches to active Outlook and never queries Inbox or mail payload fields", () => {
  const script = buildOutlookSentQueryOnlyPowerShellScript({
    dateWindow: {
      start: "2026-07-22T12:00:00.000Z",
      end: "2026-07-22T13:00:00.000Z",
    },
    maxItems: 25,
  });

  assert.match(script, /GetActiveObject\("Outlook\.Application"\)/u);
  assert.match(script, /GetDefaultFolder\(5\)/u);
  assert.doesNotMatch(script, /GetDefaultFolder\(6\)|SendAndReceive|New-Object\s+-ComObject/iu);
  assert.doesNotMatch(script, /\.Subject|\.Body|HTMLBody|SenderEmailAddress|Recipients|Attachments|FolderPath/iu);
  assert.doesNotMatch(
    script,
    /EntryID|ConversationID|Categories|PropertyAccessor|GetRules|\.Rules\b|\.To\b|\.CC\b|\.BCC\b|\.Sender\b/iu,
  );
  assert.doesNotMatch(script, /\.(?:Save|Delete|Move|Send|Close|Display)\s*\(/iu);
  assert.doesNotMatch(script, /Set-Content|Out-File|Add-Content|Export-/iu);
});

async function createRepoRoot() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-outlook-reconcile-"));
  await mkdir(path.join(repoRoot, "_workmeta", "system", "runs"), { recursive: true });
  return repoRoot;
}

async function snapshotTree(root) {
  const entries = [];
  async function visit(current) {
    const names = (await readdir(current)).sort();
    for (const name of names) {
      const absolute = path.join(current, name);
      const info = await stat(absolute);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (info.isDirectory()) {
        entries.push(`d:${relative}`);
        await visit(absolute);
      } else {
        entries.push(`f:${relative}:${info.size}:${Math.trunc(info.mtimeMs)}`);
      }
    }
  }
  await visit(root);
  return entries;
}

async function writeProjectMailHistory(repoRoot, projectCode, rows) {
  const dir = path.join(repoRoot, "_workmeta", projectCode, "reports", "메일_이력");
  await mkdir(dir, { recursive: true });
  const normalizedRows = rows.map((row) => Object.fromEntries(HEADERS.map((header) => [header, row[header] ?? ""])));
  await writeFile(
    path.join(dir, "메일_이력.csv"),
    `\uFEFF${[
      HEADERS.map(csvEscape).join(","),
      ...normalizedRows.map((row) => HEADERS.map((header) => csvEscape(row[header])).join(",")),
    ].join("\n")}\n`,
    "utf8",
  );
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, "\"\"")}"` : text;
}
