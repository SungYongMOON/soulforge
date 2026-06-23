// tools/completion_ledger.mjs — 완료 기록(completion_log) 파일 정본화. DB↔_workmeta round-trip.
// 기초감사 MED-1: completion_log 는 '담당자별 처리량·토큰·지식의 내구 기록'인데 DB에만 있어 이식·백업 불가였다.
// 작업_장부/할일_장부 가족으로 per-project _workmeta/<code>/reports/완료_장부/완료_장부.csv 에 둔다(없으면 _general).
//   --export : completion_log → _workmeta/<code>/reports/완료_장부/완료_장부.csv   (ERP가 장부를 씀)
//   --apply  : 완료_장부.csv → completion_log  (item_id+created_at 중복 skip = 멱등 복원)
// 원문·secret 미저장 — 요약/지식후보 텍스트와 포인터만(메일 본문 금지).
// 사용: node tools/completion_ledger.mjs --export [--db <path>] [--out <_workmeta>]
//       node tools/completion_ledger.mjs --apply  [--db <path>] [--out <_workmeta>]
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const dbPath = arg("db", join(HERE, "..", "data", "dev-erp.db"));
const outRoot = arg("out", join(HERE, "..", "..", "..", "..", "_workmeta"));
const COLS = ["item_id", "title", "assignee_ref", "work_type", "project_id", "done_at", "completed_by", "summary", "knowledge", "tokens", "created_at"];
const safeSeg = (s) => String(s).replace(/[\/\\:*?"<>|]/g, "_").trim() || "_general";

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => "﻿" + [COLS.join(",")].concat(rows.map((r) => COLS.map((c) => csvCell(r[c])).join(","))).join("\n") + "\n";
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const README = (code) => `# 완료 장부\n\n- Project code: \`${code}\`\n- Owner path: \`_workmeta/${code}/reports/완료_장부/\`\n- Ledger file: \`완료_장부.csv\`\n\n## Use\n\n- 한 행 = 한 번의 완료 기록(담당자·작업유형·요약·지식후보·토큰·완료시각). 내구 기록이라 item 재완료/삭제와 무관하게 보존.\n- ERP(dev-erp)가 export 로 쓰고 apply 로 읽는 왕복. \`item_id\`+\`created_at\` 중복은 skip(멱등).\n- 원문/첨부/secret 미저장. 요약/지식 텍스트와 포인터만.\n`;

if (!existsSync(dbPath)) { console.error(`[completion_ledger] DB 없음: ${dbPath}`); process.exit(2); }
const db = new DatabaseSync(dbPath);
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='completion_log'").get()) {
  console.log("[completion_ledger] completion_log 테이블 없음 — 할 일 없음"); db.close(); process.exit(0);
}

if (has("export")) {
  const groups = db.prepare("SELECT DISTINCT COALESCE(NULLIF(project_id,''),'_general') p FROM completion_log").all().map((r) => r.p);
  let nProj = 0, nRows = 0;
  for (const p of groups) {
    const rows = db.prepare(`SELECT ${COLS.join(",")} FROM completion_log WHERE COALESCE(NULLIF(project_id,''),'_general')=? ORDER BY created_at, id`).all(p);
    if (!rows.length) continue;
    const dir = join(outRoot, safeSeg(p), "reports", "완료_장부");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "완료_장부.csv"), toCsv(rows), "utf8");
    if (!existsSync(join(dir, "README.md"))) writeFileSync(join(dir, "README.md"), README(p), "utf8");
    nProj++; nRows += rows.length;
  }
  console.log(`[export] ${nRows}건 완료기록 → ${nProj}개 프로젝트 _workmeta/<code>/reports/완료_장부/완료_장부.csv`);
  db.close();
} else if (has("apply")) {
  if (!existsSync(outRoot)) { console.log(`[apply] ${outRoot} 없음 — 할 일 없음`); db.close(); process.exit(0); }
  const codes = readdirSync(outRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const exists = db.prepare("SELECT 1 FROM completion_log WHERE COALESCE(item_id,'')=? AND created_at=?");
  const ins = db.prepare(`INSERT INTO completion_log(${COLS.join(",")}) VALUES(${COLS.map(() => "?").join(",")})`);
  let add = 0, skip = 0;
  for (const code of codes) {
    const file = join(outRoot, code, "reports", "완료_장부", "완료_장부.csv");
    if (!existsSync(file)) continue;
    const rows = parseCsv(readFileSync(file, "utf8"));
    const header = rows.shift() || [];
    for (const r of rows) {
      const o = {}; header.forEach((h, i) => (o[h] = r[i]));
      if (!o.created_at) continue;
      if (exists.get(String(o.item_id ?? ""), o.created_at)) { skip++; continue; }
      ins.run(...COLS.map((c) => (c === "tokens" ? (o.tokens === "" || o.tokens == null ? null : Number(o.tokens)) : (o[c] === "" ? null : o[c] ?? null))));
      add++;
    }
  }
  console.log(`[apply] add ${add} · skip ${skip}`);
  db.close();
} else {
  console.error("usage: node tools/completion_ledger.mjs --export|--apply [--db <path>] [--out <_workmeta>]");
  db.close();
  process.exit(2);
}
