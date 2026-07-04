#!/usr/bin/env node
// five_field_promotion_scan.mjs — 5필드 레저의 배수구(ladder S4): request_kind 반복을 세어
// "2회=packet 후보, 3회=helper 후보" 승격 신호를 산출한다. 자동 실행/자동 packet 생성 없음 —
// 신호 리포트까지만(request_to_automation_ladder_v0 stop_condition). 표준 Node 만 사용.
// 사용:
//   node five_field_promotion_scan.mjs [--repo-root C:/Soulforge] [--report] [--min 2]
//   --report: _workmeta/system/reports/procedure_capture/five_field_promotion_scan_<YYYYMMDD>.md 기록
// 입력: _workmeta/*/reports/procedure_capture/five_field_log.jsonl (개발 세션 레인)
//   ERP 업무 레인(completion_log.request_kind)은 --db <경로> 로 opt-in (운영 배포 후 사용).
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const n = process.argv[i + 1];
    if (n !== undefined && !n.startsWith("--")) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true;
  }
}

function findRepoRoot(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.SOULFORGE_ROOT) return resolve(process.env.SOULFORGE_ROOT);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "_workmeta"))) return dir;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const root = findRepoRoot(args["repo-root"]);
if (!root) { console.error("repo_root_not_found"); process.exit(2); }
const MIN = Number(args.min ?? 2);
const base = join(root, "_workmeta");

// 1) 개발 세션 레인: 전 과제 five_field_log.jsonl 수집
const kinds = new Map(); // slug -> { count, projects:Set, sessions:Set, last_at, needs_backfill }
let rows = 0, badLines = 0;
for (const d of readdirSync(base, { withFileTypes: true }).filter((x) => x.isDirectory())) {
  const p = join(base, d.name, "reports", "procedure_capture", "five_field_log.jsonl");
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { badLines++; continue; }
    const k = String(r.request_kind ?? "").trim();
    if (!k) continue;
    rows++;
    const e = kinds.get(k) ?? { count: 0, projects: new Set(), sessions: new Set(), last_at: "", needs_backfill: 0 };
    e.count++; e.projects.add(r.project_code ?? "?"); e.sessions.add(r.session_ref ?? "?");
    if ((r.at ?? "") > e.last_at) e.last_at = r.at ?? "";
    if (r.needs_backfill) e.needs_backfill++;
    kinds.set(k, e);
  }
}

// 2) ERP 업무 레인(opt-in): completion_log.request_kind 집계
let erpNote = "erp_lane: skipped (--db 미지정 — 운영 배포 후 opt-in)";
if (args.db) {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(String(args.db), { readOnly: true });
    for (const r of db.prepare("SELECT request_kind k, COUNT(*) n, MAX(created_at) last FROM completion_log WHERE request_kind IS NOT NULL GROUP BY request_kind").all()) {
      const e = kinds.get(r.k) ?? { count: 0, projects: new Set(), sessions: new Set(), last_at: "", needs_backfill: 0 };
      e.count += Number(r.n); e.projects.add("(erp)");
      if ((r.last ?? "") > e.last_at) e.last_at = r.last;
      kinds.set(r.k, e);
    }
    erpNote = "erp_lane: included (" + args.db + ")";
  } catch (e) { erpNote = "erp_lane: error " + String(e?.message ?? e).slice(0, 120); }
}

// 3) packet 커버리지: dev_worker 큐 yaml 본문에 슬러그가 등장하면 covered 로 간주(보수적 휴리스틱)
const queueDir = join(base, "system", "dev_worker_candidate_queue");
let packetText = "";
if (existsSync(queueDir)) {
  for (const f of readdirSync(queueDir).filter((f) => f.endsWith(".yaml"))) {
    try { packetText += readFileSync(join(queueDir, f), "utf8") + "\n"; } catch { /* skip */ }
  }
}

const signals = [...kinds.entries()]
  .map(([slug, e]) => ({
    request_kind: slug,
    count: e.count,
    distinct_sessions: e.sessions.size,
    projects: [...e.projects],
    last_at: e.last_at,
    needs_backfill: e.needs_backfill,
    packet_covered: packetText.includes(slug),
    signal: e.count >= 3 ? "helper_candidate" : e.count >= MIN ? "packet_candidate" : "watch",
  }))
  .sort((a, b) => b.count - a.count);

const promote = signals.filter((s) => s.signal !== "watch" && !s.packet_covered);
const out = {
  schema_version: "soulforge.five_field_promotion_scan.v0",
  generated_at: new Date().toISOString(),
  scanned_rows: rows,
  bad_lines: badLines,
  erp_lane: erpNote,
  kinds_total: signals.length,
  promote_candidates: promote,
  all: signals,
  note: "신호 산출까지만 — packet 작성/자동 실행은 사람/AI 가 별도 판단(ladder stop_condition)",
};
console.log(JSON.stringify(out, null, 1));

if (args.report) {
  const day = out.generated_at.slice(0, 10).replaceAll("-", "");
  const dir = join(base, "system", "reports", "procedure_capture");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `five_field_promotion_scan_${day}.md`);
  const lines = [
    `# 5필드 승격 신호 스캔 (${out.generated_at.slice(0, 10)})`,
    "",
    `- 스캔 행: ${rows} · 유형: ${signals.length} · ${erpNote}`,
    `- 규칙: ${MIN}회=packet 후보, 3회=helper 후보 (packet 텍스트에 슬러그 등장 시 covered)`,
    "",
    "| request_kind | 횟수 | 세션수 | 과제 | 최근 | 신호 | packet |",
    "|---|---|---|---|---|---|---|",
    ...signals.map((s) => `| ${s.request_kind} | ${s.count} | ${s.distinct_sessions} | ${s.projects.join(" ")} | ${s.last_at.slice(0, 10)} | ${s.signal} | ${s.packet_covered ? "covered" : "-"} |`),
    "",
    promote.length
      ? `## 승격 후보 ${promote.length}건\n\n` + promote.map((s) => `- **${s.request_kind}** (${s.count}회, ${s.signal}) — packet 미존재 → 다음 액션: dev_worker_candidate_queue 에 packet 초안`).join("\n")
      : "## 승격 후보 없음 — 계속 축적",
    "",
    "주장 한계: 관찰됨 — 신호일 뿐 자동 실행 아님(ladder S4 stop_condition).",
  ];
  writeFileSync(p, lines.join("\n") + "\n", "utf8");
  console.error("[report] " + p);
}
