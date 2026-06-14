#!/usr/bin/env node
// tools/sync_project_names.mjs — 과제명을 워크스페이스 폴더(=정본)에서 동기화.
// 구조: `_workspaces/<코드>` 는 심링크로 OneDrive `company/<코드 + 한글명>` 을 가리킨다(정션).
//   즉 사람이 쓰는 실제 과제명은 그 대상 폴더명에 있다(예: P26-014 → "P26-014 KVDS 기뢰탐색음탐기").
// dev-erp 는 원문 미저장 포인터 모델이므로 과제 식별/이름의 진실 소스도 이 워크스페이스 폴더다.
// 이 도구는 폴더명에서 과제명을 읽어 ingest 메타(real_meta.json)의 빈/번호뿐인 title 을 채운다.
// zero-dependency: node:fs/path 만. real_meta.json 은 gitignored 로컬 데이터(외부 미노출).
//
// 사용:
//   node tools/sync_project_names.mjs [--workspaces <경로>] [--meta <real_meta.json>] [--dry]
//   --dry  : 변경 미적용, 매핑만 출력
import { readdirSync, lstatSync, readlinkSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));               // .../dev-erp/tools
const APP = resolve(HERE, "..");                                    // .../dev-erp
const REPO = resolve(APP, "..", "..", "..");                        // repo root
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const dry = process.argv.includes("--dry");
const wsDir = arg("workspaces", join(REPO, "_workspaces"));
const metaPath = arg("meta", join(APP, "data", "real_meta.json"));

// 1) 워크스페이스 폴더(심링크 대상 포함)명에서 코드 → 과제명 추출.
function workspaceNames(dir) {
  const map = {};
  if (!existsSync(dir)) return map;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    let display = e;
    try {
      const st = lstatSync(full);
      if (st.isSymbolicLink()) display = basename(readlinkSync(full)); // 정션 대상 실폴더명
      else if (!st.isDirectory()) continue;
    } catch { continue; }
    const m = display.match(/^(P\d{2}-\d{3})\s+(.+)$/); // 코드 + 한글명 (이름 없는 INBOX 등은 제외)
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

const names = workspaceNames(wsDir);
const found = Object.keys(names).length;
if (!found) { console.error(`[sync] 워크스페이스에서 과제명을 못 찾음: ${wsDir}`); process.exit(found ? 0 : 1); }

if (!existsSync(metaPath)) { console.error(`[sync] meta 없음: ${metaPath} (매핑만 출력)`); for (const [k, v] of Object.entries(names)) console.log(`  ${k}  →  ${v}`); process.exit(0); }

// 2) real_meta.json 의 title 갱신(번호뿐이거나 비어 있으면 폴더명으로).
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const changes = [];
for (const p of meta.projects ?? []) {
  const name = names[p.id];
  if (!name) continue;
  if (p.title !== name) { changes.push(`${p.id}: ${p.title === p.id ? "(번호)" : p.title} → ${name}`); p.title = name; }
}
console.log(`[sync] 워크스페이스 과제명 ${found}건, 변경 ${changes.length}건${dry ? " (dry-run)" : ""}`);
for (const c of changes) console.log(`  ${c}`);
if (!dry && changes.length) { writeFileSync(metaPath, JSON.stringify(meta, null, 2)); console.log(`[sync] 적용: ${metaPath}`); }
