// ERP export snapshot writer (SONAR_INTEL_MASTER_PLAN_V1.md §4).
//
// dev-erp integration is a snapshot *exchange*, never a DB merge (plan's P1
// read-only philosophy, kept even though ERP does not read this yet in Goal
// #1): this module only ever writes files under export/; it never opens the
// ERP database and dev-erp never opens intel.db.
//
// LLM calls in this module: zero.

import { writeFileSync } from "node:fs";
import path from "node:path";

const CSV_COLUMNS = [
  "id",
  "type",
  "source",
  "title",
  "url",
  "publishedAt",
  "fetchedAt",
  "keywordsMatched",
  "erpMapping",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Build CSV text (RFC 4180-ish, LF line endings) from a list of store records. */
export function buildCsvSnapshot(records) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const record of records) {
    const row = CSV_COLUMNS.map((column) => {
      const value = column === "keywordsMatched" ? (record.keywordsMatched ?? []).join("|") : record[column];
      return csvEscape(value);
    });
    lines.push(row.join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Build a JSON snapshot document (array wrapped with export metadata). */
export function buildJsonSnapshot(records, { generatedAt = new Date().toISOString() } = {}) {
  return {
    schema: "soulforge.sonar_intel.export_snapshot.v1",
    generatedAt,
    count: records.length,
    items: records,
  };
}

/**
 * Write both CSV and JSON snapshots of `records` into `exportDir`.
 * Returns the two file paths written.
 */
export function writeSnapshot(records, { exportDir, baseName = "sonar_intel_snapshot" } = {}) {
  if (!exportDir) throw new Error("writeSnapshot: exportDir is required");
  const jsonPath = path.join(exportDir, `${baseName}.json`);
  const csvPath = path.join(exportDir, `${baseName}.csv`);
  writeFileSync(jsonPath, JSON.stringify(buildJsonSnapshot(records), null, 2), "utf8");
  writeFileSync(csvPath, buildCsvSnapshot(records), "utf8");
  return { jsonPath, csvPath };
}
