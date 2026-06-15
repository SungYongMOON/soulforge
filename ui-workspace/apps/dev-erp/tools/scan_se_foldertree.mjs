#!/usr/bin/env node
// tools/scan_se_foldertree.mjs — _workspaces/<코드> SE 폴더트리를 읽어 ingest 가능 구조를 보고.
// 기본은 dry-run(DB 미변경·읽기·집계만). --apply 일 때만 core_deliverable 로 ingest(DB 쓰기).
//   입력: 단계 폴더(030_SRR~240_LL) + SE_산출물_목록.csv
//   (게이트·산출물ID·산출물명·완료기준·경로·마감) + 회의 폴더 + PROJECT_ID.txt.
// dev-erp 원문 미저장 포인터 모델: out_pointer 는 상대 _workspaces/<과제>/<경로>/03_Out 텍스트만.
//   파일 본문/원문은 DB 에 저장하지 않는다. 절대경로(/Volumes·/Users·OneDrive) 저장 금지.
// 보안(dry-run): 산출물명/근거 등 업무 원문은 출력하지 않고 건수·커버리지·게이트 분포만 출력.
// zero-dependency: node:fs/path/sqlite. 워크스페이스 정션(심링크) 자동 추적.
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));           // .../dev-erp/tools
const APP = resolve(HERE, "..");                               // .../dev-erp
const REPO = resolve(HERE, "..", "..", "..", "..");             // repo root (tools→dev-erp→apps→ui-workspace→root)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const wsDir = arg("workspaces", join(REPO, "_workspaces"));
const only = arg("project", null);
const apply = has("apply");
const dbArg = arg("db", null);                                 // --apply 시 상대 DB 경로(앱 기준 또는 절대)

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

// CSV 경로(NFC, '/' 구분)를 디스크에서 해석(macOS 디렉터리는 NFD 일 수 있어 NFC 비교로 매칭).
// 성공하면 실제(raw) 절대 디렉터리 경로 반환, 실패하면 null.
function resolveRelDir(projDir, relPath) {
  let cur = projDir;
  for (const seg of String(relPath).split("/").map((s) => s.trim()).filter(Boolean)) {
    const entries = existsSync(cur) ? readdirSync(cur) : [];
    const match = entries.find((e) => e.normalize("NFC") === seg.normalize("NFC"));
    if (!match) return null;
    cur = join(cur, match);
  }
  return cur;
}

// 산출물 디렉터리 안 '03_Out' 박스에 일반 파일(또는 하위 항목)이 1개 이상인가 → produced.
function outBoxProduced(delivDir) {
  if (!delivDir || !existsSync(delivDir)) return false;
  const out = readdirSync(delivDir).find((e) => e.normalize("NFC") === "03_Out");
  if (!out) return false;
  const outDir = join(delivDir, out);
  try {
    return readdirSync(outDir).filter((e) => !e.startsWith(".") && e !== ".gitkeep").length > 0;
  } catch { return false; }
}

// 경로 마지막 세그먼트의 _F/_D 접미로 제출유형 도출.
function submitTypeFromPath(relPath) {
  const last = String(relPath || "").split("/").pop() || "";
  if (/_F$/.test(last)) return "final";
  if (/_D$/.test(last)) return "draft";
  return null;
}

function scanProject(dir, code) {
  // macOS 파일명은 NFD(분해형) → NFC 정규화로 비교(한글 매칭). 파일 열 때는 원본명(raw) 사용.
  const entries = (existsSync(dir) ? readdirSync(dir) : []).map((e) => ({ raw: e, nfc: e.normalize("NFC") }));
  const stages = entries.filter((e) => STAGE_RE.test(e.nfc)).map((e) => e.nfc.match(STAGE_RE)[1]).sort();
  const hasMeetings = entries.some((e) => e.nfc === "회의");
  const hasProjectId = entries.some((e) => e.nfc === "PROJECT_ID.txt");
  const csvEntry = entries.find((e) => /SE_산출물_목록\.csv$/.test(e.nfc));
  const deliv = { rows: 0, withCriteria: 0, withDue: 0, withPath: 0, pathResolved: 0, produced: 0, byGate: {}, records: [] };
  if (csvEntry) {
    const raw = readFileSync(join(dir, csvEntry.raw), "utf8").replace(/^﻿/, "").normalize("NFC");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const header = parseCsvLine(lines[0]).map((h) => h.trim().normalize("NFC"));
    const gi = header.indexOf("게이트"), ii = header.indexOf("산출물ID"), ni = header.indexOf("산출물명");
    const ci = header.indexOf("완료기준"), di = header.indexOf("제출마감일"), pi = header.indexOf("경로");
    for (const ln of lines.slice(1)) {
      const f = parseCsvLine(ln);
      deliv.rows++;
      const gate = (gi >= 0 ? (f[gi] || "") : "").trim() || "(미지정)";
      const no = (ii >= 0 ? (f[ii] || "") : "").trim();
      const name = (ni >= 0 ? (f[ni] || "") : "").trim();
      const criteria = (ci >= 0 ? (f[ci] || "") : "").trim();
      const due = (di >= 0 ? (f[di] || "") : "").trim();
      const relPath = (pi >= 0 ? (f[pi] || "") : "").trim();
      deliv.byGate[gate] = (deliv.byGate[gate] || 0) + 1;
      if (criteria) deliv.withCriteria++;
      if (due) deliv.withDue++;
      if (relPath) deliv.withPath++;
      // 경로 해석 + produced 자동 판정(폴더 03_Out 내용으로).
      const delivDir = relPath ? resolveRelDir(dir, relPath) : null;
      if (delivDir) deliv.pathResolved++;
      const produced = outBoxProduced(delivDir);
      if (produced) deliv.produced++;
      // out/in_pointer 는 항상 상대(_workspaces/<code>/<경로>/{03_Out,02_Input}). 절대경로 저장 금지.
      const outPointer = relPath ? `_workspaces/${code}/${relPath}/03_Out` : null;
      const inPointer = relPath ? `_workspaces/${code}/${relPath}/02_Input` : null;
      deliv.records.push({
        id: `${code}:${gate}:${no || name}`,
        project_id: code,
        stage_code: gate,
        deliverable_no: no || null,
        name: name || no || "(무명 산출물)",
        submit_type: submitTypeFromPath(relPath),
        completion_criteria: criteria || null,
        due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        out_pointer: outPointer,
        in_pointer: inPointer,
        produced: produced ? 1 : 0,
        review_stage: produced ? 1 : 0,
        data_label: "real"
      });
    }
  }
  return { code, stages, deliv, hasMeetings, hasProjectId, hasCsv: !!csvEntry };
}

const codes = (existsSync(wsDir) ? readdirSync(wsDir) : [])
  .filter((e) => /^P\d{2}-\d{3}/.test(e) && (!only || e === only))
  .filter((e) => { try { return statSync(join(wsDir, e)).isDirectory(); } catch { return false; } });

const projects = codes.map((e) => scanProject(join(wsDir, e), e));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

// ---------- --apply: core_deliverable 로 ingest(DB 쓰기) ----------
if (apply) {
  if (!dbArg) { console.error("[apply] --db <경로> 가 필요합니다(예: --db data/dev-erp.db). 절대경로 금지·상대 권장."); process.exit(2); }
  if (/^([A-Za-z]:[\\/]|\/)/.test(dbArg)) console.warn("[apply] 경고: --db 절대경로 입력. 이식성 위해 상대경로(예: data/dev-erp.db) 권장.");
  // 상대경로는 앱 디렉터리 기준으로 해석(server.mjs 기본 DB_PATH 와 동일 기준).
  const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(dbArg) ? dbArg : resolve(APP, dbArg);
  const store = openStore(dbPath);
  let wrote = 0, projWrote = 0;
  for (const p of projects) {
    if (!p.hasCsv) continue;
    // 과제 행이 있어야 FK 통과 — 없으면 최소 행 생성(title=코드, data_label=real).
    if (!store.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(p.code)) {
      store.upsertProject({ id: p.code, title: p.code, data_label: "real" });
    }
    let n = 0;
    for (const rec of p.deliv.records) { store.upsertCoreDeliverable(rec); n++; wrote++; }
    if (n) {
      projWrote++;
      const byGate = Object.entries(p.deliv.byGate).sort().map(([g, c]) => `${g}=${c}`).join(", ");
      console.log(`[apply] ${p.code}: ${n}건 upsert · produced ${p.deliv.produced} · 경로해석 ${p.deliv.pathResolved}/${p.deliv.rows}`);
      console.log(`        게이트별: ${byGate}`);
    }
  }
  store.appendEvent({ actor_ref: "scan_se_foldertree", actor_kind: "system", kind: "deliverable_ingest", to: String(wrote), used_refs: ["core_deliverable"], data_label: "real", note: `apply ${projWrote}개 과제` });
  store.db.close();
  console.log(`[apply] 완료: ${projWrote}개 과제 · 산출물 ${wrote}건 ingest (DB: ${dbArg}). out_pointer 는 모두 상대경로.`);
  process.exit(0);
}

// ---------- dry-run: 집계만 출력(DB 미변경) ----------
console.log(`# SE 폴더트리 dry-run 스캔 (DB 미변경) — ${projects.length}개 과제`);
console.log(`# 소스: ${wsDir} (정션 → OneDrive company). 원문 미출력(건수·커버리지만). ingest 는 --apply --db <상대경로>.`);
let totalDeliv = 0;
for (const p of projects) {
  console.log(`\n## ${p.code}`);
  console.log(`  단계 폴더: ${p.stages.length ? p.stages.join(", ") : "(없음)"}`);
  if (p.hasCsv) {
    totalDeliv += p.deliv.rows;
    console.log(`  산출물(CSV): ${p.deliv.rows}건 · 완료기준 ${p.deliv.withCriteria}(${pct(p.deliv.withCriteria, p.deliv.rows)}) · 마감 ${p.deliv.withDue}(${pct(p.deliv.withDue, p.deliv.rows)}) · 경로포인터 ${p.deliv.withPath}(${pct(p.deliv.withPath, p.deliv.rows)})`);
    console.log(`  경로 디스크해석 ${p.deliv.pathResolved}(${pct(p.deliv.pathResolved, p.deliv.rows)}) · 03_Out 작성됨(produced) ${p.deliv.produced}(${pct(p.deliv.produced, p.deliv.rows)})`);
    console.log(`    게이트별: ${Object.entries(p.deliv.byGate).sort().map(([g, n]) => `${g}=${n}`).join(", ")}`);
  } else console.log(`  산출물 목록 CSV: 없음`);
  console.log(`  회의 폴더: ${p.hasMeetings ? "있음" : "없음"} · PROJECT_ID: ${p.hasProjectId ? "있음" : "없음"}`);
}
console.log(`\n# 합계 산출물 ${totalDeliv}건. ingest: node tools/scan_se_foldertree.mjs --apply --db data/dev-erp.db [--project <코드>]`);
console.log(`#   게이트→stage_code, 산출물명→name, 경로suffix(_F/_D)→submit_type, 완료기준→completion_criteria,`);
console.log(`#   마감→due, 03_Out 상대포인터→out_pointer(원문 미저장), 03_Out 내용유무→produced/review_stage.`);
