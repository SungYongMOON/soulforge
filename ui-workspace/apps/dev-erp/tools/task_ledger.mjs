#!/usr/bin/env node
// tools/task_ledger.mjs — 할일 장부(과제별 할일_장부.csv) export/ingest. 작업_장부(과거 로그)의 자매 = '앞으로 할 일' 장부.
//   ERP 할일(core_item)은 ERP 안에서 태어나므로(메일/요청 분류 + 수동), 이 장부는 그 할일의 이식 가능한 파일 형태다.
//   --export : core_item → _workmeta/<code>/reports/할일_장부/할일_장부.csv (+README.md). ERP 가 장부를 씀.
//   --apply  : 할일_장부.csv → core_item (멱등 ingest). 장부를 ERP 로 불러옴.
//   기본(둘 다 아님): dry-run(건수만).
// 장부 가족 구조(CSV + README + 스키마버전)·공통 ingest 계약(상대포인터·멱등·원문 미저장) 준수. 절대경로 금지.
// 표준 정본·사람용 XLSX 생성기는 Codex 소유(handoff). zero-dependency: node:fs/path/sqlite.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const SCHEMA = "soulforge.project_task_ledger.private.v1";
const HEADERS = ["할일키","스키마버전","기록일","프로젝트코드","할일명","담당자","업무유형","상태","마감일","SE단계","연결유형","연결대상","완료기준","출처","관련메일이력키","관련메일소스ID","산출물참조","관련몬스터ID","다음액션","비고","원문복사여부"];
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
    else if (c === "\r") { }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const csvEsc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function dbPathFrom(a) {
  if (!a) { console.error("--db <경로> 필요(예: --db data/dev-erp.db). 절대경로 금지·상대 권장."); process.exit(2); }
  if (/^([A-Za-z]:[\\/]|\/)/.test(a)) console.warn("[경고] --db 절대경로. 이식성 위해 상대경로 권장.");
  return /^([A-Za-z]:[\\/]|\/)/.test(a) ? a : resolve(APP, a);
}

// core_item 한 행 → 할일_장부 행(HEADERS 순서).
function itemToRow(i) {
  const isArtifact = i.link_kind === "artifact";
  return [
    i.id, SCHEMA, (i.created_at || "").slice(0, 10), i.project_id, i.title, i.assignee_ref || "",
    i.work_type || "", i.status || "", i.due || "", i.anchor_stage_code || "",
    i.link_kind || "", i.link_ref || "", i.completion_criteria || "", i.origin || "",
    i.origin_mail_id || "", "", isArtifact ? (i.link_ref || "") : "", "", "", "", "아니오"
  ];
}

const README = (code) => `# 할일 장부\n\n- Project code: \`${code}\`\n- Owner path: \`_workmeta/${code}/reports/할일_장부/\`\n- Ledger file: \`할일_장부.csv\`\n- Schema version: \`${SCHEMA}\`\n\n## Use\n\n- 한 행 = 하나의 할일(앞으로 할 일). 작업_장부(과거 로그)의 자매.\n- ERP(dev-erp)가 export 로 쓰고 ingest 로 읽는 왕복. 메일/요청 분류 + 수동으로 ERP 안에서 태어난 할일을 이식.\n- 원문/첨부/secret 미저장. 포인터(\`연결대상\`,\`산출물참조\`,\`관련메일이력키\`)만.\n- 완료 시 \`상태\`=\`done\`. \`원문복사여부\`=\`아니오\`.\n`;

// ---------- --export: core_item → 할일_장부.csv ----------
if (doExport) {
  const store = openStore(dbPathFrom(dbArg));
  const outRoot = outArg ? (/^([A-Za-z]:[\\/]|\/)/.test(outArg) ? outArg : resolve(process.cwd(), outArg)) : join(REPO, "_workmeta");
  const codes = store.db.prepare("SELECT DISTINCT project_id FROM core_item WHERE project_id IS NOT NULL ORDER BY project_id").all().map((r) => r.project_id).filter((c) => CODE_RE.test(c) && (!only || c === only));
  let wrote = 0;
  for (const code of codes) {
    const items = store.items({ project: code, include_unclassified: true });
    if (!items.length) continue;
    const dir = join(outRoot, code, "reports", "할일_장부");
    mkdirSync(dir, { recursive: true });
    const lines = [HEADERS.join(","), ...items.map((i) => itemToRow(i).map(csvEsc).join(","))];
    writeFileSync(join(dir, "할일_장부.csv"), "﻿" + lines.join("\n") + "\n");
    writeFileSync(join(dir, "README.md"), README(code));
    wrote += items.length;
    console.log(`[export] ${code}: ${items.length}건 → ${join(code, "reports", "할일_장부", "할일_장부.csv")}`);
  }
  store.appendEvent({ actor_ref: "task_ledger", actor_kind: "system", kind: "task_ledger_export", to: String(wrote), used_refs: ["core_item"], data_label: "real" });
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
  if (!recs.length) return { rows: 0, records: [] };
  const h = recs[0].map((x) => x.trim().normalize("NFC"));
  const ix = (n) => h.indexOf(n);
  const c = { key: ix("할일키"), proj: ix("프로젝트코드"), title: ix("할일명"), who: ix("담당자"), wt: ix("업무유형"),
    st: ix("상태"), due: ix("마감일"), stage: ix("SE단계"), lk: ix("연결유형"), lr: ix("연결대상"),
    cc: ix("완료기준"), org: ix("출처"), mail: ix("관련메일이력키"), art: ix("산출물참조") };
  const g = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const records = recs.slice(1).map((r) => ({
    id: g(r, c.key), project_code: g(r, c.proj), title: g(r, c.title), assignee_ref: g(r, c.who),
    work_type: g(r, c.wt), status: g(r, c.st), due: g(r, c.due), anchor_stage_code: g(r, c.stage),
    link_kind: g(r, c.lk), link_ref: g(r, c.lr) || g(r, c.art), completion_criteria: g(r, c.cc),
    origin: g(r, c.org) || "ledger", origin_mail_id: g(r, c.mail)
  })).filter((x) => x.id && x.title);
  return { rows: recs.length - 1, records };
}

if (doApply) {
  const store = openStore(dbPathFrom(dbArg));
  let wrote = 0, fresh = 0, skipped = 0, led = 0;
  for (const folder of folders) {
    const { records } = readLedger(folder);
    let n = 0, nf = 0;
    for (const rec of records) {
      const r = store.ingestTaskItem(rec);
      if (r.error) { skipped++; continue; }
      n++; wrote++; if (r.isNew) { nf++; fresh++; }
    }
    if (n) { led++; console.log(`[apply] ${folder}: ${n}건 upsert(신규 ${nf})`); }
  }
  store.appendEvent({ actor_ref: "task_ledger", actor_kind: "system", kind: "task_ledger_ingest", to: String(wrote), used_refs: ["core_item"], data_label: "real", note: `신규 ${fresh}·스킵 ${skipped}` });
  store.db.close();
  console.log(`[apply] 완료: ${led}개 장부 · 할일 ${wrote}건 ingest(신규 ${fresh}, 스킵 ${skipped}).`);
  process.exit(0);
}

// ---------- dry-run ----------
console.log(`# 할일 장부 dry-run — ${folders.length}개 장부 발견 (${srcRoot})`);
let total = 0;
for (const folder of folders) { const { rows } = readLedger(folder); total += rows; console.log(`  ${folder}: ${rows}행`); }
console.log(`# 합계 ${total}행. export: node tools/task_ledger.mjs --export --db data/dev-erp.db [--out <dir>]`);
console.log(`#         ingest: node tools/task_ledger.mjs --apply  --db data/dev-erp.db [--project <code>]`);
