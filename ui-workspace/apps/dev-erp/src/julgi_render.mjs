// ui-workspace/apps/dev-erp/src/julgi_render.mjs — 줄기 렌더 (슬라이스4)
//   같은 줄기 데이터를 세 가지로 그린다(전부 순수함수, 새 데이터 0):
//     1) 나무(척추→가지) + 시각상태(열매/잎/봉오리)  2) 흐름 뷰(가닥별 시간순)  3) 1페이지 상태요약
//   완료=열매는 visualState(julgi.mjs) 매핑을 그대로 쓴다. UI(껍데기)가 이 출력만 소비.
import { buildTree, renderState, listByProject, visualState, JULGI_TYPES } from "./julgi.mjs";

export const VISUAL_LABEL = { fruit: "열매", leaf: "잎", bud: "봉오리", dropped: "폐기" };
export const VISUAL_MARK = { fruit: "◆", leaf: "○", bud: "·", dropped: "✕" }; // 이모지 비의존 텍스트 마커

// 흐름 뷰: 가닥(thread_key)별 시간순 항목. thread_key 없으면 '(단독)' 묶음. 가닥은 최근활동순.
export function renderFlow(db, project_id) {
  const rows = listByProject(db, project_id); // created_at ASC
  const threads = new Map();
  for (const r of rows) {
    const key = r.thread_key || "(단독)";
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push({ ...r, visual: visualState(r) });
  }
  const out = [];
  for (const [thread_key, items] of threads) {
    const last_updated = items.reduce((m, i) => (i.updated_at > m ? i.updated_at : m), "");
    out.push({ thread_key, last_updated, items });
  }
  out.sort((a, b) => b.last_updated.localeCompare(a.last_updated));
  return out;
}

// 흐름 뷰 텍스트: 가닥별 화살표 체인(완료=열매 마커). "퍼즐 맞추기"용.
export function renderFlowText(db, project_id) {
  return renderFlow(db, project_id)
    .map((t) => `[${t.thread_key}] ${t.items.map((i) => `${VISUAL_MARK[i.visual] || "○"}${i.type}:${i.text}`).join(" → ")}`)
    .join("\n");
}

// 나무 텍스트: 척추(root)→가지 들여쓰기 + 시각 마커.
export function renderTreeText(db, project_id) {
  const lines = [];
  const walk = (node, depth) => {
    lines.push(`${"  ".repeat(depth)}${VISUAL_MARK[node.visual] || "○"} [${node.type}] ${node.text}`);
    for (const c of node.children) walk(c, depth + 1);
  };
  for (const r of buildTree(db, project_id)) walk(r, 0);
  return lines.join("\n");
}

// 1페이지 상태요약 텍스트: 종류별 활성 항목(renderState) 한 줄씩. 행보관의 '지금' 보기와 짝.
export function renderOnePageText(db, project_id) {
  const groups = renderState(db, project_id);
  const lines = [];
  for (const t of JULGI_TYPES) {
    const items = groups[t];
    if (items && items.length) lines.push(`${t}: ${items.map((i) => i.text).join(" · ")}`);
  }
  return lines.join("\n");
}

// 나무 통계: 열매/잎/봉오리 개수 + 완료율(진척 한눈에 — 게임루프 피드백).
export function treeStats(db, project_id) {
  const rows = listByProject(db, project_id);
  const s = { fruit: 0, leaf: 0, bud: 0, dropped: 0, total: rows.length };
  for (const r of rows) { const v = visualState(r); s[v] = (s[v] || 0) + 1; }
  s.progress = rows.length ? Math.round((s.fruit / rows.length) * 100) : 0;
  return s;
}
