// dev-erp DB 백업 — 라이브(WAL) DB를 VACUUM INTO 로 일관 스냅샷 + 라벨별 보존(오래된 것 정리).
// data/ 는 gitignore(실데이터)라 형상관리가 안 되므로, 이 스냅샷이 유일한 복구 경로다. 배포 전·일일 호출 권장.
// 사용: node tools/backup_db.mjs <dbPath> <backupRoot> [label] [keepN]
//   예) node tools/backup_db.mjs data/dev-erp.db data/backups predeploy 20
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [, , dbPath, backupRoot, label = "manual", keepStr = "14"] = process.argv;
if (!dbPath || !backupRoot) {
  console.error("usage: node tools/backup_db.mjs <dbPath> <backupRoot> [label] [keepN]");
  process.exit(2);
}
const keep = Math.max(1, Number(keepStr) || 14);
const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14); // YYYYMMDDHHmmss
const dir = join(backupRoot, `${label}_${ts}`);
mkdirSync(dir, { recursive: true });
const dest = join(dir, "dev-erp.db");

// VACUUM INTO: 라이브 서버가 열어둔 WAL DB도 읽기 락만으로 일관 스냅샷 생성(원본 미변경).
const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

// 무결성 빠른 확인
const v = new DatabaseSync(dest, { readOnly: true });
const items = v.prepare("SELECT COUNT(*) c FROM core_item").get().c;
const mail = v.prepare("SELECT COUNT(*) c FROM core_mail").get().c;
v.close();
console.log(`[backup] ${dir}  (items ${items}, mail ${mail})`);

// 보존: 같은 label 접두 스냅샷 중 최신 keep개만 유지(라벨별 풀 분리).
const olds = readdirSync(backupRoot).filter((n) => n.startsWith(`${label}_`)).sort();
const drop = olds.slice(0, Math.max(0, olds.length - keep));
for (const d of drop) rmSync(join(backupRoot, d), { recursive: true, force: true });
if (drop.length) console.log(`[backup] pruned ${drop.length} old (kept ${keep})`);
