// ui-workspace/apps/dev-erp/src/julgi_view.mjs — 줄기 + 행보관 합본 뷰 (슬라이스5)
//   행보관(상태 스냅샷 '지금')과 줄기(흐름/나무/열매율)를 한 객체로 합친다. 중복0·상보.
//   와이어링은 주입식: buildJulgiView 는 snapshot 을 인자로 받아 순수하게 합치고(테스트 쉬움),
//   loadHaengbogwanSnapshot 이 실제 행보관을 호출(동적 import·graceful null — 행보관/원장 없어도 안 깨짐).
import { renderState } from "./julgi.mjs";
import { treeStats, renderFlow, renderOnePageText } from "./julgi_render.mjs";

// 행보관 스냅샷에서 화면에 쓸 필드만 추림(부분/누락 관용).
export function compactSnapshot(s) {
  if (!s || typeof s !== "object") return null;
  const n = (k) => Number(s[k] ?? 0) || 0;
  return {
    pending_mail: n("pending_mail_count"),
    unclassified_task: n("unclassified_task_count"),
    due_today: n("due_today_count"),
    overdue: n("overdue_count"),
    blocked: n("blocked_count"),
    waiting: n("waiting_count"),
    next_actions: Array.isArray(s.next_actions) ? s.next_actions.slice(0, 5) : [],
  };
}

// 합본 뷰 객체: status(행보관 '지금', 없으면 null) + julgi(흐름/열매율/1페이지). 순수함수.
export function buildJulgiView(db, project_id, { snapshot = null } = {}) {
  return {
    project_id,
    has_status: !!snapshot,
    status: compactSnapshot(snapshot),
    julgi: {
      stats: treeStats(db, project_id),
      flow: renderFlow(db, project_id),
      onepage: renderState(db, project_id),
    },
  };
}

// 합본 한 화면 텍스트: 행보관 '지금' 한 줄 + 줄기 1페이지 + 완료율.
export function combinedViewText(db, project_id, { snapshot = null } = {}) {
  const cs = compactSnapshot(snapshot);
  const stats = treeStats(db, project_id);
  const lines = [];
  lines.push(cs
    ? `지금: 미분류메일 ${cs.pending_mail} · 미분류할일 ${cs.unclassified_task} · 오늘마감 ${cs.due_today} · 연체 ${cs.overdue}`
    : "지금: (행보관 스냅샷 없음)");
  const onepage = renderOnePageText(db, project_id);
  if (onepage) lines.push(onepage);
  lines.push(`완료율: ${stats.progress}% (열매 ${stats.fruit}/${stats.total})`);
  return lines.join("\n");
}

// 실제 행보관 호출(재사용 와이어링). 동적 import·try/catch → 행보관/원장 없으면 null(graceful).
//   서버(껍데기)가 이걸로 snapshot 을 얻어 buildJulgiView 에 주입한다.
export async function loadHaengbogwanSnapshot(projectId, opts = {}) {
  try {
    const mod = await import("../tools/haengbogwan_snapshot.mjs");
    if (typeof mod.buildSnapshotForProject !== "function") return null;
    return mod.buildSnapshotForProject({ projectId, ...opts });
  } catch {
    return null;
  }
}
