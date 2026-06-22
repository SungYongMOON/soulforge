import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  runOutlookMailReconcile,
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
  "메일수신시각",
  "메일함",
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

async function createRepoRoot() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-outlook-reconcile-"));
  await mkdir(path.join(repoRoot, "_workmeta", "system", "runs"), { recursive: true });
  return repoRoot;
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
