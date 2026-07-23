import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WORKFLOW_ID = "outlook_mail_reconcile_v0";
const MAIL_HISTORY_SCHEMA = "soulforge.project_mail_history.private.v1";
const MAIL_HISTORY_REL = path.join("reports", "메일_이력", "메일_이력.csv");
const SYSTEM_RUN_ROOT = path.join("_workmeta", "system", "runs");
const PROJECT_CODE_RE = /^P\d{2}-\d{3}/u;
const DEFAULT_WINDOW_HOURS = 36;
const OUTLOOK_SENT_QUERY_ONLY_SCHEMA = "soulforge.outlook_sent_query_only_canary.v1";
const OUTLOOK_SENT_QUERY_ONLY_MAX_HOURS = 168;
const OUTLOOK_SENT_QUERY_ONLY_MAX_ITEMS = 500;

const MAIL_HISTORY_HEADERS = [
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

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "html",
  "raw",
  "raw_body",
  "raw_html",
  "attachment_payload",
  "attachment_payloads",
  "attachment_name",
  "attachment_names",
  "attachments",
  "local_path",
  "msg_path",
  "eml_path",
  "secret",
  "token",
  "credential",
]);

export function normalizeMailSubject(subject) {
  let value = String(subject ?? "").normalize("NFC").trim();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(/^(?:\s*(?:RE|FW|FWD)\s*:\s*)+/iu, "").trim();
  }
  return value.replace(/\s+/gu, " ");
}

export function subjectFingerprint(subject) {
  return `subject:${sha256(normalizeMailSubject(subject)).slice(0, 16)}`;
}

export async function runOutlookSentQueryOnlyCanary(options = {}) {
  assertExactSentQueryOnlyOptions(options);
  const dateWindow = resolveExplicitSentQueryWindow(options.windowStart, options.windowEnd);
  const maxItems = resolveSentQueryMaxItems(options.maxItems);
  const observed = await readOutlookSentQueryOnlyAggregate({ dateWindow, maxItems });
  return formatOutlookSentQueryOnlyResult(observed, { dateWindow, maxItems });
}

export function formatOutlookSentQueryOnlyResult(observed, { dateWindow, maxItems }) {
  return {
    schema_version: OUTLOOK_SENT_QUERY_ONLY_SCHEMA,
    mode: "query_only_no_persistence",
    source_kind: "outlook_sent_items",
    observed_at: normalizeOptionalIso(observed.observed_at) ?? new Date().toISOString(),
    date_window: dateWindow,
    outlook_available: observed.outlook_available === true,
    error_code: normalizeQueryErrorCode(observed.error_code),
    sent_items_observed: normalizeNonNegativeInteger(observed.sent_items_observed),
    scanned_items: normalizeNonNegativeInteger(observed.scanned_items),
    max_items: maxItems,
    truncated_by_max_items: observed.truncated_by_max_items === true,
    latest_sent_at: normalizeOptionalIso(observed.latest_sent_at),
    earliest_sent_at: normalizeOptionalIso(observed.earliest_sent_at),
    safety: {
      sent_only: true,
      active_outlook_attach_only: true,
      inbox_queried: false,
      send_receive_attempted: false,
      outlook_mutation: false,
      body_or_attachment_read: false,
      recipient_address_read: false,
      raw_rows_returned: false,
      repository_writes: 0,
      temporary_files_created: 0,
    },
    claim_ceiling: "source_availability_metadata_only",
  };
}

export function parseOutlookSentQueryOnlyArgv(argv) {
  const allowed = new Map([
    ["--window-start", "windowStart"],
    ["--window-end", "windowEnd"],
    ["--max-items", "maxItems"],
  ]);
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);
    if (!token.startsWith("--")) {
      throw new Error(`sent_query_only_positional_argument:${token}`);
    }
    const property = allowed.get(token);
    if (!property) {
      throw new Error(`sent_query_only_unknown_option:${token}`);
    }
    if (seen.has(token)) {
      throw new Error(`sent_query_only_duplicate_option:${token}`);
    }
    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith("--")) {
      throw new Error(`sent_query_only_missing_value:${token}`);
    }
    seen.add(token);
    parsed[property] = String(value);
    index += 1;
  }
  return parsed;
}

export async function runOutlookMailReconcile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = options.now ? new Date(options.now) : new Date();
  const runId = options.runId ?? buildRunId(now);
  const outputMode = options.apply ? "apply_metadata_ledger_delta" : "dry_run";
  const dateWindow = await resolveDateWindow(repoRoot, {
    start: options.windowStart,
    end: options.windowEnd,
    now,
    fallbackHours: options.fallbackHours ?? DEFAULT_WINDOW_HOURS,
  });
  const projects = await discoverCodexManagedProjects(repoRoot, {
    projectCodes: options.projectCodes ?? [],
  });
  const preflight = {
    requested: Boolean(options.sendReceive),
    attempted: false,
    attempted_at: null,
    result: options.sendReceive ? "not_attempted" : "not_requested",
  };

  const outlookInventory = options.fixtureOutlookPath
    ? await readFixtureInventory(options.fixtureOutlookPath, { preflight, dateWindow, runId })
    : await readOutlookInventory({
        outlookSourceAlias: options.outlookSourceAlias ?? "seabot.moon@sonartech.com",
        dateWindow,
        includeInboxSubfolders: Boolean(options.includeInboxSubfolders),
        maxItems: Number(options.maxItems ?? 500),
        preflight,
      });

  const context = await loadProjectLedgerContext(repoRoot, projects.selected_project_codes);
  const matched = buildReconciliation({
    runId,
    generatedAt: now.toISOString(),
    dateWindow,
    projects,
    outlookInventory,
    context,
  });

  let appliedRows = [];
  if (options.apply) {
    appliedRows = await applySentDeltas(repoRoot, matched.sentRows);
  }

  const outputRoot = path.join(repoRoot, SYSTEM_RUN_ROOT, runId);
  await fs.mkdir(outputRoot, { recursive: true });
  const artifacts = await writeRunOutputs(outputRoot, {
    runId,
    generatedAt: now.toISOString(),
    outputMode,
    dateWindow,
    projects,
    outlookInventory,
    matched,
    appliedRows,
    preflight: outlookInventory.preflight_send_receive ?? preflight,
    outlookSourceAlias: options.outlookSourceAlias ?? outlookInventory.outlook_source_alias ?? "seabot.moon@sonartech.com",
  });

  return {
    workflow_id: WORKFLOW_ID,
    run_id: runId,
    output_root: relativeToRepo(repoRoot, outputRoot),
    output_mode: outputMode,
    selected_project_codes: projects.selected_project_codes,
    sent_metadata_rows: outlookInventory.sent.length,
    received_metadata_rows: outlookInventory.received.length,
    sent_candidate_rows: matched.sentRows.length,
    sent_applied_rows: appliedRows.length,
    received_cross_validation_rows: matched.receivedRows.length,
    owner_followup_rows: matched.ownerFollowups.length,
    artifacts,
  };
}

function assertExactSentQueryOnlyOptions(options) {
  const allowed = new Set(["windowStart", "windowEnd", "maxItems"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`sent_query_only_forbidden_options:${unknown.sort().join(",")}`);
  }
}

function resolveExplicitSentQueryWindow(windowStart, windowEnd) {
  if (!windowStart || !windowEnd) {
    throw new Error("sent_query_only_requires_explicit_window");
  }
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("sent_query_only_invalid_window");
  }
  const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
  if (durationHours > OUTLOOK_SENT_QUERY_ONLY_MAX_HOURS) {
    throw new Error(`sent_query_only_window_exceeds_${OUTLOOK_SENT_QUERY_ONLY_MAX_HOURS}_hours`);
  }
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    duration_hours: durationHours,
  };
}

function resolveSentQueryMaxItems(value) {
  if (typeof value === "boolean") {
    throw new Error(`sent_query_only_max_items_must_be_1_to_${OUTLOOK_SENT_QUERY_ONLY_MAX_ITEMS}`);
  }
  const maxItems = Number(value ?? 100);
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > OUTLOOK_SENT_QUERY_ONLY_MAX_ITEMS) {
    throw new Error(`sent_query_only_max_items_must_be_1_to_${OUTLOOK_SENT_QUERY_ONLY_MAX_ITEMS}`);
  }
  return maxItems;
}

function normalizeNonNegativeInteger(value) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeOptionalIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeQueryErrorCode(value) {
  const allowed = new Set([
    null,
    "outlook_active_session_unavailable",
    "outlook_sent_query_failed",
    "powershell_query_failed",
    "powershell_output_invalid",
    "not_available_non_windows",
  ]);
  const code = value == null ? null : String(value);
  return allowed.has(code) ? code : "outlook_sent_query_failed";
}

async function readOutlookSentQueryOnlyAggregate({ dateWindow, maxItems }) {
  if (process.platform !== "win32") {
    return {
      outlook_available: false,
      error_code: "not_available_non_windows",
      sent_items_observed: 0,
      scanned_items: 0,
      truncated_by_max_items: false,
    };
  }

  const script = buildOutlookSentQueryOnlyPowerShellScript({ dateWindow, maxItems });
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    return {
      outlook_available: false,
      error_code: "powershell_query_failed",
      sent_items_observed: 0,
      scanned_items: 0,
      truncated_by_max_items: false,
    };
  }
  try {
    return JSON.parse(String(result.stdout ?? "").replace(/^\uFEFF/u, "").trim());
  } catch {
    return {
      outlook_available: false,
      error_code: "powershell_output_invalid",
      sent_items_observed: 0,
      scanned_items: 0,
      truncated_by_max_items: false,
    };
  }
}

export function buildOutlookSentQueryOnlyPowerShellScript({ dateWindow, maxItems }) {
  return `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$since = [datetime]"${dateWindow.start}"
$until = [datetime]"${dateWindow.end}"
$observedAt = (Get-Date).ToString("o")
$outlookAvailable = $false
$errorCode = $null
$scannedItems = 0
$sentItemsObserved = 0
$latestSentAt = $null
$earliestSentAt = $null
$truncated = $false
$reachedLowerBound = $false
try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
  $session = $app.Session
  $sentFolder = $session.GetDefaultFolder(5)
  $items = $sentFolder.Items
  $items.Sort("[SentOn]", $true)
  $scanLimit = [Math]::Min($items.Count, ${maxItems})
  for ($i = 1; $i -le $scanLimit; $i++) {
    $item = $null
    try { $item = $items.Item($i) } catch { continue }
    if ($null -eq $item) { continue }
    $class = $null
    try { $class = $item.Class } catch { continue }
    if ($class -ne 43) { continue }
    $scannedItems += 1
    $sentOn = [datetime]$item.SentOn
    if ($sentOn -gt $until) { continue }
    if ($sentOn -lt $since) {
      $reachedLowerBound = $true
      break
    }
    $sentItemsObserved += 1
    $sentIso = $sentOn.ToString("o")
    if ($null -eq $latestSentAt) { $latestSentAt = $sentIso }
    $earliestSentAt = $sentIso
  }
  $truncated = ($items.Count -gt ${maxItems}) -and (-not $reachedLowerBound)
  $outlookAvailable = $true
} catch [System.Runtime.InteropServices.COMException] {
  $errorCode = "outlook_active_session_unavailable"
} catch {
  $errorCode = "outlook_sent_query_failed"
}
[ordered]@{
  observed_at = $observedAt
  outlook_available = $outlookAvailable
  error_code = $errorCode
  sent_items_observed = $sentItemsObserved
  scanned_items = $scannedItems
  truncated_by_max_items = $truncated
  latest_sent_at = $latestSentAt
  earliest_sent_at = $earliestSentAt
} | ConvertTo-Json -Compress
`;
}

export async function discoverCodexManagedProjects(repoRoot, { projectCodes = [] } = {}) {
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const requested = new Set(projectCodes.filter(Boolean));
  const selected = [];
  const excluded = ["P00-000_INBOX"];
  const missing = [];
  let entries = [];
  try {
    entries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  } catch {
    return {
      scope_mode: requested.size ? "explicit_project_codes" : "codex_managed_projects",
      selected_project_codes: [],
      excluded_project_codes: excluded,
      missing_ledger_project_codes: [...requested],
    };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const code = entry.name;
    if (code === "P00-000_INBOX") continue;
    if (!PROJECT_CODE_RE.test(code)) continue;
    if (requested.size && !requested.has(code)) continue;
    const csvPath = path.join(workmetaRoot, code, MAIL_HISTORY_REL);
    if (await pathExists(csvPath)) selected.push(code);
    else if (requested.has(code)) missing.push(code);
  }

  for (const code of requested) {
    if (!selected.includes(code) && !missing.includes(code)) {
      missing.push(code);
    }
  }

  selected.sort();
  missing.sort();
  return {
    scope_mode: requested.size ? "explicit_project_codes" : "codex_managed_projects",
    selected_project_codes: selected,
    excluded_project_codes: excluded,
    missing_ledger_project_codes: missing,
  };
}

function buildReconciliation({ runId, generatedAt, dateWindow, projects, outlookInventory, context }) {
  const sentRows = [];
  const receivedRows = [];
  const ownerFollowups = [];

  for (const row of outlookInventory.sent) {
    assertMetadataOnly(row, "sent metadata row");
    const fingerprint = row.subject_fingerprint || subjectFingerprint(row.subject_normalized ?? row.subject);
    const candidates = context.subjectToProjects.get(fingerprint) ?? new Set();
    const projectCodes = [...candidates].filter((code) => projects.selected_project_codes.includes(code));
    if (projectCodes.length === 1) {
      const projectCode = projectCodes[0];
      const duplicate = context.projectSourceIds.get(projectCode)?.has(row.source_id);
      if (!duplicate) {
        sentRows.push({
          run_id: runId,
          generated_at: generatedAt,
          project_code: projectCode,
          match_basis: "exact_subject_fingerprint",
          confidence: "exact",
          source_id: row.source_id,
          source_entry_fingerprint: row.source_entry_fingerprint,
          subject: row.subject,
          subject_normalized: normalizeMailSubject(row.subject_normalized ?? row.subject),
          subject_fingerprint: fingerprint,
          conversation_fingerprint: row.conversation_fingerprint ?? "",
          sent_at: row.sent_at,
          source_folder_alias: row.source_folder_alias ?? "",
          sender_account_alias: row.sender_account_alias ?? "",
          attachment_count: Number(row.attachment_count ?? 0),
          ledger_row: buildSentLedgerRow(projectCode, row),
        });
      }
    } else if (projectCodes.length > 1) {
      ownerFollowups.push({
        direction: "sent",
        reason: "ambiguous_project_match",
        source_id: row.source_id,
        subject_fingerprint: fingerprint,
        candidate_project_codes: projectCodes,
      });
    }
  }

  for (const row of outlookInventory.received) {
    assertMetadataOnly(row, "received metadata row");
    const fingerprint = row.subject_fingerprint || subjectFingerprint(row.subject_normalized ?? row.subject);
    const candidates = context.subjectToProjects.get(fingerprint) ?? new Set();
    const projectCodes = [...candidates].filter((code) => projects.selected_project_codes.includes(code));
    if (projectCodes.length === 1) {
      const projectCode = projectCodes[0];
      const sourceKnown = context.projectSourceIds.get(projectCode)?.has(row.source_id);
      receivedRows.push({
        direction: "received",
        project_code: projectCode,
        classification: sourceKnown ? "matched" : "missing_in_project_ledger",
        mutation_applied: false,
        source_id: row.source_id,
        subject_fingerprint: fingerprint,
        received_at: row.received_at,
      });
    } else if (projectCodes.length > 1) {
      ownerFollowups.push({
        direction: "received",
        reason: "ambiguous_project_match",
        source_id: row.source_id,
        subject_fingerprint: fingerprint,
        candidate_project_codes: projectCodes,
      });
    }
  }

  return { sentRows, receivedRows, ownerFollowups, dateWindow };
}

async function loadProjectLedgerContext(repoRoot, projectCodes) {
  const subjectToProjects = new Map();
  const projectSourceIds = new Map();
  const ledgerStats = [];

  for (const projectCode of projectCodes) {
    const csvPath = path.join(repoRoot, "_workmeta", projectCode, MAIL_HISTORY_REL);
    const rows = await readCsvObjects(csvPath);
    const sourceIds = new Set();
    for (const row of rows) {
      const subject = row["제목"];
      const sourceId = row["메일소스ID"];
      if (subject) {
        const fp = subjectFingerprint(subject);
        if (!subjectToProjects.has(fp)) subjectToProjects.set(fp, new Set());
        subjectToProjects.get(fp).add(projectCode);
      }
      if (sourceId) sourceIds.add(sourceId);
    }
    projectSourceIds.set(projectCode, sourceIds);
    ledgerStats.push({
      project_code: projectCode,
      ledger_ref: `_workmeta/${projectCode}/${toPosix(MAIL_HISTORY_REL)}`,
      row_count: rows.length,
      ledger_hash: sha256(JSON.stringify(rows)),
    });
  }

  return { subjectToProjects, projectSourceIds, ledgerStats };
}

function buildSentLedgerRow(projectCode, row) {
  const sourceId = requiredString(row.source_id, "sent.source_id");
  const key = sha256(`${projectCode}|mail_sent_outlook_reconcile|${sourceId}`).slice(0, 24);
  const sourceEntryShort = String(row.source_entry_fingerprint ?? "").slice(0, 16) || key;
  const sentAt = requiredString(row.sent_at, "sent.sent_at");
  const subject = requiredString(row.subject, "sent.subject");
  return {
    "이력키": key,
    "스키마버전": MAIL_HISTORY_SCHEMA,
    "발생시각": sentAt,
    "프로젝트코드": projectCode,
    "단계": "outlook_sent_reconcile",
    "몬스터ID": `outlook_sent_${sourceEntryShort}`,
    "후보ID": "",
    "이벤트유형": "mail_sent_outlook_reconcile",
    "메일소스ID": sourceId,
    "메일메시지ID": String(row.provider_message_id ?? ""),
    "메일수신시각": sentAt,
    "메일함": String(row.source_folder_alias ?? ""),
    "수신역할": "",
    "스레드": String(row.conversation_fingerprint ?? ""),
    "제목": subject,
    "발신자": `sender:${String(row.sender_account_alias ?? "")}`,
    "첨부수": String(Number(row.attachment_count ?? 0)),
    "작업상태": "sent_metadata_reconciled",
    "게이트웨이몬스터참조": "",
    "프로젝트몬스터참조": "",
    "파일링패킷참조": "",
    "미션참조": "",
    "원문복사여부": "false",
  };
}

async function applySentDeltas(repoRoot, sentRows) {
  const byProject = new Map();
  for (const row of sentRows) {
    if (!byProject.has(row.project_code)) byProject.set(row.project_code, []);
    byProject.get(row.project_code).push(row.ledger_row);
  }

  const applied = [];
  for (const [projectCode, rows] of byProject) {
    const csvPath = path.join(repoRoot, "_workmeta", projectCode, MAIL_HISTORY_REL);
    const existing = await readCsvObjects(csvPath);
    const byKey = new Map(existing.map((row) => [row["이력키"], row]));
    for (const row of rows) {
      byKey.set(row["이력키"], normalizeLedgerRow(row));
      applied.push({ project_code: projectCode, history_key: row["이력키"], source_id: row["메일소스ID"] });
    }
    const next = [...byKey.values()].sort(compareLedgerRows);
    await fs.writeFile(csvPath, renderCsv(next, MAIL_HISTORY_HEADERS), "utf8");
  }
  return applied;
}

async function writeRunOutputs(outputRoot, input) {
  const {
    runId,
    generatedAt,
    outputMode,
    dateWindow,
    projects,
    outlookInventory,
    matched,
    appliedRows,
    preflight,
    outlookSourceAlias,
  } = input;
  const common = {
    workflow_id: WORKFLOW_ID,
    run_id: runId,
    generated_at: generatedAt,
  };
  const files = {
    reconcile_scope: "reconcile_scope.json",
    raw_outlook_inventory: "raw_outlook_inventory.json",
    outlook_sent_metadata_packet: "outlook_sent_metadata_packet.json",
    outlook_received_metadata_packet: "outlook_received_metadata_packet.json",
    project_sent_history_delta: "project_sent_history_delta.json",
    inbox_cross_validation_report: "inbox_cross_validation_report.json",
    owner_followup_needed: "owner_followup_needed.json",
    reconciliation_summary: "reconciliation_summary.json",
    boundary_review_note: "boundary_review_note.md",
  };

  await writeJson(path.join(outputRoot, files.reconcile_scope), {
    ...common,
    kind: "reconcile_scope",
    output_mode: outputMode,
    date_window: dateWindow,
    outlook_source_alias: outlookSourceAlias,
    project_scope: projects,
    preflight_send_receive: preflight,
    denied_actions: deniedActions(),
  });
  await writeJson(path.join(outputRoot, files.raw_outlook_inventory), {
    ...common,
    date_window: dateWindow,
    outlook_source_alias: outlookSourceAlias,
    preflight_send_receive: preflight,
    outlook_available: outlookInventory.outlook_available,
    outlook_error: outlookInventory.outlook_error,
    sent: outlookInventory.sent,
    received: outlookInventory.received,
  });
  await writeJson(path.join(outputRoot, files.outlook_sent_metadata_packet), {
    ...common,
    kind: "outlook_sent_metadata_packet",
    rows: outlookInventory.sent,
  });
  await writeJson(path.join(outputRoot, files.outlook_received_metadata_packet), {
    ...common,
    kind: "outlook_received_metadata_packet",
    rows: outlookInventory.received,
  });
  await writeJson(path.join(outputRoot, files.project_sent_history_delta), {
    ...common,
    kind: "project_sent_history_delta",
    write_mode: outputMode,
    summary: {
      candidate_rows: matched.sentRows.length,
      applied_rows: appliedRows.length,
    },
    rows: matched.sentRows.map(({ ledger_row, ...row }) => ({
      ...row,
      ledger_row_preview: ledger_row,
    })),
  });
  await writeJson(path.join(outputRoot, files.inbox_cross_validation_report), {
    ...common,
    kind: "inbox_cross_validation_report",
    mutation_policy: {
      move_outlook_mail: false,
      delete_received_ledger_rows: false,
      rewrite_received_ledger_rows: false,
      edit_outlook_rules: false,
    },
    summary: summarizeReceivedRows(matched.receivedRows),
    rows: matched.receivedRows,
  });
  await writeJson(path.join(outputRoot, files.owner_followup_needed), {
    ...common,
    kind: "owner_followup_needed",
    summary: {
      rows: matched.ownerFollowups.length,
    },
    rows: matched.ownerFollowups,
  });
  await writeJson(path.join(outputRoot, files.reconciliation_summary), {
    ...common,
    output_mode: outputMode,
    date_window: dateWindow,
    selected_project_codes: projects.selected_project_codes,
    excluded_project_codes: projects.excluded_project_codes,
    missing_ledger_project_codes: projects.missing_ledger_project_codes,
    outlook_available: outlookInventory.outlook_available,
    outlook_error: outlookInventory.outlook_error,
    preflight_send_receive: preflight,
    sent_metadata_rows: outlookInventory.sent.length,
    received_metadata_rows: outlookInventory.received.length,
    sent_candidate_rows: matched.sentRows.length,
    sent_applied_rows: appliedRows.length,
    received_cross_validation_rows: matched.receivedRows.length,
    owner_followup_rows: matched.ownerFollowups.length,
  });
  await fs.writeFile(
    path.join(outputRoot, files.boundary_review_note),
    renderBoundaryReview({
      common,
      outputMode,
      preflight,
      projects,
      outlookInventory,
      matched,
      appliedRows,
    }),
    "utf8",
  );

  return Object.fromEntries(Object.entries(files).map(([key, file]) => [key, file]));
}

async function resolveDateWindow(repoRoot, { start, end, now, fallbackHours }) {
  const endDate = end ? new Date(end) : now;
  let startDate = start ? new Date(start) : null;
  let source = start ? "explicit" : "previous_successful_run";
  if (!startDate) {
    const previous = await findPreviousSuccessfulRun(repoRoot);
    if (previous) startDate = new Date(previous);
    else {
      startDate = new Date(endDate.getTime() - fallbackHours * 60 * 60 * 1000);
      source = `fallback_${fallbackHours}h`;
    }
  }
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    source,
  };
}

async function findPreviousSuccessfulRun(repoRoot) {
  const root = path.join(repoRoot, SYSTEM_RUN_ROOT);
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("outlook_mail_reconcile_")) continue;
    const summaryPath = path.join(root, entry.name, "reconciliation_summary.json");
    try {
      const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
      if (summary?.outlook_available === false) continue;
      const generatedAt = summary.generated_at ?? summary.date_window?.end;
      if (generatedAt) candidates.push(generatedAt);
    } catch {
      // Ignore incomplete or older run folders.
    }
  }
  candidates.sort();
  return candidates.at(-1) ?? null;
}

async function readFixtureInventory(filePath, { preflight, dateWindow, runId }) {
  const fixture = JSON.parse(await fs.readFile(filePath, "utf8"));
  return normalizeInventory({
    run_id: fixture.run_id ?? runId,
    generated_at: fixture.generated_at ?? dateWindow.end,
    date_window: dateWindow,
    outlook_source_alias: fixture.outlook_source_alias ?? "fixture",
    preflight_send_receive: {
      ...preflight,
      attempted: false,
      attempted_at: null,
      result: preflight.requested ? "fixture_skipped" : "not_requested",
    },
    outlook_available: true,
    outlook_error: null,
    sent: fixture.sent ?? [],
    received: fixture.received ?? [],
  });
}

async function readOutlookInventory({
  outlookSourceAlias,
  dateWindow,
  includeInboxSubfolders,
  maxItems,
  preflight,
}) {
  if (process.platform !== "win32") {
    return normalizeInventory({
      outlook_source_alias: outlookSourceAlias,
      preflight_send_receive: { ...preflight, result: "not_available_non_windows" },
      outlook_available: false,
      outlook_error: "Outlook COM metadata collection is only available on Windows.",
      sent: [],
      received: [],
    });
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-outlook-reconcile-"));
  const scriptPath = path.join(tempRoot, "collect_outlook_metadata.ps1");
  const outputPath = path.join(tempRoot, "outlook_inventory.json");
  try {
    const ps = buildOutlookPowerShellScript({
      outlookSourceAlias,
      dateWindow,
      includeInboxSubfolders,
      maxItems,
      requestSendReceive: preflight.requested,
      outputPath,
    });
    await fs.writeFile(scriptPath, ps, "utf8");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0) {
      return normalizeInventory({
        outlook_source_alias: outlookSourceAlias,
        preflight_send_receive: { ...preflight, attempted: preflight.requested, result: "error" },
        outlook_available: false,
        outlook_error: String(result.stderr || result.stdout || "powershell_outlook_metadata_failed").trim(),
        sent: [],
        received: [],
      });
    }
    try {
      const payload = (await fs.readFile(outputPath, "utf8")).replace(/^\uFEFF/u, "");
      return normalizeInventory(JSON.parse(payload));
    } catch (error) {
      return normalizeInventory({
        outlook_source_alias: outlookSourceAlias,
        preflight_send_receive: { ...preflight, attempted: preflight.requested, result: "json_parse_error" },
        outlook_available: false,
        outlook_error: `Failed to parse Outlook metadata JSON: ${error.message}`,
        sent: [],
        received: [],
      });
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function normalizeInventory(inventory) {
  const sent = (inventory.sent ?? []).map((row) => normalizeSentMetadataRow(row));
  const received = (inventory.received ?? []).map((row) => normalizeReceivedMetadataRow(row));
  return {
    run_id: inventory.run_id ?? "",
    generated_at: inventory.generated_at ?? new Date().toISOString(),
    date_window: inventory.date_window ?? null,
    outlook_source_alias: inventory.outlook_source_alias ?? "",
    preflight_send_receive: inventory.preflight_send_receive ?? {
      requested: false,
      attempted: false,
      attempted_at: null,
      result: "not_requested",
    },
    outlook_available: inventory.outlook_available !== false,
    outlook_error: inventory.outlook_error ?? null,
    sent,
    received,
  };
}

function normalizeSentMetadataRow(row) {
  const subject = String(row.subject ?? "");
  const subjectNormalized = normalizeMailSubject(row.subject_normalized ?? subject);
  const sourceFingerprint = String(row.source_entry_fingerprint ?? sha256(String(row.source_id ?? subject)));
  const out = {
    subject,
    subject_normalized: subjectNormalized,
    subject_fingerprint: row.subject_fingerprint ?? subjectFingerprint(subjectNormalized),
    conversation_fingerprint: String(row.conversation_fingerprint ?? ""),
    attachment_count: Number(row.attachment_count ?? 0),
    message_size_bucket: String(row.message_size_bucket ?? ""),
    source_entry_fingerprint: sourceFingerprint,
    source_folder_alias: String(row.source_folder_alias ?? ""),
    source_id: String(row.source_id ?? `outlook:sent:${sourceFingerprint.slice(0, 16)}`),
    provider_message_id: String(row.provider_message_id ?? ""),
    sent_at: String(row.sent_at ?? ""),
    sender_account_alias: String(row.sender_account_alias ?? ""),
    recipient_count: Number(row.recipient_count ?? 0),
    recipient_domain_fingerprints: Array.isArray(row.recipient_domain_fingerprints) ? row.recipient_domain_fingerprints : [],
  };
  assertMetadataOnly(out, "sent metadata row");
  return out;
}

function normalizeReceivedMetadataRow(row) {
  const subject = String(row.subject ?? "");
  const subjectNormalized = normalizeMailSubject(row.subject_normalized ?? subject);
  const sourceFingerprint = String(row.source_entry_fingerprint ?? sha256(String(row.source_id ?? subject)));
  const out = {
    received_at: String(row.received_at ?? ""),
    subject,
    subject_normalized: subjectNormalized,
    subject_fingerprint: row.subject_fingerprint ?? subjectFingerprint(subjectNormalized),
    conversation_fingerprint: String(row.conversation_fingerprint ?? ""),
    sender_alias_or_fingerprint: String(row.sender_alias_or_fingerprint ?? ""),
    recipient_account_alias: String(row.recipient_account_alias ?? ""),
    attachment_count: Number(row.attachment_count ?? 0),
    message_size_bucket: String(row.message_size_bucket ?? ""),
    source_entry_fingerprint: sourceFingerprint,
    source_folder_alias: String(row.source_folder_alias ?? ""),
    source_id: String(row.source_id ?? `outlook:received:${sourceFingerprint.slice(0, 16)}`),
  };
  assertMetadataOnly(out, "received metadata row");
  return out;
}

function buildOutlookPowerShellScript({
  outlookSourceAlias,
  dateWindow,
  includeInboxSubfolders,
  maxItems,
  requestSendReceive,
  outputPath,
}) {
  return `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputPath = '${String(outputPath).replace(/'/gu, "''")}'
function Get-Sha256Hex([string]$Value) {
  if ($null -eq $Value) { $Value = "" }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha.Dispose()
  }
}
function Normalize-Subject([string]$Subject) {
  if ($null -eq $Subject) { return "" }
  $value = $Subject.Trim()
  $previous = $null
  while ($value -ne $previous) {
    $previous = $value
    $value = [regex]::Replace($value, '^(?:\\s*(?:RE|FW|FWD)\\s*:\\s*)+', '', 'IgnoreCase').Trim()
  }
  return [regex]::Replace($value, '\\s+', ' ')
}
function Size-Bucket($Size) {
  $n = 0
  if ($null -ne $Size) { $n = [int64]$Size }
  if ($n -lt 50000) { return "lt50k" }
  if ($n -lt 200000) { return "50k_200k" }
  if ($n -lt 1000000) { return "200k_1m" }
  return "ge1m"
}
function To-Iso($DateValue) {
  if ($null -eq $DateValue) { return "" }
  return ([datetime]$DateValue).ToString("yyyy-MM-ddTHH:mm:ss.fffffffzzz")
}
function Folder-Alias($Folder) {
  try { return [string]$Folder.FolderPath } catch { return "" }
}
function Collect-MailItems($Folder, [string]$Kind, [datetime]$Since, [datetime]$Until, [int]$MaxItems) {
  $rows = New-Object System.Collections.ArrayList
  $items = $Folder.Items
  if ($Kind -eq "sent") { $items.Sort("[SentOn]", $true) } else { $items.Sort("[ReceivedTime]", $true) }
  $count = [Math]::Min($items.Count, $MaxItems)
  for ($i = 1; $i -le $count; $i++) {
    $item = $null
    try { $item = $items.Item($i) } catch { continue }
    if ($null -eq $item) { continue }
    $class = $null
    try { $class = $item.Class } catch { continue }
    if ($class -ne 43) { continue }
    $itemTime = if ($Kind -eq "sent") { [datetime]$item.SentOn } else { [datetime]$item.ReceivedTime }
    if ($itemTime -gt $Until) { continue }
    if ($itemTime -lt $Since) { break }
    $subject = [string]$item.Subject
    $subjectNormalized = Normalize-Subject $subject
    $entryHash = Get-Sha256Hex ([string]$item.EntryID)
    $conversationHash = Get-Sha256Hex ([string]$item.ConversationID)
    if ($Kind -eq "sent") {
      [void]$rows.Add([ordered]@{
        subject = $subject
        subject_normalized = $subjectNormalized
        subject_fingerprint = "subject:$((Get-Sha256Hex $subjectNormalized).Substring(0, 16))"
        conversation_fingerprint = "conversation:$($conversationHash.Substring(0, 16))"
        attachment_count = [int]$item.Attachments.Count
        message_size_bucket = Size-Bucket $item.Size
        source_entry_fingerprint = $entryHash
        source_folder_alias = Folder-Alias $Folder
        source_id = "outlook:sent:$($entryHash.Substring(0, 16))"
        sent_at = To-Iso $itemTime
        sender_account_alias = "${outlookSourceAlias}"
        recipient_count = [int]$item.Recipients.Count
        recipient_domain_fingerprints = @()
      })
    } else {
      $senderHash = Get-Sha256Hex ("$($item.SenderName)|$($item.SenderEmailAddress)")
      [void]$rows.Add([ordered]@{
        received_at = To-Iso $itemTime
        subject = $subject
        subject_normalized = $subjectNormalized
        subject_fingerprint = "subject:$((Get-Sha256Hex $subjectNormalized).Substring(0, 16))"
        conversation_fingerprint = "conversation:$($conversationHash.Substring(0, 16))"
        sender_alias_or_fingerprint = "sender:$($senderHash.Substring(0, 16))"
        recipient_account_alias = "${outlookSourceAlias}"
        attachment_count = [int]$item.Attachments.Count
        message_size_bucket = Size-Bucket $item.Size
        source_entry_fingerprint = $entryHash
        source_folder_alias = Folder-Alias $Folder
        source_id = "outlook:received:$($entryHash.Substring(0, 16))"
      })
    }
  }
  return $rows
}
function Collect-ReceivedFolders($Folder, [datetime]$Since, [datetime]$Until, [int]$MaxItems, [bool]$IncludeSubfolders) {
  $rows = New-Object System.Collections.ArrayList
  foreach ($row in (Collect-MailItems $Folder "received" $Since $Until $MaxItems)) { [void]$rows.Add($row) }
  if ($IncludeSubfolders) {
    foreach ($child in $Folder.Folders) {
      foreach ($row in (Collect-ReceivedFolders $child $Since $Until $MaxItems $IncludeSubfolders)) { [void]$rows.Add($row) }
    }
  }
  return $rows
}
$since = [datetime]"${dateWindow.start}"
$until = [datetime]"${dateWindow.end}"
$preflight = [ordered]@{
  requested = [bool]$${requestSendReceive ? "true" : "false"}
  attempted = $false
  attempted_at = $null
  result = if ([bool]$${requestSendReceive ? "true" : "false"}) { "not_attempted" } else { "not_requested" }
}
$outlookAvailable = $true
$outlookError = $null
$sentRows = @()
$receivedRows = @()
try {
  $app = New-Object -ComObject Outlook.Application
  $session = $app.Session
  if ([bool]$${requestSendReceive ? "true" : "false"}) {
    $preflight.attempted = $true
    $preflight.attempted_at = (Get-Date).ToString("o")
    try {
      $session.SendAndReceive($false)
      $preflight.result = "started"
    } catch {
      $preflight.result = "error: $($_.Exception.Message)"
    }
  }
  $sentFolder = $session.GetDefaultFolder(5)
  $inboxFolder = $session.GetDefaultFolder(6)
  $sentRows = Collect-MailItems $sentFolder "sent" $since $until ${maxItems}
  $receivedRows = Collect-ReceivedFolders $inboxFolder $since $until ${maxItems} ([bool]$${includeInboxSubfolders ? "true" : "false"})
} catch {
  $outlookAvailable = $false
  $outlookError = $_.Exception.Message
}
$payload = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  date_window = [ordered]@{ start = "${dateWindow.start}"; end = "${dateWindow.end}" }
  outlook_source_alias = "${outlookSourceAlias}"
  preflight_send_receive = $preflight
  outlook_available = $outlookAvailable
  outlook_error = $outlookError
  sent = @($sentRows)
  received = @($receivedRows)
}
$json = $payload | ConvertTo-Json -Depth 12
Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8
`;
}

async function readCsvObjects(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const rows = parseCsv(raw.replace(/^\uFEFF/u, ""));
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function renderCsv(rows, headers) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      if (text[index + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, "\"\"")}"` : text;
}

function normalizeLedgerRow(row) {
  return Object.fromEntries(MAIL_HISTORY_HEADERS.map((header) => [header, String(row[header] ?? "")]));
}

function compareLedgerRows(a, b) {
  return `${a["발생시각"]}|${a["이력키"]}`.localeCompare(`${b["발생시각"]}|${b["이력키"]}`);
}

function summarizeReceivedRows(rows) {
  const summary = {
    checked_rows: rows.length,
    matched: 0,
    missing_in_project_ledger: 0,
    ambiguous_owner_review_required: 0,
  };
  for (const row of rows) {
    if (row.classification === "matched") summary.matched += 1;
    if (row.classification === "missing_in_project_ledger") summary.missing_in_project_ledger += 1;
    if (row.classification === "ambiguous_owner_review_required") summary.ambiguous_owner_review_required += 1;
  }
  return summary;
}

function renderBoundaryReview({ common, outputMode, preflight, projects, outlookInventory, matched, appliedRows }) {
  return [
    `# Outlook Mail Reconcile Boundary Review`,
    ``,
    `- Workflow: \`${common.workflow_id}\``,
    `- Run id: \`${common.run_id}\``,
    `- Output mode: \`${outputMode}\``,
    `- Send/Receive preflight requested: \`${preflight.requested}\``,
    `- Send/Receive preflight result: \`${preflight.result}\``,
    `- Selected projects: ${projects.selected_project_codes.join(", ") || "(none)"}`,
    `- Excluded projects: ${projects.excluded_project_codes.join(", ")}`,
    ``,
    `## Checks`,
    ``,
    `- Outlook access stayed metadata-only and read-only after the optional Send/Receive preflight.`,
    `- No body text, HTML, .msg/.eml export, attachment filename/payload, secret, or session state is written by this runner.`,
    `- No mail send, move, delete, mark-read/unread, category, folder, or rule mutation is performed by this runner.`,
    `- Sent-mail rows are applied only to private project metadata ledgers when \`--apply\` is used.`,
    `- Received-mail rows are cross-validation only and do not rewrite received history.`,
    `- Ambiguous project matches are routed to owner follow-up rows.`,
    `- Public tracked files receive no project mail rows or private Outlook metadata.`,
    ``,
    `## Counts`,
    ``,
    `- Sent metadata rows: ${outlookInventory.sent.length}`,
    `- Received metadata rows: ${outlookInventory.received.length}`,
    `- Sent candidate rows: ${matched.sentRows.length}`,
    `- Sent applied rows: ${appliedRows.length}`,
    `- Received cross-validation rows: ${matched.receivedRows.length}`,
    `- Owner follow-up rows: ${matched.ownerFollowups.length}`,
    ``,
    `Claim ceiling: observed private metadata.`,
    ``,
  ].join("\n");
}

function deniedActions() {
  return [
    "send_composed_mail",
    "move_mail",
    "delete_mail",
    "mark_read_or_unread",
    "edit_categories",
    "edit_rules",
    "create_or_rename_folders",
    "export_msg_or_eml",
    "copy_attachment",
    "read_body_text_or_html",
    "inspect_secrets",
  ];
}

function assertMetadataOnly(value, label) {
  const stack = [{ path: label, value }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      const normalized = key.toLowerCase();
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalized)) {
        throw new Error(`forbidden payload key in ${current.path}: ${key}`);
      }
      if (child && typeof child === "object") stack.push({ path: `${current.path}.${key}`, value: child });
    }
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildRunId(date) {
  const stamp = date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `outlook_mail_reconcile_${stamp.toLowerCase()}`;
}

function requiredString(value, name) {
  const text = String(value ?? "");
  if (!text) throw new Error(`missing required value: ${name}`);
  return text;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function relativeToRepo(repoRoot, target) {
  return toPosix(path.relative(repoRoot, target));
}

function toPosix(value) {
  return String(value).replace(/\\/gu, "/");
}
