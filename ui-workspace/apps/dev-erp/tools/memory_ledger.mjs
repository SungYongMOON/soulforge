// tools/memory_ledger.mjs — 담당자 업무 메모리 파일 정본화. DB↔_workmeta round-trip.
// owner 우려("메모리가 DB에만 떠 있다") 해소: 파일이 정본, ERP DB는 이 파일의 ingest 소비자/주입 캐시.
// 2층 모두 왕복: core blob(assignee_memory) → memory.md, 누적 항목(assignee_memory_item) → memory_items.csv.
// 다른 장부(task_ledger/mail_ledger)와 같은 가족 — 사람은 cross-project이라 _workmeta/system/team/<ref>/.
//   --export : DB → _workmeta/system/team/<ref>/{memory.md, memory_items.csv}   (ERP가 장부를 씀)
//   --apply  : 파일 → DB  (신규 ref/항목 복원=import, 기존 blob은 --force 없으면 diff만; 항목은 ref+text 중복 skip)
// 원문·secret 미저장 — 업무 규칙·맥락·포인터만(메일 본문 금지).
// 사용: node tools/memory_ledger.mjs --export [--db <path>] [--out <_workmeta>]
//       node tools/memory_ledger.mjs --apply  [--db <path>] [--out <_workmeta>] [--force]
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const dbPath = arg("db", join(HERE, "..", "data", "dev-erp.db"));
const outRoot = arg("out", join(HERE, "..", "..", "..", "..", "_workmeta")); // tools→dev-erp→apps→ui-workspace→Soulforge
const teamDir = join(outRoot, "system", "team");
const force = has("force");
const BODY = "<!-- MEMORY BODY BELOW — 이 줄 아래가 정본 내용(위는 머리말) -->";
const safeRef = (ref) => String(ref).replace(/[\/\\:*?"<>|]/g, "_").trim() || "_";
const stamp = () => new Date().toISOString();
const ITEM_COLS = ["type", "text", "source_ref", "salience", "created_at", "updated_at", "status"];

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const itemsCsv = (items) => "﻿" + [ITEM_COLS.join(",")].concat(items.map((it) => ITEM_COLS.map((c) => csvCell(it[c])).join(","))).join("\n") + "\n";
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

if (!existsSync(dbPath)) { console.error(`[memory_ledger] DB 없음: ${dbPath}`); process.exit(2); }
const db = new DatabaseSync(dbPath);
const tbl = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const hasBlob = tbl("assignee_memory");
const hasItem = tbl("assignee_memory_item");
if (!hasBlob && !hasItem) { console.log("[memory_ledger] 메모리 테이블 없음 — 할 일 없음"); db.close(); process.exit(0); }

const head = (ref, ts) => `# 담당자 업무 메모리 — ${ref}\n\n`
  + `> 정본은 이 파일입니다. ERP DB(assignee_memory)는 이 파일의 ingest 소비자/주입 캐시입니다.\n`
  + `> 원문·secret 미저장 — 업무 규칙·맥락·포인터만(메일 본문 금지).\n`
  + `> updated_at: ${ts ?? ""}\n>\n> dev-erp tools/memory_ledger.mjs 로 export/apply 왕복. 누적 항목은 memory_items.csv.\n\n${BODY}\n`;

if (has("export")) {
  const refs = new Set();
  if (hasBlob) for (const r of db.prepare("SELECT ref FROM assignee_memory").all()) refs.add(r.ref);
  if (hasItem) for (const r of db.prepare("SELECT DISTINCT ref FROM assignee_memory_item").all()) refs.add(r.ref);
  let nCore = 0, nItems = 0;
  for (const ref of [...refs].sort()) {
    const blob = hasBlob ? db.prepare("SELECT content, updated_at FROM assignee_memory WHERE ref=?").get(ref) : null;
    const items = hasItem ? db.prepare(`SELECT ${ITEM_COLS.join(",")} FROM assignee_memory_item WHERE ref=? ORDER BY id`).all(ref) : [];
    const hasCore = blob && String(blob.content ?? "").trim();
    if (!hasCore && !items.length) continue;
    const dir = join(teamDir, safeRef(ref));
    mkdirSync(dir, { recursive: true });
    if (hasCore) { writeFileSync(join(dir, "memory.md"), head(ref, blob.updated_at) + String(blob.content), "utf8"); nCore++; }
    if (items.length) { writeFileSync(join(dir, "memory_items.csv"), itemsCsv(items), "utf8"); nItems++; }
  }
  console.log(`[export] core ${nCore}명 · items ${nItems}명 → _workmeta/system/team/<ref>/`);
  db.close();
} else if (has("apply")) {
  if (!existsSync(teamDir)) { console.log(`[apply] ${teamDir} 없음 — 할 일 없음`); db.close(); process.exit(0); }
  const dirs = readdirSync(teamDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  let imported = 0, conflict = 0, noop = 0, itemAdd = 0, itemSkip = 0;
  const get = hasBlob ? db.prepare("SELECT content FROM assignee_memory WHERE ref=?") : null;
  const up = hasBlob ? db.prepare("INSERT INTO assignee_memory(ref, content, updated_at) VALUES(?,?,?) ON CONFLICT(ref) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at") : null;
  const itemExists = hasItem ? db.prepare("SELECT 1 FROM assignee_memory_item WHERE ref=? AND text=?") : null;
  const itemIns = hasItem ? db.prepare("INSERT INTO assignee_memory_item(ref,type,text,source_ref,salience,created_at,updated_at,status) VALUES(?,?,?,?,?,?,?,?)") : null;
  for (const d of dirs) {
    const mdFile = join(teamDir, d.name, "memory.md");
    const csvFile = join(teamDir, d.name, "memory_items.csv");
    let ref = d.name;
    if (hasBlob && existsSync(mdFile)) { // core blob 복원
      const text = readFileSync(mdFile, "utf8");
      const idx = text.indexOf(BODY);
      const content = (idx >= 0 ? text.slice(idx + BODY.length) : text).replace(/^\r?\n/, "");
      const m = text.match(/^#\s*담당자 업무 메모리\s*—\s*(.+)$/m);
      ref = (m ? m[1].trim() : d.name);
      const cur = get.get(ref);
      if (cur == null) { up.run(ref, content, stamp()); imported++; }
      else if (String(cur.content) === content) { noop++; }
      else if (force) { up.run(ref, content, stamp()); imported++; }
      else { conflict++; console.log(`[conflict] ${ref}: DB와 파일 다름(--force 로 덮어쓰기)`); }
    }
    if (hasItem && existsSync(csvFile)) { // 누적 항목 복원(ref+text 중복 skip = 멱등)
      const rows = parseCsv(readFileSync(csvFile, "utf8"));
      const header = rows.shift() || [];
      for (const r of rows) {
        const o = {}; header.forEach((h, i) => (o[h] = r[i]));
        if (!o.text || !String(o.text).trim()) continue;
        if (itemExists.get(ref, o.text)) { itemSkip++; continue; }
        itemIns.run(ref, o.type || "fact", o.text, o.source_ref || null, Number(o.salience) || 0.5, o.created_at || stamp(), o.updated_at || stamp(), o.status || "active");
        itemAdd++;
      }
    }
  }
  console.log(`[apply] core: import ${imported} · noop ${noop} · conflict ${conflict} / items: add ${itemAdd} · skip ${itemSkip}`);
  db.close();
} else {
  console.error("usage: node tools/memory_ledger.mjs --export|--apply [--db <path>] [--out <_workmeta>] [--force]");
  db.close();
  process.exit(2);
}
