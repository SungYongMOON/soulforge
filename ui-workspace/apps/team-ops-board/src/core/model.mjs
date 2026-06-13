// Team Ops Board MVP1 - core domain model (dependency-free).
// Source contract: _workmeta/system/reports/procedure_capture/team_ops_board_fresh_design_20260602.md
// Status / priority enums follow the design brief data model.

export const SCHEMA_VERSION = "team_ops_board.v1";

export const STATUSES = ["todo", "doing", "waiting", "blocked", "done"];
export const PRIORITIES = ["high", "normal", "low"];
export const PROJECT_HEALTH = ["ok", "watch", "risk", "stopped"];

export const STATUS_LABELS_KO = {
  todo: "할 일",
  doing: "진행 중",
  waiting: "대기",
  blocked: "차단",
  done: "완료"
};

export const PRIORITY_LABELS_KO = {
  high: "높음",
  normal: "보통",
  low: "낮음"
};

export const HEALTH_LABELS_KO = {
  ok: "정상",
  watch: "주의",
  risk: "위험",
  stopped: "중단"
};

export const FIELD_LABELS_KO = {
  title: "제목",
  projectId: "프로젝트",
  ownerId: "담당자",
  status: "상태",
  priority: "우선순위",
  dueDate: "마감일",
  nextAction: "다음 행동",
  blockerReason: "차단 사유",
  waitingOn: "대기 대상"
};

export function statusLabel(status) {
  return STATUS_LABELS_KO[status] ?? status;
}

export function priorityLabel(priority) {
  return PRIORITY_LABELS_KO[priority] ?? priority;
}

export function healthLabel(health) {
  return HEALTH_LABELS_KO[health] ?? health;
}

// blocked -> blockerReason 필수, waiting -> waitingOn 필수 (설계서 규칙).
export function requiredNoteField(status) {
  if (status === "blocked") {
    return "blockerReason";
  }
  if (status === "waiting") {
    return "waitingOn";
  }
  return null;
}

export function validateItem(item) {
  const errors = [];
  if (!item || typeof item !== "object") {
    return ["item_not_object"];
  }
  if (!String(item.title ?? "").trim()) {
    errors.push("title_required");
  }
  if (!STATUSES.includes(item.status)) {
    errors.push("status_invalid");
  }
  if (!PRIORITIES.includes(item.priority)) {
    errors.push("priority_invalid");
  }
  if (item.status === "blocked" && !String(item.blockerReason ?? "").trim()) {
    errors.push("blocker_reason_required");
  }
  if (item.status === "waiting" && !String(item.waitingOn ?? "").trim()) {
    errors.push("waiting_on_required");
  }
  if (item.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) {
    errors.push("due_date_format");
  }
  return errors;
}

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysKey(todayKey, days) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return dateKey(next);
}

// 보드 묶음 분류: 담당없음 / 차단 / 대기 / 완료 / 오늘(마감 지남 포함) / 마감임박.
export function bucketForItem(item, todayKey, dueSoonEndKey) {
  if (!item.ownerId) {
    return "no_owner";
  }
  if (item.status === "blocked") {
    return "blocked";
  }
  if (item.status === "waiting") {
    return "waiting";
  }
  if (item.status === "done") {
    return "done";
  }
  if (item.dueDate && item.dueDate <= todayKey) {
    return "today";
  }
  if (item.dueDate && dueSoonEndKey && item.dueDate <= dueSoonEndKey) {
    return "due_soon";
  }
  return "due_soon";
}
