#!/usr/bin/env node
// P1b: 승인된 메타 표면 → data/real_meta.json (정규화, 메타데이터만).
// 읽는 것: soulforge snapshot(프로젝트/미션), _workmeta/*/reports/메일_이력/메일_이력.csv
// 읽지 않는 것: 메일 원문/첨부, _workspaces 실파일, secret. (원문복사여부=false 원장만)
// 사용: node tools/build_real_meta.mjs [--repo <soulforge root>] [--out data/real_meta.json]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const REPO = flag("repo", join(HERE, "..", "..", "..", ".."));
const OUT = flag("out", join(HERE, "..", "data", "real_meta.json"));

// 최소 CSV 파서 (RFC4180-lite)
function parseCsv(text) {
  const input = text.replace(/^﻿/, "");
  const rows = []; let row = []; let field = ""; let q = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (q) { if (c === '"') { if (input[i + 1] === '"') { field += '"'; i += 1; } else q = false; } else field += c; continue; }
    if (c === '"') { q = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = []; continue;
    }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

const report = { projects: 0, missions_as_items: 0, mail_files: 0, mail_rows: 0, skipped: [] };
const out = { projects: [], items: [], mail: [] };

// 1) snapshot: 프로젝트 코드 + 미션
const snapPath = join(REPO, "guild_hall", "state", "snapshot", "soulforge_snapshot.json");
if (existsSync(snapPath)) {
  const snap = JSON.parse(readFileSync(snapPath, "utf-8"));
  for (const p of snap.projects ?? []) {
    if (!p.project_code) continue;
    out.projects.push({
      id: p.project_code,
      title: p.project_code, // 사람용 이름은 보호 영역일 수 있어 코드 유지 (owner 가 P2 에서 별칭 부여)
      health: "ok",
      source_ref: "guild_hall/state/snapshot/soulforge_snapshot.json"
    });
    report.projects += 1;
  }
  for (const m of snap.missions?.items ?? []) {
    if (!m.mission_id) continue;
    const projectId = m.project_code ?? "P00-000_INBOX";
    out.items.push({
      id: m.mission_id,
      project_id: projectId,
      title: m.title ?? m.mission_id,
      origin: "manual",
      encounter_role: "elite",
      status: m.readiness_status === "blocked" ? "blocked" : m.status === "completed" ? "done" : "open"
    });
    report.missions_as_items += 1;
  }
} else {
  report.skipped.push("snapshot_missing");
}

// 미션의 project_code 가 프로젝트 목록에 없으면 코드만으로 추가 (demo_project 등)
const known = new Set(out.projects.map((p) => p.id));
for (const item of out.items) {
  if (!known.has(item.project_id)) {
    out.projects.push({ id: item.project_id, title: item.project_id, health: "ok", source_ref: "mission" });
    known.add(item.project_id);
    report.projects += 1;
  }
}

// 2) 메일 이력 CSV (whitelist 칼럼만)
const wmRoot = join(REPO, "_workmeta");
const WL = { id: "이력키", at: "메일수신시각", at2: "발생시각", kind: "이벤트유형", subject: "제목", sender: "발신자", src: "메일소스ID", box: "메일함", proj: "프로젝트코드", copied: "원문복사여부" };
for (const code of existsSync(wmRoot) ? readdirSync(wmRoot) : []) {
  const csvPath = join(wmRoot, code, "reports", "메일_이력", "메일_이력.csv");
  if (!existsSync(csvPath)) continue;
  report.mail_files += 1;
  const rows = parseCsv(readFileSync(csvPath, "utf-8"));
  if (rows.length < 2) continue;
  const header = rows[0];
  const idx = Object.fromEntries(Object.entries(WL).map(([k, name]) => [k, header.indexOf(name)]));
  for (const r of rows.slice(1)) {
    const get = (k) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    if (get("copied") === "true") { report.skipped.push(`raw_copy_row:${get("id")}`); continue; } // 가드: 원문 복사 행 제외
    const id = get("id");
    const at = get("at") || get("at2");
    let subject = get("subject");
    // 원장 일부 행에 \uXXXX 이스케이프가 문자열로 저장된 경우 디코드 (표시 품질)
    if (/\\u[0-9a-fA-F]{4}/.test(subject)) {
      try { subject = JSON.parse(`"${subject.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\\\\u", "\\u")}"`); } catch { /* 원본 유지 */ }
    }
    if (!id || !at || !subject) { report.skipped.push(`mail_incomplete:${id || code}`); continue; }
    out.mail.push({
      id: `${code}:${id}`,
      project_id: get("proj") || code,
      at,
      direction: get("kind").includes("sent") ? "out" : "in",
      subject,
      counterpart: get("sender") || null,
      pointer_ref: get("src") || get("box") || null
    });
    report.mail_rows += 1;
    if (!known.has(get("proj") || code)) {
      out.projects.push({ id: code, title: code, health: "ok", source_ref: "mail_ledger" });
      known.add(code); report.projects += 1;
    }
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("[build_real_meta]", JSON.stringify({ ...report, skipped: report.skipped.length, out: OUT }));
if (report.skipped.length) console.log("[build_real_meta] skipped detail:", report.skipped.slice(0, 10).join(", "));
