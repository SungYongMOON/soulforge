// tools/mail_receipts.mjs — 메일 처분 영수증(mail_receipts.csv) 공용 작성기.
//   목적: "할일 아님/참고만" 판정을 파일로 기억시켜 pending 재판단 루프를 수렴시킨다
//   (mail_to_task_pending.readHandledReceiptKeys 가 disposition=reference_only|no_action 을 처리됨으로 인정).
//   haengbogwan_apply(reference_only)와 auto_intake_cycle(llm not_task)이 같은 헤더/멱등 규칙을 공유한다.
//   metadata-only: 본문·첨부·secret 없음. 절대경로 없음(상대 ref 만).
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH, readHandledReceiptKeys } from "./mail_to_task_pending.mjs";

export const RECEIPT_HEADERS = [
  "receipt_key",
  "history_key",
  "project_id",
  "disposition",
  "status",
  "handled_at",
  "reason",
  "source_event_ref",
  "source_mail_ref",
  "source_mail_source_id",
  "source_lineage_ref",
  "generation_rule_ref",
  "generation_run_ref",
  "body_access",
];

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function mailReceiptPath(workmetaRoot, projectId) {
  return join(workmetaRoot, projectId, HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH);
}

// rows: RECEIPT_HEADERS 필드를 가진 객체 배열(history_key 필수). 이미 처리됨(reference_only/no_action)
// 으로 기록된 이력키는 중복으로 건너뛴다(멱등). 반환: { written, skipped_duplicate, receipt_relpath }.
export function appendMailReceipts({ workmetaRoot, projectId, rows = [] }) {
  const receiptPath = mailReceiptPath(workmetaRoot, projectId);
  const existing = readHandledReceiptKeys(receiptPath);
  const out = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const historyKey = String(row?.history_key ?? "").trim();
    if (!historyKey) continue;
    if (existing.has(historyKey)) { duplicateCount += 1; continue; }
    existing.add(historyKey);
    out.push(row);
  }
  if (out.length) {
    mkdirSync(dirname(receiptPath), { recursive: true });
    const needsHeader = !existsSync(receiptPath);
    const lines = out.map((row) => RECEIPT_HEADERS.map((header) => csvEscape(row[header])).join(","));
    appendFileSync(receiptPath, `${needsHeader ? `${RECEIPT_HEADERS.join(",")}\n` : ""}${lines.join("\n")}\n`, "utf8");
  }
  return {
    written: out.length,
    skipped_duplicate: duplicateCount,
    receipt_relpath: HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH.replace(/\\/g, "/"),
  };
}
