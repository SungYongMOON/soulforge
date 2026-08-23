// Hermes Bot 관찰 하니스 - 뷰 모델(rows)을 안전한 HTML 문자열로 렌더한다.
// 모든 동적 값은 HTML 이스케이프되며, 검증되지 않은 링크는 생성하지 않는다(fail-closed).

export const HARNESS_DEFAULT_PORT = 4791;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatUsage(usage) {
  // usage.kind는 패널(동결 계약)이 판정한 값만 소비한다.
  if (!usage || usage.kind === "unknown") return "사용량 알 수 없음";
  if (usage.kind === "unavailable") return "사용량 정보 없음";
  if (usage.kind === "exact") {
    return `입력 ${usage.inputTokens} / 출력 ${usage.outputTokens} / 캐시 ${usage.cacheReadTokens}`;
  }
  return "사용량 알 수 없음";
}

function formatHeartbeat(heartbeat) {
  if (!heartbeat || heartbeat.kind === "unknown" || typeof heartbeat.ageSeconds !== "number") {
    return "마지막 신호 알 수 없음";
  }
  const { kind, ageSeconds } = heartbeat;
  if (kind === "fresh") return `마지막 신호 ${ageSeconds}초 전`;
  if (kind === "stale") {
    if (ageSeconds < 3600) return `마지막 신호 ${Math.floor(ageSeconds / 60)}분 전`;
    const hours = Math.floor(ageSeconds / 3600);
    const minutes = Math.round((ageSeconds % 3600) / 60);
    return minutes > 0
      ? `마지막 신호 ${hours}시간 ${minutes}분 전`
      : `마지막 신호 ${hours}시간 전`;
  }
  return "마지막 신호 알 수 없음";
}

function renderBotCard(row, generatedAtMs) {
  void generatedAtMs;
  const stateLabel = row.stateLabel ?? row.state;
  const openAction = row.open && row.open.supported && typeof row.open.url === "string"
    ? `<a class="hbot-open" href="${escapeHtml(row.open.url)}">Hermes에서 대화 열기</a>`
    : `<span class="hbot-open hbot-open-missing">열기 경로 없음</span>`;
  const goal = row.goalLabel ?? "목표 없음";
  const stage = row.stageLabel ?? "단계 없음";
  const model = row.model ?? "모델 알 수 없음";
  const provider = row.provider ?? "공급자 알 수 없음";
  const resultStatus = row.result?.status ?? "unknown";
  const resultText =
    resultStatus === "available" ? "결과 확인 가능"
    : resultStatus === "missing" ? "결과 없음"
    : "결과 알 수 없음";
  const holdChip = row.hold
    ? `\n    <span class="hbot-chip hbot-suppressed-chip">표시 보류</span>`
    : "";
  return [
    `<article class="hbot-card" data-state="${escapeHtml(row.state)}">`,
    `  <header class="hbot-card-head"><h3>${escapeHtml(row.botName)}</h3>`,
    `  <span class="hbot-chip hbot-state-chip">${escapeHtml(stateLabel)}</span></header>`,
    `  <dl class="hbot-meta">`,
    `    <div><dt>목표</dt><dd>${escapeHtml(goal)}</dd></div>`,
    `    <div><dt>단계</dt><dd>${escapeHtml(stage)}</dd></div>`,
    `    <div><dt>모델</dt><dd>${escapeHtml(model)}</dd></div>`,
    `    <div><dt>공급자</dt><dd>${escapeHtml(provider)}</dd></div>`,
    `    <div><dt>결과</dt><dd>${escapeHtml(resultText)}</dd></div>`,
    `  </dl>`,
    `  <p class="hbot-chip-row">`,
    `    <span class="hbot-chip">${escapeHtml(formatUsage(row.usage))}</span>`,
    `    <span class="hbot-chip">${escapeHtml(formatHeartbeat(row.heartbeat))}</span>${holdChip}`,
    `  </p>`,
    `  ${openAction}`,
    `</article>`,
  ].join("\n");
}

export function renderHermesBotHarnessHtml(viewModel) {
  // 이미 정규화된 동결 계약 뷰 모델(buildHermesBotPanelViewModel 산출)을 그대로 소비한다.
  const vm = viewModel !== null && typeof viewModel === "object" && Array.isArray(viewModel.rows)
    ? viewModel
    : { ok: true, generatedAtMs: null, rows: [] };
  const rows = Array.isArray(vm.rows) ? vm.rows : [];
  const cards = rows
    .filter((row) => row !== null && typeof row === "object" && !Array.isArray(row))
    .map((row) => renderBotCard(row, vm.generatedAtMs))
    .join("\n");
  const body = cards.length > 0
    ? cards
    : `<p class="hbot-empty">관찰 중인 Bot 활동 없음</p>`;
  return [
    "<!DOCTYPE html>",
    `<html lang="ko">`,
    "<head>",
    `  <meta charset="utf-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1">`,
    `  <title>Hermes Bot 관찰</title>`,
    "  <style>",
    "    :root { color-scheme: light dark; }",
    "    body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; }",
    "    .hbot-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }",
    "    .hbot-card { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; }",
    '    .hbot-card[data-state="hold"] { border-color: #c0392b; }',
    '    .hbot-chip { display: inline-block; background: #eee; color: #111; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.85rem; margin-right: 0.35rem; }',
    "    .hbot-open { display: inline-block; margin-top: 0.75rem; color: #0645ad; }",
    "    .hbot-open-missing { color: #777; }",
    "    a:focus-visible, button:focus-visible { outline: 3px solid #0645ad; outline-offset: 2px; }",
    "    @media (max-width: 390px) {",
    "      body { padding: 0.5rem; }",
    "      .hbot-grid { grid-template-columns: 1fr; }",
    "      .hbot-card { padding: 0.75rem; }",
    "    }",
    "  </style>",
    "</head>",
    "<body>",
    `  <main><h1>Hermes Bot 관찰</h1><section class="hbot-grid">${body}</section></main>`,
    "</body>",
    "</html>",
  ].join("\n");
}
