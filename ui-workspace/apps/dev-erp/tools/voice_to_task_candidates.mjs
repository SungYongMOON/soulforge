#!/usr/bin/env node
// Accepted recording-library route -> one owner-reviewable voice task row.
// Reads only the exact manifest and ledger paths supplied by the caller. It never
// opens audio, transcript, session, or source-event references from the manifest.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEMA = "soulforge.project_task_ledger.private.v0";
const REPORT_SCHEMA = "soulforge.dev_erp.voice_to_task_candidates.v0";
const RECORDING_MANIFEST_SCHEMA = "soulforge.voice_recording_library_entry.v0";
const BASE_HEADERS = ["할일키","스키마버전","기록일","프로젝트코드","할일명","담당자","업무유형","상태","마감일","SE단계","연결유형","연결대상","완료기준","출처","관련메일이력키","관련메일소스ID","산출물참조","관련몬스터ID","다음액션","비고","원문복사여부"];
const AUTOMATION_HEADERS = [
  "검토상태", "검토사유", "수정사유", "라우트후보", "라우트신뢰도", "라우트사유",
  "필요역할", "필요역량", "제안담당자", "담당신뢰도", "담당사유", "소스후보키",
  "소스메일키", "소스메일소스ID", "소스스레드키", "소스그룹키", "소스계보",
  "생성런", "생성규칙", "동기화상태", "동기화오류", "동기화리비전", "동기화해시", "동기화시각",
];
const HEADERS = [...BASE_HEADERS, ...AUTOMATION_HEADERS];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROJECT_RE = /^P\d{2}-\d{3}[A-Za-z0-9._-]*$/;
const ACCEPTED_BY_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const ACCEPTED_AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;
const INBOX_PROJECT = "P00-000_INBOX";
const MANAGED_HEADERS = [
  "할일키", "스키마버전", "기록일", "프로젝트코드", "할일명", "담당자", "업무유형", "상태",
  "마감일", "SE단계", "연결유형", "연결대상", "완료기준", "출처", "관련메일이력키",
  "관련메일소스ID", "산출물참조", "관련몬스터ID", "다음액션", "비고", "원문복사여부",
  "검토상태", "검토사유", "라우트후보", "라우트신뢰도", "라우트사유", "소스후보키",
  "소스계보", "생성규칙",
];

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") {
      if (text[i + 1] !== "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    } else cur += c;
  }
  if (quoted) throw new Error("unsafe_task_ledger_csv:unterminated_quote");
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const csvEsc = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function safeText(value) {
  const text = String(value ?? "").trim();
  return /[\0\r\n]/.test(text) ? "" : text;
}

function safeRelativeRef(value) {
  const raw = safeText(value).replaceAll("\\", "/");
  if (!raw || isAbsolute(raw) || /^[A-Za-z]:\//.test(raw) || raw.startsWith("//")) return "";
  const parts = raw.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return raw;
}

function validAcceptedAt(value) {
  const text = safeText(value);
  const match = ACCEPTED_AT_RE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[9]) : 0;
  const offsetMinute = match[8] ? Number(match[10]) : 0;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  return !Number.isNaN(Date.parse(text));
}

function canonicalTaskLedgerPath(taskLedgerPath, acceptedProjectCode) {
  const raw = safeText(taskLedgerPath);
  if (!raw || raw.split(/[\\/]/).includes("..")) throw new Error("unsafe_task_ledger_path");
  const normalized = resolve(raw).replaceAll("\\", "/");
  const suffix = `/_workmeta/${acceptedProjectCode}/reports/할일_장부/할일_장부.csv`;
  if (!normalized.endsWith(suffix)) throw new Error(`noncanonical_task_ledger_path:${acceptedProjectCode}`);
  return normalized;
}

function reviewReport(manifest, mode, reason) {
  const candidate = safeText(manifest?.route_state?.project_code_candidate);
  return {
    schema_version: REPORT_SCHEMA,
    mode,
    recording_id: safeText(manifest?.recording_id),
    route_status: safeText(manifest?.route_state?.route_status) || "unknown",
    disposition: "review_required",
    review_reason: reason,
    route_suggestion: candidate && candidate !== INBOX_PROJECT && PROJECT_RE.test(candidate) ? candidate : null,
    planned_rows: 0,
    written_rows: 0,
  };
}

export function planVoiceTask(manifest, { apply = false } = {}) {
  const mode = apply ? "apply" : "dry_run";
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return reviewReport(manifest, mode, "invalid_recording_manifest");
  if (manifest.schema_version !== RECORDING_MANIFEST_SCHEMA) return reviewReport(manifest, mode, "unsupported_recording_manifest_schema");
  const route = manifest.route_state;
  if (!route || route.route_status !== "accepted_project_route") return reviewReport(manifest, mode, "project_route_not_accepted");

  const recordingId = safeText(manifest.recording_id);
  const project = safeText(route.accepted_project_code);
  const acceptedBy = safeText(route.accepted_by);
  const acceptedAt = safeText(route.accepted_at);
  const draftRef = safeRelativeRef(manifest?.payload_refs?.source_event_draft_ref);
  if (!ID_RE.test(recordingId)) return reviewReport(manifest, mode, "invalid_recording_id");
  if (!PROJECT_RE.test(project) || project === INBOX_PROJECT) return reviewReport(manifest, mode, "invalid_accepted_project_code");
  if (!ACCEPTED_BY_RE.test(acceptedBy)) return reviewReport(manifest, mode, "invalid_accepted_by");
  if (!validAcceptedAt(acceptedAt)) return reviewReport(manifest, mode, "invalid_accepted_at");
  if (!draftRef) return reviewReport(manifest, mode, "unsafe_source_event_draft_ref");

  const key = `voicetask:${recordingId}`;
  const row = Object.fromEntries(HEADERS.map((header) => [header, ""]));
  Object.assign(row, {
    "할일키": key,
    "스키마버전": SCHEMA,
    "기록일": acceptedAt,
    "프로젝트코드": project,
    "할일명": `음성 기록 검토: ${recordingId}`,
    "업무유형": "review",
    "상태": "unclassified",
    "완료기준": "음성 기록의 할일 후보와 완료 기준을 책임자가 검토해 확정",
    "출처": "voice",
    "비고": "recording-library accepted route; task details require owner review",
    "원문복사여부": "아니오",
    "검토상태": "needs_review",
    "검토사유": "accepted voice route; task details require owner review",
    "라우트후보": project,
    "라우트신뢰도": "exact",
    "라우트사유": `recording_library accepted_project_route by ${acceptedBy} at ${acceptedAt}`,
    "소스후보키": `voice:${recordingId}`,
    "소스계보": `voicedraft:${draftRef}`,
    "생성규칙": "voice_recording_library_accepted_route_v0",
    "동기화상태": "pending",
    "동기화리비전": "1",
  });
  return {
    schema_version: REPORT_SCHEMA,
    mode,
    recording_id: recordingId,
    route_status: route.route_status,
    accepted_project_code: project,
    disposition: apply ? "ready_to_apply" : "ready_to_apply",
    planned_rows: 1,
    written_rows: 0,
    row,
  };
}

function readLedger(filePath) {
  if (!existsSync(filePath)) return { header: HEADERS, rows: [], hadBom: true };
  const raw = readFileSync(filePath, "utf8");
  const hadBom = raw.startsWith("﻿");
  const records = parseCsv(raw.replace(/^﻿/, "").normalize("NFC")).filter((row) => row.some((cell) => String(cell).trim()));
  if (!records.length) return { header: HEADERS, rows: [], hadBom: true };
  const header = records[0].map((value) => String(value).trim().normalize("NFC"));
  if (header.some((value) => !value)) throw new Error("unsafe_task_ledger_headers:blank_header");
  if (new Set(header).size !== header.length) throw new Error("unsafe_task_ledger_headers:duplicate_header");
  if (!header.includes("할일키") || !header.includes("할일명")) throw new Error("unsafe_task_ledger_headers:missing_할일키_or_할일명");
  const rows = records.slice(1).map((record, rowIndex) => {
    if (record.length > header.length) throw new Error(`unsafe_task_ledger_row:${rowIndex + 2}:extra_columns`);
    return Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""]));
  });
  return { header, rows, hadBom };
}

function managedRowsEqual(left, right) {
  return MANAGED_HEADERS.every((header) => String(left[header] ?? "") === String(right[header] ?? ""));
}

export function runVoiceToTaskCandidates({ recordingManifestPath, taskLedgerPath, apply = false } = {}) {
  if (!recordingManifestPath) throw new Error("--recording-manifest_requires_value");
  if (!taskLedgerPath) throw new Error("--task-ledger_requires_value");
  const manifest = JSON.parse(readFileSync(recordingManifestPath, "utf8"));
  const plan = planVoiceTask(manifest, { apply });
  if (!plan.row) return plan;

  const ledgerPath = canonicalTaskLedgerPath(taskLedgerPath, plan.accepted_project_code);
  const ledger = readLedger(ledgerPath);
  const key = plan.row["할일키"];
  const matching = ledger.rows.filter((row) => row["할일키"] === key);
  if (matching.length > 1) throw new Error(`unsafe_task_ledger_duplicate_key:${key}`);
  if (matching.length === 1) {
    if (managedRowsEqual(matching[0], plan.row)) {
      return { ...plan, disposition: "already_present", planned_rows: 0, written_rows: 0, row: undefined };
    }
    return { ...plan, disposition: "review_required", review_reason: "existing_voice_row_conflict", planned_rows: 0, written_rows: 0, row: undefined };
  }
  if (!apply) return { ...plan, row: undefined };

  const outHeader = [...ledger.header, ...HEADERS.filter((header) => !ledger.header.includes(header))];
  const outputRows = [...ledger.rows, plan.row];
  const lines = [
    outHeader.map(csvEsc).join(","),
    ...outputRows.map((row) => outHeader.map((header) => csvEsc(row[header] ?? "")).join(",")),
  ];
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const tmp = `${ledgerPath}.${process.pid}.voice-intake.tmp`;
  writeFileSync(tmp, `${ledger.hadBom ? "﻿" : ""}${lines.join("\n")}\n`, "utf8");
  renameSync(tmp, ledgerPath);
  return { ...plan, disposition: "applied", written_rows: 1, row: undefined };
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

export function parseArgs(argv) {
  const options = { apply: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--recording-manifest") options.recordingManifestPath = readValue(argv, i++, token);
    else if (token === "--task-ledger") options.taskLedgerPath = readValue(argv, i++, token);
    else if (token === "--apply") options.apply = true;
    else if (token === "--json") options.json = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new Error(`unknown_arg:${token}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: node tools/voice_to_task_candidates.mjs --recording-manifest <recording_manifest.json> --task-ledger <할일_장부.csv> [--apply] [--json]",
    "",
    "Dry-run is the default. Only an accepted_project_route with accepted project/by/at metadata and a relative source_event_draft_ref can add one needs_review voicetask row.",
  ].join("\n"));
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return; }
  const report = runVoiceToTaskCandidates(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`${report.disposition}: recording=${report.recording_id || "unknown"} planned=${report.planned_rows} written=${report.written_rows}${report.review_reason ? ` reason=${report.review_reason}` : ""}`);
}

if (process.argv[1] && pathToFileURL(fileURLToPath(import.meta.url)).href === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[voice_to_task_candidates] ${error?.message || error}`);
    process.exitCode = 2;
  });
}
