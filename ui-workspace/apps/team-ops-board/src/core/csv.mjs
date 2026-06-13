// Team Ops Board MVP1 - CSV 내보내기/가져오기.
// 헤더는 안정적인 영문 식별자(파일 계약), 화면 표시는 한국어(UI 계약).
// Excel 한글 호환을 위해 내보내기에 UTF-8 BOM 을 붙인다.

import { PRIORITIES, PRIORITY_LABELS_KO, STATUSES, STATUS_LABELS_KO, validateItem } from "./model.mjs";

export const CSV_BOM = "﻿";

export const ITEM_CSV_COLUMNS = [
  "id",
  "title",
  "project",
  "owner",
  "status",
  "priority",
  "due_date",
  "next_action",
  "blocker_reason",
  "waiting_on",
  "last_update_at",
  "last_update_note"
];

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportItemsCsv(state) {
  const projectName = (projectId) => state.projects.find((entry) => entry.id === projectId)?.name ?? "";
  const personName = (ownerId) => state.people.find((entry) => entry.id === ownerId)?.name ?? "";

  const rows = [
    ITEM_CSV_COLUMNS,
    ...state.items.map((item) => [
      item.id,
      item.title,
      projectName(item.projectId),
      personName(item.ownerId),
      item.status,
      item.priority,
      item.dueDate ?? "",
      item.nextAction ?? "",
      item.blockerReason ?? "",
      item.waitingOn ?? "",
      item.lastUpdate?.at ?? "",
      item.lastUpdate?.note ?? ""
    ])
  ];

  return CSV_BOM + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// RFC4180 스타일 파서: 따옴표, 따옴표 안 줄바꿈/쉼표, "" 이스케이프 지원.
export function parseCsv(text) {
  const input = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }
    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeStatus(value) {
  const trimmed = String(value ?? "").trim();
  if (STATUSES.includes(trimmed)) {
    return trimmed;
  }
  const byLabel = Object.entries(STATUS_LABELS_KO).find(([, label]) => label === trimmed);
  return byLabel ? byLabel[0] : null;
}

function normalizePriority(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "normal";
  }
  if (PRIORITIES.includes(trimmed)) {
    return trimmed;
  }
  const byLabel = Object.entries(PRIORITY_LABELS_KO).find(([, label]) => label === trimmed);
  return byLabel ? byLabel[0] : null;
}

// 가져오기: id 가 일치하면 갱신, 없으면 추가.
// 모르는 프로젝트/담당자는 조용히 만들지 않고 행 오류로 보고한다.
export function importItemsCsv(state, { raw, at, actor }) {
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    return { state, errors: [{ line: 0, error: "csv_empty" }], imported: 0, updated: 0 };
  }

  const header = rows[0].map((cell) => cell.trim());
  const columnIndex = new Map(header.map((name, index) => [name, index]));
  for (const required of ["title", "project", "status"]) {
    if (!columnIndex.has(required)) {
      return { state, errors: [{ line: 1, error: `csv_header_missing_${required}` }], imported: 0, updated: 0 };
    }
  }

  const cell = (row, name) => {
    const index = columnIndex.get(name);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };

  const projectByName = new Map(state.projects.map((entry) => [entry.name, entry.id]));
  const projectById = new Set(state.projects.map((entry) => entry.id));
  const personByName = new Map(state.people.map((entry) => [entry.name, entry.id]));
  const personById = new Set(state.people.map((entry) => entry.id));

  const errors = [];
  let nextItems = [...state.items];
  let imported = 0;
  let updated = 0;

  rows.slice(1).forEach((row, rowOffset) => {
    const line = rowOffset + 2;
    const title = cell(row, "title");
    if (!title) {
      errors.push({ line, error: "title_required" });
      return;
    }

    const projectRaw = cell(row, "project");
    const projectId = projectById.has(projectRaw) ? projectRaw : projectByName.get(projectRaw);
    if (!projectId) {
      errors.push({ line, error: "project_unknown", value: projectRaw });
      return;
    }

    const ownerRaw = cell(row, "owner");
    let ownerId = null;
    if (ownerRaw) {
      ownerId = personById.has(ownerRaw) ? ownerRaw : personByName.get(ownerRaw) ?? null;
      if (!ownerId) {
        errors.push({ line, error: "owner_unknown", value: ownerRaw });
        return;
      }
    }

    const status = normalizeStatus(cell(row, "status"));
    if (!status) {
      errors.push({ line, error: "status_invalid", value: cell(row, "status") });
      return;
    }

    const priority = normalizePriority(cell(row, "priority"));
    if (!priority) {
      errors.push({ line, error: "priority_invalid", value: cell(row, "priority") });
      return;
    }

    const candidate = {
      title,
      projectId,
      ownerId,
      status,
      priority,
      dueDate: cell(row, "due_date"),
      nextAction: cell(row, "next_action"),
      blockerReason: cell(row, "blocker_reason"),
      waitingOn: cell(row, "waiting_on")
    };

    const validation = validateItem({ ...candidate, comments: [] });
    if (validation.length > 0) {
      errors.push({ line, error: validation[0] });
      return;
    }

    const idRaw = cell(row, "id");
    const existingIndex = idRaw ? nextItems.findIndex((item) => item.id === idRaw) : -1;
    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      nextItems[existingIndex] = {
        ...existing,
        ...candidate,
        lastUpdate: { at, by: actor, note: "CSV 가져오기로 갱신" }
      };
      updated += 1;
    } else {
      const id = idRaw || `wi-${String(nextItems.length + 1).padStart(3, "0")}`;
      const uniqueId = nextItems.some((item) => item.id === id)
        ? `wi-${String(nextItems.length + 101).padStart(3, "0")}`
        : id;
      nextItems = [
        {
          id: uniqueId,
          ...candidate,
          comments: [],
          createdAt: at,
          lastUpdate: { at, by: actor, note: "CSV 가져오기로 생성" }
        },
        ...nextItems
      ];
      imported += 1;
    }
  });

  return { state: { ...state, items: nextItems }, errors, imported, updated };
}
