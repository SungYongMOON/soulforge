#!/usr/bin/env node
// Single-entry metadata-only haengbogwan run report.
// Dry-run is the default; --apply delegates writes to haengbogwan_apply.mjs.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHaengbogwanApplyReport } from "./haengbogwan_apply.mjs";
import { buildContextPacketForProject } from "./haengbogwan_context_packet.mjs";
import { runProjectContextKnowledgeCandidateUpdate } from "./haengbogwan_knowledge_candidates.mjs";
import { runProjectContextUpdate } from "./haengbogwan_project_context.mjs";
import { buildSnapshots } from "./haengbogwan_snapshot.mjs";
import { activeSnoozeDecisionMap } from "./haengbogwan_task_decisions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const DEFAULT_TRIAGE_LIMIT = 10;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function usage() {
  return `Usage: haengbogwan_run [--repo-root <dir>] [--workmeta-root <dir>] [--project <code>] [--limit <n>] [--triage-limit <n>] [--today YYYY-MM-DD] [--db <dev-erp.db>] [--apply] [--apply-context] [--apply-knowledge-candidates] [--auto-open] [--stage <code>] [--json]

Build one metadata-only haengbogwan execution report.
Dry-run is the default. --apply is required before task ledger rows or reference receipts are written.
--apply-context separately updates _workmeta/<project>/project_context from mail/task metadata.
--apply-knowledge-candidates appends metadata-only deferred wiki/RAG candidate rows after context is applied.`;
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function validateLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_limit:${value}`);
  return n;
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    repoRoot: REPO,
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projects: [],
    limit: DEFAULT_LIMIT,
    triageLimit: DEFAULT_TRIAGE_LIMIT,
    today: todayIso(),
    dbPath: "",
    apply: false,
    applyContext: false,
    applyKnowledgeCandidates: false,
    autoOpen: false,
    stage: "",
    stagePresent: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--apply") {
      opts.apply = true;
    } else if (token === "--apply-context") {
      opts.applyContext = true;
    } else if (token === "--apply-knowledge-candidates") {
      opts.applyKnowledgeCandidates = true;
    } else if (token === "--auto-open") {
      opts.autoOpen = true;
    } else if (token === "--repo-root") {
      opts.repoRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      opts.workmetaRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projects.push(readValue(argv, i, token));
      i += 1;
    } else if (token === "--limit") {
      opts.limit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else if (token === "--triage-limit") {
      opts.triageLimit = validateLimit(readValue(argv, i, token));
      i += 1;
    } else if (token === "--today") {
      opts.today = validateToday(readValue(argv, i, token));
      i += 1;
    } else if (token === "--db") {
      opts.dbPath = readValue(argv, i, token);
      i += 1;
    } else if (token === "--stage") {
      opts.stage = readValue(argv, i, token);
      opts.stagePresent = true;
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateToday(opts.today);
  opts.limit = validateLimit(opts.limit);
  opts.triageLimit = validateLimit(opts.triageLimit);
  return opts;
}

function compactSnapshot(snapshot) {
  return {
    pending_mail_count: snapshot.pending_mail_count ?? 0,
    unclassified_task_count: snapshot.unclassified_task_count ?? 0,
    due_today_count: snapshot.due_today_count ?? 0,
    overdue_count: snapshot.overdue_count ?? 0,
    blocked_count: snapshot.blocked_count ?? 0,
    waiting_count: snapshot.waiting_count ?? 0,
    needs_quick_triage_count: snapshot.needs_quick_triage_count ?? 0,
    raw_boundary_skip_count: snapshot.raw_boundary_skip_count ?? 0,
    next_actions: Array.isArray(snapshot.next_actions) ? snapshot.next_actions.slice(0, 8) : [],
  };
}

function addTotals(totals, row) {
  totals.pending_mail_count += row.snapshot.pending_mail_count;
  totals.unclassified_task_count += row.snapshot.unclassified_task_count;
  totals.due_today_count += row.snapshot.due_today_count;
  totals.overdue_count += row.snapshot.overdue_count;
  totals.blocked_count += row.snapshot.blocked_count;
  totals.waiting_count += row.snapshot.waiting_count;
  totals.needs_quick_triage_count += row.snapshot.needs_quick_triage_count;
  totals.raw_boundary_skip_count += row.snapshot.raw_boundary_skip_count;
  totals.candidate_count += row.apply_report.candidate_count;
  totals.reference_only_skip_count += row.apply_report.reference_only_skip_count;
  totals.reference_receipt_written += row.apply_report.reference_receipt_written;
  totals.triage_queue_count += row.triage_queue.length;
  totals.active_snooze_count += row.task_decisions.active_snooze_count;
  totals.context_event_count += row.context_report.context_event_count;
  totals.context_accepted_event_count += row.context_report.accepted_event_count;
  if (row.context_report.apply) totals.context_apply_project_count += 1;
  totals.knowledge_candidate_count += row.knowledge_candidate_report.candidate_count;
  totals.knowledge_candidate_appended_count += row.knowledge_candidate_report.appended_count;
  totals.knowledge_candidate_skipped_duplicate_count += row.knowledge_candidate_report.skipped_duplicate_count;
  if (row.apply_report.ledger_exit_code && row.apply_report.ledger_exit_code !== 0) totals.ledger_failure_count += 1;
}

function addTriageItem(map, item, reason, score) {
  const taskKey = String(item?.task_key || "").trim();
  if (!taskKey) return;
  const existing = map.get(taskKey) || {
    task_key: taskKey,
    title: item.title || "",
    status: item.status || "",
    review_status: item.review_status || "",
    due: item.due || "",
    assignee: item.assignee || "",
    source_ref: item.source_ref || "",
    reasons: [],
    score: 0,
    next_action: "",
  };
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  existing.score = Math.max(existing.score, score);
  existing.next_action = nextActionForReasons(existing.reasons);
  map.set(taskKey, existing);
}

function nextActionForReasons(reasons) {
  if (reasons.includes("blocked")) return "Clear blocker or mark an owner decision.";
  if (reasons.includes("overdue")) return "Decide: do today, snooze with reason, or close if already handled.";
  if (reasons.includes("due_today")) return "Confirm the completion plan for today.";
  if (reasons.includes("unclassified")) return "Fill work type, completion criteria, due date, and owner.";
  if (reasons.includes("missing_assignee")) return "Assign a responsible owner or team.";
  if (reasons.includes("waiting")) return "Check whether the wait is still valid or snooze explicitly.";
  return "Review and decide the next action.";
}

function buildTriageQueue(snapshot, { limit = DEFAULT_TRIAGE_LIMIT, activeSnoozes = new Map() } = {}) {
  const map = new Map();
  for (const item of snapshot.blocked || []) addTriageItem(map, item, "blocked", 120);
  for (const item of snapshot.overdue || []) addTriageItem(map, item, "overdue", 110);
  for (const item of snapshot.due_today || []) addTriageItem(map, item, "due_today", 100);
  for (const item of snapshot.waiting || []) addTriageItem(map, item, "waiting", 70);
  for (const item of snapshot.needs_quick_triage || []) {
    const reasons = Array.isArray(item.reasons) && item.reasons.length ? item.reasons : ["quick_triage"];
    for (const reason of reasons) {
      const score = reason === "unclassified" ? 90
        : reason === "missing_due" ? 75
          : reason === "missing_assignee" ? 80
            : reason === "reference_likely" ? 45
              : 60;
      addTriageItem(map, item, reason, score);
    }
  }
  const allItems = [...map.values()];
  const activeSnoozeCount = allItems.filter((item) => activeSnoozes.has(item.task_key)).length;
  const queue = allItems
    .filter((item) => !activeSnoozes.has(item.task_key))
    .sort((a, b) => b.score - a.score
      || (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99")
      || a.task_key.localeCompare(b.task_key))
    .slice(0, limit);
  return { queue, active_snooze_count: activeSnoozeCount };
}

function historyKeyFromMailHistoryRef(ref) {
  const raw = String(ref ?? "").trim();
  return raw.startsWith("mailcsv:") ? raw.slice("mailcsv:".length) : "";
}

// 브랜치 배정: ① 프로젝트별 owner 큐레이션 규칙(_workmeta/<code>/rules/haengbogwan_context_hint_rules.json,
// reading 레인과 같은 파일)을 우선 적용 → ② 없으면 계약(PROJECT_CONTEXT_GRAPH_MODEL_V0 Branch Seeds)의
// 프로젝트 중립 seed 로 폴백. (이전: KVDS 라벨 하드코딩이 모든 프로젝트에 적용되어 타 과제 줄기를 오염시켰음)
const GENERIC_BRANCH_SEEDS = [
  { branch: "requirements", pattern: /\bsow\b|statement of work|업무\s*정의|과업|요구사항|요구도|regulation|사양서|규격서|requirement/iu },
  { branch: "design", pattern: /csci|sdd|설계|도면|drawing|schematic|layout|디자인/iu },
  { branch: "test", pattern: /시험|테스트|\btest\b|성적서?|시제/iu },
  { branch: "quality", pattern: /품질|검사|검증|quality|inspection|verification|audit/iu },
  { branch: "procurement", pattern: /구매|견적|발주|자재|주문|조달|purchase|quote|quotation|\bpo\b/iu },
  { branch: "delivery", pattern: /납품|납기|출하|delivery|shipment/iu },
  { branch: "meeting", pattern: /회의|미팅|간담회|착수회의|참석|명단|meeting|kickoff/iu },
  { branch: "schedule", pattern: /일정|일시|기한|마감|schedule|calendar|deadline/iu },
  { branch: "document_response", pattern: /회신|답변|응답|문의|질의|공문|reply|response|inquiry/iu },
  { branch: "risk", pattern: /리스크|위험|이슈|risk|issue/iu },
];

// rules/haengbogwan_context_hint_rules.json → [{keywords[], branch, priority}] (enabled, priority desc).
// 파일 없음/파손은 빈 배열(폴백 동작) — 규칙 로드 실패가 실행을 막지 않는다.
export function loadContextHintRules(workmetaRoot, projectId) {
  try {
    const raw = JSON.parse(readFileSync(join(workmetaRoot, projectId, "rules", "haengbogwan_context_hint_rules.json"), "utf8"));
    return (Array.isArray(raw?.rules) ? raw.rules : [])
      .filter((r) => r?.enabled !== false && String(r?.target_object ?? "").trim())
      .map((r) => ({
        branch: String(r.target_object).trim(),
        priority: Number(r.priority) || 0,
        keywords: (Array.isArray(r.event_keywords) ? r.event_keywords : [])
          .map((k) => String(k ?? "").normalize("NFKC").toLowerCase().trim()).filter(Boolean),
      }))
      .filter((r) => r.keywords.length)
      .sort((a, b) => b.priority - a.priority);
  } catch {
    return [];
  }
}

export function branchHintForProject(value, { rules = [], fallback = "task triage" } = {}) {
  const text = String(value ?? "").normalize("NFKC").toLowerCase();
  if (!text.trim()) return fallback;
  for (const rule of rules) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.branch;
  }
  for (const seed of GENERIC_BRANCH_SEEDS) {
    if (seed.pattern.test(text)) return seed.branch;
  }
  return fallback;
}

function metadataSourceEventToProjectContextEvent(event, { candidateKeys = new Set(), rules = [] } = {}) {
  const historyKey = event.history_key || historyKeyFromMailHistoryRef(event.source_refs?.mail_history_ref);
  const actionRequired = historyKey ? candidateKeys.has(historyKey) : false;
  const title = event.subject || event.event_ref || "pending mail";
  return {
    source_kind: "mail",
    source_id: event.source_refs?.mail_history_ref || event.event_ref || historyKey,
    external_ref: event.source_refs?.mail_history_ref || event.event_ref || historyKey,
    project_code: event.project_id || "",
    received_at: event.received_at || "",
    title,
    branch_hint: branchHintForProject(title, { rules, fallback: "pending mail" }),
    summary_hint: [
      "metadata haengbogwan run",
      actionRequired ? "candidate=true" : "candidate=false",
      "body_text_not_loaded",
    ].join("; "),
    action_required: actionRequired,
    work_type: actionRequired ? "review" : "",
    completion_criteria: actionRequired ? "Mail-derived work candidate is reviewed, routed, or dismissed." : "",
    due: event.due_hint || "",
    suggested_actor_ref: "",
    confidence: actionRequired ? 0.65 : 0.45,
    pointer_ref: event.source_refs?.mail_history_ref || "",
    body_access: "metadata_only",
    reason: "haengbogwan_run metadata source event",
  };
}

function taskSummaryToProjectContextEvent(task, rules = []) {
  const reasons = Array.isArray(task.reasons) ? task.reasons : [];
  const actionRequired = !/(done|closed|complete|cancelled|canceled)/i.test(String(task.status || ""));
  const title = task.title || task.task_key || "task ledger item";
  return {
    source_kind: "task_ledger",
    source_id: task.task_key || task.source_ref || task.title,
    external_ref: task.task_key || task.source_ref || task.title,
    project_code: task.project_id || "",
    received_at: "",
    title,
    branch_hint: branchHintForProject(title, { rules, fallback: "task triage" }),
    summary_hint: [
      "metadata haengbogwan task triage",
      task.status ? `status=${task.status}` : "",
      task.review_status ? `review=${task.review_status}` : "",
      reasons.length ? `reasons=${reasons.join("+")}` : "",
      "body_text_not_loaded",
    ].filter(Boolean).join("; "),
    action_required: actionRequired,
    work_type: reasons.includes("unclassified") ? "review" : "",
    completion_criteria: actionRequired ? "Task ledger item is triaged, assigned, snoozed, closed, or updated." : "",
    due: task.due || "",
    suggested_actor_ref: task.assignee || "",
    confidence: reasons.includes("unclassified") ? 0.55 : 0.7,
    pointer_ref: task.source_ref || "",
    body_access: "metadata_only",
    reason: "haengbogwan_run metadata task event",
  };
}

function buildMetadataRunContextEvents(contextPacket, triageQueue, projectId, candidateKeys, rules = []) {
  const mailEvents = (Array.isArray(contextPacket?.source_events) ? contextPacket.source_events : [])
    .map((event) => metadataSourceEventToProjectContextEvent(event, { candidateKeys, rules }));
  const taskEvents = (Array.isArray(triageQueue) ? triageQueue : [])
    .map((task) => taskSummaryToProjectContextEvent({ ...task, project_id: projectId }, rules));
  return [...mailEvents, ...taskEvents];
}

function buildMetadataContextReport(snapshot, opts, applyReport, triageQueue) {
  const contextPacket = buildContextPacketForProject({
    workmetaRoot: opts.workmetaRoot,
    projectId: snapshot.project_id,
    limit: opts.limit,
    today: opts.today,
    dbPath: opts.dbPath,
    includeKnowledge: true,
  });
  const candidateKeys = new Set(Array.isArray(applyReport.candidate_keys) ? applyReport.candidate_keys : []);
  const hintRules = loadContextHintRules(opts.workmetaRoot, snapshot.project_id);
  const events = buildMetadataRunContextEvents(contextPacket, triageQueue, snapshot.project_id, candidateKeys, hintRules);
  return {
    ...runProjectContextUpdate({
      workmetaRoot: opts.workmetaRoot,
      projectCode: snapshot.project_id,
      events,
      generatedAt: contextPacket.generated_at || new Date().toISOString(),
      apply: opts.applyContext,
    }),
    context_event_count: events.length,
  };
}

function projectRunRow(snapshot, opts) {
  const activeSnoozes = activeSnoozeDecisionMap({
    workmetaRoot: opts.workmetaRoot,
    projectId: snapshot.project_id,
    today: opts.today,
  });
  const triage = buildTriageQueue(snapshot, { limit: opts.triageLimit, activeSnoozes });
  const applyReport = buildHaengbogwanApplyReport({
    workmetaRoot: opts.workmetaRoot,
    projectId: snapshot.project_id,
    limit: opts.limit,
    today: opts.today,
    dbPath: opts.dbPath,
    apply: opts.apply,
    autoOpen: opts.autoOpen,
    stage: opts.stage,
    stagePresent: opts.stagePresent,
    defaultReviewDays: 0,
    defaultReviewDaysPresent: false,
    reminderDays: 0,
    reminderDaysPresent: false,
  });
  const contextReport = buildMetadataContextReport(snapshot, opts, applyReport, triage.queue);
  const knowledgeCandidateReport = runProjectContextKnowledgeCandidateUpdate({
    repoRoot: opts.repoRoot,
    workmetaRoot: opts.workmetaRoot,
    projectCode: snapshot.project_id,
    contextReport,
    generatedAt: contextReport.generated_at || new Date().toISOString(),
    apply: opts.applyKnowledgeCandidates,
  });
  return {
    project_id: snapshot.project_id,
    snapshot: compactSnapshot(snapshot),
    triage_queue: triage.queue,
    task_decisions: {
      active_snooze_count: triage.active_snooze_count,
    },
    context_report: {
      apply: contextReport.apply,
      context_event_count: contextReport.context_event_count,
      accepted_event_count: contextReport.accepted_event_count,
      skipped_event_count: contextReport.skipped_event_count,
      incoming_counts: contextReport.incoming_counts,
      total_counts: contextReport.total_counts,
      files_written: contextReport.files_written,
      body_access: contextReport.body_access,
    },
    knowledge_candidate_report: knowledgeCandidateReport,
    apply_report: {
      apply: applyReport.apply,
      candidate_count: applyReport.candidate_count,
      candidate_keys: applyReport.candidate_keys,
      reference_only_skip_count: applyReport.reference_only_skip_count,
      reference_receipt_written: applyReport.reference_receipt_written,
      reference_receipt_skipped: applyReport.reference_receipt_skipped,
      ledger_exit_code: applyReport.ledger_exit_code,
      ledger_invoked: Boolean(applyReport.ledger_args_summary?.invoked),
      skipped_reason: applyReport.skipped_reason || "",
      body_access: applyReport.body_access,
    },
  };
}

export function buildHaengbogwanRunReport(opts) {
  const snapshots = buildSnapshots({
    workmetaRoot: opts.workmetaRoot,
    projects: opts.projects,
    today: opts.today,
    itemLimit: opts.limit,
    rawSkipLimit: opts.limit,
  });
  const projects = snapshots.map((snapshot) => projectRunRow(snapshot, opts));
  const totals = {
    pending_mail_count: 0,
    unclassified_task_count: 0,
    due_today_count: 0,
    overdue_count: 0,
    blocked_count: 0,
    waiting_count: 0,
    needs_quick_triage_count: 0,
    raw_boundary_skip_count: 0,
    candidate_count: 0,
    reference_only_skip_count: 0,
    reference_receipt_written: 0,
    triage_queue_count: 0,
    active_snooze_count: 0,
    context_event_count: 0,
    context_accepted_event_count: 0,
    context_apply_project_count: 0,
    knowledge_candidate_count: 0,
    knowledge_candidate_appended_count: 0,
    knowledge_candidate_skipped_duplicate_count: 0,
    ledger_failure_count: 0,
  };
  for (const row of projects) addTotals(totals, row);
  return {
    generated_at: new Date().toISOString(),
    today: opts.today,
    apply: opts.apply,
    apply_context: opts.applyContext,
    apply_knowledge_candidates: opts.applyKnowledgeCandidates,
    body_access: "metadata_only",
    project_count: projects.length,
    totals,
    projects,
  };
}

function renderText(report) {
  const lines = [];
  lines.push(`# haengbogwan run ${report.today} (${report.apply ? "apply" : "dry-run"})`);
  lines.push(`projects=${report.project_count} pending=${report.totals.pending_mail_count} candidates=${report.totals.candidate_count} refs=${report.totals.reference_only_skip_count} due_today=${report.totals.due_today_count} overdue=${report.totals.overdue_count} triage=${report.totals.triage_queue_count} snoozed=${report.totals.active_snooze_count}`);
  for (const row of report.projects) {
    lines.push(`- ${row.project_id}: pending=${row.snapshot.pending_mail_count} candidates=${row.apply_report.candidate_count} refs=${row.apply_report.reference_only_skip_count} triage=${row.triage_queue.length} snoozed=${row.task_decisions.active_snooze_count} ledger=${row.apply_report.ledger_exit_code ?? "not_invoked"}`);
    for (const action of row.snapshot.next_actions.slice(0, 3)) lines.push(`  next: ${action}`);
    for (const item of row.triage_queue.slice(0, 3)) lines.push(`  triage: ${item.task_key} score=${item.score} ${item.reasons.join("+")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const report = buildHaengbogwanRunReport(opts);
    stdout.write(opts.json ? `${JSON.stringify(report)}\n` : renderText(report));
    return report.totals.ledger_failure_count ? 1 : 0;
  } catch (error) {
    stderr.write(`[haengbogwan_run] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
