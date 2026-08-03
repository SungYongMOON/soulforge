import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256, summarizeUsageEvents } from "./usage_meter.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function number(value, digits = 0) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function table(title, rows) {
  const body = rows.slice(0, 25).map((row) => `
    <tr>
      <td>${escapeHtml(row.key)}</td>
      <td class="num">${number(row.turns)}</td>
      <td class="num">${number(row.input_tokens)}</td>
      <td class="num">${number(row.output_tokens)}</td>
      <td class="num">${number(row.credits, 3)}</td>
      <td class="num">${number(row.credit_unknown_turns)}</td>
    </tr>`).join("");
  return `<section><h2>${escapeHtml(title)}</h2><div class="table-wrap"><table>
    <thead><tr><th>구분</th><th>Turn</th><th>입력</th><th>출력</th><th>크레딧</th><th>요율 미확인</th></tr></thead>
    <tbody>${body || '<tr><td colspan="6">데이터 없음</td></tr>'}</tbody>
  </table></div></section>`;
}

export function renderUsageDashboard(events, {
  title = "Soulforge AI 사용량 미터",
  generatedAt = new Date().toISOString(),
  coverage = null,
  operational = null,
} = {}) {
  const summary = summarizeUsageEvents(events);
  const totals = summary.totals;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title><style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{margin:0;background:#0c1324;color:#e8eefc}main{max-width:1280px;margin:auto;padding:28px}h1{margin:0 0 6px;font-size:28px}p{color:#aebbd4}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:24px 0}.card,section{background:#141e35;border:1px solid #273554;border-radius:14px;padding:16px}.label{color:#9eb0cf;font-size:13px}.value{font-size:25px;font-weight:700;margin-top:5px}.warn{color:#ffca73}.ok{color:#87e3b2}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:9px 10px;border-bottom:1px solid #2b3854;text-align:left;white-space:nowrap}.num{text-align:right;font-variant-numeric:tabular-nums}section{margin:14px 0}h2{font-size:18px;margin:0 0 12px}.foot{font-size:12px;margin-top:24px}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1><p>생성 시각 ${escapeHtml(generatedAt)} · 원문 대화·reasoning·도구 payload 비수집</p>
<div class="cards">
  <div class="card"><div class="label">계산된 크레딧</div><div class="value">${number(totals.credits, 3)}</div></div>
  <div class="card"><div class="label">Turn</div><div class="value">${number(totals.turns)}</div></div>
  <div class="card"><div class="label">입력 토큰</div><div class="value">${number(totals.input_tokens)}</div></div>
  <div class="card"><div class="label">출력 토큰</div><div class="value">${number(totals.output_tokens)}</div></div>
  <div class="card"><div class="label">캐시 입력 비율</div><div class="value">${number(totals.cached_input_ratio * 100, 1)}%</div></div>
  <div class="card"><div class="label">귀속 미확인 프로젝트</div><div class="value ${totals.unassigned_project_turns ? "warn" : "ok"}">${number(totals.unassigned_project_turns)}</div></div>
  <div class="card"><div class="label">요율 미확인 Turn</div><div class="value ${totals.credit_unknown_turns ? "warn" : "ok"}">${number(totals.credit_unknown_turns)}</div></div>
  <div class="card"><div class="label">잠정 측정 Turn</div><div class="value ${totals.incomplete_measurement_turns ? "warn" : "ok"}">${number(totals.incomplete_measurement_turns)}</div></div>
  <div class="card"><div class="label">Session 수집 범위</div><div class="value">${coverage ? `${number(coverage.parsed_session_count)}/${number(coverage.session_file_count)}` : "미측정"}</div></div>
  <div class="card"><div class="label">수집 HOLD</div><div class="value ${coverage?.issue_count ? "warn" : "ok"}">${coverage ? number(coverage.issue_count) : "-"}</div></div>
  <div class="card"><div class="label">중복 원천 관찰</div><div class="value">${coverage ? number(coverage.duplicate_event_observation_count) : "-"}</div></div>
  <div class="card"><div class="label">자동 훅 상태</div><div class="value ${operational?.hook_status === "ok" ? "ok" : "warn"}">${escapeHtml(operational?.hook_status ?? "unknown")}</div></div>
  <div class="card"><div class="label">병합 대기 이벤트</div><div class="value ${operational?.pending_event_count ? "warn" : "ok"}">${operational ? number(operational.pending_event_count) : "-"}</div></div>
</div>
${table("업무별", summary.by_work)}
${table("프로젝트별", summary.by_project)}
${table("팀별", summary.by_team)}
${table("모델별", summary.by_model)}
${table("Reasoning effort별", summary.by_reasoning_effort)}
${table("에이전트별", summary.by_agent)}
${table("역할별", summary.by_role)}
<p class="foot">크레딧은 저장된 rate card로 계산한 운영 추정치이며 OpenAI 결제·주간 한도 원장 자체가 아닙니다. 요율 미확인 모델은 토큰만 합산되고 크레딧에는 더해지지 않습니다.</p>
</main></body></html>`;
}

export async function writeUsageDashboard(outputPath, events, options = {}) {
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomBytes(6).toString("hex")}`;
  const html = renderUsageDashboard(events, options);
  try {
    await writeFile(temporary, html, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return {
    schema_version: "soulforge.ai_usage_dashboard_receipt.v1",
    output_path: target,
    event_count: events.length,
    summary_digest: sha256(canonicalJson(summarizeUsageEvents(events))),
  };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderUsageCsv(events, { groupBy = "work" } = {}) {
  const summary = summarizeUsageEvents(events);
  const groups = {
    organization: summary.by_organization,
    team: summary.by_team,
    project: summary.by_project,
    work: summary.by_work,
    model: summary.by_model,
    agent: summary.by_agent,
    node: summary.by_node,
    role: summary.by_role,
    reasoning_effort: summary.by_reasoning_effort,
  };
  const rows = groups[groupBy];
  if (!rows) throw new TypeError("group_by_invalid");
  const fields = [
    "key",
    "turns",
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "credits",
    "credit_unknown_turns",
    "model_invocations",
  ];
  return `${fields.join(",")}\n${rows.map((row) => (
    fields.map((field) => csvCell(row[field])).join(",")
  )).join("\n")}\n`;
}

export async function writeUsageCsv(outputPath, events, options = {}) {
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporary, renderUsageCsv(events, options), "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return {
    schema_version: "soulforge.ai_usage_csv_receipt.v1",
    output_path: target,
    event_count: events.length,
    group_by: options.groupBy ?? "work",
  };
}
