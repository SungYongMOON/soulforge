#!/usr/bin/env node
// dev-erp doctor (하네스 B2): 환경/상태 진단 — 표준 Node 만.
// 사용: node tools/doctor.mjs [--live] [--port 4300]
//  --live: 로컬 서버 /api/health 도 확인 (127.0.0.1 한정 — 외부 전송 아님)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));

export function checkNode(version = process.versions.node) {
  const [maj, min] = version.split(".").map(Number);
  const ok = maj > 22 || (maj === 22 && min >= 5);
  return { id: "node", ok, note: `v${version} (node:sqlite 요구 >=22.5)` };
}

export function checkSyntax(files, checker) {
  const bad = files.filter((f) => !checker(f));
  return { id: "syntax", ok: bad.length === 0, note: bad.join("; ") || `${files.length}개 파일 --check 통과` };
}

// DB 상태: 없으면 warn(첫 부팅 시 자동 생성), 있으면 스키마/실메타 신선도
export function checkDb({ dbExists, schemaVersion, realMetaMtime, ingestedMtime }) {
  if (!dbExists) return { id: "db", ok: true, warn: true, note: "data/dev-erp.db 없음 — 서버 첫 기동 시 생성/적재됨" };
  if (schemaVersion !== "dev_erp.v1") return { id: "db", ok: false, note: `schema_version=${schemaVersion} (기대 dev_erp.v1)` };
  if (realMetaMtime && ingestedMtime !== String(realMetaMtime)) {
    return { id: "db", ok: true, warn: true, note: "real_meta.json 이 DB 적재본보다 새것 — 서버 재기동 시 자동 재적재" };
  }
  return { id: "db", ok: true, note: "스키마 v1, 실메타 적재 최신" };
}

export function checkGitignore(read, tracked) {
  const gi = read(".gitignore");
  const ok = gi.includes("data/") && tracked.length === 0;
  return { id: "gitignore", ok, note: ok ? "data/ 보호됨" : `추적된 data 파일 ${tracked.length}건` };
}

export async function checkLive(port = 4300, fetcher = fetch) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetcher(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    return { id: "live_server", ok: j.ok === true, note: `health ok, counts=${JSON.stringify(j.counts)}` };
  } catch {
    return { id: "live_server", ok: true, warn: true, note: "서버 미가동/미접근 (선택 체크 — node server.mjs 로 기동)" };
  }
}

export async function runDoctor({ live = false, port = 4300, root = APP } = {}) {
  const read = (p) => readFileSync(join(root, p), "utf-8");
  const checks = [checkNode()];
  checks.push(checkSyntax(
    ["server.mjs", "src/store.mjs", "src/guide.mjs", "src/lexicon.mjs", "tools/verify_gate.mjs"].filter((f) => existsSync(join(root, f))),
    (f) => { try { execFileSync(process.execPath, ["--check", f], { cwd: root }); return true; } catch { return false; } }
  ));
  // DB 점검 (읽기 전용 — 라이브 서버와 동시 접근 회피 위해 meta 만 살짝)
  const dbPath = join(root, "data", "dev-erp.db");
  let dbInfo = { dbExists: existsSync(dbPath) };
  if (dbInfo.dbExists) {
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(dbPath, { readOnly: true });
      dbInfo.schemaVersion = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value;
      dbInfo.ingestedMtime = db.prepare("SELECT value FROM meta WHERE key='real_ingest_mtime'").get()?.value;
      db.close();
      const rm = join(root, "data", "real_meta.json");
      if (existsSync(rm)) dbInfo.realMetaMtime = statSync(rm).mtimeMs;
    } catch (e) {
      checks.push({ id: "db_open", ok: false, note: `읽기 실패: ${String(e.message).slice(0, 80)}` });
    }
  }
  checks.push(checkDb(dbInfo));
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files", "data"], { cwd: root, encoding: "utf-8" }).split("\n").filter(Boolean); } catch { /* git 없음 */ }
  checks.push(checkGitignore(read, tracked));
  if (live) checks.push(await checkLive(port));
  return { checks, ok: checks.every((c) => c.ok) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const r = await runDoctor({ live: args.includes("--live"), port: Number(flag("port", "4300")) });
  console.log(`[dev-erp doctor] ${r.ok ? "OK" : "문제 발견"}`);
  for (const c of r.checks) console.log(` ${c.ok ? (c.warn ? "△" : "✓") : "✗"} ${c.id}: ${c.note}`);
  process.exit(r.ok ? 0 : 1);
}
