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
  "메일수신시각",
  "메일함",
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
  const projectRoot = path.join(path.resolve(repoRoot), "_workmeta", safeProjectCode);
  const historyRoot = path.join(projectRoot, HISTORY_DIR);
  const paths = {
    project_root: projectRoot,
    history_root: historyRoot,
    csv_path: path.join(historyRoot, CSV_FILE_NAME),
    xlsx_path: path.join(historyRoot, XLSX_FILE_NAME),
    schedule_path: path.join(historyRoot, SCHEDULE_FILE_NAME),
  };

  for (const filePath of [paths.csv_path, paths.xlsx_path, paths.schedule_path]) {
    assertInside(projectRoot, filePath, "_workmeta project root");
  }

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
    "메일수신시각": nullableString(mail.received_at ?? monster.last_mail_at),
    "메일함": nullableString(mail.mailbox_id),
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
  await fs.writeFile(paths.csv_path, renderCsv(rows), "utf8");
  await fs.writeFile(paths.xlsx_path, buildXlsxBuffer(rows));
  await fs.writeFile(paths.schedule_path, renderScheduleIcs(rows), "utf8");

  return {
    status: "updated",
    project_code: safeProjectCode,
    history_key: nextEntry["이력키"],
    dedupe_status: replacedExisting ? "replaced_existing" : "inserted",
    written_refs: projectMailHistoryRefs(repoRoot, safeProjectCode),
    boundary: {
      owner: "_workmeta/<project_code>/reports/메일_이력",
      raw_payload_copied: false,
      public_safe: false,
    },
  };
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
  const files = [
    {
      name: "[Content_Types].xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        "</Types>",
      ].join(""),
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
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        "<sheets>",
        '<sheet name="메일_이력" sheetId="1" r:id="rId1"/>',
        "</sheets>",
        "</workbook>",
      ].join(""),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        "</Relationships>",
      ].join(""),
    },
    {
      name: "xl/styles.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>",
        "<fills count=\"1\"><fill><patternFill patternType=\"none\"/></fill></fills>",
        "<borders count=\"1\"><border/></borders>",
        "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
        "<cellXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/></cellXfs>",
        "</styleSheet>",
      ].join(""),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: renderWorksheetXml(rows),
    },
  ];

  return buildZip(files);
}

function renderWorksheetXml(rows) {
  const allRows = [
    Object.fromEntries(CSV_HEADERS.map((header) => [header, header])),
    ...rows,
  ];
  const sheetRows = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = CSV_HEADERS.map((header, columnIndex) => {
        const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
        const value = xmlEscape(row[header]);
        return `<c r="${cellRef}" t="inlineStr"><is><t>${value}</t></is></c>`;
      }).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<sheetData>",
    sheetRows,
    "</sheetData>",
    "</worksheet>",
  ].join("");
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
