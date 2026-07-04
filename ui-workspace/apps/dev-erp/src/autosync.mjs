// src/autosync.mjs — 할일_장부.csv → ERP(core_item) 자동 import(autosync Phase 2, 결정적·LLM 무관).
// 메일/Codex/ERP가 만든 할일_장부 변경을 ERP가 폴링으로 감지해 자동 표시한다. 동기 버튼 불필요.
// 안전 원칙: '신규 할일키만' import(기존 행은 사람 편집 가능성 → auto-import 가 건드리지 않음).
//   기존 행 갱신(장부→ERP 전파)은 revision/conflict 비교가 필요한 후속 단계(Phase 3)로 둔다.
// zero-dependency: node:fs/path.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CODE_RE = /^P\d{2}-\d{3}/;
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");
const SCHEMA = "soulforge.project_task_ledger.private.v0";
const BASE_HEADERS = ["할일키","스키마버전","기록일","프로젝트코드","할일명","담당자","업무유형","상태","마감일","SE단계","연결유형","연결대상","완료기준","출처","관련메일이력키","관련메일소스ID","산출물참조","관련몬스터ID","다음액션","비고","원문복사여부"];
const AUTOMATION_HEADERS = [
  ["검토상태", "review_status"],
  ["검토사유", "review_reason"],
  ["수정사유", "correction_reason"],
  ["라우트후보", "route_candidate"],
  ["라우트신뢰도", "route_confidence"],
  ["라우트사유", "route_reason"],
  ["필요역할", "required_role"],
  ["필요역량", "required_capability"],
  ["제안담당자", "suggested_assignee_ref"],
  ["담당신뢰도", "assignee_confidence"],
  ["담당사유", "assignee_reason"],
  ["소스후보키", "source_candidate_ref"],
  ["소스메일키", "source_mail_ref"],
  ["소스메일소스ID", "source_mail_source_id"],
  ["소스스레드키", "source_thread_ref"],
  ["소스그룹키", "source_group_ref"],
  ["소스계보", "source_lineage_ref"],
  ["생성런", "generation_run_ref"],
  ["생성규칙", "generation_rule_ref"],
  ["동기화상태", "sync_state"],
  ["동기화오류", "sync_error"],
  ["동기화리비전", "sync_revision"],
  ["동기화해시", "sync_hash"],
  ["동기화시각", "sync_at"],
  ["부모할일ID", "parent_item_id"],
  ["파티참조", "party_ref"],
];
const HEADERS = [...BASE_HEADERS, ...AUTOMATION_HEADERS.map(([h]) => h)];
const csvEsc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function parseCsv(text) {
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
const stableTaskHash = (obj) => createHash("sha256").update(JSON.stringify({
  id: obj.id ?? "", project_id: obj.project_id ?? obj.project_code ?? "", title: obj.title ?? "",
  assignee_ref: obj.assignee_ref ?? "", work_type: obj.work_type ?? "", status: obj.status ?? "",
  due: obj.due ?? "", anchor_stage_code: obj.anchor_stage_code ?? "", link_kind: obj.link_kind ?? "",
  link_ref: obj.link_ref ?? "", completion_criteria: obj.completion_criteria ?? "", origin: obj.origin ?? "",
  origin_mail_id: obj.origin_mail_id ?? "", source_mail_ref: obj.source_mail_ref ?? "",
  source_mail_source_id: obj.source_mail_source_id ?? "", review_status: obj.review_status ?? "",
  review_reason: obj.review_reason ?? "", correction_reason: obj.correction_reason ?? "",
  route_candidate: obj.route_candidate ?? "",
  route_confidence: obj.route_confidence ?? "", route_reason: obj.route_reason ?? "",
  required_role: obj.required_role ?? "", required_capability: obj.required_capability ?? "",
  suggested_assignee_ref: obj.suggested_assignee_ref ?? "", assignee_confidence: obj.assignee_confidence ?? "",
  assignee_reason: obj.assignee_reason ?? "", source_thread_ref: obj.source_thread_ref ?? "",
  source_candidate_ref: obj.source_candidate_ref ?? "", source_group_ref: obj.source_group_ref ?? "",
  source_lineage_ref: obj.source_lineage_ref ?? "", generation_run_ref: obj.generation_run_ref ?? "",
  generation_rule_ref: obj.generation_rule_ref ?? "",
  parent_item_id: obj.parent_item_id ?? "", party_ref: obj.party_ref ?? "",
})).digest("hex");

function automationToObj(i, { syncAt = null, syncHash = null, syncRevision = null } = {}) {
  const out = {};
  for (const [, field] of AUTOMATION_HEADERS) out[field] = i[field] ?? "";
  out.source_mail_ref ||= i.origin_mail_id ?? "";
  out.source_mail_source_id ||= i.source_mail_source_id ?? "";
  out.sync_state ||= "synced";
  out.sync_revision = syncRevision != null ? String(syncRevision) : (out.sync_revision || "1");
  out.sync_hash = syncHash || stableTaskHash(i);
  out.sync_at = syncAt || out.sync_at || i.sync_at || "";
  return out;
}

function automationFromCsv(r, h, g) {
  const ix = (n) => h.indexOf(n);
  const out = {};
  for (const [header, field] of AUTOMATION_HEADERS) out[field] = g(r, ix(header));
  if (!out.source_mail_source_id) out.source_mail_source_id = g(r, ix("관련메일소스ID"));
  if (!out.source_mail_ref) out.source_mail_ref = g(r, ix("관련메일이력키"));
  if (!out.review_reason) out.review_reason = g(r, ix("비고"));
  return out;
}

function patchTaskLedgerRows(filePath, patches) {
  if (!patches.size || !existsSync(filePath)) return false;
  const recs = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (!recs.length) return false;
  const h = recs[0].map((x) => x.trim().normalize("NFC"));
  const keyIx = h.indexOf("할일키");
  if (keyIx < 0) return false;
  const outHeader = [...HEADERS, ...h.filter((c) => !HEADERS.includes(c))];
  const rows = recs.slice(1).map((r) => {
    const o = {};
    h.forEach((c, i) => (o[c] = r[i] ?? ""));
    const patch = patches.get(o["할일키"] || "");
    if (patch) Object.assign(o, patch);
    return o;
  });
  const out = [outHeader.join(","), ...rows.map((o) => outHeader.map((c) => csvEsc(o[c] ?? "")).join(","))];
  const tmp = `${filePath}.${process.pid}.sync.tmp`;
  writeFileSync(tmp, "﻿" + out.join("\n") + "\n");
  renameSync(tmp, filePath);
  return true;
}

function syncPatch(state, { error = "", hash = "", revision = "1", at = new Date().toISOString() } = {}) {
  return {
    "동기화상태": state,
    "동기화오류": error,
    "동기화리비전": revision || "1",
    "동기화해시": hash,
    "동기화시각": at,
  };
}

export function importTaskLedgerFile(store, filePath) {
  const out = { imported: 0, skipped: 0, conflicts: 0, errors: 0 };
  const patches = new Map();
  const rows = readTaskLedgerRows(filePath);
  for (const row of rows) {
    const existing = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(row.id);
    if (existing) {
      const existingHash = stableTaskHash(existing);
      const rowHash = stableTaskHash(row);
      const revision = row.sync_revision || existing.sync_revision || "1";
      if (rowHash === existingHash) {
        if (row.sync_state !== "synced" || row.sync_hash !== rowHash || existing.sync_state !== "synced" || existing.sync_hash !== existingHash) {
          const at = new Date().toISOString();
          store.db.prepare("UPDATE core_item SET sync_state='synced', sync_error=NULL, sync_revision=?, sync_hash=?, sync_at=? WHERE id=?")
            .run(Number(revision) || 1, existingHash, at, row.id);
          patches.set(row.id, syncPatch("synced", { hash: rowHash, revision, at }));
        }
        out.skipped++;
        continue;
      }
      const at = new Date().toISOString();
      store.db.prepare("UPDATE core_item SET sync_state='conflict', sync_error='existing_item_not_imported', sync_hash=?, sync_at=? WHERE id=?")
        .run(existingHash, at, row.id);
      patches.set(row.id, syncPatch("conflict", { error: "existing_item_not_imported", hash: rowHash, revision, at }));
      out.skipped++; out.conflicts++;
      continue;
    }
    const r = store.ingestTaskItem(row);
    if (r.ok) {
      const imported = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(row.id);
      const hash = stableTaskHash(imported || row);
      const at = new Date().toISOString();
      const revision = row.sync_revision || "1";
      store.db.prepare("UPDATE core_item SET sync_state='synced', sync_error=NULL, sync_revision=?, sync_hash=?, sync_at=? WHERE id=?")
        .run(Number(revision) || 1, hash, at, row.id);
      patches.set(row.id, syncPatch("synced", { hash, revision, at }));
      out.imported++;
    } else {
      patches.set(row.id, syncPatch("error", { error: r.error || "ingest_failed", revision: row.sync_revision || "1" }));
      out.skipped++; out.errors++;
    }
  }
  patchTaskLedgerRows(filePath, patches);
  return out;
}

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
    origin: g(r, c.org) || "ledger", origin_mail_id: g(r, c.mail), created_at: g(r, c.created),
    ...automationFromCsv(r, h, g)
  })).filter((x) => x.id && x.title);
}

// _workmeta/<code>/reports/할일_장부/할일_장부.csv 들을 스캔해 신규 행만 core_item 으로 import.
export function importNewTaskLedgers(store, { root } = {}) {
  const wm = root ? join(root, "_workmeta") : null;
  const out = { imported: 0, skipped: 0, files: 0, conflicts: 0, errors: 0 };
  if (!wm || !existsSync(wm)) return out;
  for (const code of readdirSync(wm)) {
    if (!CODE_RE.test(code)) continue;
    const f = join(wm, code, TASK_REL);
    if (!existsSync(f)) continue;
    out.files++;
    const r = importTaskLedgerFile(store, f);
    out.imported += r.imported;
    out.skipped += r.skipped;
    out.conflicts += r.conflicts;
    out.errors += r.errors;
  }
  return out;
}

// core_item 1행 → 할일_장부 행(HEADERS 순서).
function itemToLedgerRow(i, automationOptions = {}) {
  const isArtifact = i.link_kind === "artifact";
  const meta = automationToObj(i, automationOptions);
  return [i.id, SCHEMA, (i.created_at || "").slice(0, 10), i.project_id, i.title, i.assignee_ref || "",
    i.work_type || "", i.status || "", i.due || "", i.anchor_stage_code || "", i.link_kind || "", i.link_ref || "",
    i.completion_criteria || "", i.origin || "", i.origin_mail_id || meta.source_mail_ref || "", meta.source_mail_source_id || "",
    isArtifact ? (i.link_ref || "") : "", "", "", i.review_reason || i.correction_reason || i.sync_error || "", "아니오",
    ...AUTOMATION_HEADERS.map(([, field]) => meta[field] || "")];
}

// autosync Phase 1: ERP 할일 1건 → 할일_장부.csv write-through(멱등 upsert, atomic temp+rename).
// 헤더 순서 안전(컬럼명 매핑) + 추가컬럼 보존 + 키 없는 행 패스스루 + 낙관적 동시성(외부 변경 시 재시도).
export function writeTaskToLedger(store, itemId, { root } = {}) {
  if (!root) return { error: "no_root" };
  const item = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(itemId);
  if (!item || !item.project_id) return { error: "item_or_project_missing" };
  const dir = join(root, "_workmeta", item.project_id, "reports", "할일_장부");
  const file = join(dir, "할일_장부.csv");
  const syncAt = new Date().toISOString();
  const syncHash = stableTaskHash(item);
  const currentRevision = Number(item.sync_revision);
  const syncRevision = Number.isInteger(currentRevision) && currentRevision > 0 ? currentRevision + 1 : 1;
  const row = itemToLedgerRow(
    { ...item, sync_state: "synced", sync_error: "", sync_revision: syncRevision, sync_hash: syncHash, sync_at: syncAt },
    { syncAt, syncHash, syncRevision },
  );
  const newObj = {}; HEADERS.forEach((c, i) => (newObj[c] = row[i]));
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    let mtimeAtRead = -1, outHeader = HEADERS;
    const byKey = new Map();
    if (existsSync(file)) {
      mtimeAtRead = statSync(file).mtimeMs;
      const recs = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
      if (recs.length) {
        const h = recs[0].map((x) => x.trim());
        outHeader = [...HEADERS, ...h.filter((c) => !HEADERS.includes(c))];                 // 추가컬럼 보존
        for (const r of recs.slice(1)) { const o = {}; h.forEach((c, i) => (o[c] = r[i] ?? "")); const k = o["할일키"] || ""; byKey.set(k || `__nokey_${byKey.size}`, o); } // 키없는 행 패스스루
      }
    }
    byKey.set(item.id, newObj);
    const out = [outHeader.join(","), ...[...byKey.values()].map((o) => outHeader.map((c) => csvEsc(o[c] ?? "")).join(","))];
    // 낙관적 동시성: read 이후 외부(Codex 등)가 파일을 바꿨으면 재시도(cross-process lost write 완화).
    // BE-5 한계(문서화된 best-effort): mtime 재확인 ~ rename 사이의 미세 TOCTOU 창과 같은 mtimeMs 해상도 내
    //   연속 쓰기는 감지 못 할 수 있음. autosync 는 기본 OFF(DEV_ERP_AUTOSYNC=1)라 현재 위험은 낮다.
    //   교차 프로세스 안전이 중요해지면 O_EXCL 잠금파일 또는 콘텐츠 해시 CAS 로 승격(후속).
    if (existsSync(file) && statSync(file).mtimeMs !== mtimeAtRead) continue;
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, "﻿" + out.join("\n") + "\n");
    renameSync(tmp, file); // atomic
    store.db.prepare("UPDATE core_item SET sync_state='synced', sync_error=NULL, sync_revision=?, sync_hash=?, sync_at=? WHERE id=?")
      .run(syncRevision, syncHash, syncAt, item.id);
    return { ok: true, file };
  }
  return { error: "concurrent_write_retry" };
}

// ── 입력파일_장부(산출물 입력파일) — 할일_장부와 동일 패턴(write-through + 신규행 import) ──
const INPUT_REL = join("reports", "입력파일_장부", "입력파일_장부.csv");
const INPUT_SCHEMA = "soulforge.deliverable_input_ledger.private.v0";
const INPUT_HEADERS = ["입력키", "스키마버전", "기록일", "프로젝트코드", "산출물참조", "게이트", "입력하위폴더", "파일명", "파일포인터", "출처", "해시", "크기", "상태", "관련메일이력키", "비고", "원문복사여부"];

// 입력파일_장부.csv → registerDeliverableInput 입력 행. 헤더 누락/빈 키·산출물 드롭.
export function readInputLedgerRows(filePath) {
  const recs = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
  if (!recs.length) return [];
  const h = recs[0].map((x) => x.trim().normalize("NFC"));
  const ix = (n) => h.indexOf(n);
  if (ix("입력키") < 0 || ix("산출물참조") < 0) return [];
  const c = { key: ix("입력키"), deliv: ix("산출물참조"), sub: ix("입력하위폴더"), file: ix("파일명"),
    ptr: ix("파일포인터"), src: ix("출처"), sha: ix("해시"), size: ix("크기"), st: ix("상태"), mail: ix("관련메일이력키"), note: ix("비고") };
  const g = (r, i) => unguard(i >= 0 ? String(r[i] ?? "").trim() : "");
  return recs.slice(1).map((r) => ({
    id: g(r, c.key), deliverable_id: g(r, c.deliv), subfolder: g(r, c.sub) || null, file_name: g(r, c.file) || null,
    pointer: g(r, c.ptr) || null, source: g(r, c.src) || "codex", sha256: g(r, c.sha) || null,
    size: g(r, c.size) ? Number(g(r, c.size)) : null, status: g(r, c.st) || "needed",
    mail_ref: g(r, c.mail) || null, note: g(r, c.note) || null,
  })).filter((x) => x.id && x.deliverable_id);
}

// deliverable_input 1행 → 입력파일_장부 행(INPUT_HEADERS 순서).
function inputToLedgerRow(x) {
  return [x.id, INPUT_SCHEMA, (x.created_at || "").slice(0, 10), x.project_id || "", x.deliverable_id, x.stage_code || "",
    x.subfolder || "", x.file_name || "", x.pointer || "", x.source || "", x.sha256 || "", x.size != null ? String(x.size) : "",
    x.status || "", x.mail_ref || "", x.note || "", "아니오"];
}

// 신규 입력키만 import(기존=사람 편집 보호). 산출물 없으면 skip. import 경로는 write-through 안 함(순환 차단).
export function importNewInputLedgers(store, { root } = {}) {
  const wm = root ? join(root, "_workmeta") : null;
  const out = { imported: 0, skipped: 0, files: 0 };
  if (!wm || !existsSync(wm)) return out;
  for (const code of readdirSync(wm)) {
    if (!CODE_RE.test(code)) continue;
    const f = join(wm, code, INPUT_REL);
    if (!existsSync(f)) continue;
    out.files++;
    for (const row of readInputLedgerRows(f)) {
      if (store.db.prepare("SELECT 1 FROM deliverable_input WHERE id=?").get(row.id)) { out.skipped++; continue; }
      const r = store.registerDeliverableInput(row, { sync: false });
      if (r.ok) out.imported++; else out.skipped++;
    }
  }
  return out;
}

// ERP 입력파일 1건 → 입력파일_장부.csv write-through(멱등·atomic·추가컬럼 보존·키없는행 패스스루·낙관적 동시성).
export function writeInputToLedger(store, inputId, { root } = {}) {
  if (!root) return { error: "no_root" };
  const x = store.deliverableInput ? store.deliverableInput(inputId) : store.db.prepare("SELECT * FROM deliverable_input WHERE id=?").get(inputId);
  if (!x || !x.project_id) return { error: "input_or_project_missing" };
  const dir = join(root, "_workmeta", x.project_id, "reports", "입력파일_장부");
  const file = join(dir, "입력파일_장부.csv");
  const row = inputToLedgerRow(x);
  const newObj = {}; INPUT_HEADERS.forEach((c, i) => (newObj[c] = row[i]));
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    let mtimeAtRead = -1, outHeader = INPUT_HEADERS;
    const byKey = new Map();
    if (existsSync(file)) {
      mtimeAtRead = statSync(file).mtimeMs;
      const recs = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, "").normalize("NFC")).filter((r) => r.some((c) => String(c).trim()));
      if (recs.length) {
        const h = recs[0].map((s) => s.trim());
        outHeader = [...INPUT_HEADERS, ...h.filter((c) => !INPUT_HEADERS.includes(c))];   // 추가컬럼 보존
        for (const r of recs.slice(1)) { const o = {}; h.forEach((c, i) => (o[c] = r[i] ?? "")); const k = o["입력키"] || ""; byKey.set(k || `__nokey_${byKey.size}`, o); } // 키없는 행 패스스루
      }
    }
    byKey.set(x.id, newObj);
    const out = [outHeader.join(","), ...[...byKey.values()].map((o) => outHeader.map((c) => csvEsc(o[c] ?? "")).join(","))];
    if (existsSync(file) && statSync(file).mtimeMs !== mtimeAtRead) continue;   // 외부 변경 → 재시도
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, "﻿" + out.join("\n") + "\n");
    renameSync(tmp, file); // atomic
    return { ok: true, file };
  }
  return { error: "concurrent_write_retry" };
}

// 주기 폴링 시작(부팅 즉시 1회 + intervalMs 마다). 변경 없는 파일은 mtime 으로 건너뛴다.
export function startAutosyncPoll(store, { root, intervalMs = 10000, log = () => {} } = {}) {
  const seen = new Map(); // file → mtimeMs
  const tick = () => {
    try {
      const wm = root ? join(root, "_workmeta") : null;
      if (!wm || !existsSync(wm)) return;
      let imported = 0, importedInput = 0, files = 0, changed = false;
      for (const code of readdirSync(wm)) {
        if (!CODE_RE.test(code)) continue;
        // 할일_장부
        const f = join(wm, code, TASK_REL);
        if (existsSync(f)) {
          files++;
          const m = statSync(f).mtimeMs;
          if (seen.get(f) !== m) {
            seen.set(f, m); changed = true;
            imported += importTaskLedgerFile(store, f).imported;
          }
        }
        // 입력파일_장부(신규 입력키만, 산출물 없으면 skip)
        const fi = join(wm, code, INPUT_REL);
        if (existsSync(fi)) {
          const mi = statSync(fi).mtimeMs;
          if (seen.get(fi) !== mi) {
            seen.set(fi, mi); changed = true;
            for (const row of readInputLedgerRows(fi)) {
              if (store.db.prepare("SELECT 1 FROM deliverable_input WHERE id=?").get(row.id)) continue;
              if (store.registerDeliverableInput(row, { sync: false }).ok) importedInput++;
            }
          }
        }
      }
      if (changed && (imported || importedInput)) log(`[autosync] 신규 import — 할일 ${imported} · 입력파일 ${importedInput} (${files}장부)`);
    } catch (e) { log(`[autosync] import 오류: ${e.message}`); }
  };
  tick();
  const h = setInterval(tick, intervalMs);
  h.unref?.();
  return h;
}
