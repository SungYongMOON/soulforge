import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { pathExists, relativeToRepo } from "../shared/io.mjs";

export const PROJECT_MAIL_HISTORY_SCHEMA_VERSION = "soulforge.project_mail_history.private.v1";

const HISTORY_DIR = path.join("reports", "메일_이력");
const CSV_FILE_NAME = "메일_이력.csv";
const XLSX_FILE_NAME = "메일_이력.xlsx";
const SCHEDULE_FILE_NAME = "메일_일정이벤트.ics";
const CSV_HEADERS = [
  "이력키",
  "스키마버전",
  "발생시각",
  "프로젝트코드",
  "단계",
  "몬스터ID",
  "후보ID",
  "이벤트유형",
  "메일소스ID",
  "메일메시지ID",
  "메일수신시각",
  "메일함",
  "수신역할",
  "스레드",
  "제목",
  "발신자",
  "첨부수",
  "작업상태",
  "게이트웨이몬스터참조",
  "프로젝트몬스터참조",
  "파일링패킷참조",
  "미션참조",
  "원문복사여부",
];
const XLSX_STYLE_IDS = Object.freeze({
  default: 0,
  header: 1,
  wrap: 2,
  dateTime: 3,
  integer: 4,
  mutedWrap: 5,
});
const HUMAN_XLSX_COLUMNS = [
  { key: "event_at", header: "날짜", width: 19, style: XLSX_STYLE_IDS.dateTime, type: "date" },
  { key: "direction", header: "방향", width: 10, style: XLSX_STYLE_IDS.default },
  { key: "subject", header: "제목", width: 48, style: XLSX_STYLE_IDS.wrap },
  { key: "counterpart", header: "상대방", width: 28, style: XLSX_STYLE_IDS.wrap },
  { key: "event_type", header: "이벤트유형", width: 18, style: XLSX_STYLE_IDS.default },
  { key: "attachment_count", header: "첨부수", width: 9, style: XLSX_STYLE_IDS.integer, type: "integer" },
  { key: "status", header: "상태", width: 16, style: XLSX_STYLE_IDS.wrap },
  { key: "source_ref", header: "메일소스ID", width: 28, style: XLSX_STYLE_IDS.wrap },
  { key: "recipient_role", header: "수신역할", width: 10, style: XLSX_STYLE_IDS.default },
  { key: "project_code", header: "프로젝트", width: 14, style: XLSX_STYLE_IDS.default },
  { key: "stage", header: "단계", width: 14, style: XLSX_STYLE_IDS.default },
  { key: "candidate_id", header: "후보ID", width: 20, style: XLSX_STYLE_IDS.mutedWrap },
  { key: "monster_id", header: "몬스터ID", width: 24, style: XLSX_STYLE_IDS.mutedWrap },
  { key: "thread_ref", header: "스레드", width: 20, style: XLSX_STYLE_IDS.mutedWrap },
  { key: "mailbox", header: "메일함", width: 18, style: XLSX_STYLE_IDS.mutedWrap },
  { key: "raw_copied", header: "원문복사여부", width: 14, style: XLSX_STYLE_IDS.default },
];
const TECHNICAL_XLSX_COLUMNS = CSV_HEADERS.map((header) => ({
  key: header,
  header,
  width: technicalColumnWidth(header),
  style: XLSX_STYLE_IDS.mutedWrap,
}));
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "html",
  "raw",
  "raw_body",
  "raw_html",
  "attachment",
  "attachments",
  "attachment_payload",
  "attachment_payloads",
  "attachment_url",
  "attachment_urls",
  "local_path",
  "downloaded_path",
]);

export function projectMailHistoryPaths(repoRoot, projectCode) {
  const safeProjectCode = safePathToken(projectCode, "project_code");
  const root = path.resolve(repoRoot);
  const projectRoot = path.join(root, "_workmeta", safeProjectCode);
  const historyRoot = path.join(projectRoot, HISTORY_DIR);
  const workspaceProjectRoot = path.join(root, "_workspaces", safeProjectCode);
  const workspaceHistoryRoot = path.join(workspaceProjectRoot, HISTORY_DIR);
  const paths = {
    project_root: projectRoot,
    history_root: historyRoot,
    workspace_project_root: workspaceProjectRoot,
    workspace_history_root: workspaceHistoryRoot,
    csv_path: path.join(historyRoot, CSV_FILE_NAME),
    legacy_workmeta_xlsx_path: path.join(historyRoot, XLSX_FILE_NAME),
    xlsx_path: path.join(workspaceHistoryRoot, XLSX_FILE_NAME),
    schedule_path: path.join(historyRoot, SCHEDULE_FILE_NAME),
  };

  for (const filePath of [paths.csv_path, paths.legacy_workmeta_xlsx_path, paths.schedule_path]) {
    assertInside(projectRoot, filePath, "_workmeta project root");
  }
  assertInside(workspaceProjectRoot, paths.xlsx_path, "_workspaces project root");

  return paths;
}

export function projectMailHistoryRefs(repoRoot, projectCode) {
  const paths = projectMailHistoryPaths(repoRoot, projectCode);
  return [
    relativeToRepo(repoRoot, paths.csv_path),
    relativeToRepo(repoRoot, paths.xlsx_path),
    relativeToRepo(repoRoot, paths.schedule_path),
  ];
}

export function buildProjectMailHistoryEntry({
  eventType,
  at,
  projectCode,
  stage = null,
  monster = {},
  mail = {},
  refs = {},
  workStatus = null,
}) {
  const safeProjectCode = safePathToken(projectCode, "project_code");
  const monsterId = requiredString(monster.monster_id, "monster.monster_id");
  const sourceRef = nullableString(mail.source_ref ?? firstValue(monster.source_refs));
  const entry = {
    "이력키": buildHistoryKey({
      projectCode: safeProjectCode,
      eventType,
      monsterId,
      sourceRef,
    }),
    "스키마버전": PROJECT_MAIL_HISTORY_SCHEMA_VERSION,
    "발생시각": normalizeTimestamp(at),
    "프로젝트코드": safeProjectCode,
    "단계": nullableString(stage ?? monster.assigned_stage ?? monster.stage),
    "몬스터ID": monsterId,
    "후보ID": nullableString(mail.candidate_id ?? refs.candidate_id),
    "이벤트유형": requiredString(eventType, "eventType"),
    "메일소스ID": sourceRef,
    "메일메시지ID": nullableString(mail.provider_message_id ?? mail.message_id),
    "메일수신시각": nullableString(mail.received_at ?? monster.last_mail_at),
    "메일함": nullableString(mail.mailbox_id),
    "수신역할": recipientRoleForMailbox(mail),
    "스레드": nullableString(mail.thread_ref),
    "제목": nullableString(mail.subject),
    "발신자": formatAddressList(mail.from),
    "첨부수": String(Number(mail.attachment_count ?? 0)),
    "작업상태": nullableString(workStatus ?? monster.assignment_status ?? monster.status),
    "게이트웨이몬스터참조": nullableString(refs.gateway_monster_ref),
    "프로젝트몬스터참조": nullableString(refs.project_monster_ref ?? monster.project_monster_ref),
    "파일링패킷참조": nullableString(refs.filing_packet_ref ?? monster.filing_packet_ref),
    "미션참조": nullableString(refs.mission_ref ?? monster.mission_ref),
    "원문복사여부": "false",
  };

  assertNoForbiddenPayload(entry, "project mail history entry");
  return normalizeCsvRow(entry);
}

export async function upsertProjectMailHistory({
  repoRoot,
  projectCode,
  entry,
}) {
  if (!projectCode) {
    return {
      status: "skipped",
      reason: "missing_project_code",
      written_refs: [],
    };
  }

  const safeProjectCode = safePathToken(projectCode, "project_code");
  const paths = projectMailHistoryPaths(repoRoot, safeProjectCode);
  const nextEntry = normalizeCsvRow(entry);
  assertNoForbiddenPayload(nextEntry, "project mail history entry");

  const existingRows = await readCsvRows(paths.csv_path);
  const rowsByKey = new Map();
  for (const row of existingRows) {
    const key = row["이력키"];
    if (key) {
      rowsByKey.set(key, normalizeCsvRow(row));
    }
  }

  const replacedExisting = rowsByKey.has(nextEntry["이력키"]);
  rowsByKey.set(nextEntry["이력키"], nextEntry);
  const rows = [...rowsByKey.values()].sort(compareHistoryRows);
  assertNoDuplicateHistoryKeys(rows);

  await fs.mkdir(paths.history_root, { recursive: true });
  await fs.mkdir(paths.workspace_history_root, { recursive: true });
  await fs.writeFile(paths.csv_path, renderCsv(rows), "utf8");
  await fs.writeFile(paths.xlsx_path, buildXlsxBuffer(rows));
  await fs.writeFile(paths.schedule_path, renderScheduleIcs(rows), "utf8");
  await removeLegacyWorkmetaXlsx(paths.legacy_workmeta_xlsx_path);

  return {
    status: "updated",
    project_code: safeProjectCode,
    history_key: nextEntry["이력키"],
    dedupe_status: replacedExisting ? "replaced_existing" : "inserted",
    written_refs: projectMailHistoryRefs(repoRoot, safeProjectCode),
    boundary: {
      metadata_owner: "_workmeta/<project_code>/reports/메일_이력",
      export_owner: "_workspaces/<project_code>/reports/메일_이력",
      raw_payload_copied: false,
      public_safe: false,
    },
  };
}

async function removeLegacyWorkmetaXlsx(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function buildHistoryKey({ projectCode, eventType, monsterId, sourceRef }) {
  const raw = [
    projectCode,
    eventType,
    monsterId,
    sourceRef ?? "no_mail_source",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function normalizeCsvRow(row) {
  return Object.fromEntries(CSV_HEADERS.map((header) => [header, nullableString(row?.[header])]));
}

async function readCsvRows(filePath) {
  if (!(await pathExists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, "utf8");
  return parseCsv(raw);
}

function renderCsv(rows) {
  const lines = [
    CSV_HEADERS.map(csvEscape).join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function parseCsv(raw) {
  const text = raw.replace(/^\uFEFF/u, "");
  if (!text.trim()) {
    return [];
  }

  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      record.push(field.replace(/\r$/u, ""));
      records.push(record);
      record = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || record.length > 0) {
    record.push(field.replace(/\r$/u, ""));
    records.push(record);
  }

  const [headers, ...rows] = records;
  if (!headers) {
    return [];
  }

  return rows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function csvEscape(value) {
  const text = nullableString(value);
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replace(/"/gu, "\"\"")}"`;
  }
  return text;
}

function buildXlsxBuffer(rows) {
  const sheets = buildXlsxSheets(rows);
  const files = [
    {
      name: "[Content_Types].xml",
      content: renderContentTypesXml(sheets),
    },
    {
      name: "_rels/.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        "</Relationships>",
      ].join(""),
    },
    {
      name: "xl/workbook.xml",
      content: renderWorkbookXml(sheets),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: renderWorkbookRelsXml(sheets),
    },
    {
      name: "xl/styles.xml",
      content: renderStylesXml(),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: renderWorksheetXml(sheet, index),
    })),
  ];

  return buildZip(files);
}

function buildXlsxSheets(rows) {
  const normalizedRows = rows.map(normalizeCsvRow);
  const humanRows = normalizedRows.map(buildHumanXlsxRow);
  return [
    { name: "메일_이력", columns: HUMAN_XLSX_COLUMNS, rows: humanRows },
    {
      name: "수신",
      columns: HUMAN_XLSX_COLUMNS,
      rows: humanRows.filter((row) => row.direction === "수신"),
    },
    {
      name: "발신",
      columns: HUMAN_XLSX_COLUMNS,
      rows: humanRows.filter((row) => row.direction === "발신"),
    },
    {
      name: "검토필요",
      columns: HUMAN_XLSX_COLUMNS,
      rows: humanRows.filter((row) => row.needs_review),
    },
    {
      name: "기술정보",
      columns: TECHNICAL_XLSX_COLUMNS,
      rows: normalizedRows,
      hidden: true,
    },
  ];
}

function buildHumanXlsxRow(row) {
  const direction = deriveMailDirection(row);
  const rawStatus = row["작업상태"];
  const eventType = row["이벤트유형"];
  const needsReview = rowNeedsReview({ eventType, status: rawStatus, direction });
  return {
    event_at: toExcelDateSerial(row["메일수신시각"] || row["발생시각"]),
    direction,
    subject: row["제목"],
    counterpart: row["발신자"],
    event_type: eventType,
    attachment_count: row["첨부수"],
    status: rawStatus || (needsReview ? "검토필요" : ""),
    source_ref: row["메일소스ID"],
    recipient_role: row["수신역할"],
    project_code: row["프로젝트코드"],
    stage: row["단계"],
    candidate_id: row["후보ID"],
    monster_id: row["몬스터ID"],
    thread_ref: row["스레드"],
    mailbox: row["메일함"],
    raw_copied: row["원문복사여부"],
    needs_review: needsReview,
  };
}

function deriveMailDirection(row) {
  const eventType = row["이벤트유형"].toLowerCase();
  if (/(sent|send|outbound|smtp|발신|송신)/u.test(eventType)) {
    return "발신";
  }
  if (/(received|inbound|incoming|intake|filing|monster|candidate|수신)/u.test(eventType)) {
    return "수신";
  }
  return "미분류";
}

function rowNeedsReview({ eventType, status, direction }) {
  const normalizedStatus = nullableString(status).toLowerCase();
  const normalizedEventType = nullableString(eventType).toLowerCase();
  if (!normalizedStatus) {
    return true;
  }
  if (/(review|pending|candidate|needs|stale|blocked|hold|unassigned|unknown|검토|대기|보류|막힘|미분류)/u.test(normalizedStatus)) {
    return true;
  }
  if (
    direction === "수신"
    && normalizedEventType === "mail_received"
    && !/(assigned|filed|done|completed|closed|transferred|resolved|배정|완료|종료)/u.test(normalizedStatus)
  ) {
    return true;
  }
  return false;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function addressListContains(value, mailbox) {
  const mailboxEmail = normalizeEmail(mailbox);
  if (!mailboxEmail) return false;
  const entries = Array.isArray(value) ? value : [value];
  return entries.some((entry) => {
    if (!entry) return false;
    if (typeof entry === "string") return normalizeEmail(entry) === mailboxEmail;
    return normalizeEmail(entry.address ?? entry.email) === mailboxEmail;
  });
}

function recipientRoleForMailbox(mail = {}) {
  const explicit = normalizeEmail(mail.recipient_role);
  if (explicit === "to" || explicit === "cc") return explicit;
  const mailbox = mail.mailbox_id ?? mail.mailbox ?? "";
  if (addressListContains(mail.to, mailbox)) return "to";
  if (addressListContains(mail.cc, mailbox)) return "cc";
  return "";
}

function renderContentTypesXml(sheets) {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map((_, index) => (
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    "</Types>",
  ].join("");
}

function renderWorkbookXml(sheets) {
  const sheetEntries = sheets
    .map((sheet, index) => {
      const hidden = sheet.hidden ? ' state="hidden"' : "";
      return `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}"${hidden} r:id="rId${index + 1}"/>`;
    })
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<bookViews><workbookView activeTab="0"/></bookViews>',
    "<sheets>",
    sheetEntries,
    "</sheets>",
    "</workbook>",
  ].join("");
}

function renderWorkbookRelsXml(sheets) {
  const sheetRels = sheets
    .map((_, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ))
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    sheetRels,
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    "</Relationships>",
  ].join("");
}

function renderStylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>',
    '<fonts count="3">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font>',
    '</fonts>',
    '<fills count="3">',
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>',
    '</fills>',
    '<borders count="2">',
    '<border/>',
    '<border><left style="thin"><color rgb="FFD9E2EC"/></left><right style="thin"><color rgb="FFD9E2EC"/></right><top style="thin"><color rgb="FFD9E2EC"/></top><bottom style="thin"><color rgb="FFD9E2EC"/></bottom></border>',
    '</borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="6">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>',
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '</cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    "</styleSheet>",
  ].join("");
}

function renderWorksheetXml(sheet, sheetIndex) {
  const columns = sheet.columns;
  const allRows = [
    Object.fromEntries(columns.map((column) => [column.key, column.header])),
    ...sheet.rows,
  ];
  const lastColumn = columnName(columns.length);
  const lastRow = Math.max(1, allRows.length);
  const sheetRows = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = rowIndex === 0 ? 24 : 38;
      const cells = columns.map((column, columnIndex) => {
        const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
        if (rowIndex === 0) {
          return renderInlineStringCell(cellRef, column.header, XLSX_STYLE_IDS.header);
        }
        return renderWorksheetCell(cellRef, row[column.key], column);
      }).join("");
      return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
    })
    .join("");
  const columnXml = columns
    .map((column, index) => {
      const columnNumber = index + 1;
      return `<col min="${columnNumber}" max="${columnNumber}" width="${column.width}" customWidth="1"/>`;
    })
    .join("");
  const selected = sheetIndex === 0 ? ' tabSelected="1"' : "";
  const filterRef = `A1:${lastColumn}${lastRow}`;

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="${filterRef}"/>`,
    `<sheetViews><sheetView workbookViewId="0"${selected}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`,
    '<sheetFormatPr defaultRowHeight="18"/>',
    `<cols>${columnXml}</cols>`,
    "<sheetData>",
    sheetRows,
    "</sheetData>",
    `<autoFilter ref="${filterRef}"/>`,
    "</worksheet>",
  ].join("");
}

function renderWorksheetCell(cellRef, value, column) {
  if (column.type === "date") {
    return renderNumberCell(cellRef, value, XLSX_STYLE_IDS.dateTime);
  }
  if (column.type === "integer") {
    return renderNumberCell(cellRef, Number(value), XLSX_STYLE_IDS.integer);
  }
  return renderInlineStringCell(cellRef, value, column.style ?? XLSX_STYLE_IDS.default);
}

function renderNumberCell(cellRef, value, styleId) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return `<c r="${cellRef}" s="${styleId}"/>`;
  }
  return `<c r="${cellRef}" s="${styleId}"><v>${Number(value)}</v></c>`;
}

function renderInlineStringCell(cellRef, value, styleId) {
  const style = styleId ? ` s="${styleId}"` : "";
  const text = nullableString(value);
  if (!text) {
    return `<c r="${cellRef}"${style}/>`;
  }
  const preserve = /^\s|\s$/u.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${cellRef}"${style} t="inlineStr"><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
}

function toExcelDateSerial(value) {
  const raw = nullableString(value).trim();
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const excelEpoch = Date.UTC(1899, 11, 30);
  return Number(((date.getTime() - excelEpoch) / 86_400_000).toFixed(10));
}

function technicalColumnWidth(header) {
  if (header.includes("참조")) {
    return 42;
  }
  if (header.includes("제목")) {
    return 48;
  }
  if (header.includes("시각")) {
    return 22;
  }
  if (header.includes("ID") || header.includes("키") || header.includes("버전")) {
    return 28;
  }
  return Math.max(10, Math.min(24, Array.from(header).length * 2 + 4));
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.from(file.content, "utf8");
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function renderScheduleIcs(rows) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Soulforge//Project Mail History//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const row of rows) {
    const startsAt = row["메일수신시각"] || row["발생시각"];
    const eventStart = formatIcsDate(startsAt);
    const eventEnd = formatIcsDate(addMinutes(startsAt, 15));
    const summary = `[${row["프로젝트코드"]}] ${row["제목"] || row["후보ID"] || row["몬스터ID"]}`;
    const description = [
      `이벤트유형: ${row["이벤트유형"]}`,
      `후보ID: ${row["후보ID"]}`,
      `몬스터ID: ${row["몬스터ID"]}`,
      `메일소스ID: ${row["메일소스ID"]}`,
      `프로젝트몬스터참조: ${row["프로젝트몬스터참조"]}`,
      "원문복사여부: false",
    ].join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${row["이력키"]}@soulforge.local`,
      `DTSTAMP:${formatIcsDate(row["발생시각"])}`,
      `DTSTART:${eventStart}`,
      `DTEND:${eventEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "CATEGORIES:메일,몬스터",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`;
}

function columnName(index) {
  let value = index;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table.push(crc >>> 0);
  }
  return table;
})();

function compareHistoryRows(left, right) {
  const timeCompare = compareTimestamps(left["발생시각"], right["발생시각"]);
  if (timeCompare !== 0) {
    return timeCompare;
  }
  return `${left["몬스터ID"]}:${left["이벤트유형"]}:${left["이력키"]}`.localeCompare(
    `${right["몬스터ID"]}:${right["이벤트유형"]}:${right["이력키"]}`,
  );
}

function compareTimestamps(left, right) {
  const leftEpoch = Date.parse(left ?? "");
  const rightEpoch = Date.parse(right ?? "");
  if (Number.isNaN(leftEpoch) && Number.isNaN(rightEpoch)) {
    return String(left ?? "").localeCompare(String(right ?? ""));
  }
  if (Number.isNaN(leftEpoch)) {
    return -1;
  }
  if (Number.isNaN(rightEpoch)) {
    return 1;
  }
  return leftEpoch - rightEpoch;
}

function assertNoDuplicateHistoryKeys(rows) {
  const seen = new Set();
  for (const row of rows) {
    const key = row["이력키"];
    if (seen.has(key)) {
      throw new Error(`duplicate project mail history key: ${key}`);
    }
    seen.add(key);
  }
}

function assertNoForbiddenPayload(value, label) {
  const violations = [];
  visit(value, [], (entry, keyPath) => {
    const key = keyPath.at(-1);
    if (typeof key === "string" && FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      violations.push(keyPath.join("."));
    }
    if (typeof entry === "string" && /^data:[^;]+;base64,/iu.test(entry)) {
      violations.push(keyPath.join("."));
    }
  });

  if (violations.length > 0) {
    throw new Error(`${label} contains forbidden raw payload fields: ${violations.join(", ")}`);
  }
}

function visit(value, keyPath, callback) {
  callback(value, keyPath);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, [...keyPath, String(index)], callback));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, [...keyPath, key], callback);
    }
  }
}

function formatAddressList(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry) => {
      if (!entry) {
        return "";
      }
      if (typeof entry === "string") {
        return entry;
      }
      const address = entry.address ?? entry.email ?? "";
      const name = entry.name ?? "";
      if (name && address) {
        return `${name} <${address}>`;
      }
      return address || name;
    })
    .filter(Boolean)
    .join("; ");
}

function nullableString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function requiredString(value, label) {
  const raw = nullableString(value).trim();
  if (!raw) {
    throw new Error(`missing ${label}`);
  }
  return raw;
}

function firstValue(value) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value.find(Boolean) ?? null : value;
}

function normalizeTimestamp(value) {
  const raw = nullableString(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid timestamp: ${raw}`);
  }
  return date.toISOString();
}

function formatIcsDate(value) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date(0) : date;
  return safeDate.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function addMinutes(value, minutes) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date(0) : date;
  return new Date(safeDate.getTime() + minutes * 60_000).toISOString();
}

function xmlEscape(value) {
  return nullableString(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function escapeIcsText(value) {
  return nullableString(value)
    .replace(/\\/gu, "\\\\")
    .replace(/\r?\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

function foldIcsLine(line) {
  const folded = [];
  let remaining = line;
  while (remaining.length > 75) {
    folded.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  folded.push(remaining);
  return folded;
}

function safePathToken(value, label) {
  const raw = nullableString(value).trim();
  if (!raw) {
    throw new Error(`missing ${label}`);
  }
  if (!/^[A-Za-z0-9._-]+$/u.test(raw)) {
    throw new Error(`${label} contains unsupported path characters`);
  }
  return raw;
}

function assertInside(rootPath, targetPath, label) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`project mail history output must stay inside ${label}`);
  }
}
