#!/usr/bin/env node
// tools/scan_mail_ledger.mjs — 과제별 메일 장부(_workmeta/<code>/reports/메일_이력/메일_이력.csv)를 읽어 core_mail 로 ingest.
//   "ERP = 흩어진 과제별 장부를 불러와 통합" 모델. 산출물 ingest(scan_se_foldertree)와 같은 패턴의 메일판.
//   장부 표준(soulforge.project_mail_history.private.v1, 21컬럼)은 Codex subsystem 소유 — 여기는 소비자(읽기만).
// 기본은 dry-run(DB 미변경·건수/단계분포만). --apply --db <상대경로> 일 때만 core_mail 로 ingest(DB 쓰기).
// 원문 미저장 포인터 모델: 제목/상대/시각/단계/메일소스ID/상대포인터만 저장. 메일 본문·첨부는 저장하지 않는다.
// 보안(dry-run/apply 로그): 제목·발신자 등 업무 원문은 출력하지 않고 건수·단계분포·신규/중복만 출력.
// zero-dependency: node:fs/path/sqlite. 절대경로(/Volumes·/Users) 저장 금지 — pointer 는 상대(_workmeta/...).
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));            // .../dev-erp/tools
const APP = resolve(HERE, "..");                                // .../dev-erp
const REPO = resolve(HERE, "..", "..", "..", "..");              // repo root (tools→dev-erp→apps→ui-workspace→root)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const wmDir = arg("workmeta", join(REPO, "_workmeta"));
const only = arg("project", null);                              // 과제코드 또는 폴더명(P26-014 / P00-000_INBOX)
const apply = has("apply");
const dbArg = arg("db", null);

const LEDGER_REL = join("reports", "메일_이력", "메일_이력.csv");  // 장부 표준 위치
const CODE_RE = /^P\d{2}-\d{3}/;                                 // 폴더명 접두 과제코드

// 완전 CSV 파서(따옴표 안의 쉼표·줄바꿈을 보존). 레코드(필드배열) 목록 반환.
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// 메일함/이벤트유형에 발신 신호가 있으면 out, 아니면 in.
function directionOf(eventType, mailbox) {
  const s = `${eventType ?? ""} ${mailbox ?? ""}`;
  return /발신|보낸|sent|out/i.test(s) ? "out" : "in";
}

function scanLedger(folder) {
  const csvPath = join(wmDir, folder, LEDGER_REL);
  const folderCode = (folder.match(CODE_RE) || [])[0] || null;
  const isInbox = /INBOX/i.test(folder) || folderCode === "P00-000";
  // 주의: 이 장부의 '단계' 컬럼은 SE 게이트(030_SRR…)가 아니라 메일 수집 파이프라인 상태 라벨이다
  // (mail_candidate_queue, outlook_received_folder_reconcile 등). 그래서 core_mail.stage_code 에 SE게이트로
  // 흘려넣지 않는다 — stage_code 는 사람이 메일→할일 분류 때 SE 기준점으로 직접 건다(unclassified 격리 모델).
  const out = { folder, folderCode, isInbox, exists: existsSync(csvPath), rows: 0, withRoute: 0, withSubject: 0, dateOk: 0, routed: 0, byRoute: {}, records: [] };
  if (!out.exists) return out;
  const text = readFileSync(csvPath, "utf8").replace(/^﻿/, "").normalize("NFC");
  const recs = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!recs.length) return out;
  const header = recs[0].map((h) => h.trim().normalize("NFC"));
  const idx = (name) => header.indexOf(name);
  const iKey = idx("이력키"), iEventAt = idx("발생시각"), iProj = idx("프로젝트코드"), iStage = idx("단계");
  const iSrc = idx("메일소스ID"), iRecvAt = idx("메일수신시각"), iSubj = idx("제목"), iFrom = idx("발신자");
  const iEvent = idx("이벤트유형"), iBox = idx("메일함");
  const get = (f, i) => (i >= 0 ? String(f[i] ?? "").trim() : "");
  for (const f of recs.slice(1)) {
    out.rows++;
    const key = get(f, iKey) || get(f, iSrc);
    if (!key) continue;                                          // 식별자 없으면 스킵
    const at = (get(f, iRecvAt) || get(f, iEventAt));
    const route = get(f, iStage);                                // '단계' 컬럼 = 수집 파이프라인 라벨(SE게이트 아님)
    const subject = get(f, iSubj);
    let rowCode = get(f, iProj) || (out.isInbox ? "" : (folderCode || ""));
    if (rowCode === "P00-000") rowCode = "";                     // 인박스 코드는 과제 아님 → 미배정
    if (CODE_RE.test(rowCode)) out.routed++;
    if (route) out.withRoute++;
    if (subject) out.withSubject++;
    if (/^\d{4}-\d{2}-\d{2}/.test(at)) out.dateOk++;
    const sk = route || "(미지정)";
    out.byRoute[sk] = (out.byRoute[sk] || 0) + 1;
    out.records.push({
      id: `mailcsv:${key}`,
      project_code: CODE_RE.test(rowCode) ? rowCode : null,
      at,
      subject,
      counterpart: get(f, iFrom),
      stage_code: null,                                          // SE게이트는 사람이 분류 때 건다(파이프라인 라벨 미사용)
      source_ref: get(f, iSrc) || key,
      direction: directionOf(get(f, iEvent), get(f, iBox)),
      // 원문 미저장: 포인터는 장부(메타) 상대경로 + 소스ID 앵커. 메일 본문은 메일시스템에만.
      pointer_ref: `_workmeta/${folder}/reports/메일_이력/메일_이력.csv#${get(f, iSrc) || key}`,
      data_label: "real"
    });
  }
  return out;
}

const folders = (existsSync(wmDir) ? readdirSync(wmDir) : [])
  .filter((e) => CODE_RE.test(e))
  .filter((e) => !only || e === only || e.startsWith(only))
  .filter((e) => { try { return statSync(join(wmDir, e)).isDirectory(); } catch { return false; } })
  .filter((e) => existsSync(join(wmDir, e, LEDGER_REL)))
  .sort();

const ledgers = folders.map(scanLedger);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

// ---------- --apply: core_mail 로 ingest(DB 쓰기) ----------
if (apply) {
  if (!dbArg) { console.error("[apply] --db <경로> 가 필요합니다(예: --db data/dev-erp.db). 절대경로 금지·상대 권장."); process.exit(2); }
  if (/^([A-Za-z]:[\\/]|\/)/.test(dbArg)) console.warn("[apply] 경고: --db 절대경로 입력. 이식성 위해 상대경로(예: data/dev-erp.db) 권장.");
  const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(dbArg) ? dbArg : resolve(APP, dbArg);
  const store = openStore(dbPath);
  let wrote = 0, fresh = 0, skipped = 0, ledgerWrote = 0;
  for (const L of ledgers) {
    let n = 0, nf = 0;
    for (const rec of L.records) {
      const r = store.ingestMail(rec);
      if (r.error) { skipped++; continue; }
      n++; wrote++; if (r.isNew) { nf++; fresh++; }
    }
    if (n) {
      ledgerWrote++;
      const byRoute = Object.entries(L.byRoute).sort().map(([s, c]) => `${s}=${c}`).join(", ");
      console.log(`[apply] ${L.folder}: ${n}건 upsert(신규 ${nf}) · 과제배정 ${L.routed}/${L.rows}${L.isInbox ? " (인박스=미배정)" : ""}`);
      console.log(`        수집경로별(파이프라인): ${byRoute}`);
    }
  }
  store.appendEvent({ actor_ref: "scan_mail_ledger", actor_kind: "system", kind: "mail_ingest", to: String(wrote), used_refs: ["core_mail"], data_label: "real", note: `apply ${ledgerWrote}개 장부 · 신규 ${fresh} · 스킵 ${skipped}` });
  store.db.close();
  console.log(`[apply] 완료: ${ledgerWrote}개 장부 · 메일 ${wrote}건 ingest(신규 ${fresh}, 스킵 ${skipped}). pointer 는 모두 상대(_workmeta/...).`);
  process.exit(0);
}

// ---------- dry-run: 집계만 출력(DB 미변경) ----------
console.log(`# 메일 장부 dry-run 스캔 (DB 미변경) — ${ledgers.length}개 장부`);
console.log(`# 소스: ${wmDir}/<과제>/${LEDGER_REL}. 원문 미출력(건수·단계분포만). ingest 는 --apply --db <상대경로>.`);
let total = 0, totalRouted = 0;
for (const L of ledgers) {
  total += L.rows; totalRouted += L.routed;
  console.log(`\n## ${L.folder}${L.isInbox ? " (인박스=미배정 메일)" : ""}`);
  console.log(`  메일: ${L.rows}건 · 수집경로기재 ${L.withRoute}(${pct(L.withRoute, L.rows)}) · 제목 ${L.withSubject}(${pct(L.withSubject, L.rows)}) · 날짜OK ${L.dateOk}(${pct(L.dateOk, L.rows)}) · 과제배정 ${L.routed}(${pct(L.routed, L.rows)})`);
  console.log(`    수집경로별(파이프라인, SE게이트 아님): ${Object.entries(L.byRoute).sort().map(([s, n]) => `${s}=${n}`).join(", ")}`);
}
console.log(`\n# 합계 메일 ${total}건(과제배정 ${totalRouted}). ingest: node tools/scan_mail_ledger.mjs --apply --db data/dev-erp.db [--project <코드>]`);
console.log(`#   이력키→id(mailcsv:), 프로젝트코드→project_id(미등록은 stub·인박스는 null), 메일수신시각→at, 제목→subject,`);
console.log(`#   발신자→counterpart, 메일소스ID→source_ref, 장부 상대경로#소스ID→pointer_ref(원문 미저장).`);
console.log(`#   주의: 장부 '단계'는 수집 파이프라인 라벨(SE게이트 아님) → stage_code 에 안 넣음. SE게이트는 메일→할일 분류 때 사람이 건다.`);
