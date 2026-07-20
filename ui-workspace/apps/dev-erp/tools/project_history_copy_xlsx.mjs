#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";

export const PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION =
  "soulforge.project_history_copy_xlsx_input.v1";
export const PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION =
  "soulforge.project_history_copy_xlsx_readback.v1";

export const PROJECT_HISTORY_COPY_COLUMNS = Object.freeze([
  "generation_id",
  "project_id",
  "classification_state",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "source_attestation_digest",
  "raw_payload_copied",
  "accepted_history",
  "sort_ordinal",
  "occurrence_id",
  "lane",
  "event_at",
  "valid_at",
  "observed_at",
  "known_at",
  "recorded_at",
  "metadata_digest",
]);

const XLSX_INPUT_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "project_id",
  "classification_state",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "source_attestation_digest",
  "raw_payload_copied",
  "accepted_history",
  "columns",
  "rows",
  "ordered_row_digest",
  "hidden_sheets",
  "external_links",
  "formula_cells",
]);
const XLSX_READBACK_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "ordered_row_digest",
  "columns",
  "rows",
  "hidden_sheet_count",
  "external_link_count",
  "formula_cell_count",
]);
const INTEGER_COLUMNS = new Set(["event_count", "coverage_count", "sort_ordinal"]);
const BOOLEAN_COLUMNS = new Set(["raw_payload_copied", "accepted_history"]);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/u;
const URI_OR_PATH_PATTERN = /^(?:https?|ftp|file|mailto|urn|data):|^[A-Za-z][A-Za-z0-9+.-]*:\/\/|^[A-Za-z]:[\\/]|^\\\\|[/\\]/iu;
const XML_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const MAX_XLSX_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 32;

const CONTENT_TYPES_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
  '</Types>',
].join("");
const ROOT_RELS_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
  '</Relationships>',
].join("");
const WORKBOOK_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  '<bookViews><workbookView activeTab="0" firstSheet="0"/></bookViews>',
  '<sheets><sheet name="Project History" sheetId="1" r:id="rId1"/></sheets>',
  '</workbook>',
].join("");
const WORKBOOK_RELS_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  '</Relationships>',
].join("");
const STYLES_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>',
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
  '</styleSheet>',
].join("");
const STATIC_PARTS = Object.freeze({
  "[Content_Types].xml": CONTENT_TYPES_XML,
  "_rels/.rels": ROOT_RELS_XML,
  "xl/workbook.xml": WORKBOOK_XML,
  "xl/_rels/workbook.xml.rels": WORKBOOK_RELS_XML,
  "xl/styles.xml": STYLES_XML,
});
const REQUIRED_ENTRY_NAMES = Object.freeze([
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
]);
const SHEET_XML_PREFIX = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
].join("");
const SHEET_XML_AFTER_DIMENSION = [
  '<sheetViews><sheetView workbookViewId="0" tabSelected="1"/></sheetViews>',
  '<sheetFormatPr defaultRowHeight="15"/>',
  '<sheetData>',
].join("");
const SHEET_XML_SUFFIX = '</sheetData></worksheet>';

export class ProjectHistoryCopyXlsxError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProjectHistoryCopyXlsxError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectHistoryCopyXlsxError(code, message);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail("plain_object_required", `${label} must be a plain object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", `${label} fields differ from the fixed contract`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", `${label} must be a canonical sha256 digest`);
  }
}

function assertSafeString(value, label) {
  if (typeof value !== "string" || XML_CONTROL_PATTERN.test(value)) {
    fail("xlsx_string_invalid", `${label} must be XML-safe text`);
  }
  if (FORMULA_PREFIX_PATTERN.test(value)) {
    fail("xlsx_formula_prefix_forbidden", `${label} retains an executable spreadsheet prefix`);
  }
  if (URI_OR_PATH_PATTERN.test(value)) {
    fail("xlsx_locator_forbidden", `${label} contains a path or URI`);
  }
}

function assertMetadataString(value, label) {
  if (typeof value !== "string" || value.length === 0 || XML_CONTROL_PATTERN.test(value)) {
    fail("xlsx_string_invalid", `${label} must be non-empty XML-safe text`);
  }
  if (URI_OR_PATH_PATTERN.test(value)) {
    fail("xlsx_locator_forbidden", `${label} contains a path or URI`);
  }
}

function assertColumns(columns, label) {
  if (!Array.isArray(columns)
      || columns.length !== PROJECT_HISTORY_COPY_COLUMNS.length
      || columns.some((column, index) => column !== PROJECT_HISTORY_COPY_COLUMNS[index])) {
    fail("xlsx_columns_mismatch", `${label} differs from the canonical columns`);
  }
}

function spreadsheetSafeText(value) {
  return FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

function spreadsheetOriginalText(value) {
  return value.startsWith("'") && FORMULA_PREFIX_PATTERN.test(value.slice(1)) ? value.slice(1) : value;
}

function validateRow(row, rowIndex, model) {
  assertExactKeys(row, PROJECT_HISTORY_COPY_COLUMNS, `XLSX row ${rowIndex}`);
  for (const column of PROJECT_HISTORY_COPY_COLUMNS) {
    const value = row[column];
    if (INTEGER_COLUMNS.has(column)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        fail("xlsx_integer_invalid", `${column} in row ${rowIndex} is not a non-negative safe integer`);
      }
    } else if (BOOLEAN_COLUMNS.has(column)) {
      if (typeof value !== "boolean") fail("xlsx_boolean_invalid", `${column} in row ${rowIndex} is not boolean`);
    } else {
      assertSafeString(value, `${column} in row ${rowIndex}`);
    }
  }
  if (row.generation_id !== spreadsheetSafeText(model.generation_id)
      || row.project_id !== spreadsheetSafeText(model.project_id)
      || row.classification_state !== "shadow"
      || row.event_count !== model.event_count
      || row.coverage_count !== model.coverage_count
      || row.ordered_event_digest !== model.ordered_event_digest
      || row.source_attestation_digest !== model.source_attestation_digest
      || row.raw_payload_copied !== false
      || row.accepted_history !== false
      || row.sort_ordinal !== rowIndex
      || !PROJECT_HISTORY_LANES.includes(row.lane)) {
    fail("xlsx_row_boundary_invalid", `XLSX row ${rowIndex} differs from the feature-OFF row contract`);
  }
  assertDigest(row.ordered_event_digest, `row ${rowIndex} ordered_event_digest`);
  assertDigest(row.source_attestation_digest, `row ${rowIndex} source_attestation_digest`);
  assertDigest(row.metadata_digest, `row ${rowIndex} metadata_digest`);
}

export function validateProjectHistoryCopyXlsxInput(value, expectedModel = null) {
  assertExactKeys(value, XLSX_INPUT_FIELDS, "XLSX input");
  if (value.schema_version !== PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION
      || value.classification_state !== "shadow"
      || value.raw_payload_copied !== false
      || value.accepted_history !== false
      || value.hidden_sheets !== false
      || value.external_links !== false
      || value.formula_cells !== false) {
    fail("xlsx_input_boundary_invalid", "XLSX input must remain one visible feature-OFF data projection");
  }
  for (const [label, entry] of [
    ["generation_id", value.generation_id],
    ["project_id", value.project_id],
  ]) assertMetadataString(entry, label);
  if (!Number.isSafeInteger(value.event_count) || value.event_count < 1
      || !Number.isSafeInteger(value.coverage_count) || value.coverage_count < 1
      || !Array.isArray(value.rows) || value.rows.length !== value.event_count) {
    fail("xlsx_input_count_invalid", "XLSX input counts must match a non-empty row set");
  }
  assertDigest(value.ordered_event_digest, "ordered_event_digest");
  assertDigest(value.source_attestation_digest, "source_attestation_digest");
  assertDigest(value.ordered_row_digest, "ordered_row_digest");
  assertColumns(value.columns, "XLSX input columns");
  value.rows.forEach((row, index) => validateRow(row, index, value));
  if (sha256Canonical(value.rows) !== value.ordered_row_digest) {
    fail("xlsx_ordered_row_digest_mismatch", "XLSX input ordered_row_digest does not match its rows");
  }
  if (expectedModel !== null && canonicalJson(value) !== canonicalJson(expectedModel)) {
    fail("xlsx_input_parity_mismatch", "XLSX input differs from the canonical DB row model");
  }
  return value;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function xmlUnescape(value, label) {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/u.test(value)) {
    fail("xlsx_xml_entity_invalid", `${label} contains an unsupported XML entity`);
  }
  const decoded = value
    .replace(/&apos;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&gt;/gu, ">")
    .replace(/&lt;/gu, "<")
    .replace(/&amp;/gu, "&");
  if (XML_CONTROL_PATTERN.test(decoded)) fail("xlsx_xml_text_invalid", `${label} contains XML control data`);
  return decoded;
}

function columnName(index) {
  let value = index;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function renderCell(reference, column, value) {
  if (INTEGER_COLUMNS.has(column)) return `<c r="${reference}"><v>${value}</v></c>`;
  if (BOOLEAN_COLUMNS.has(column)) return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const preserve = /^\s|\s$/u.test(value) ? ' xml:space="preserve"' : "";
  return `<c r="${reference}" t="inlineStr"><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
}

function renderWorksheetXml(model) {
  const rows = [
    PROJECT_HISTORY_COPY_COLUMNS,
    ...model.rows.map((row) => PROJECT_HISTORY_COPY_COLUMNS.map((column) => row[column])),
  ];
  const renderedRows = rows.map((values, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = values.map((value, columnIndex) => renderCell(
      `${columnName(columnIndex + 1)}${rowNumber}`,
      rowIndex === 0 ? "header" : PROJECT_HISTORY_COPY_COLUMNS[columnIndex],
      value,
    )).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const dimension = `A1:${columnName(PROJECT_HISTORY_COPY_COLUMNS.length)}${rows.length}`;
  return `${SHEET_XML_PREFIX}<dimension ref="${dimension}"/>${SHEET_XML_AFTER_DIMENSION}${renderedRows}${SHEET_XML_SUFFIX}`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table.push(crc >>> 0);
  }
  return table;
})();

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [entryName, entryContent] of entries) {
    const name = Buffer.from(entryName, "utf8");
    const content = Buffer.isBuffer(entryContent) ? entryContent : Buffer.from(entryContent, "utf8");
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralSize = centralParts.reduce((total, entry) => total + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("xlsx_utf8_invalid", `${label} is not strict UTF-8`);
  }
}

function assertZipEntryName(name) {
  if (name.length === 0 || name.includes("\0") || name.includes("\\") || name.startsWith("/")
      || /^[A-Za-z]:/u.test(name) || name.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("xlsx_zip_entry_name_invalid", "XLSX ZIP contains an unsafe entry name");
  }
}

function parseStoredZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_XLSX_BYTES) {
    fail("xlsx_zip_invalid", "XLSX must be a bounded ZIP buffer");
  }
  const endOffset = bytes.length - 22;
  if (bytes.readUInt32LE(endOffset) !== 0x06054b50
      || bytes.readUInt16LE(endOffset + 4) !== 0
      || bytes.readUInt16LE(endOffset + 6) !== 0
      || bytes.readUInt16LE(endOffset + 20) !== 0) {
    fail("xlsx_zip_eocd_invalid", "XLSX ZIP must have one unspanned, comment-free central directory");
  }
  const diskCount = bytes.readUInt16LE(endOffset + 8);
  const totalCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (diskCount !== totalCount || totalCount < 1 || totalCount > MAX_ZIP_ENTRIES
      || centralOffset + centralSize !== endOffset) {
    fail("xlsx_zip_directory_invalid", "XLSX ZIP central directory bounds or counts are invalid");
  }

  const records = [];
  const names = new Set();
  const foldedNames = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < totalCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      fail("xlsx_zip_directory_invalid", "XLSX ZIP central record is truncated or invalid");
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if ((flags & ~0x0800) !== 0 || method !== 0 || compressedSize !== uncompressedSize
        || extraLength !== 0 || commentLength !== 0 || diskStart !== 0
        || nameLength < 1 || recordEnd > endOffset) {
      fail("xlsx_zip_feature_unsupported", "XLSX ZIP uses unsupported or ambiguous ZIP features");
    }
    const name = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength), "ZIP entry name");
    assertZipEntryName(name);
    const folded = name.toLowerCase();
    if (names.has(name) || foldedNames.has(folded)) {
      fail("xlsx_zip_duplicate_entry", `XLSX ZIP contains duplicate entry ${name}`);
    }
    names.add(name);
    foldedNames.add(folded);
    records.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset });
    cursor = recordEnd;
  }
  if (cursor !== endOffset) fail("xlsx_zip_directory_invalid", "XLSX ZIP central directory has trailing data");

  const localOrder = [...records].sort((left, right) => left.localOffset - right.localOffset);
  const entries = new Map();
  let expectedOffset = 0;
  for (const record of localOrder) {
    const offset = record.localOffset;
    if (offset !== expectedOffset || offset + 30 > centralOffset
        || bytes.readUInt32LE(offset) !== 0x04034b50) {
      fail("xlsx_zip_local_header_invalid", "XLSX ZIP local entries are overlapping, hidden, or non-contiguous");
    }
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const crc = bytes.readUInt32LE(offset + 14);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (flags !== record.flags || method !== record.method || crc !== record.crc
        || compressedSize !== record.compressedSize || uncompressedSize !== record.uncompressedSize
        || extraLength !== 0 || nameLength < 1 || dataEnd > centralOffset) {
      fail("xlsx_zip_local_header_invalid", "XLSX ZIP local and central records disagree");
    }
    const localName = decodeUtf8(bytes.subarray(nameStart, nameStart + nameLength), "ZIP local entry name");
    if (localName !== record.name) fail("xlsx_zip_local_header_invalid", "XLSX ZIP local entry name differs");
    const content = bytes.subarray(dataStart, dataEnd);
    if (crc32(content) !== record.crc) fail("xlsx_zip_crc_mismatch", `CRC mismatch for ${record.name}`);
    entries.set(record.name, Buffer.from(content));
    expectedOffset = dataEnd;
  }
  if (expectedOffset !== centralOffset) {
    fail("xlsx_zip_local_header_invalid", "XLSX ZIP contains unindexed local data");
  }
  return entries;
}

function parseCellBody(type, body, column, label) {
  if (/<\/?(?:[A-Za-z_][\w.-]*:)?f(?:\s|>|\/)/u.test(body)) {
    fail("xlsx_formula_cell_forbidden", `${label} contains a formula cell`);
  }
  if (type === "inlineStr") {
    const match = /^<is><t(?: xml:space="preserve")?>([\s\S]*)<\/t><\/is>$/u.exec(body);
    if (!match) fail("xlsx_cell_invalid", `${label} is not a canonical inline string cell`);
    const value = xmlUnescape(match[1], label);
    assertSafeString(value, label);
    return value;
  }
  if (type === "b") {
    const match = /^<v>([01])<\/v>$/u.exec(body);
    if (!match || !BOOLEAN_COLUMNS.has(column)) fail("xlsx_cell_invalid", `${label} is not a canonical boolean cell`);
    return match[1] === "1";
  }
  const match = /^<v>(0|[1-9]\d*)<\/v>$/u.exec(body);
  if (!match || !INTEGER_COLUMNS.has(column)) fail("xlsx_cell_invalid", `${label} is not a canonical integer cell`);
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) fail("xlsx_integer_invalid", `${label} is outside the safe integer range`);
  return value;
}

function parseWorksheetRows(sheetXml) {
  if (sheetXml.includes("<!DOCTYPE") || sheetXml.includes("<!ENTITY")
      || /<(?:f|hyperlinks?|oleObjects?|controls?|drawing|legacyDrawing|extLst)(?:\s|>|\/)/iu.test(sheetXml)) {
    fail("xlsx_active_content_forbidden", "Worksheet contains formulas, links, or active/extension content");
  }
  const expectedLastColumn = columnName(PROJECT_HISTORY_COPY_COLUMNS.length);
  const dynamicPattern = new RegExp(
    `^${escapeRegExp(SHEET_XML_PREFIX)}<dimension ref="A1:${expectedLastColumn}(\\d+)"/>${escapeRegExp(SHEET_XML_AFTER_DIMENSION)}([\\s\\S]*)${escapeRegExp(SHEET_XML_SUFFIX)}$`,
    "u",
  );
  const sheetMatch = dynamicPattern.exec(sheetXml);
  if (!sheetMatch) fail("xlsx_worksheet_structure_invalid", "Worksheet differs from the canonical single-sheet structure");
  const declaredLastRow = Number(sheetMatch[1]);
  const rowsXml = sheetMatch[2];
  const rows = [];
  const rowPattern = /<row r="(\d+)">([\s\S]*?)<\/row>/gu;
  let rowCursor = 0;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(rowsXml)) !== null) {
    if (rowMatch.index !== rowCursor) fail("xlsx_worksheet_structure_invalid", "Worksheet contains unsupported row data");
    const rowNumber = Number(rowMatch[1]);
    if (rowNumber !== rows.length + 1) fail("xlsx_row_order_invalid", "Worksheet rows are not contiguous and ordered");
    const cells = [];
    const cellXml = rowMatch[2];
    const cellPattern = /<c r="([A-Z]+)(\d+)"(?: t="(inlineStr|b)")?>([\s\S]*?)<\/c>/gu;
    let cellCursor = 0;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(cellXml)) !== null) {
      if (cellMatch.index !== cellCursor) fail("xlsx_worksheet_structure_invalid", "Worksheet contains unsupported cell data");
      const columnIndex = cells.length;
      if (cellMatch[1] !== columnName(columnIndex + 1) || Number(cellMatch[2]) !== rowNumber
          || columnIndex >= PROJECT_HISTORY_COPY_COLUMNS.length) {
        fail("xlsx_cell_order_invalid", "Worksheet cells are not a complete ordered rectangular row");
      }
      const column = rowNumber === 1 ? "header" : PROJECT_HISTORY_COPY_COLUMNS[columnIndex];
      cells.push(parseCellBody(cellMatch[3] ?? null, cellMatch[4], column, `cell ${cellMatch[1]}${rowNumber}`));
      cellCursor = cellPattern.lastIndex;
    }
    if (cellCursor !== cellXml.length || cells.length !== PROJECT_HISTORY_COPY_COLUMNS.length) {
      fail("xlsx_row_width_mismatch", "Worksheet row width differs from the canonical columns");
    }
    rows.push(cells);
    rowCursor = rowPattern.lastIndex;
  }
  if (rowCursor !== rowsXml.length || rows.length !== declaredLastRow || rows.length < 2) {
    fail("xlsx_row_count_mismatch", "Worksheet row count differs from its dimension");
  }
  assertColumns(rows[0], "worksheet header");
  return rows.slice(1).map((values) => Object.fromEntries(
    PROJECT_HISTORY_COPY_COLUMNS.map((column, index) => [column, values[index]]),
  ));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function readProjectHistoryCopyXlsx(source) {
  const bytes = Buffer.isBuffer(source) ? source : readFileSync(path.resolve(source));
  const entries = parseStoredZip(bytes);
  if (entries.size !== REQUIRED_ENTRY_NAMES.length
      || REQUIRED_ENTRY_NAMES.some((name) => !entries.has(name))) {
    fail("xlsx_entries_invalid", "XLSX ZIP must contain only the fixed non-active workbook parts");
  }
  for (const [name, expected] of Object.entries(STATIC_PARTS)) {
    const actual = decodeUtf8(entries.get(name), name);
    if (actual !== expected) {
      const active = /(?:macroEnabled|vbaProject|externalLink|state="(?:hidden|veryHidden)"|TargetMode="External")/iu.test(actual);
      fail(active ? "xlsx_active_content_forbidden" : "xlsx_workbook_structure_invalid", `${name} differs from the fixed one-visible-sheet contract`);
    }
  }
  const rows = parseWorksheetRows(decodeUtf8(entries.get("xl/worksheets/sheet1.xml"), "worksheet"));
  const first = rows[0];
  const model = {
    schema_version: PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,
    generation_id: spreadsheetOriginalText(first.generation_id),
    project_id: spreadsheetOriginalText(first.project_id),
    classification_state: first.classification_state,
    event_count: first.event_count,
    coverage_count: first.coverage_count,
    ordered_event_digest: first.ordered_event_digest,
    source_attestation_digest: first.source_attestation_digest,
    raw_payload_copied: first.raw_payload_copied,
    accepted_history: first.accepted_history,
    columns: [...PROJECT_HISTORY_COPY_COLUMNS],
    rows,
    ordered_row_digest: sha256Canonical(rows),
    hidden_sheets: false,
    external_links: false,
    formula_cells: false,
  };
  validateProjectHistoryCopyXlsxInput(model);
  return Object.freeze({
    schema_version: PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION,
    generation_id: model.generation_id,
    event_count: model.event_count,
    coverage_count: model.coverage_count,
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    columns: model.columns,
    rows: model.rows,
    hidden_sheet_count: 0,
    external_link_count: 0,
    formula_cell_count: 0,
  });
}

export function verifyProjectHistoryCopyXlsxReadback(value, expectedModel) {
  assertExactKeys(value, XLSX_READBACK_FIELDS, "XLSX readback");
  if (value.schema_version !== PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION
      || value.hidden_sheet_count !== 0
      || value.external_link_count !== 0
      || value.formula_cell_count !== 0) {
    fail("xlsx_readback_boundary_invalid", "XLSX readback found hidden, external, or formula data");
  }
  if (value.generation_id !== expectedModel.generation_id
      || value.event_count !== expectedModel.event_count
      || value.coverage_count !== expectedModel.coverage_count
      || value.ordered_event_digest !== expectedModel.ordered_event_digest
      || value.ordered_row_digest !== expectedModel.ordered_row_digest
      || canonicalJson(value.columns) !== canonicalJson(expectedModel.columns)
      || canonicalJson(value.rows) !== canonicalJson(expectedModel.rows)
      || sha256Canonical(value.rows) !== value.ordered_row_digest) {
    fail("xlsx_readback_parity_mismatch", "Actual XLSX readback differs from the canonical DB row model");
  }
  return true;
}

export function authorProjectHistoryCopyXlsx(model) {
  validateProjectHistoryCopyXlsxInput(model);
  const entries = REQUIRED_ENTRY_NAMES.map((name) => [
    name,
    name === "xl/worksheets/sheet1.xml" ? renderWorksheetXml(model) : STATIC_PARTS[name],
  ]);
  const bytes = buildStoredZip(entries);
  const readback = readProjectHistoryCopyXlsx(bytes);
  verifyProjectHistoryCopyXlsxReadback(readback, model);
  return bytes;
}

export function renderProjectHistoryCopyXlsxReadback(readback) {
  return `${canonicalJson(readback)}\n`;
}

function writeDeterministicFile(filePath, bytes) {
  const resolved = path.resolve(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  if (existsSync(resolved)) {
    const entry = lstatSync(resolved);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) {
      fail("xlsx_output_not_standalone", "XLSX output must be a direct single-link file");
    }
    if (readFileSync(resolved).equals(bytes)) return false;
  }
  writeFileSync(resolved, bytes);
  return true;
}

export function writeProjectHistoryCopyXlsx({ inputPath, xlsxPath, readbackPath }) {
  const model = JSON.parse(new TextDecoder("utf-8", { fatal: true })
    .decode(readFileSync(path.resolve(inputPath))).replace(/^\uFEFF/u, ""));
  validateProjectHistoryCopyXlsxInput(model);
  const xlsx = authorProjectHistoryCopyXlsx(model);
  const readback = readProjectHistoryCopyXlsx(xlsx);
  verifyProjectHistoryCopyXlsxReadback(readback, model);
  const readbackBytes = Buffer.from(renderProjectHistoryCopyXlsxReadback(readback), "utf8");
  const xlsxChanged = writeDeterministicFile(xlsxPath, xlsx);
  const readbackChanged = writeDeterministicFile(readbackPath, readbackBytes);
  return Object.freeze({
    ok: true,
    xlsx_changed: xlsxChanged,
    readback_changed: readbackChanged,
    xlsx_sha256: `sha256:${createHash("sha256").update(xlsx).digest("hex")}`,
    readback_sha256: `sha256:${createHash("sha256").update(readbackBytes).digest("hex")}`,
    ordered_row_digest: readback.ordered_row_digest,
  });
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ["--input", "inputPath"],
    ["--xlsx", "xlsxPath"],
    ["--readback", "readbackPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") options.help = true;
    else if (valueFlags.has(token)) {
      const key = valueFlags.get(token);
      if (options[key] !== undefined) fail("duplicate_argument", `${token} was supplied twice`);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail("argument_value_missing", `${token} needs a value`);
      options[key] = value;
      index += 1;
    } else {
      fail("unknown_argument", `Unknown argument ${token}`);
    }
  }
  return options;
}

function helpText() {
  return [
    "Author and independently read back one deterministic project-history XLSX.",
    "",
    "Usage:",
    "  node tools/project_history_copy_xlsx.mjs --input <project_history.xlsx-input.json> \\",
    "    --xlsx <project_history.xlsx> --readback <project_history.xlsx-readback.json>",
    "",
    "The writer uses a fixed stored-ZIP OOXML profile: one visible sheet and no formulas, macros, or external links.",
  ].join("\n");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
      process.exit(0);
    }
    for (const key of ["inputPath", "xlsxPath", "readbackPath"]) {
      if (typeof options[key] !== "string" || options[key].length === 0) {
        fail("argument_required", `${key} is required`);
      }
    }
    process.stdout.write(`${JSON.stringify(writeProjectHistoryCopyXlsx(options), null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "xlsx_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exit(1);
  }
}
