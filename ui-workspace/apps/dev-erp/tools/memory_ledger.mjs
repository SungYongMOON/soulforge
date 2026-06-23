// tools/memory_ledger.mjs — 담당자 업무 메모리(assignee_memory) 파일 정본화. DB↔_workmeta round-trip.
// owner 우려("메모리가 DB에만 떠 있다") 해소: 파일이 정본, ERP DB는 이 파일의 ingest 소비자/주입 캐시.
// 다른 장부(task_ledger/mail_ledger)와 같은 가족 — 사람은 cross-project이므로 _workmeta/system/team/<ref>/.
//   --export : assignee_memory → _workmeta/system/team/<ref>/memory.md  (ERP가 장부를 씀)
//   --apply  : memory.md → assignee_memory  (신규 ref 복원=import, 기존은 --force 없으면 diff만 보고)
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

if (!existsSync(dbPath)) { console.error(`[memory_ledger] DB 없음: ${dbPath}`); process.exit(2); }
const db = new DatabaseSync(dbPath);
const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assignee_memory'").get();
if (!hasTable) { console.log("[memory_ledger] assignee_memory 테이블 없음 — 할 일 없음"); db.close(); process.exit(0); }

const head = (ref, ts) => `# 담당자 업무 메모리 — ${ref}\n\n`
  + `> 정본은 이 파일입니다. ERP DB(assignee_memory)는 이 파일의 ingest 소비자/주입 캐시입니다.\n`
  + `> 원문·secret 미저장 — 업무 규칙·맥락·포인터만(메일 본문 금지).\n`
  + `> updated_at: ${ts ?? ""}\n>\n> dev-erp tools/memory_ledger.mjs 로 export/apply 왕복.\n\n${BODY}\n`;

if (has("export")) {
  const rows = db.prepare("SELECT ref, content, updated_at FROM assignee_memory ORDER BY ref").all();
  let n = 0;
  for (const r of rows) {
    if (!r.content || !String(r.content).trim()) continue; // 빈 메모리는 파일 안 만듦
    const dir = join(teamDir, safeRef(r.ref));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "memory.md"), head(r.ref, r.updated_at) + String(r.content), "utf8");
    n++;
  }
  console.log(`[export] ${n}명 메모리 → _workmeta/system/team/<ref>/memory.md`);
  db.close();
} else if (has("apply")) {
  if (!existsSync(teamDir)) { console.log(`[apply] ${teamDir} 없음 — 할 일 없음`); db.close(); process.exit(0); }
  const dirs = readdirSync(teamDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  let imported = 0, conflict = 0, noop = 0;
  const get = db.prepare("SELECT content FROM assignee_memory WHERE ref=?");
  const up = db.prepare("INSERT INTO assignee_memory(ref, content, updated_at) VALUES(?,?,?) ON CONFLICT(ref) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at");
  for (const d of dirs) {
    const file = join(teamDir, d.name, "memory.md");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const idx = text.indexOf(BODY);
    const content = (idx >= 0 ? text.slice(idx + BODY.length) : text).replace(/^\r?\n/, ""); // 구분 개행 1개만 제거(무손실)
    const m = text.match(/^#\s*담당자 업무 메모리\s*—\s*(.+)$/m); // ref 정본 = 머리말(폴더명은 sanitize 됐을 수 있음)
    const ref = (m ? m[1].trim() : d.name);
    const cur = get.get(ref);
    if (cur == null) { up.run(ref, content, stamp()); imported++; }              // 신규(복원) → import
    else if (String(cur.content) === content) { noop++; }                        // 동일 → noop
    else if (force) { up.run(ref, content, stamp()); imported++; }               // --force → 덮어씀
    else { conflict++; console.log(`[conflict] ${ref}: DB와 파일 다름(--force 로 덮어쓰기)`); }
  }
  console.log(`[apply] import ${imported} · noop ${noop} · conflict ${conflict}`);
  db.close();
} else {
  console.error("usage: node tools/memory_ledger.mjs --export|--apply [--db <path>] [--out <_workmeta>] [--force]");
  db.close();
  process.exit(2);
}
