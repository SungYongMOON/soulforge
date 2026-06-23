// tools/ai_proposal_ledger.mjs — AI 제안 착지면(ai_proposal) 파일 정본화. DB↔_workmeta round-trip.
// 기초감사 후속: ai_proposal(P-4 키스톤 — AI/규칙 산출이 pending 으로 적재되고 사람 approve 후에만 도메인 쓰기)는
// 사람-AI 협업 의사결정 감사추적인데 DB에만 있어 이식·백업 불가였다. cross-cutting 이라 system-wide 단일 장부.
//   --export : ai_proposal → _workmeta/system/ai_proposal_ledger/ai_proposal_ledger.csv   (ERP가 장부를 씀)
//   --apply  : csv → ai_proposal  (id 중복 skip = 멱등 복원; id 가 TEXT PK 라 복원이 정확)
// 원문·secret 미저장 — 제안 payload/요약/포인터만(메일 본문 금지).
// 사용: node tools/ai_proposal_ledger.mjs --export [--db <path>] [--out <_workmeta>]
//       node tools/ai_proposal_ledger.mjs --apply  [--db <path>] [--out <_workmeta>]
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const dbPath = arg("db", join(HERE, "..", "data", "dev-erp.db"));
const outRoot = arg("out", join(HERE, "..", "..", "..", "..", "_workmeta"));
const dir = join(outRoot, "system", "ai_proposal_ledger");
const file = join(dir, "ai_proposal_ledger.csv");
const COLS = ["id", "at", "source", "kind", "target_ref", "payload_json", "summary", "status", "decided_at", "decided_by", "applied_ref", "used_refs", "data_label"];

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
const README = `# AI 제안 장부 (ai_proposal)\n\n- Owner path: \`_workmeta/system/ai_proposal_ledger/\`\n- Ledger file: \`ai_proposal_ledger.csv\`\n\n## Use\n\n- 한 행 = AI/규칙 산출 제안 1건(착지면). pending→사람 approve 후에만 도메인 쓰기(P-4 키스톤). 사람-AI 협업 의사결정 감사추적.\n- ERP(dev-erp)가 export 로 쓰고 apply 로 읽는 왕복. \`id\`(TEXT PK) 중복은 skip(멱등).\n- 원문/첨부/secret 미저장. 제안 payload/요약/포인터만.\n`;

if (!existsSync(dbPath)) { console.error(`[ai_proposal_ledger] DB 없음: ${dbPath}`); process.exit(2); }
const db = new DatabaseSync(dbPath);
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_proposal'").get()) {
  console.log("[ai_proposal_ledger] ai_proposal 테이블 없음 — 할 일 없음"); db.close(); process.exit(0);
}

if (has("export")) {
  const rows = db.prepare(`SELECT ${COLS.join(",")} FROM ai_proposal ORDER BY at, id`).all();
  if (!rows.length) { console.log("[export] ai_proposal 0건 — 파일 안 만듦"); db.close(); process.exit(0); }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, toCsv(rows), "utf8");
  if (!existsSync(join(dir, "README.md"))) writeFileSync(join(dir, "README.md"), README, "utf8");
  console.log(`[export] ${rows.length}건 AI 제안 → _workmeta/system/ai_proposal_ledger/ai_proposal_ledger.csv`);
  db.close();
} else if (has("apply")) {
  if (!existsSync(file)) { console.log(`[apply] ${file} 없음 — 할 일 없음`); db.close(); process.exit(0); }
  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift() || [];
  const exists = db.prepare("SELECT 1 FROM ai_proposal WHERE id=?");
  const ins = db.prepare(`INSERT INTO ai_proposal(${COLS.join(",")}) VALUES(${COLS.map(() => "?").join(",")})`);
  let add = 0, skip = 0;
  for (const r of rows) {
    const o = {}; header.forEach((h, i) => (o[h] = r[i]));
    if (!o.id) continue;
    if (exists.get(o.id)) { skip++; continue; }
    // NOT NULL 컬럼 기본값 보정(at/source/kind/payload_json/status/data_label)
    ins.run(o.id, o.at || "", o.source || "import", o.kind || "unknown", o.target_ref || null, o.payload_json || "{}",
      o.summary || null, o.status || "pending", o.decided_at || null, o.decided_by || null, o.applied_ref || null, o.used_refs || null, o.data_label || "real");
    add++;
  }
  console.log(`[apply] add ${add} · skip ${skip}`);
  db.close();
} else {
  console.error("usage: node tools/ai_proposal_ledger.mjs --export|--apply [--db <path>] [--out <_workmeta>]");
  db.close();
  process.exit(2);
}
