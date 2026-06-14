#!/usr/bin/env node
// tools/daily_se_report.mjs — 일일 SE 진행보고 자동 작성 (영상 '윤비서' 사상 차용).
// git push 이력(개발 활동) + (옵션) ERP event_log 워크로그를 합쳐 markdown 보고서를 stdout 으로.
// 24시간 PC cron 으로 저녁 실행 권장 — 사람이 보고서 자체를 쓰지 않고 시스템이 작성, 사람은 검토만.
// zero-dependency: node:child_process(git) + fetch(ERP API). 원문/secret 미접촉(커밋 메시지·메타만).
//
// 사용:
//   node tools/daily_se_report.mjs [--since "18 hours ago"] [--repo <repo경로>] [--erp http://127.0.0.1:4300]
// cron 예(매일 18:00): 0 18 * * *  cd <repo> && node ui-workspace/apps/dev-erp/tools/daily_se_report.mjs --erp http://127.0.0.1:4300 >> _workmeta/system/reports/daily/$(date +\%F).md
import { execSync } from "node:child_process";

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return process.argv.includes(`--${name}`) ? true : def;
}

const since = arg("since", "18 hours ago");
const repo = arg("repo", process.cwd());
const erpUrl = arg("erp", null);

// 1) git push 이력(개발 활동) — 작업자 표기(claude_*/codex_*)로 그룹.
let commits = [];
try {
  const out = execSync(`git -C "${repo}" log --since="${since}" --no-merges --format="%h%x1f%an%x1f%s"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  commits = out ? out.split("\n").map((l) => { const [h, a, s] = l.split("\x1f"); return { h, a, s }; }) : [];
} catch { /* git 없음/레포 아님 → 빈 목록 */ }

const byWorker = {};
for (const c of commits) (byWorker[c.a] ||= []).push(c);
const areaOf = (s) => { const m = s.match(/^\w+\(([^)]+)\)/); return m ? m[1] : (/dev-erp/.test(s) ? "dev-erp" : "기타"); };
const byArea = {};
for (const c of commits) (byArea[areaOf(c.s)] ||= []).push(c);

// 2) (옵션) ERP SE 업무 워크로그(event_log 기반) — 서버 가동 시.
let erpWorklog = "";
if (erpUrl) {
  try {
    const r = await fetch(`${erpUrl}/api/worklog/draft?days=1`);
    if (r.ok) erpWorklog = (await r.json()).text || "";
  } catch { /* 서버 미가동 → 생략 */ }
}

// 3) markdown 보고서.
const today = new Date().toISOString().slice(0, 10);
const out = [];
out.push(`# 일일 SE 진행보고 — ${today}`);
out.push(`> 자동 작성(git push 이력 기반, 최근 "${since}"). 사람은 검토만 — 영상 '시스템이 일하게' 사상.`);
out.push("");
out.push(`## 개발 활동 (커밋 ${commits.length}건)`);
if (commits.length) {
  for (const [w, cs] of Object.entries(byWorker)) {
    out.push(`- **${w}** — ${cs.length}건`);
    for (const c of cs.slice(0, 12)) out.push(`  - \`${c.h}\` ${c.s}`);
  }
  out.push("", "### 영역별");
  for (const [a, cs] of Object.entries(byArea).sort((x, y) => y[1].length - x[1].length)) out.push(`- ${a}: ${cs.length}건`);
} else {
  out.push("- (해당 기간 커밋 없음)");
}
if (erpWorklog) out.push("", "## SE 업무 (ERP event_log)", erpWorklog);
out.push("", "※ git 커밋 메시지·메타만 사용(원문/secret 미접촉). 초안 — 검토 후 사용.");
process.stdout.write(out.join("\n") + "\n");
