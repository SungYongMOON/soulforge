// ui-workspace/apps/dev-erp/src/julgi_schedule.mjs — 체계공학 일정 → 줄기 척추 (실데이터, 모델 0)
//   core_deliverable(게이트·산출물·마감)을 그대로 줄기 나무로 투영한다. 결정적·멱등.
//   게이트(stage_code) = 척추 부모, 산출물 = 가지. produced=1 → 전달완료(열매). 마감 있으면 마감.
//   데모 아님 — 그 과제의 실제 산출물 레지스터를 읽는다. (메일·음성 가지는 별도 소스가 붙음)
import { ensureJulgiSchema, addItem, listByProject } from "./julgi.mjs";

// 일정 투영. 이전 'se:' 출처 항목을 먼저 지워 멱등(재실행 안전). 반환=요약.
export function projectScheduleToJulgi(db, project_id) {
  if (!project_id) throw new Error("project_id_required");
  ensureJulgiSchema(db);
  db.prepare("DELETE FROM project_memory_item WHERE project_id=? AND source_ref LIKE 'se:%'").run(project_id);

  let rows;
  try {
    rows = db.prepare(
      "SELECT stage_code, deliverable_no, name, due, produced FROM core_deliverable WHERE project_id=? " +
      "ORDER BY stage_code, CAST(deliverable_no AS INTEGER), deliverable_no"
    ).all(project_id);
  } catch (e) {
    return { error: `core_deliverable_unavailable:${e.message}`, stages: 0, deliverables: 0, fruit: 0 };
  }
  if (!rows.length) return { stages: 0, deliverables: 0, fruit: 0 };

  // 게이트(stage) 부모 노드 = 척추. 등장 순서 보존.
  const stageParent = new Map();
  for (const r of rows) {
    const code = String(r.stage_code || "(단계미상)");
    if (!stageParent.has(code)) {
      const pid = addItem(db, {
        project_id, type: "요구사항", text: `${code} 게이트`,
        source_ref: `se:stage:${code}`, thread_key: code, salience: "high", status: "open",
      });
      stageParent.set(code, pid);
    }
  }

  // 산출물 = 가지(부모=게이트). produced→전달완료(열매), 마감有→마감, 그외→요구사항.
  let fruit = 0;
  for (const r of rows) {
    const code = String(r.stage_code || "(단계미상)");
    const done = Number(r.produced) === 1;
    const due = String(r.due ?? "").trim();
    const type = done ? "전달완료" : (due ? "마감" : "요구사항");
    const status = done ? "closed" : "open";
    if (done) fruit++;
    const text = `${r.name || `산출물 ${r.deliverable_no}`}${due ? ` (마감 ${due})` : ""}`.slice(0, 300);
    addItem(db, {
      project_id, type, text, status,
      source_ref: `se:${code}:${r.deliverable_no}`, thread_key: code,
      parent_id: stageParent.get(code), salience: "normal",
    });
  }
  return { stages: stageParent.size, deliverables: rows.length, fruit, total: listByProject(db, project_id).length };
}
