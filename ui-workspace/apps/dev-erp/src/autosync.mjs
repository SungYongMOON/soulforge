// src/autosync.mjs — 할일_장부.csv → ERP(core_item) 자동 import(autosync Phase 2, 결정적·LLM 무관).
// 메일/Codex/ERP가 만든 할일_장부 변경을 ERP가 폴링으로 감지해 자동 표시한다. 동기 버튼 불필요.
// 안전 원칙: '신규 할일키만' import(기존 행은 사람 편집 가능성 → auto-import 가 건드리지 않음).
//   기존 행 갱신(장부→ERP 전파)은 revision/conflict 비교가 필요한 후속 단계(Phase 3)로 둔다.
// zero-dependency: node:fs/path.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CODE_RE = /^P\d{2}-\d{3}/;
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { if (text[i + 1] !== "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const unguard = (s) => s.replace(/^'(?=[=+\-@\t\r])/, ""); // CSV 수식가드 ' 복원

// 할일_장부.csv 파일 → ingestTaskItem 입력 행 배열. 헤더 누락/빈 키·제목은 드롭.
export function readTaskLedgerRows(filePath) {
  const recs = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (!recs.length) return [];
  const h = recs[0].map((x) => x.trim().normalize("NFC"));
  const ix = (n) => h.indexOf(n);
  if (ix("할일키") < 0 || ix("할일명") < 0) return [];
  const c = { key: ix("할일키"), proj: ix("프로젝트코드"), title: ix("할일명"), who: ix("담당자"), wt: ix("업무유형"),
    st: ix("상태"), due: ix("마감일"), stage: ix("SE단계"), lk: ix("연결유형"), lr: ix("연결대상"), art: ix("산출물참조"),
    cc: ix("완료기준"), org: ix("출처"), mail: ix("관련메일이력키"), created: ix("기록일") };
  const g = (r, i) => unguard(i >= 0 ? String(r[i] ?? "").trim() : "");
  return recs.slice(1).map((r) => ({
    id: g(r, c.key), project_code: g(r, c.proj), title: g(r, c.title), assignee_ref: g(r, c.who),
    work_type: g(r, c.wt), status: g(r, c.st), due: g(r, c.due), anchor_stage_code: g(r, c.stage),
    link_kind: g(r, c.lk), link_ref: g(r, c.lr) || g(r, c.art), completion_criteria: g(r, c.cc),
    origin: g(r, c.org) || "ledger", origin_mail_id: g(r, c.mail), created_at: g(r, c.created)
  })).filter((x) => x.id && x.title);
}

// _workmeta/<code>/reports/할일_장부/할일_장부.csv 들을 스캔해 신규 행만 core_item 으로 import.
export function importNewTaskLedgers(store, { root } = {}) {
  const wm = root ? join(root, "_workmeta") : null;
  const out = { imported: 0, skipped: 0, files: 0 };
  if (!wm || !existsSync(wm)) return out;
  for (const code of readdirSync(wm)) {
    if (!CODE_RE.test(code)) continue;
    const f = join(wm, code, TASK_REL);
    if (!existsSync(f)) continue;
    out.files++;
    for (const row of readTaskLedgerRows(f)) {
      if (store.db.prepare("SELECT 1 FROM core_item WHERE id=?").get(row.id)) { out.skipped++; continue; } // 기존=보호
      const r = store.ingestTaskItem(row);
      if (r.ok) out.imported++; else out.skipped++;
    }
  }
  return out;
}

// 주기 폴링 시작(부팅 즉시 1회 + intervalMs 마다). 변경 없는 파일은 mtime 으로 건너뛴다.
export function startAutosyncPoll(store, { root, intervalMs = 10000, log = () => {} } = {}) {
  const seen = new Map(); // file → mtimeMs
  const tick = () => {
    try {
      const wm = root ? join(root, "_workmeta") : null;
      if (!wm || !existsSync(wm)) return;
      let imported = 0, files = 0, changed = false;
      for (const code of readdirSync(wm)) {
        if (!CODE_RE.test(code)) continue;
        const f = join(wm, code, TASK_REL);
        if (!existsSync(f)) continue;
        files++;
        const m = statSync(f).mtimeMs;
        if (seen.get(f) === m) continue;     // 변경 없음 → 스킵
        seen.set(f, m); changed = true;
        for (const row of readTaskLedgerRows(f)) {
          if (store.db.prepare("SELECT 1 FROM core_item WHERE id=?").get(row.id)) continue;
          if (store.ingestTaskItem(row).ok) imported++;
        }
      }
      if (changed && imported) log(`[autosync] 할일_장부 신규 ${imported}건 자동 import (${files}장부)`);
    } catch (e) { log(`[autosync] import 오류: ${e.message}`); }
  };
  tick();
  const h = setInterval(tick, intervalMs);
  h.unref?.();
  return h;
}
