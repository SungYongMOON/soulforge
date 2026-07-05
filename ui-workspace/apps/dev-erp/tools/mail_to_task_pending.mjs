#!/usr/bin/env node
// tools/mail_to_task_pending.mjs — 메일_이력 중 "아직 할일로 변환 안 된" 메일만 결정적으로 추린다.
//   목적: LLM 판단(어떤 메일이 할일인가)을 매번 전체가 아니라 신규 델타에만 돌리게 해 증분/스케줄 가능하게 함.
//   변환됨 판정: 할일_장부.csv 에 할일키 `mailtask:<이력키>` 또는 `mailtask:<이력키>:<n>` 행이 있으면 그 메일은 처리됨.
//   출력은 LLM 후보 입력에 필요한 메타데이터만(제목/발신자/시각/메일함/소스ID/기한힌트). 본문·첨부·secret 미출력(포인터 모델).
// 기본 사람용 요약, --json 이면 기계 입력용 배열. zero-dependency: node:fs/path.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mailHistoryKeyFromMailRef, mailHistoryKeyFromTaskKey, threadKeyAliasesForMail, threadKeyForMail } from "./mail_thread_key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const wmDir = arg("workmeta", join(REPO, "_workmeta"));
const only = arg("project", null);
const asJson = has("json");
const limit = Number(arg("limit", "0")) || 0;

const CODE_RE = /^P\d{2}-\d{3}/;
export const HAENGBOGWAN_MAIL_RECEIPT_RELATIVE_PATH = join("reports", "haengbogwan_mail_receipts", "mail_receipts.csv");
const MAIL_REL = join("reports", "메일_이력", "메일_이력.csv");
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");

export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { if (text[i + 1] !== "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function readCsvObjects(filePath) {
  if (!existsSync(filePath)) return { headers: [], rows: [] };
  const recs = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (!recs.length) return { headers: [], rows: [] };
  const headers = recs[0].map((x) => x.trim().normalize("NFC"));
  const rows = recs.slice(1).map((r) => { const o = {}; headers.forEach((h, i) => (o[h] = String(r[i] ?? "").trim())); return o; });
  return { headers, rows };
}
const firstOf = (o, names) => { for (const n of names) { const v = o[n]; if (v != null && String(v).trim() !== "") return String(v).trim(); } return ""; };

export function haengbogwanMailReceiptPathForTaskCsv(taskCsvPath) {
  return join(dirname(dirname(taskCsvPath)), "haengbogwan_mail_receipts", "mail_receipts.csv");
}

export function readHandledReceiptKeys(receiptCsvPath) {
  const receipt = readCsvObjects(receiptCsvPath);
  const out = new Set();
  for (const row of receipt.rows) {
    const disposition = firstOf(row, ["disposition", "status"]).toLowerCase();
    if (!["reference_only", "no_action"].includes(disposition)) continue;
    const bodyAccess = firstOf(row, ["body_access"]).toLowerCase();
    if (bodyAccess && bodyAccess !== "metadata_only") continue;
    const directKey = firstOf(row, ["history_key"]);
    const sourceMailRef = firstOf(row, ["source_mail_ref"]);
    const refMatch = /^mailcsv:(.+)$/.exec(sourceMailRef);
    const historyKey = directKey || (refMatch ? refMatch[1] : "");
    if (historyKey) out.add(historyKey);
  }
  return out;
}

// 한 프로젝트의 미변환 메일 목록(결정적). converted = 할일_장부의 mailtask:<key> 집합.
export function pendingForProject(mailCsvPath, taskCsvPath) {
  const mail = readCsvObjects(mailCsvPath);
  if (!mail.rows.length) return [];
  const mailKeys = new Set(mail.rows.map((row) => row["이력키"] || "").filter(Boolean));
  const task = readCsvObjects(taskCsvPath);
  const converted = new Set();
  for (const t of task.rows) {
    const taskHistoryKey = mailHistoryKeyFromTaskKey(t["할일키"] || "", mailKeys);
    if (taskHistoryKey) converted.add(taskHistoryKey);
    const ref = t["관련메일이력키"] || ""; // 보조: mailcsv:<key> 형태도 처리됨 표시로 인정
    const refHistoryKey = mailHistoryKeyFromMailRef(ref);
    if (refHistoryKey) converted.add(refHistoryKey);
  }
  for (const key of readHandledReceiptKeys(haengbogwanMailReceiptPathForTaskCsv(taskCsvPath))) converted.add(key);
  const out = [];
  for (const r of mail.rows) {
    const key = r["이력키"] || "";
    if (!key || converted.has(key)) continue;
    const subject = firstOf(r, ["제목"]);
    const from = firstOf(r, ["발신자"]);
    const rawThread = firstOf(r, ["스레드", "스레드키", "메일스레드ID", "스레드ID"]);
    const threadAliases = threadKeyAliasesForMail({ thread: rawThread, subject, from });
    out.push({
      history_key: key,
      subject,
      from,
      received_at: firstOf(r, ["메일수신시각"]),
      mailbox: firstOf(r, ["메일함", "mailbox"]),
      source_id: firstOf(r, ["메일소스ID"]),
      provider_message_id: firstOf(r, ["메일메시지ID", "provider_message_id", "message_id"]),
      list_unsubscribe: firstOf(r, ["List-Unsubscribe", "list_unsubscribe", "수신거부헤더"]),
      recipient_role: firstOf(r, ["수신역할", "recipient_role"]),
      event_type: firstOf(r, ["이벤트유형", "event_type"]),
      thread: threadKeyForMail({ thread: rawThread, subject, from }),
      thread_aliases: threadAliases,
      source_group_ref: firstOf(r, ["소스그룹키", "그룹키", "메일그룹키"]),
      due_hint: firstOf(r, ["마감일", "기한", "D-Day", "D-DAY", "due", "due_date"]),
    });
  }
  return out;
}

// _workmeta/<code>/ 스캔 → {project, pending[]}. only 지정 시 그 코드만.
export function scanPending(wm, { only = null } = {}) {
  const result = [];
  if (!existsSync(wm)) return result;
  for (const code of readdirSync(wm)) {
    if (!CODE_RE.test(code)) continue;
    if (only && code !== only) continue;
    const mailCsv = join(wm, code, MAIL_REL);
    if (!existsSync(mailCsv)) continue;
    const pending = pendingForProject(mailCsv, join(wm, code, TASK_REL));
    result.push({ project: code, pending });
  }
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  let scanned = scanPending(wmDir, { only });
  if (limit > 0) scanned = scanned.map((s) => ({ ...s, pending: s.pending.slice(0, limit) }));
  if (asJson) {
    process.stdout.write(`${JSON.stringify(scanned, null, 2)}\n`);
  } else {
    const total = scanned.reduce((a, s) => a + s.pending.length, 0);
    console.log(`# 미변환 메일(할일로 안 떨어진 것) — ${only || "전 프로젝트"}`);
    if (!scanned.length) console.log("  (메일_이력.csv 있는 프로젝트 없음)");
    for (const s of scanned) {
      console.log(`  ${s.project}: 미변환 ${s.pending.length}건`);
      for (const p of s.pending.slice(0, limit || 8)) console.log(`    - ${p.history_key} · ${p.mailbox || "(메일함?)"} · ${p.subject || "(제목 없음)"}`);
      if (!limit && s.pending.length > 8) console.log(`    … 외 ${s.pending.length - 8}건`);
    }
    console.log(`  합계 미변환 ${total}건. LLM 후보 입력: --json 으로 출력 → 분류 → mail_to_task_ledger --candidates.`);
  }
}
