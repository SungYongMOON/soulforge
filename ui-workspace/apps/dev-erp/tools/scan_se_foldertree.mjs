#!/usr/bin/env node
// tools/scan_se_foldertree.mjs — _workspaces/<코드> SE 폴더트리를 읽어 ingest 가능 구조를 dry-run 보고.
// DB 미변경(읽기·집계만). 입력: 단계 폴더(030_SRR~240_LL) + SE_산출물_목록.csv
//   (게이트·산출물ID·산출물명·완료기준·경로·마감) + 회의 폴더 + PROJECT_ID.txt.
// dev-erp 원문 미저장 포인터 모델: 실제 ingest(core_stage/산출물 포인터/completion_criteria)는
//   이 구조 확인 후 별도 단계(owner 확인). 이 도구는 무엇을 ingest할 수 있는지 집계만 보여준다.
// 보안: 산출물명/근거 등 업무 원문은 출력하지 않고 건수·커버리지·게이트 분포만 출력.
// zero-dependency: node:fs/path. 워크스페이스 정션(심링크) 자동 추적.
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));           // .../dev-erp/tools
const REPO = resolve(HERE, "..", "..", "..", "..");             // repo root (tools→dev-erp→apps→ui-workspace→root)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const wsDir = arg("workspaces", join(REPO, "_workspaces"));
const only = arg("project", null);

const STAGE_RE = /^(\d{3})_/; // 030_SRR

// 최소 CSV 라인 파서(따옴표·이스케이프 처리).
function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}

function scanProject(dir, code) {
  // macOS 파일명은 NFD(분해형) → NFC 정규화로 비교(한글 매칭). 파일 열 때는 원본명(raw) 사용.
  const entries = (existsSync(dir) ? readdirSync(dir) : []).map((e) => ({ raw: e, nfc: e.normalize("NFC") }));
  const stages = entries.filter((e) => STAGE_RE.test(e.nfc)).map((e) => e.nfc.match(STAGE_RE)[1]).sort();
  const hasMeetings = entries.some((e) => e.nfc === "회의");
  const hasProjectId = entries.some((e) => e.nfc === "PROJECT_ID.txt");
  const csvEntry = entries.find((e) => /SE_산출물_목록\.csv$/.test(e.nfc));
  const deliv = { rows: 0, withCriteria: 0, withDue: 0, withPath: 0, byGate: {} };
  if (csvEntry) {
    const raw = readFileSync(join(dir, csvEntry.raw), "utf8").replace(/^﻿/, "").normalize("NFC");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const header = parseCsvLine(lines[0]).map((h) => h.trim().normalize("NFC"));
    const gi = header.indexOf("게이트"), ci = header.indexOf("완료기준"), di = header.indexOf("제출마감일"), pi = header.indexOf("경로");
    for (const ln of lines.slice(1)) {
      const f = parseCsvLine(ln);
      deliv.rows++;
      const gate = (gi >= 0 ? f[gi] : "" || "").trim() || "(미지정)";
      deliv.byGate[gate] = (deliv.byGate[gate] || 0) + 1;
      if (ci >= 0 && (f[ci] || "").trim()) deliv.withCriteria++;
      if (di >= 0 && (f[di] || "").trim()) deliv.withDue++;
      if (pi >= 0 && (f[pi] || "").trim()) deliv.withPath++;
    }
  }
  return { code, stages, deliv, hasMeetings, hasProjectId, hasCsv: !!csvEntry };
}

const codes = (existsSync(wsDir) ? readdirSync(wsDir) : [])
  .filter((e) => /^P\d{2}-\d{3}/.test(e) && (!only || e === only))
  .filter((e) => { try { return statSync(join(wsDir, e)).isDirectory(); } catch { return false; } });

const projects = codes.map((e) => scanProject(join(wsDir, e), e));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

console.log(`# SE 폴더트리 dry-run 스캔 (DB 미변경) — ${projects.length}개 과제`);
console.log(`# 소스: ${wsDir} (정션 → OneDrive company). 원문 미출력(건수·커버리지만).`);
let totalDeliv = 0;
for (const p of projects) {
  console.log(`\n## ${p.code}`);
  console.log(`  단계 폴더: ${p.stages.length ? p.stages.join(", ") : "(없음)"}`);
  if (p.hasCsv) {
    totalDeliv += p.deliv.rows;
    console.log(`  산출물(CSV): ${p.deliv.rows}건 · 완료기준 ${p.deliv.withCriteria}(${pct(p.deliv.withCriteria, p.deliv.rows)}) · 마감 ${p.deliv.withDue}(${pct(p.deliv.withDue, p.deliv.rows)}) · 경로포인터 ${p.deliv.withPath}(${pct(p.deliv.withPath, p.deliv.rows)})`);
    console.log(`    게이트별: ${Object.entries(p.deliv.byGate).sort().map(([g, n]) => `${g}=${n}`).join(", ")}`);
  } else console.log(`  산출물 목록 CSV: 없음`);
  console.log(`  회의 폴더: ${p.hasMeetings ? "있음" : "없음"} · PROJECT_ID: ${p.hasProjectId ? "있음" : "없음"}`);
}
console.log(`\n# 합계 산출물 ${totalDeliv}건. 다음(owner 확인 후): 게이트→core_stage.stage_code,`);
console.log(`#   산출물→core_artifact 포인터(경로 미저장), 완료기준→core_item.completion_criteria,`);
console.log(`#   마감→due. ingest 는 별도 --apply 도구로(현재는 스캔만).`);
