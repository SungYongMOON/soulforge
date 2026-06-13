// Team Ops Board MVP1 - 일일 기준선(오전 baseline) 고정과 변경 비교.
// 설계서 운영 흐름: 아침 회의에서 보드를 "오전 기준선"으로 얼리고,
// 하루 동안 "오전 이후 무엇이 바뀌었나"를 채팅 기록 없이 보이게 한다.

import { FIELD_LABELS_KO, statusLabel } from "./model.mjs";

const BASELINE_FIELDS = ["title", "projectId", "ownerId", "status", "priority", "dueDate", "nextAction"];

export function captureBaseline(state, { at, actor }) {
  const snapshot = {};
  for (const item of state.items) {
    const record = {};
    for (const field of BASELINE_FIELDS) {
      record[field] = item[field] ?? "";
    }
    snapshot[item.id] = record;
  }
  return { at, by: actor, snapshot };
}

export function diffSinceBaseline(state) {
  const baseline = state.baseline;
  if (!baseline) {
    return null;
  }

  const added = [];
  const changed = [];
  const seen = new Set();

  for (const item of state.items) {
    seen.add(item.id);
    const before = baseline.snapshot[item.id];
    if (!before) {
      added.push(item.id);
      continue;
    }
    const fields = [];
    for (const field of BASELINE_FIELDS) {
      const fromValue = before[field] ?? "";
      const toValue = item[field] ?? "";
      if (fromValue !== toValue) {
        fields.push({
          field,
          label: FIELD_LABELS_KO[field] ?? field,
          from: field === "status" ? statusLabel(fromValue) : String(fromValue),
          to: field === "status" ? statusLabel(toValue) : String(toValue)
        });
      }
    }
    if (fields.length > 0) {
      changed.push({ id: item.id, title: item.title, fields });
    }
  }

  const removed = Object.keys(baseline.snapshot).filter((id) => !seen.has(id));
  const count = added.length + removed.length + changed.length;

  return { at: baseline.at, by: baseline.by, added, removed, changed, count };
}

export function baselineSummaryKo(diff) {
  if (!diff) {
    return "기준선 없음";
  }
  if (diff.count === 0) {
    return "기준선 이후 변경 없음";
  }
  const parts = [];
  if (diff.changed.length > 0) {
    parts.push(`변경 ${diff.changed.length}`);
  }
  if (diff.added.length > 0) {
    parts.push(`추가 ${diff.added.length}`);
  }
  if (diff.removed.length > 0) {
    parts.push(`삭제 ${diff.removed.length}`);
  }
  return `기준선 이후 ${parts.join(" · ")}`;
}
