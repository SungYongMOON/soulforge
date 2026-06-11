// Team Ops Board MVP1 - pure state operations with audit trail.
// 모든 변경은 이벤트(감사 기록)를 함께 반환한다. 저장소(localStorage) 접근은
// 이 모듈이 아니라 UI 어댑터가 담당한다.

import {
  FIELD_LABELS_KO,
  SCHEMA_VERSION,
  requiredNoteField,
  statusLabel,
  validateItem
} from "./model.mjs";

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    people: [],
    items: [],
    audit: [],
    baseline: null,
    settings: {
      requireBlockedNote: true,
      requireWaitingNote: true,
      compactRows: true
    }
  };
}

export function nextId(prefix, existingIds) {
  let index = existingIds.length + 1;
  let candidate = `${prefix}-${String(index).padStart(3, "0")}`;
  const taken = new Set(existingIds);
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${String(index).padStart(3, "0")}`;
  }
  return candidate;
}

function makeEvent(state, { at, actor, kind, itemId = null, field = null, from = null, to = null, note = null, summary }) {
  return {
    id: nextId("ev", state.audit.map((event) => event.id)),
    at,
    actor,
    kind,
    itemId,
    field,
    from,
    to,
    note,
    summary
  };
}

function withEvent(state, event) {
  return { ...state, audit: [event, ...state.audit] };
}

export function addItem(state, { at, actor, fields }) {
  const item = {
    id: nextId("wi", state.items.map((existing) => existing.id)),
    title: String(fields.title ?? "").trim(),
    projectId: fields.projectId ?? null,
    ownerId: fields.ownerId ?? null,
    status: fields.status ?? "todo",
    priority: fields.priority ?? "normal",
    dueDate: fields.dueDate ?? "",
    nextAction: String(fields.nextAction ?? "").trim(),
    blockerReason: String(fields.blockerReason ?? "").trim(),
    waitingOn: String(fields.waitingOn ?? "").trim(),
    comments: [],
    createdAt: at,
    lastUpdate: { at, by: actor, note: "항목 생성" }
  };

  const errors = validateItem(item);
  if (errors.length > 0) {
    return { state, error: errors[0], errors };
  }

  const event = makeEvent(state, {
    at,
    actor,
    kind: "create",
    itemId: item.id,
    summary: `항목 생성: ${item.title}`
  });

  return {
    state: withEvent({ ...state, items: [item, ...state.items] }, event),
    item
  };
}

const AUDITED_FIELDS = [
  "title",
  "projectId",
  "ownerId",
  "status",
  "priority",
  "dueDate",
  "nextAction",
  "blockerReason",
  "waitingOn"
];

export function updateItem(state, { at, actor, itemId, patch, note = "" }) {
  const current = state.items.find((item) => item.id === itemId);
  if (!current) {
    return { state, error: "item_not_found" };
  }

  const next = { ...current, ...patch };

  // 상태가 차단/대기로 바뀌면 필수 사유 필드를 강제한다.
  const noteField = requiredNoteField(next.status);
  if (noteField && !String(next[noteField] ?? "").trim()) {
    return { state, error: `${noteField === "blockerReason" ? "blocker_reason" : "waiting_on"}_required` };
  }

  const errors = validateItem(next);
  if (errors.length > 0) {
    return { state, error: errors[0], errors };
  }

  let workingState = state;
  const changedFields = [];
  for (const field of AUDITED_FIELDS) {
    const fromValue = current[field] ?? "";
    const toValue = next[field] ?? "";
    if (fromValue === toValue) {
      continue;
    }
    changedFields.push(field);
    const isStatus = field === "status";
    workingState = withEvent(
      workingState,
      makeEvent(workingState, {
        at,
        actor,
        kind: "update",
        itemId,
        field,
        from: isStatus ? statusLabel(fromValue) : String(fromValue),
        to: isStatus ? statusLabel(toValue) : String(toValue),
        note: note || null,
        summary: `${FIELD_LABELS_KO[field] ?? field} 변경: ${current.title}`
      })
    );
  }

  if (changedFields.length === 0) {
    return { state, error: "no_change" };
  }

  next.lastUpdate = {
    at,
    by: actor,
    note: note || `${changedFields.map((field) => FIELD_LABELS_KO[field] ?? field).join(", ")} 변경`
  };

  return {
    state: {
      ...workingState,
      items: workingState.items.map((item) => (item.id === itemId ? next : item))
    },
    item: next,
    changedFields
  };
}

export function addComment(state, { at, actor, itemId, message }) {
  const current = state.items.find((item) => item.id === itemId);
  const trimmed = String(message ?? "").trim();
  if (!current) {
    return { state, error: "item_not_found" };
  }
  if (!trimmed) {
    return { state, error: "comment_empty" };
  }

  const comment = { author: actor, message: trimmed, at };
  const event = makeEvent(state, {
    at,
    actor,
    kind: "comment",
    itemId,
    note: trimmed,
    summary: `메모 추가: ${current.title}`
  });

  return {
    state: withEvent(
      {
        ...state,
        items: state.items.map((item) =>
          item.id === itemId
            ? { ...item, comments: [...item.comments, comment], lastUpdate: { at, by: actor, note: "메모 추가" } }
            : item
        )
      },
      event
    )
  };
}

export function upsertProject(state, { at, actor, project }) {
  const name = String(project.name ?? "").trim();
  if (!name) {
    return { state, error: "project_name_required" };
  }
  const existing = project.id ? state.projects.find((entry) => entry.id === project.id) : null;
  const record = {
    id: existing ? existing.id : nextId("pj", state.projects.map((entry) => entry.id)),
    name,
    code: String(project.code ?? "").trim() || name.slice(0, 3).toUpperCase(),
    color: project.color ?? "#0e7490",
    health: project.health ?? "ok",
    currentGoal: String(project.currentGoal ?? "").trim(),
    nextGate: String(project.nextGate ?? "").trim(),
    targetDate: project.targetDate ?? ""
  };

  const event = makeEvent(state, {
    at,
    actor,
    kind: "project",
    summary: existing ? `프로젝트 수정: ${record.name}` : `프로젝트 추가: ${record.name}`
  });

  return {
    state: withEvent(
      {
        ...state,
        projects: existing
          ? state.projects.map((entry) => (entry.id === record.id ? record : entry))
          : [...state.projects, record]
      },
      event
    ),
    project: record
  };
}

export function upsertPerson(state, { at, actor, person }) {
  const name = String(person.name ?? "").trim();
  if (!name) {
    return { state, error: "person_name_required" };
  }
  const existing = person.id ? state.people.find((entry) => entry.id === person.id) : null;
  const record = {
    id: existing ? existing.id : nextId("tm", state.people.map((entry) => entry.id)),
    name,
    role: String(person.role ?? "").trim(),
    color: person.color ?? "#2563eb"
  };

  const event = makeEvent(state, {
    at,
    actor,
    kind: "person",
    summary: existing ? `팀원 수정: ${record.name}` : `팀원 추가: ${record.name}`
  });

  return {
    state: withEvent(
      {
        ...state,
        people: existing
          ? state.people.map((entry) => (entry.id === record.id ? record : entry))
          : [...state.people, record]
      },
      event
    ),
    person: record
  };
}

// 직렬화: localStorage/백업 파일 공용. 역직렬화는 스키마 버전을 검사한다.
export function serializeState(state) {
  return JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION });
}

export function parseState(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "backup_not_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "backup_not_object" };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { error: "backup_schema_mismatch" };
  }
  const base = emptyState();
  const state = {
    ...base,
    ...parsed,
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    items: Array.isArray(parsed.items) ? parsed.items : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    baseline: parsed.baseline ?? null
  };
  const invalid = state.items.map((item) => validateItem(item)).filter((errors) => errors.length > 0);
  if (invalid.length > 0) {
    return { error: "backup_items_invalid", detail: `${invalid.length} item(s)` };
  }
  return { state };
}

export function makeBackup(state, { at, actor }) {
  const payload = serializeState({
    ...state,
    audit: [
      makeEvent(state, { at, actor, kind: "backup", summary: "백업 파일 생성" }),
      ...state.audit
    ]
  });
  return payload;
}

export function restoreBackup(state, { at, actor, raw }) {
  const parsed = parseState(raw);
  if (parsed.error) {
    return { state, error: parsed.error, detail: parsed.detail };
  }
  const restored = parsed.state;
  const event = makeEvent(restored, {
    at,
    actor,
    kind: "restore",
    summary: `백업 복원 (${restored.items.length}개 항목)`
  });
  return { state: withEvent(restored, event) };
}
