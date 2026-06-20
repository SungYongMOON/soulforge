#!/usr/bin/env node
// dev-erp 배정 알림 브리지: dev-erp event_log 의 item_assign(할일 담당 배정) 이벤트를 읽어
// town_crier 로 알림 요청을 emit 한다. "일이 떨어져도 담당자가 모른다(all-pull)" 병목 해소용.
//
// egress-safe 설계: dev-erp 서버는 외부 전송 금지 가드(no_server_egress)가 있어 텔레그램을 직접 못 보낸다.
// 이 별도 프로세스가 dev-erp DB(event_log)를 읽어, 외부 전송이 허용된 town_crier(emitNotification)로만 넘긴다.
// 실제 텔레그램 발송은 town_crier 의 notify 정책(item_assigned 활성)+telegram env 로 게이트된다(미설정이면 disabled).
//
// 사용: node guild_hall/town_crier/assign_notify_bridge.mjs [--db <dev-erp.db>] [--state <watermark.json>] [--apply] [--limit N]
//   기본 dry-run(미발화, 텍스트만 출력). --apply 일 때만 emitNotification 호출 + watermark 전진.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
// 주의: emitNotification(외부 전송 가능 runtime, yaml 의존)은 실제 발화(--apply) 때만 동적 import.
// → 순수 수집/텍스트 로직과 dry-run 은 의존성 없이 동작·테스트 가능.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--apply") a.apply = true;
    else if (t.startsWith("--")) { a[t.slice(2)] = argv[i + 1]; i++; }
  }
  return a;
}

// 알림 텍스트(담당자에게 "무슨 일이 너에게 떨어졌나"). 미배정(to_val 공란)은 호출 전 제외됨.
export function buildAssignText(row) {
  const to = String(row.to_val ?? "").trim();
  const proj = row.project_ref ? `[${row.project_ref}] ` : "";
  const title = String(row.title ?? row.item_ref ?? "할 일").trim();
  return `🔔 새 배정 — ${to}: ${proj}${title}`;
}

// 핵심 로직(순수, 테스트 가능): watermark 이후 미처리 item_assign 중 실제 배정(to_val 있음)만 모아 알림 생성.
export function collectAssignNotifications(db, sinceId = 0, limit = 50) {
  const rows = db.prepare(
    `SELECT e.id, e.item_ref, e.to_val, e.project_ref, e.at, i.title AS title
       FROM event_log e LEFT JOIN core_item i ON i.id = e.item_ref
      WHERE e.kind = 'item_assign' AND e.id > ? AND COALESCE(e.to_val,'') <> ''
      ORDER BY e.id ASC LIMIT ?`
  ).all(sinceId, limit);
  return rows.map((r) => ({ id: r.id, item_ref: r.item_ref, to: r.to_val, text: buildAssignText(r) }));
}

function readWatermark(stateFile) {
  try { return Number(JSON.parse(readFileSync(stateFile, "utf-8")).last_event_id) || 0; } catch { return 0; }
}
function writeWatermark(stateFile, id) {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ last_event_id: id, updated_at: new Date().toISOString() }, null, 2));
}

export async function runAssignNotifyBridge(repoRootArg, { dbPath, stateFile, apply = false, limit = 50 } = {}) {
  if (!existsSync(dbPath)) return { ok: false, status: "db_missing", dbPath };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const since = readWatermark(stateFile);
    const notes = collectAssignNotifications(db, since, limit);
    const results = [];
    let maxId = since;
    const emit = apply ? (await import("./runtime.mjs")).emitNotification : null; // 발화 시에만 runtime(+yaml) 로드
    for (const n of notes) {
      maxId = Math.max(maxId, n.id);
      if (apply) {
        const r = await emit(repoRootArg, { scope: "gateway", event: "item_assigned", text: n.text, sourceRef: n.item_ref });
        results.push({ event_id: n.id, to: n.to, emit: r.status });
      } else {
        results.push({ event_id: n.id, to: n.to, text: n.text, emit: "dry-run" });
      }
    }
    if (apply && maxId > since) writeWatermark(stateFile, maxId);
    return { ok: true, scanned: notes.length, applied: apply, since, last_event_id: maxId, results };
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.db ? path.resolve(args.db) : path.join(repoRoot, "ui-workspace", "apps", "dev-erp", "data", "dev-erp.db");
  const stateFile = args.state ? path.resolve(args.state) : path.join(repoRoot, "guild_hall", "state", "town_crier", "assign_notify_state.json");
  const result = await runAssignNotifyBridge(repoRoot, { dbPath, stateFile, apply: Boolean(args.apply), limit: Number(args.limit ?? 50) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
