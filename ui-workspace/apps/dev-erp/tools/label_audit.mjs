#!/usr/bin/env node
// 하네스 B5: 라벨 감사기 — 라벨링 우선 원칙(used_refs[]+data_label+project_ref)
// 의 커버리지를 event_log 에서 감사한다. 쓰레기(라벨 없는 사건) 누적을
// 조기에 보이게 하는 것이 목적. 읽기 전용, 표준 Node 만.
// 사용: node tools/label_audit.mjs [--db data/dev-erp.db] [--json] [--min 0.9]
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));

// 순수 집계: 행 배열 → 커버리지 리포트 (테스트 가능)
export function audit(rows) {
  const total = rows.length;
  const stat = {
    total,
    data_label_present: 0,
    data_label_synthetic: 0,
    used_refs_present: 0,
    project_ref_present: 0,
    actor_present: 0,
    by_kind: {},
    offenders: { no_used_refs: [], no_project_ref: [], no_data_label: [] }
  };
  for (const r of rows) {
    let refs = [];
    try { refs = JSON.parse(r.used_refs ?? "[]"); } catch { refs = []; }
    const kind = r.kind ?? "?";
    const k = (stat.by_kind[kind] ??= { total: 0, with_refs: 0, with_project: 0 });
    k.total += 1;
    if (r.data_label) stat.data_label_present += 1;
    else stat.offenders.no_data_label.push(r.id);
    if (r.data_label === "synthetic") stat.data_label_synthetic += 1;
    if (Array.isArray(refs) && refs.length > 0) { stat.used_refs_present += 1; k.with_refs += 1; }
    else stat.offenders.no_used_refs.push(r.id);
    if (r.project_ref) { stat.project_ref_present += 1; k.with_project += 1; }
    else stat.offenders.no_project_ref.push(r.id);
    if (r.actor_ref) stat.actor_present += 1;
  }
  const pct = (n) => (total === 0 ? 1 : n / total);
  stat.coverage = {
    data_label: pct(stat.data_label_present),
    used_refs: pct(stat.used_refs_present),
    project_ref: pct(stat.project_ref_present),
    actor: pct(stat.actor_present)
  };
  // offender 목록은 상한 (리포트 비대 방지)
  for (const key of Object.keys(stat.offenders)) stat.offenders[key] = stat.offenders[key].slice(0, 20);
  return stat;
}

// project_ref 는 run16 에 도입 — 그 이전 행은 구조적으로 null (백필 안 함).
// 공정한 판정을 위해 도입 이후 행만으로도 따로 계산한다.
export function auditSince(rows, sinceId) {
  return audit(rows.filter((r) => r.id > sinceId));
}

export async function loadRows(dbPath) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare("SELECT id, kind, actor_ref, used_refs, data_label, project_ref FROM event_log ORDER BY id").all();
  const firstProjectRef = db.prepare("SELECT MIN(id) AS m FROM event_log WHERE project_ref IS NOT NULL").get()?.m ?? 0;
  db.close();
  return { rows, firstProjectRef };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const dbPath = flag("db", join(APP, "data", "dev-erp.db"));
  const minCov = Number(flag("min", "0"));
  if (!existsSync(dbPath)) {
    console.log(`[label-audit] DB 없음: ${dbPath} — 감사 대상 없음`);
    process.exit(0);
  }
  const { rows, firstProjectRef } = await loadRows(dbPath);
  const all = audit(rows);
  const recent = firstProjectRef ? auditSince(rows, firstProjectRef - 1) : all;
  if (args.includes("--json")) {
    console.log(JSON.stringify({ all, since_project_ref: recent }, null, 2));
  } else {
    const p = (x) => `${Math.round(x * 100)}%`;
    console.log(`[label-audit] 전체 ${all.total}건 — data_label ${p(all.coverage.data_label)}, used_refs ${p(all.coverage.used_refs)}, project_ref ${p(all.coverage.project_ref)}, actor ${p(all.coverage.actor)}`);
    console.log(`[label-audit] project_ref 도입 이후 ${recent.total}건 — used_refs ${p(recent.coverage.used_refs)}, project_ref ${p(recent.coverage.project_ref)}`);
    const worst = Object.entries(all.by_kind).filter(([, v]) => v.with_refs < v.total).map(([k, v]) => `${k}(${v.with_refs}/${v.total})`);
    if (worst.length) console.log(`[label-audit] used_refs 결손 kind: ${worst.join(", ")}`);
  }
  // --min: 도입 이후 구간의 최저 커버리지로 게이트 (CI 용)
  const floor = Math.min(recent.coverage.used_refs, recent.coverage.data_label, recent.coverage.project_ref);
  process.exit(floor >= minCov ? 0 : 1);
}
