#!/usr/bin/env node
// tools/mail_to_task_ledger.mjs — 메일 이력 → 할일_장부 자동 작성기(결정적 엔진). auto_intake_cycle 또는 운영자가 호출한다.
//   역할 분담(autosync mail_history_to_task_generation_rule):
//     · LLM 판단(어떤 메일이 할일인가 + 업무유형/완료기준/할일명/split) = 분류 어댑터가 --candidates JSON 으로 넣는다.
//     · 결정적(여기, 코어 LLM 0%): SE단계=프로젝트 현재상태, mailtask:<이력키> 멱등키, 상태규칙, CSV 표준 작성·머지.
//   자동 흐름: 메일_이력.csv 읽기 → LLM 분석 → candidates JSON → 이 도구 --apply → 할일_장부.csv → ERP import.
// 기본 dry-run(건수만). --apply 일 때만 할일_장부.csv 작성(멱등 머지). 원문/첨부/secret 미복사. 절대경로 금지.
// zero-dependency: node:fs/path/sqlite. SE단계는 --db(프로젝트 현재상태) 또는 --stage 로 주거나 비우면 unclassified.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { mailHistoryKeyFromTaskKey, threadKeyForMail } from "./mail_thread_key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const project = arg("project", null);
const candPath = arg("candidates", null);     // 분류 어댑터 출력 JSON {이력키: {..} | [..split]}
const skeleton = has("skeleton");             // LLM 없이 메일당 1건 skeleton(테스트/폴백). --limit 권장.
const limit = Number(arg("limit", "0")) || 0;
const dbArg = arg("db", null);                // SE단계 읽을 dev-erp DB(상대 권장)
const stageArg = arg("stage", null);          // SE단계 명시(대안)
const wmArg = arg("workmeta", join(REPO, "_workmeta"));
const runId = arg("run-id", "");
const generationRule = arg("rule", "mail_history_to_task_generation_rule");
const autoOpen = has("auto-open");            // owner-approved 정책: 전필드 있으면 open(기본 needs_review→unclassified)
const assignMailboxOwner = has("assign-mailbox-owner"); // 메일함 수신자를 확정 담당자로 넣는 보수적 opt-in. 기본은 제안만.
const skeletonReviewTasks = has("skeleton-review-tasks"); // skeleton 폴백을 실제 "메일 검토" 작업으로 채운다.
const defaultReviewDays = Number(arg("default-review-days", "0")) || 0; // 기한 없을 때 메일일+N일을 첫 검토기한으로 사용.
const reminderDays = Number(arg("reminder-days", "2")) || 2;            // 첫 검토기한 이후 N일 내 후속일 미정이면 급한 일.
const apply = has("apply");

const WORK_TYPES = ["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"];
const SCHEMA = "soulforge.project_task_ledger.private.v0";
const BASE_HEADERS = ["할일키","스키마버전","기록일","프로젝트코드","할일명","담당자","업무유형","상태","마감일","SE단계","연결유형","연결대상","완료기준","출처","관련메일이력키","관련메일소스ID","산출물참조","관련몬스터ID","다음액션","비고","원문복사여부"];
const AUTOMATION_HEADERS = [
  ["검토상태", "review_status"],
  ["검토사유", "review_reason"],
  ["수정사유", "correction_reason"],
  ["라우트후보", "route_candidate"],
  ["라우트신뢰도", "route_confidence"],
  ["라우트사유", "route_reason"],
  ["필요역할", "required_role"],
  ["필요역량", "required_capability"],
  ["제안담당자", "suggested_assignee_ref"],
  ["담당신뢰도", "assignee_confidence"],
  ["담당사유", "assignee_reason"],
  ["소스후보키", "source_candidate_ref"],
  ["소스메일키", "source_mail_ref"],
  ["소스메일소스ID", "source_mail_source_id"],
  ["소스스레드키", "source_thread_ref"],
  ["소스그룹키", "source_group_ref"],
  ["소스계보", "source_lineage_ref"],
  ["생성런", "generation_run_ref"],
  ["생성규칙", "generation_rule_ref"],
  ["동기화상태", "sync_state"],
  ["동기화오류", "sync_error"],
  ["동기화리비전", "sync_revision"],
  ["동기화해시", "sync_hash"],
  ["동기화시각", "sync_at"],
];
const HEADERS = [...BASE_HEADERS, ...AUTOMATION_HEADERS.map(([h]) => h)];
const MAIL_REL = join("reports", "메일_이력", "메일_이력.csv");
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");

if (!project) { console.error("--project <코드> 필요."); process.exit(2); }

const MAIL_REF_REL = MAIL_REL.replaceAll("\\", "/");

function parseCsv(text) {
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
const csvEsc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const relPathOk = (s) => {
  const raw = String(s ?? "").trim();
  return !!raw && !isAbsolute(raw) && !/^[A-Za-z]:[\\/]/.test(raw) && !/^\\\\/.test(raw);
}; // 절대경로 금지
const safeRef = (v) => { const s = String(v ?? "").trim(); return s && relPathOk(s) ? s : ""; };
const pick = (obj, names, fallback = "") => {
  for (const n of names) {
    const v = obj?.[n];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
};
const confidence = (v) => {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (["low", "medium", "high"].includes(raw)) return raw;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n >= 0.75 ? "high" : (n >= 0.4 ? "medium" : "low");
  return "";
};
const routeConfidence = (v, routeCandidate = "") => {
  const raw = String(v ?? "").trim().toLowerCase();
  if (String(routeCandidate ?? "").startsWith("none/")) return "none";
  if (!raw) return routeCandidate ? "review" : "";
  if (["exact", "review", "none"].includes(raw)) return raw;
  if (["high", "confirmed", "owner_confirmed"].includes(raw)) return "exact";
  if (["low", "medium", "hint", "suggested", "defaulted", "manual_review"].includes(raw)) return "review";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n >= 0.9 ? "exact" : "review";
  return routeCandidate ? "review" : "";
};

const mailCsv = join(wmArg, project, MAIL_REL);
if (!existsSync(mailCsv)) { console.error(`메일 이력 없음: ${mailCsv}`); process.exit(2); }
const mailRecs = parseCsv(readFileSync(mailCsv, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
const mh = mailRecs[0].map((x) => x.trim().normalize("NFC"));
const mIx = (n) => mh.indexOf(n);
const firstIx = (...names) => names.map((n) => mIx(n)).find((i) => i >= 0) ?? -1;
const mc = { key: mIx("이력키"), subj: mIx("제목"), at: mIx("메일수신시각"), from: mIx("발신자"), src: mIx("메일소스ID"),
  mailbox: firstIx("메일함", "mailbox"),
  due: firstIx("마감일", "기한", "D-Day", "D-DAY", "due", "due_date"),
  thread: firstIx("스레드", "스레드키", "메일스레드ID", "스레드ID"), group: firstIx("그룹키", "메일그룹키"), lineage: firstIx("소스계보", "라인리지", "계보") };
const mailById = new Map();
for (const r of mailRecs.slice(1)) {
  const g = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const mailbox = g(mc.mailbox);
  const subject = g(mc.subj);
  const from = g(mc.from);
  const rawThread = g(mc.thread);
  const mailMeta = { subject, at: g(mc.at), from, src: g(mc.src), mailbox, due_hint: g(mc.due), thread: rawThread, group: g(mc.group) };
  const mailRowHash = createHash("sha256").update(JSON.stringify(mailMeta)).digest("hex");
  const k = g(mc.key); if (k) mailById.set(k, { subject, at: g(mc.at), from, src: g(mc.src),
    mailbox: mailbox.includes("@") ? mailbox.toLowerCase() : mailbox,
    due_hint: g(mc.due), thread: threadKeyForMail({ thread: rawThread, subject, from }), group: g(mc.group), lineage: g(mc.lineage), row_hash: mailRowHash });
}

// 분류 어댑터 후보(어떤 메일이 할일인가 + 필드). 없으면 skeleton(메일당 1건, LLM필드 공란).
let candidates = {};
if (candPath) {
  candidates = JSON.parse(readFileSync(/^([A-Za-z]:[\\/]|\/)/.test(candPath) ? candPath : resolve(process.cwd(), candPath), "utf8"));
} else if (skeleton) {
  let n = 0;
  for (const [k] of mailById) { if (limit && n >= limit) break; candidates[k] = {}; n++; }
} else {
  console.error("후보 입력 필요: --candidates <json>(분류 어댑터 출력) 또는 --skeleton [--limit N]."); process.exit(2);
}

const stage = await resolveStageAsync();
async function resolveStageAsync() {
  if (stageArg) return stageArg;
  if (dbArg) {
    const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(dbArg) ? dbArg : resolve(APP, dbArg);
    const { openStore } = await import("../src/store.mjs");
    const s = openStore(dbPath);
    const v = s.projectCurrentStage(project); s.db.close(); return v || "";
  }
  return "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function addDaysIso(isoLike, days) {
  const base = String(isoLike ?? "").slice(0, 10);
  if (!DATE_RE.test(base)) return "";
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function formatDateOnly(year, month, day) {
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(d.getTime())) return "";
  if (d.getUTCFullYear() !== Number(year) || d.getUTCMonth() + 1 !== Number(month) || d.getUTCDate() !== Number(day)) return "";
  return d.toISOString().slice(0, 10);
}
function normalizeDateOnly(value) {
  const s = String(value ?? "").trim();
  if (DATE_RE.test(s)) return s;
  const full = s.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/u);
  if (full) return formatDateOnly(full[1], full[2], full[3]);
  return "";
}
function extractDueHintFromSubject(subject, receivedAt) {
  const sourceText = String(subject ?? "");
  const baseYear = Number(String(receivedAt ?? "").slice(0, 4)) || new Date().getUTCFullYear();
  const candidates = [];
  const patterns = [
    { regexp: /(?<!\d)(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/gu,
      build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), confidence: "subject_full_date" }) },
    { regexp: /'(\d{2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})/gu,
      build: (m) => ({ year: 2000 + Number(m[1]), month: Number(m[2]), day: Number(m[3]), confidence: "subject_short_year_date" }) },
    { regexp: /(?:~|까지|기한|due|by)\s*'?(\d{1,2})\s*[./]\s*(\d{1,2})/giu,
      build: (m) => ({ year: baseYear, month: Number(m[1]), day: Number(m[2]), confidence: "subject_month_day" }) },
    { regexp: /(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu,
      build: (m) => ({ year: baseYear, month: Number(m[1]), day: Number(m[2]), confidence: "subject_month_day" }) },
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern.regexp)) {
      const parsed = pattern.build(match);
      const dueDate = formatDateOnly(parsed.year, parsed.month, parsed.day);
      if (dueDate) candidates.push({ due_date: dueDate, due_text: match[0], due_source: "subject", deadline_confidence: parsed.confidence });
    }
  }
  candidates.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.due_text.localeCompare(b.due_text));
  return candidates[0] ?? null;
}
function resolveDue(cand, mail) {
  const candidateDue = normalizeDateOnly(cand.due);
  if (candidateDue) return { due: candidateDue, source: "candidate", text: String(cand.due).trim(), confidence: "candidate" };
  const mailDue = normalizeDateOnly(mail.due_hint);
  if (mailDue) return { due: mailDue, source: "mail_history", text: String(mail.due_hint).trim(), confidence: "structured_mail_history" };
  const subjectDue = extractDueHintFromSubject(mail.subject, mail.at);
  if (subjectDue?.due_date) return { due: subjectDue.due_date, source: subjectDue.due_source, text: subjectDue.due_text, confidence: subjectDue.deadline_confidence };
  if (defaultReviewDays > 0) {
    const reviewDue = addDaysIso(mail.at, defaultReviewDays);
    if (reviewDue) return { due: reviewDue, source: "default_first_review", text: `메일수신+${defaultReviewDays}일`, confidence: "policy_default" };
  }
  return { due: "", source: "", text: "", confidence: "" };
}
// 후보 1건 → 할일_장부 행(HEADERS 순서). LLM 필드는 분류 어댑터 제공값, 없으면 공란/폴백.
function toRow(histKey, cand, splitIdx) {
  const mail = mailById.get(histKey) || {};
  const key = splitIdx ? `mailtask:${histKey}:${splitIdx}` : `mailtask:${histKey}`;
  const wt = WORK_TYPES.includes(cand.work_type) ? cand.work_type : (skeletonReviewTasks ? "review" : "");
  const cc = String(cand.completion_criteria ?? "").trim() || (skeletonReviewTasks ? "메일 요청사항을 검토하고 회신/후속일/담당자/완료기준 중 필요한 후속 조치를 확정" : "");
  const title = String(cand.title ?? "").trim() || (skeletonReviewTasks ? `메일 검토: ${mail.subject || "(제목 없음)"}` : (mail.subject || "(제목 없음)"));
  const dueInfo = resolveDue(cand, mail);
  const due = dueInfo.due;
  const reminderDue = due ? addDaysIso(due, reminderDays) : "";
  const requestedReviewStatus = String(cand.review_status ?? "").trim();
  const explicitReviewStatus = ["needs_review", "ready", "reviewed", "approved", "rejected", "corrected"].includes(requestedReviewStatus)
    ? requestedReviewStatus
    : "";
  const unsupportedReviewStatus = !!requestedReviewStatus && !explicitReviewStatus;
  const reviewGateBlocked = unsupportedReviewStatus || ["needs_review", "rejected"].includes(explicitReviewStatus);
  // 상태: open 은 (SE단계 + 업무유형 + 완료기준 전부 + auto-open 정책 + 검토 게이트 통과) 일 때만.
  const full = stage && wt && cc;
  const status = autoOpen && full && !reviewGateBlocked ? "open" : "unclassified";
  const candidateAssignee = safeRef(pick(cand, ["assignee_ref", "assignee"]));
  const candidateSuggested = safeRef(pick(cand, ["suggested_assignee_ref", "suggested_assignee"]));
  const mailboxOwner = safeRef(mail.mailbox || "");
  const mailboxSuggestedDefaulted = !!(!candidateAssignee && !candidateSuggested && mailboxOwner);
  const mailboxFinalDefaulted = !!(!candidateAssignee && assignMailboxOwner && mailboxOwner);
  const mailboxReason = (mailboxSuggestedDefaulted || mailboxFinalDefaulted) ? "메일함 수신자 기본 제안(확정 담당자 아님)" : "";
  const dueReason = dueInfo.source
    ? `기한출처=${dueInfo.source}${dueInfo.text ? `(${dueInfo.text})` : ""}${reminderDue ? `·리마인드=${reminderDue}` : ""}`
    : "";
  // 검토사유: 왜 needs_review 인지(LLM 저신뢰/필드부족/단계없음).
  const reviewGateReason = reviewGateBlocked
    ? `검토게이트=${unsupportedReviewStatus ? "unsupported_review_status" : explicitReviewStatus}`
    : "";
  const reason = status === "open" ? dueReason : [reviewGateReason, !stage && "SE단계없음", !wt && "업무유형미정", !cc && "완료기준미정", cand.review_reason, mailboxReason, dueReason].filter(Boolean).join("·");
  const mailKeyRef = relPathOk(histKey) ? `mailcsv:${histKey}` : "";
  const finalAssignee = candidateAssignee || (mailboxFinalDefaulted ? mailboxOwner : "");
  const suggestedAssignee = candidateSuggested || candidateAssignee || (mailboxSuggestedDefaulted ? mailboxOwner : "");
  const reviewStatus = explicitReviewStatus || (status === "open" ? "ready" : "needs_review");
  const sourceCandidate = safeRef(pick(cand, ["source_candidate_ref", "candidate_ref", "candidate_id"], key));
  const sourceThread = safeRef(pick(cand, ["source_thread_ref", "thread_ref", "thread_id"], mail.thread || ""));
  const sourceGroup = safeRef(pick(cand, ["source_group_ref", "group_ref", "group_id"], mail.group || ""));
  const lineageDefault = `mailhistory:${project}/${MAIL_REF_REL}#${histKey}${mail.row_hash ? `@${mail.row_hash.slice(0, 16)}` : ""}`;
  const sourceLineage = safeRef(pick(cand, ["source_lineage_ref", "lineage_ref"], mail.lineage || lineageDefault));
  const routeCandidate = safeRef(pick(cand, ["route_candidate", "route_ref"], project));
  const meta = {
    review_status: reviewStatus,
    review_reason: reason || String(cand.review_reason ?? "").trim(),
    correction_reason: String(cand.correction_reason ?? "").trim(),
    route_candidate: routeCandidate,
    route_confidence: routeConfidence(cand.route_confidence, routeCandidate),
    route_reason: String(cand.route_reason ?? "").trim(),
    required_role: String(cand.required_role ?? "").trim(),
    required_capability: String(cand.required_capability ?? "").trim(),
    suggested_assignee_ref: suggestedAssignee,
    assignee_confidence: confidence(pick(cand, ["assignee_confidence", "suggested_assignee_confidence"])) || (mailboxSuggestedDefaulted ? "low" : ""),
    assignee_reason: String(cand.assignee_reason ?? "").trim() || (mailboxSuggestedDefaulted ? "메일함 수신자 기준 보수적 제안" : ""),
    source_candidate_ref: sourceCandidate,
    source_mail_ref: mailKeyRef,
    source_mail_source_id: safeRef(pick(cand, ["source_mail_source_id", "mail_source_id"], mail.src || "")),
    source_thread_ref: sourceThread,
    source_group_ref: sourceGroup,
    source_lineage_ref: sourceLineage,
    generation_run_ref: safeRef(pick(cand, ["generation_run_ref", "run_id"], runId)),
    generation_rule_ref: safeRef(pick(cand, ["generation_rule_ref", "rule_ref"], generationRule)),
    sync_state: "pending",
    sync_error: "",
    sync_revision: "1",
    sync_hash: "",
    sync_at: "",
  };
  if (mailboxReason && !meta.review_reason) meta.review_reason = mailboxReason;
  const nextAction = String(cand.next_action ?? "").trim()
    || (reminderDue ? `${reminderDue}까지 후속일/담당자/완료기준 미확정 시 급한 일로 재검토` : "");
  return [key, SCHEMA, "", project, title, finalAssignee, wt, status, due, stage, "", "", cc, "mail", mailKeyRef, mail.src || "", "", "", nextAction, reason, "아니오",
    ...AUTOMATION_HEADERS.map(([, field]) => meta[field] || "")];
}

// 후보 → 행들(split 처리)
const newRows = [];
let skippedNoMail = 0;
let skippedBadKey = 0;
for (const [histKey, cand] of Object.entries(candidates)) {
  if (!mailById.has(histKey)) { skippedNoMail++; continue; }        // 메일 이력에 없는 키는 무시
  if (!relPathOk(histKey) || /[,\n\r]/.test(histKey)) { skippedBadKey++; continue; } // 절대경로/CSV 구분자 든 이력키는 할일키로 못 씀. Outlook/Gmail 이력키 ':'는 허용.
  if (Array.isArray(cand)) cand.forEach((c, i) => { if (c) newRows.push(toRow(histKey, c, i + 1)); }); // null 원소 스킵
  else newRows.push(toRow(histKey, cand || {}, null));
}

// 멱등 머지(이름 키 매핑·헤더 안전). 기존 행을 헤더명 객체로 읽어 컬럼순서/추가컬럼을 보존하고,
// 처리한 메일의 mailtask:<이력키>* 행은 통째 교체(split 수 변경 시 orphan 방지). 다른 행(ERP itm_*·다른 메일)·키없는 행은 보존.
const taskCsv = join(wmArg, project, TASK_REL);
let existHeader = HEADERS;
const existObjs = [];
if (existsSync(taskCsv)) {
  const recs = parseCsv(readFileSync(taskCsv, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (recs.length) {
    existHeader = recs[0].map((x) => x.trim());
    for (const r of recs.slice(1)) { const o = {}; existHeader.forEach((c, i) => (o[c] = r[i] ?? "")); existObjs.push(o); }
  }
}
const outHeader = [...HEADERS, ...existHeader.filter((c) => !HEADERS.includes(c))]; // 추가컬럼 보존
const touched = new Set(Object.keys(candidates).filter((k) => mailById.has(k)));
const isTouchedMailTask = (k) => {
  const historyKey = mailHistoryKeyFromTaskKey(k, touched);
  return historyKey && touched.has(historyKey);
};
const byKey = new Map();
let purged = 0;
for (const o of existObjs) {
  const k = o["할일키"] || "";
  if (k && isTouchedMailTask(k)) { purged++; continue; }          // 처리 메일의 옛 mailtask 행 제거(통째 교체)
  byKey.set(k || `__nokey_${byKey.size}`, o);                     // 키 없는 행도 패스스루 보존
}
for (const row of newRows) { const o = {}; HEADERS.forEach((c, i) => (o[c] = row[i])); byKey.set(o["할일키"], o); }

const summary = `생성행 ${newRows.length} · 옛 mailtask 교체삭제 ${purged} · 총 ${byKey.size}행`;
const openRows = newRows.filter((r) => r[7] === "open").length;
const triageRows = newRows.length - openRows;
if (!apply) {
  console.log(`# mail→할일_장부 dry-run — ${project}`);
  console.log(`  메일 이력 ${mailById.size}건 · 후보 ${Object.keys(candidates).length}(메일없음 스킵 ${skippedNoMail}) · ${summary}`);
  console.log(`  SE단계(프로젝트 현재상태) = ${stage || "(없음→unclassified)"} · 출처=mail · 상태=${autoOpen ? "auto-open 정책" : "needs_review→unclassified"}`);
  console.log(`  메일함 수신자 기본 담당 배정 = ${assignMailboxOwner ? "on" : "off(제안만)"}`);
  if (defaultReviewDays > 0) console.log(`  기본 검토기한 = 메일수신+${defaultReviewDays}일 · 리마인드 = 기한+${reminderDays}일`);
  console.log(`  open ${openRows} · unclassified(검토대기) ${triageRows}`);
  console.log(`  작성: --apply 추가. 출력: ${taskCsv}`);
  process.exit(0);
}

mkdirSync(dirname(taskCsv), { recursive: true });
const out = [outHeader.join(","), ...[...byKey.values()].map((o) => outHeader.map((c) => csvEsc(o[c] ?? "")).join(","))];
const tmp = `${taskCsv}.tmp`;
writeFileSync(tmp, "﻿" + out.join("\n") + "\n");
renameSync(tmp, taskCsv); // atomic
console.log(`[apply] ${project}: 할일_장부 ${summary} → ${join(project, TASK_REL)}`);
console.log(`        SE단계=${stage || "(없음)"} · open ${openRows} · unclassified(검토대기) ${triageRows}. ERP import: tools/task_ledger.mjs --apply.`);
console.log(`        메일함 수신자 기본 담당 배정=${assignMailboxOwner ? "on" : "off(제안만)"}.`);
if (defaultReviewDays > 0) console.log(`        기본 검토기한=메일수신+${defaultReviewDays}일 · 리마인드=기한+${reminderDays}일.`);
