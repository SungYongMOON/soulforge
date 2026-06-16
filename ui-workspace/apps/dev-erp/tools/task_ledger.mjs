#!/usr/bin/env node
// tools/task_ledger.mjs — 할일 장부(과제별 할일_장부.csv) export/ingest. 작업_장부(과거 로그)의 자매 = '앞으로 할 일' 장부.
//   ERP 할일(core_item)은 ERP 안에서 태어나므로(메일/요청 분류 + 수동), 이 장부는 그 할일의 이식 가능한 파일 형태다.
//   --export : core_item → _workmeta/<code>/reports/할일_장부/할일_장부.csv (+README.md). ERP 가 장부를 씀.
//   --apply  : 할일_장부.csv → core_item. 신규는 import, 기존은 덮어쓰지 않고 sync conflict 로 표시.
//   기본(둘 다 아님): dry-run(건수만).
// 장부 가족 구조(CSV + README + 스키마버전)·공통 ingest 계약(상대포인터·멱등·원문 미저장) 준수. 절대경로 금지.
// 표준 정본·사람용 XLSX 생성기는 Codex 소유(handoff). zero-dependency: node:fs/path/sqlite.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { importTaskLedgerFile } from "../src/autosync.mjs";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const dbArg = arg("db", null);
const only = arg("project", null);
const outArg = arg("out", null);                         // export 대상 루트(기본 _workmeta). 테스트용 override.
const doExport = has("export");
const doApply = has("apply");

const SCHEMA = "soulforge.project_task_ledger.private.v0"; // v0=초안. Codex 정식 비준 시 v1 승격(단일 지점).
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
const LEDGER_REL = join("reports", "할일_장부", "할일_장부.csv");
const CODE_RE = /^P\d{2}-\d{3}/;

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { if (text[i + 1] !== "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } } // CR/CRLF 모두 레코드 종결(인용 밖)
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// CSV 수식 인젝션 가드: 위험 선두문자(= + - @ tab cr)는 ' 접두로 무력화하고 ingest 에서 되돌려 왕복 보존.
const csvEsc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const unguard = (s) => s.replace(/^'(?=[=+\-@\t\r])/, ""); // export 수식가드 ' 복원
const stableTaskHash = (obj) => createHash("sha256").update(JSON.stringify({
  id: obj.id ?? "", project_id: obj.project_id ?? obj.project_code ?? "", title: obj.title ?? "",
  assignee_ref: obj.assignee_ref ?? "", work_type: obj.work_type ?? "", status: obj.status ?? "",
  due: obj.due ?? "", anchor_stage_code: obj.anchor_stage_code ?? "", link_kind: obj.link_kind ?? "",
  link_ref: obj.link_ref ?? "", completion_criteria: obj.completion_criteria ?? "", origin: obj.origin ?? "",
  origin_mail_id: obj.origin_mail_id ?? "", source_mail_ref: obj.source_mail_ref ?? "",
  source_mail_source_id: obj.source_mail_source_id ?? "", review_status: obj.review_status ?? "",
  review_reason: obj.review_reason ?? "", correction_reason: obj.correction_reason ?? "",
  route_candidate: obj.route_candidate ?? "",
  route_confidence: obj.route_confidence ?? "", route_reason: obj.route_reason ?? "",
  required_role: obj.required_role ?? "", required_capability: obj.required_capability ?? "",
  suggested_assignee_ref: obj.suggested_assignee_ref ?? "", assignee_confidence: obj.assignee_confidence ?? "",
  assignee_reason: obj.assignee_reason ?? "", source_thread_ref: obj.source_thread_ref ?? "",
  source_candidate_ref: obj.source_candidate_ref ?? "", source_group_ref: obj.source_group_ref ?? "",
  source_lineage_ref: obj.source_lineage_ref ?? "", generation_run_ref: obj.generation_run_ref ?? "",
  generation_rule_ref: obj.generation_rule_ref ?? "",
})).digest("hex");

function automationToObj(i) {
  const out = {};
  for (const [, field] of AUTOMATION_HEADERS) out[field] = i[field] ?? "";
  out.source_mail_ref ||= i.origin_mail_id ?? "";
  out.source_mail_source_id ||= i.source_mail_source_id ?? "";
  out.sync_state ||= "synced";
  out.sync_revision ||= "1";
  out.sync_hash = stableTaskHash(i);
  return out;
}

function automationFromCsv(r, h, g) {
  const ix = (n) => h.indexOf(n);
  const out = {};
  for (const [header, field] of AUTOMATION_HEADERS) out[field] = g(r, ix(header));
  if (!out.source_mail_source_id) out.source_mail_source_id = g(r, ix("관련메일소스ID"));
  if (!out.source_mail_ref) out.source_mail_ref = g(r, ix("관련메일이력키"));
  if (!out.review_reason) out.review_reason = g(r, ix("비고"));
  return out;
}

function dbPathFrom(a) {
  if (!a) { console.error("--db <경로> 필요(예: --db data/dev-erp.db). 절대경로 금지·상대 권장."); process.exit(2); }
  if (/^([A-Za-z]:[\\/]|\/)/.test(a)) console.warn("[경고] --db 절대경로. 이식성 위해 상대경로 권장.");
  return /^([A-Za-z]:[\\/]|\/)/.test(a) ? a : resolve(APP, a);
}

// core_item 한 행 → 할일_장부 행(HEADERS 순서).
function itemToRow(i) {
  const isArtifact = i.link_kind === "artifact";
  const meta = automationToObj(i);
  return [
    i.id, SCHEMA, (i.created_at || "").slice(0, 10), i.project_id, i.title, i.assignee_ref || "",
    i.work_type || "", i.status || "", i.due || "", i.anchor_stage_code || "",
    i.link_kind || "", i.link_ref || "", i.completion_criteria || "", i.origin || "",
    i.origin_mail_id || meta.source_mail_ref || "", meta.source_mail_source_id || "", isArtifact ? (i.link_ref || "") : "", "", "",
    i.review_reason || i.correction_reason || i.sync_error || "", "아니오",
    ...AUTOMATION_HEADERS.map(([, field]) => meta[field] || "")
  ];
}

const README = (code) => `# 할일 장부\n\n- Project code: \`${code}\`\n- Owner path: \`_workmeta/${code}/reports/할일_장부/\`\n- Ledger file: \`할일_장부.csv\`\n- Schema version: \`${SCHEMA}\`\n\n## Use\n\n- 한 행 = 하나의 할일(앞으로 할 일). 작업_장부(과거 로그)의 자매지만, 작업_장부를 통째 할일로 변환하지 않는다.\n- ERP(dev-erp)가 export 로 쓰고 ingest 로 읽는 왕복. 신규 행은 불러오고 기존 행 차이는 sync conflict 로 남긴다.\n- 원문/첨부/secret 미저장. 포인터(\`연결대상\`,\`산출물참조\`,\`관련메일이력키\`)만.\n- \`관련메일이력키\` 는 \`mailcsv:<이력키>\` 권장. 순수 이력키는 ingest 때 \`mailcsv:\` 로 정규화된다.\n- 완료 시 \`상태\`=\`done\`. \`원문복사여부\`=\`아니오\`.\n`;

// ---------- --export: core_item → 할일_장부.csv ----------
if (doExport) {
  const store = openStore(dbPathFrom(dbArg));
  const outRoot = outArg ? (/^([A-Za-z]:[\\/]|\/)/.test(outArg) ? outArg : resolve(process.cwd(), outArg)) : join(REPO, "_workmeta");
  const codes = store.db.prepare("SELECT DISTINCT project_id FROM core_item WHERE project_id IS NOT NULL ORDER BY project_id").all().map((r) => r.project_id).filter((c) => CODE_RE.test(c) && (!only || c === only || c.startsWith(only)));
  let wrote = 0;
  for (const code of codes) {
    const items = store.items({ project: code, include_unclassified: true, limit: 1000000 }); // 전량 export(LIMIT 잘림 방지)
    if (!items.length) continue;
    const dir = join(outRoot, code, "reports", "할일_장부");
    mkdirSync(dir, { recursive: true });
    const lines = [HEADERS.join(","), ...items.map((i) => itemToRow(i).map(csvEsc).join(","))];
    writeFileSync(join(dir, "할일_장부.csv"), "﻿" + lines.join("\n") + "\n");
    if (!existsSync(join(dir, "README.md"))) writeFileSync(join(dir, "README.md"), README(code)); // 사람 메모 보존(있으면 미덮음)
    wrote += items.length;
    console.log(`[export] ${code}: ${items.length}건 → ${join(code, "reports", "할일_장부", "할일_장부.csv")}`);
  }
  store.appendEvent({ actor_ref: "task_ledger", actor_kind: "system", kind: "task_ledger_export", to: String(wrote), used_refs: ["core_item"], data_label: "real", note: `${codes.length}개 과제·${wrote}건` });
  store.db.close();
  console.log(`[export] 완료: ${codes.length}개 과제 · 할일 ${wrote}건 → ${outArg ? outArg : "_workmeta"} (할일_장부.csv + README).`);
  process.exit(0);
}

// ---------- --apply: 할일_장부.csv → core_item (ingest) ----------
const srcRoot = outArg ? (/^([A-Za-z]:[\\/]|\/)/.test(outArg) ? outArg : resolve(process.cwd(), outArg)) : join(REPO, "_workmeta");
const folders = (existsSync(srcRoot) ? readdirSync(srcRoot) : [])
  .filter((e) => CODE_RE.test(e) && (!only || e === only || e.startsWith(only)))
  .filter((e) => { try { return statSync(join(srcRoot, e)).isDirectory(); } catch { return false; } })
  .filter((e) => existsSync(join(srcRoot, e, LEDGER_REL)))
  .sort();

function readLedger(folder) {
  const recs = parseCsv(readFileSync(join(srcRoot, folder, LEDGER_REL), "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (!recs.length) return { rows: 0, records: [], dropped: 0 };
  const h = recs[0].map((x) => x.trim().normalize("NFC"));
  const ix = (n) => h.indexOf(n);
  // 헤더 검증: 필수 헤더(할일키/할일명) 없으면 전 행 조용히 드롭되는 대신 명시 에러(오타·인코딩 깨짐 탐지).
  if (ix("할일키") < 0 || ix("할일명") < 0) {
    return { rows: recs.length - 1, records: [], dropped: recs.length - 1, headerError: `필수 헤더 누락(할일키/할일명). 발견: ${h.join("|")}` };
  }
  const c = { key: ix("할일키"), proj: ix("프로젝트코드"), title: ix("할일명"), who: ix("담당자"), wt: ix("업무유형"),
    st: ix("상태"), due: ix("마감일"), stage: ix("SE단계"), lk: ix("연결유형"), lr: ix("연결대상"),
    cc: ix("완료기준"), org: ix("출처"), mail: ix("관련메일이력키"), art: ix("산출물참조"), created: ix("기록일") };
  const g = (r, i) => unguard(i >= 0 ? String(r[i] ?? "").trim() : ""); // 수식가드 ' 복원
  const all = recs.slice(1).map((r) => ({
    id: g(r, c.key), project_code: g(r, c.proj), title: g(r, c.title), assignee_ref: g(r, c.who),
    work_type: g(r, c.wt), status: g(r, c.st), due: g(r, c.due), anchor_stage_code: g(r, c.stage),
    link_kind: g(r, c.lk), link_ref: g(r, c.lr) || g(r, c.art), completion_criteria: g(r, c.cc),
    origin: g(r, c.org) || "ledger", origin_mail_id: g(r, c.mail), created_at: g(r, c.created),
    ...automationFromCsv(r, h, g)
  }));
  const records = all.filter((x) => x.id && x.title); // 키·제목 빈 행 드롭
  return { rows: recs.length - 1, records, dropped: all.length - records.length };
}

if (doApply) {
  const store = openStore(dbPathFrom(dbArg));
  let wrote = 0, fresh = 0, skipped = 0, dropped = 0, led = 0, hdrErr = 0, conflicts = 0, errors = 0;
  for (const folder of folders) {
    const { records, dropped: d, headerError } = readLedger(folder);
    if (headerError) { hdrErr++; console.warn(`[apply] ${folder}: 건너뜀 — ${headerError}`); continue; }
    dropped += d || 0;
    const result = records.length ? importTaskLedgerFile(store, join(srcRoot, folder, LEDGER_REL)) : { imported: 0, skipped: 0, conflicts: 0, errors: 0 };
    wrote += result.imported;
    fresh += result.imported;
    skipped += result.skipped;
    conflicts += result.conflicts;
    errors += result.errors;
    if (result.imported || result.skipped || d) {
      led++;
      console.log(`[apply] ${folder}: 신규 ${result.imported} · 스킵 ${result.skipped} · 충돌 ${result.conflicts} · 오류 ${result.errors}${d ? ` · 키·제목 빈행 드롭 ${d}` : ""}`);
    }
  }
  store.appendEvent({ actor_ref: "task_ledger", actor_kind: "system", kind: "task_ledger_ingest", to: String(wrote), used_refs: ["core_item"], data_label: "real", note: `신규 ${fresh}·스킵 ${skipped}·충돌 ${conflicts}·오류 ${errors}·드롭 ${dropped}·헤더오류 ${hdrErr}` });
  store.db.close();
  console.log(`[apply] 완료: ${led}개 장부 · 신규 ${fresh}건 ingest(스킵 ${skipped}, 충돌 ${conflicts}, 오류 ${errors}, 빈행드롭 ${dropped}, 헤더오류장부 ${hdrErr}).`);
  process.exit(0);
}

// ---------- dry-run ----------
console.log(`# 할일 장부 dry-run — ${folders.length}개 장부 발견 (${srcRoot})`);
let total = 0;
for (const folder of folders) {
  const { rows, records, dropped, headerError } = readLedger(folder); total += rows;
  if (headerError) console.log(`  ${folder}: ${rows}행 ⚠️ ${headerError}`);
  else console.log(`  ${folder}: ${rows}행 → ingest 대상 ${records.length}건${dropped ? ` (키·제목 빈행 ${dropped} 드롭)` : ""}`);
}
console.log(`# 합계 ${total}행. export: node tools/task_ledger.mjs --export --db data/dev-erp.db [--out <dir>]`);
console.log(`#         ingest: node tools/task_ledger.mjs --apply  --db data/dev-erp.db [--project <code>]`);
