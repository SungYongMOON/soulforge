#!/usr/bin/env node
// tools/mail_to_task_ledger.mjs — 메일 이력 → 할일_장부 자동 작성기(결정적 엔진). Codex 자동화 스킬이 호출한다.
//   역할 분담(autosync mail_history_to_task_generation_rule):
//     · LLM 판단(어떤 메일이 할일인가 + 업무유형/완료기준/할일명/split) = Codex 가 --candidates JSON 으로 넣는다.
//     · 결정적(여기, 코어 LLM 0%): SE단계=프로젝트 현재상태, mailtask:<이력키> 멱등키, 상태규칙, CSV 표준 작성·머지.
//   Codex 흐름: 메일_이력.csv 읽기 → LLM 분석 → candidates JSON → 이 도구 --apply → 할일_장부.csv → ERP import.
// 기본 dry-run(건수만). --apply 일 때만 할일_장부.csv 작성(멱등 머지). 원문/첨부/secret 미복사. 절대경로 금지.
// zero-dependency: node:fs/path/sqlite. SE단계는 --db(프로젝트 현재상태) 또는 --stage 로 주거나 비우면 unclassified.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const project = arg("project", null);
const candPath = arg("candidates", null);     // Codex LLM 출력 JSON {이력키: {..} | [..split]}
const skeleton = has("skeleton");             // LLM 없이 메일당 1건 skeleton(테스트/폴백). --limit 권장.
const limit = Number(arg("limit", "0")) || 0;
const dbArg = arg("db", null);                // SE단계 읽을 dev-erp DB(상대 권장)
const stageArg = arg("stage", null);          // SE단계 명시(대안)
const wmArg = arg("workmeta", join(REPO, "_workmeta"));
const autoOpen = has("auto-open");            // owner-approved 정책: 전필드 있으면 open(기본 needs_review→unclassified)
const apply = has("apply");

const WORK_TYPES = ["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"];
const SCHEMA = "soulforge.project_task_ledger.private.v0";
const HEADERS = ["할일키","스키마버전","기록일","프로젝트코드","할일명","담당자","업무유형","상태","마감일","SE단계","연결유형","연결대상","완료기준","출처","관련메일이력키","관련메일소스ID","산출물참조","관련몬스터ID","다음액션","비고","원문복사여부"];
const MAIL_REL = join("reports", "메일_이력", "메일_이력.csv");
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");

if (!project) { console.error("--project <코드> 필요."); process.exit(2); }

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
const relPathOk = (s) => !/^([A-Za-z]:[\\/]|\/(Volumes|Users)\/)/.test(String(s || "")); // 절대경로 금지

const mailCsv = join(wmArg, project, MAIL_REL);
if (!existsSync(mailCsv)) { console.error(`메일 이력 없음: ${mailCsv}`); process.exit(2); }
const mailRecs = parseCsv(readFileSync(mailCsv, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
const mh = mailRecs[0].map((x) => x.trim().normalize("NFC"));
const mIx = (n) => mh.indexOf(n);
const mc = { key: mIx("이력키"), subj: mIx("제목"), at: mIx("메일수신시각"), from: mIx("발신자"), src: mIx("메일소스ID") };
const mailById = new Map();
for (const r of mailRecs.slice(1)) {
  const g = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const k = g(mc.key); if (k) mailById.set(k, { subject: g(mc.subj), at: g(mc.at), from: g(mc.from), src: g(mc.src) });
}

// Codex LLM 후보(어떤 메일이 할일인가 + 필드). 없으면 skeleton(메일당 1건, LLM필드 공란).
let candidates = {};
if (candPath) {
  candidates = JSON.parse(readFileSync(/^([A-Za-z]:[\\/]|\/)/.test(candPath) ? candPath : resolve(process.cwd(), candPath), "utf8"));
} else if (skeleton) {
  let n = 0;
  for (const [k] of mailById) { if (limit && n >= limit) break; candidates[k] = {}; n++; }
} else {
  console.error("후보 입력 필요: --candidates <json>(Codex LLM 출력) 또는 --skeleton [--limit N]."); process.exit(2);
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
// 후보 1건 → 할일_장부 행(HEADERS 순서). LLM 필드는 Codex 제공값, 없으면 공란/폴백.
function toRow(histKey, cand, splitIdx) {
  const mail = mailById.get(histKey) || {};
  const key = splitIdx ? `mailtask:${histKey}:${splitIdx}` : `mailtask:${histKey}`;
  const wt = WORK_TYPES.includes(cand.work_type) ? cand.work_type : "";
  const cc = String(cand.completion_criteria ?? "").trim();
  const title = String(cand.title ?? "").trim() || mail.subject || "(제목 없음)";
  const due = DATE_RE.test(String(cand.due ?? "").trim()) ? String(cand.due).trim() : "";
  // 상태: open 은 (SE단계 + 업무유형 + 완료기준 전부 + auto-open 정책) 일 때만. 아니면 unclassified(=needs_review 격리).
  const full = stage && wt && cc;
  const status = autoOpen && full ? "open" : "unclassified";
  // 검토사유: 왜 needs_review 인지(LLM 저신뢰/필드부족/단계없음).
  const reason = status === "open" ? "" : [!stage && "SE단계없음", !wt && "업무유형미정", !cc && "완료기준미정", cand.review_reason].filter(Boolean).join("·");
  const mailKeyRef = relPathOk(histKey) ? `mailcsv:${histKey}` : "";
  return [key, SCHEMA, "", project, title, "", wt, status, due, stage, "", "", cc, "mail", mailKeyRef, mail.src || "", "", "", "", reason, "아니오"];
}

// 후보 → 행들(split 처리)
const newRows = [];
let skippedNoMail = 0;
for (const [histKey, cand] of Object.entries(candidates)) {
  if (!mailById.has(histKey)) { skippedNoMail++; continue; } // 메일 이력에 없는 키는 무시
  if (Array.isArray(cand)) cand.forEach((c, i) => newRows.push(toRow(histKey, c || {}, i + 1)));
  else newRows.push(toRow(histKey, cand || {}, null));
}

// 멱등 머지: 기존 할일_장부 읽어 할일키로 인덱싱, mailtask 행은 새 값으로 교체, 나머지(ERP itm_* 등) 보존.
const taskCsv = join(wmArg, project, TASK_REL);
const existing = [];
let header = HEADERS;
if (existsSync(taskCsv)) {
  const recs = parseCsv(readFileSync(taskCsv, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (recs.length) { header = recs[0].map((x) => x.trim()); for (const r of recs.slice(1)) existing.push(r); }
}
const keyIdx = header.indexOf("할일키");
const byKey = new Map();
for (const r of existing) { const k = (keyIdx >= 0 ? r[keyIdx] : r[0]) || ""; if (k) byKey.set(k, r); }
let added = 0, updated = 0;
for (const row of newRows) {
  const k = row[0];
  if (byKey.has(k)) updated++; else added++;
  byKey.set(k, row);
}

if (!apply) {
  console.log(`# mail→할일_장부 dry-run — ${project}`);
  console.log(`  메일 이력 ${mailById.size}건 · 후보 ${Object.keys(candidates).length}(메일없음 스킵 ${skippedNoMail}) · 생성행 ${newRows.length}(신규 ${added}·갱신 ${updated})`);
  console.log(`  SE단계(프로젝트 현재상태) = ${stage || "(없음→unclassified)"} · 출처=mail · 상태=${autoOpen ? "auto-open 정책" : "needs_review→unclassified"}`);
  const open = newRows.filter((r) => r[7] === "open").length;
  console.log(`  open ${open} · unclassified(검토대기) ${newRows.length - open}`);
  console.log(`  작성: --apply 추가. 출력: ${taskCsv}`);
  process.exit(0);
}

mkdirSync(dirname(taskCsv), { recursive: true });
const out = [header.join(","), ...[...byKey.values()].map((r) => r.map(csvEsc).join(","))];
writeFileSync(taskCsv, "﻿" + out.join("\n") + "\n");
console.log(`[apply] ${project}: 할일_장부 작성 ${newRows.length}행(신규 ${added}·갱신 ${updated}), 총 ${byKey.size}행 → ${join(project, TASK_REL)}`);
console.log(`        SE단계=${stage || "(없음)"} · 상태=${autoOpen ? "auto-open" : "needs_review→unclassified"}. ERP import: tools/task_ledger.mjs --apply.`);
