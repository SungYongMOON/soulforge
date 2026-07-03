#!/usr/bin/env node
// tools/auto_intake_cycle.mjs — 메일→할일 자동 인입 사이클(수집 이후 구간 오케스트레이터).
//   체인: pending(결정적 신규 델타) → LLM 분류(로컬 Ollama, 메타 전용, src/llm.mjs classifyMailForTasks)
//        → mail_to_task_ledger --auto-open --apply(결정적 행 작성, 멱등)
//        → haengbogwan_run --apply-context(줄기 project_context 갱신, 메타 전용)
//   LLM 미가용 기본값: 후보 생성 없이 pending 유지(다음 사이클 재판단, rubric V1) + 줄기 갱신은 수행.
//   DEV_ERP_INTAKE_FALLBACK=deterministic 이면 haengbogwan_run --apply 의 결정적 후보(전건 격리)로 폴백.
//   기본 dry-run(계획·건수만 출력, 쓰기 0). --apply 일 때만 자식 도구에 쓰기 전달.
//   원문·첨부·secret 미접촉(메타 전용). stdout 은 건수·이력키·exit code 만(제목 등 업무 메타 미출력).
//   동시 실행 방지: <data>/auto_intake.lock (stale 15분). 실행 기록: <data>/auto_intake_receipts.jsonl + event_log(meta).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { INTAKE_WORK_TYPES, classifyMailForTasks, intakeLlmProvider } from "../src/llm.mjs";
import { loadContextHintRules } from "./haengbogwan_run.mjs";
import { appendMailReceipts } from "./mail_receipts.mjs";
import { groupMailCopies } from "./mail_fingerprint.mjs";
import { readCsvObjects, scanPending } from "./mail_to_task_pending.mjs";
import { isOutboundMail, threadKeyAliasesForMail, threadKeyForMail } from "./mail_thread_key.mjs";
import { runCompletionKnowledgeFeed } from "./completion_knowledge_feed.mjs";
import { runFollowupScan } from "./followup_scan.mjs";
import {
  DEFAULT_KNOWLEDGE_INDEX_ROOT,
  applyKnowledgeGroundingToCandidate,
  knowledgeContextLines,
  listProjectKnowledgeRefs,
} from "./knowledge_grounding.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const LOCK_STALE_MS = 15 * 60 * 1000;
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");
const CLOSED_TASK_STATUSES = new Set(["done", "cancelled", "canceled", "closed", "complete", "완료", "취소"]);
const INTAKE_WORK_TYPE_SET = new Set(INTAKE_WORK_TYPES);

function truthyEnv(name, env = process.env) {
  const v = String(env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function parseCycleArgs(argv = process.argv.slice(2), env = process.env) {
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
  const has = (n) => argv.includes(`--${n}`);
  const projects = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === "--project" && argv[i + 1] && !argv[i + 1].startsWith("--")) projects.push(argv[i + 1]);
  return {
    apply: has("apply"),
    json: has("json"),
    db: arg("db", "data/dev-erp.db"),
    workmeta: arg("workmeta", join(REPO, "_workmeta")),
    dataDir: arg("data-dir", join(APP, "data")),
    projects,
    limit: Math.max(1, Number(arg("limit", env.DEV_ERP_INTAKE_LIMIT || "12")) || 12),
    provider: arg("provider", intakeLlmProvider(env)),
    fallback: arg("fallback", String(env.DEV_ERP_INTAKE_FALLBACK ?? "skip").trim().toLowerCase() === "deterministic" ? "deterministic" : "skip"),
    knowledge: has("knowledge") || truthyEnv("DEV_ERP_INTAKE_KNOWLEDGE", env),
    knowledgeCommon: truthyEnv("DEV_ERP_INTAKE_KNOWLEDGE_COMMON", env),
    knowledgeRoot: arg("knowledge-root", DEFAULT_KNOWLEDGE_INDEX_ROOT),
    completionFeed: truthyEnv("DEV_ERP_INTAKE_COMPLETION_FEED", env),
    followup: has("followup") || truthyEnv("DEV_ERP_INTAKE_FOLLOWUP", env),
    followupDays: Math.max(1, Number(arg("followup-days", env.DEV_ERP_FOLLOWUP_DAYS || "3")) || 3),
    followupLimit: Math.max(1, Number(arg("followup-limit", env.DEV_ERP_FOLLOWUP_LIMIT || "5")) || 5),
    followupReminderDays: Math.max(0, Number(arg("followup-reminder-days", env.DEV_ERP_FOLLOWUP_REMINDER_DAYS || "2")) || 2),
    today: arg("today", new Date().toISOString().slice(0, 10)),
    skipContext: has("skip-context"),
    // not_task 고신뢰 판정을 영수증으로 기억(재판단 수렴). --no-receipts 또는 DEV_ERP_INTAKE_RECEIPTS=0 으로 끔.
    receipts: !has("no-receipts") && String(env.DEV_ERP_INTAKE_RECEIPTS ?? "1").trim() !== "0",
    runId: arg("run-id", `auto_intake_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`),
  };
}

// 분류 입력용 줄기 맥락(메타 요약, 결정적): 프로젝트별 힌트 규칙 키워드 + project_context 상위 branch 요약.
// 본문 없음 — branch label 은 이미 redacted metadata 표면이다.
export function buildProjectContextLines(workmetaRoot, projectId, { maxBranches = 6, maxChars = 900, knowledgeRefs = [] } = {}) {
  const lines = [];
  const rules = loadContextHintRules(workmetaRoot, projectId);
  if (rules.length) {
    lines.push(`업무 줄기(branch) 후보: ${rules.map((r) => r.branch).slice(0, 8).join(" / ")}`);
  }
  lines.push(...knowledgeContextLines(knowledgeRefs));
  try {
    const csv = readFileSync(join(workmetaRoot, projectId, "project_context", "summaries", "branch_summaries.csv"), "utf8");
    const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map((line) => line.split(","));
    // branch_id,project_code,branch_key,label,source_count,task_count,open_review_count,updated_at
    const top = rows
      .map((c) => ({ label: String(c[3] ?? "").trim(), sources: Number(c[4]) || 0, open: Number(c[6]) || 0 }))
      .filter((b) => b.label && !/[�]|ㅇㅇ/.test(b.label)) // 인코딩 깨진 라벨은 맥락에서 제외
      .sort((a, b) => b.open - a.open || b.sources - a.sources)
      .slice(0, maxBranches);
    for (const b of top) lines.push(`진행 중 줄기: ${b.label} (자료 ${b.sources}, 미결 ${b.open})`);
  } catch { /* 줄기 없음 → 규칙 라인만 */ }
  let total = 0;
  return lines.filter((l) => { total += l.length + 1; return total <= maxChars; });
}

// 단순 파일 락(단일 호스트용). 손상/정지 대비 stale 15분 후 탈취.
export function acquireLock(dataDir, { now = Date.now() } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = join(dataDir, "auto_intake.lock");
  const payload = JSON.stringify({ pid: process.pid, at: now });
  try {
    writeFileSync(lockPath, payload, { flag: "wx" });
    return lockPath;
  } catch {
    try {
      const prev = JSON.parse(readFileSync(lockPath, "utf8"));
      if (now - Number(prev?.at ?? 0) > LOCK_STALE_MS) { writeFileSync(lockPath, payload); return lockPath; }
    } catch { /* 깨진 락은 탈취 */ writeFileSync(lockPath, payload); return lockPath; }
    return null;
  }
}

export function releaseLock(lockPath) {
  try { if (lockPath && existsSync(lockPath)) unlinkSync(lockPath); } catch { /* noop */ }
}

const firstOf = (row, names) => {
  for (const name of names) {
    const value = row?.[name];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

function isOpenTaskStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return !CLOSED_TASK_STATUSES.has(normalized);
}

function matchesRuleKeyword(subjectText, rule) {
  const text = String(subjectText ?? "").normalize("NFKC").toLowerCase();
  return text.trim() && (rule.keywords ?? []).some((keyword) => text.includes(String(keyword).normalize("NFKC").toLowerCase()));
}

function appendReason(existing, reason) {
  const current = String(existing ?? "").trim();
  if (!current) return reason;
  return current.includes(reason) ? current : `${current}+${reason}`;
}

export function enrichCandidateWithRules(candidate, subjectText, rules = []) {
  const next = { ...(candidate ?? {}) };
  const rule = (rules ?? []).find((entry) => matchesRuleKeyword(subjectText, entry));
  if (!rule) return { candidate: next, enriched: false, rule_id: "" };

  let enriched = false;
  if (!String(next.required_role ?? "").trim() && rule.required_role) {
    next.required_role = rule.required_role;
    enriched = true;
  }
  if (!String(next.required_capability ?? "").trim() && rule.required_capability) {
    next.required_capability = rule.required_capability;
    enriched = true;
  }
  if (!String(next.suggested_assignee_ref ?? "").trim() && rule.suggested_assignee_ref) {
    next.suggested_assignee_ref = rule.suggested_assignee_ref;
    if (!String(next.assignee_confidence ?? "").trim()) next.assignee_confidence = "medium";
    if (!String(next.assignee_reason ?? "").trim()) {
      next.assignee_reason = `브랜치 규칙(${rule.id || rule.branch}) 기반 제안`;
    }
    enriched = true;
  }

  const ruleWorkType = (rule.work_types ?? []).find((workType) => INTAKE_WORK_TYPE_SET.has(workType));
  if (String(next.work_type ?? "").trim().toLowerCase() === "review" && ruleWorkType && ruleWorkType !== "review") {
    next.work_type = ruleWorkType;
    next.review_reason = appendReason(next.review_reason, "rule_work_type");
    enriched = true;
  }

  return { candidate: next, enriched, rule_id: rule.id || rule.branch };
}

export function openTaskThreadMap(workmetaRoot, projectId) {
  const task = readCsvObjects(join(workmetaRoot, projectId, TASK_REL));
  const out = new Map();
  for (const row of task.rows) {
    const itemKey = firstOf(row, ["할일키", "id"]);
    const thread = firstOf(row, ["소스스레드키", "source_thread_ref"]);
    const status = firstOf(row, ["상태", "status"]);
    if (!itemKey || !thread || !isOpenTaskStatus(status)) continue;
    if (!out.has(thread)) out.set(thread, itemKey);
  }
  return out;
}

function threadAliasesForPendingItem(item) {
  if (Array.isArray(item?.thread_aliases) && item.thread_aliases.length) {
    return [...new Set(item.thread_aliases.map((thread) => String(thread ?? "").trim()).filter(Boolean))];
  }
  if (String(item?.thread ?? "").startsWith("thread-fallback:")) {
    return threadKeyAliasesForMail({ subject: item.subject, from: item.from });
  }
  return threadKeyAliasesForMail({ thread: item.thread || "", subject: item.subject, from: item.from });
}

async function appendFollowupEvent(opts, deps, event) {
  if (typeof deps.appendEvent === "function") {
    deps.appendEvent(event);
    return true;
  }
  if (deps.appendEvent === null || !opts.apply) return false;
  try {
    const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(opts.db) ? opts.db : resolve(APP, opts.db);
    if (!existsSync(dbPath)) return false;
    const { openStore } = await import("../src/store.mjs");
    const store = openStore(dbPath);
    store.appendEvent(event);
    store.db.close();
    return true;
  } catch {
    return false;
  }
}

export async function threadDedupPrePass(scanned, opts, deps = {}) {
  const nextScanned = [];
  const summary = {
    thread_followups: 0,
    outbound_skipped: 0,
    receipts_written: 0,
    receipts_planned: 0,
    receipt_duplicates: 0,
    events_written: 0,
  };

  for (const projectScan of scanned) {
    const threadMap = openTaskThreadMap(opts.workmeta, projectScan.project);
    const nextPending = [];
    for (const item of projectScan.pending) {
      if (isOutboundMail(item)) {
        summary.outbound_skipped += 1;
        continue;
      }
      const aliases = threadAliasesForPendingItem(item);
      const matchedThread = aliases.find((thread) => threadMap.has(thread)) || "";
      const thread = item.thread || threadKeyForMail(item);
      const itemRef = matchedThread ? threadMap.get(matchedThread) : "";
      if (!itemRef) {
        nextPending.push(item);
        continue;
      }

      summary.thread_followups += 1;
      const receiptRow = {
        receipt_key: `mailreceipt:${item.history_key}:thread_followup:${itemRef}`,
        history_key: item.history_key,
        project_id: projectScan.project,
        disposition: "no_action",
        status: "auto",
        handled_at: new Date().toISOString(),
        reason: `thread_followup:${itemRef}`,
        source_event_ref: "",
        source_mail_ref: `mailcsv:${item.history_key}`,
        source_mail_source_id: item.source_id || "",
        source_lineage_ref: matchedThread ? `thread:${matchedThread}` : (thread ? `thread:${thread}` : ""),
        generation_rule_ref: "thread_dedup",
        generation_run_ref: opts.runId,
        body_access: "metadata_only",
      };
      if (!opts.apply) {
        summary.receipts_planned += 1;
        continue;
      }
      const receipt = appendMailReceipts({ workmetaRoot: opts.workmeta, projectId: projectScan.project, rows: [receiptRow] });
      summary.receipts_written += receipt.written;
      summary.receipt_duplicates += receipt.skipped_duplicate;
      if (receipt.written > 0) {
        const wrote = await appendFollowupEvent(opts, deps, {
          actor_ref: "erp",
          actor_kind: "ai",
          kind: "mail_followup",
          item_ref: itemRef,
          project_ref: projectScan.project,
          used_refs: ["auto_intake", "thread_dedup"],
          data_label: "meta",
          note: `history_key=${item.history_key}`,
        });
        if (wrote) summary.events_written += 1;
      }
    }
    nextScanned.push({ ...projectScan, pending: nextPending });
  }
  return { scanned: nextScanned, summary };
}

export function teamMailDedupPrePass(scanned, opts) {
  const nextScanned = [];
  const groupRefsByProject = new Map();
  const summary = {
    groups: 0,
    copies_suppressed: 0,
    receipts_planned: 0,
    receipts_written: 0,
    receipt_duplicates: 0,
  };

  for (const projectScan of scanned) {
    const grouped = groupMailCopies(projectScan.pending);
    const nextPending = [...grouped.singles];
    const groupRefs = new Map();
    const receiptRows = [];
    for (const group of grouped.duplicateGroups) {
      summary.groups += 1;
      summary.copies_suppressed += group.copies.length;
      nextPending.push({ ...group.representative, source_group_ref: group.group_key, duplicate_copy_count: group.copy_count });
      groupRefs.set(group.representative.history_key, group.group_key);
      for (const copy of group.copies) {
        receiptRows.push({
          receipt_key: `mailreceipt:${copy.history_key}:duplicate_of:${group.representative.history_key}`,
          history_key: copy.history_key,
          project_id: projectScan.project,
          disposition: "no_action",
          status: "auto",
          handled_at: new Date().toISOString(),
          reason: `duplicate_of:${group.representative.history_key}`,
          source_event_ref: "",
          source_mail_ref: `mailcsv:${copy.history_key}`,
          source_mail_source_id: copy.source_id || "",
          source_lineage_ref: `mailgroup:${group.group_key}`,
          generation_rule_ref: "team_mail_dedup",
          generation_run_ref: opts.runId,
          body_access: "metadata_only",
        });
      }
    }
    if (receiptRows.length) {
      if (opts.apply) {
        const receipt = appendMailReceipts({ workmetaRoot: opts.workmeta, projectId: projectScan.project, rows: receiptRows });
        summary.receipts_written += receipt.written;
        summary.receipt_duplicates += receipt.skipped_duplicate;
      } else {
        summary.receipts_planned += receiptRows.length;
      }
    }
    if (groupRefs.size) groupRefsByProject.set(projectScan.project, groupRefs);
    nextScanned.push({ ...projectScan, pending: nextPending });
  }

  return { scanned: nextScanned, groupRefsByProject, summary };
}

function defaultExec(cmd, args, { timeout }) {
  return execFileP(cmd, args, { cwd: APP, timeout, maxBuffer: 8 * 1024 * 1024 });
}

// 사이클 본체. deps 주입(테스트: exec/classify 모킹). 각 단계는 독립 try/catch — 한 단계 실패가 전체를 막지 않는다.
export async function runCycle(opts, deps = {}) {
  const exec = deps.exec ?? defaultExec;
  const classify = deps.classify ?? classifyMailForTasks;
  const started = Date.now();
  const summary = {
    ok: true, run_id: opts.runId, apply: opts.apply, provider: opts.provider, fallback: opts.fallback,
    pending_total: 0, judged: 0, candidate_count: 0,
    skipped: { not_task: 0, llm_error: 0, busy: 0 },
    ledger: {}, context: null, errors: [], body_access: "metadata_only",
    receipts: { written: 0, skipped_duplicate: 0 },
    team_mail_dedup: { groups: 0, copies_suppressed: 0, receipts_planned: 0, receipts_written: 0, receipt_duplicates: 0 },
    thread_dedup: { followups: 0, outbound_skipped: 0, receipts_planned: 0, receipts_written: 0, receipt_duplicates: 0, events_written: 0 },
    capability_assign: { enriched: 0 },
    knowledge_grounding: { include_common: Boolean(opts.knowledgeCommon), refs: 0, matched: 0, used_refs: [], projects: {} },
    completion_knowledge_feed: { enabled: Boolean(opts.completionFeed) },
    followup_scan: { enabled: Boolean(opts.followup) },
  };

  // 1) pending 델타(결정적, 메일 메타만)
  let scanned = [];
  let groupRefsByProject = new Map();
  try {
    scanned = scanPending(opts.workmeta, {});
    if (opts.projects.length) scanned = scanned.filter((s) => opts.projects.includes(s.project));
    const teamDedup = teamMailDedupPrePass(scanned, opts);
    scanned = teamDedup.scanned;
    groupRefsByProject = teamDedup.groupRefsByProject;
    summary.team_mail_dedup = teamDedup.summary;
    summary.receipts.written += teamDedup.summary.receipts_written;
    summary.receipts.skipped_duplicate += teamDedup.summary.receipt_duplicates;
    const dedup = await threadDedupPrePass(scanned, opts, deps);
    scanned = dedup.scanned;
    summary.thread_dedup = {
      followups: dedup.summary.thread_followups,
      outbound_skipped: dedup.summary.outbound_skipped,
      receipts_planned: dedup.summary.receipts_planned,
      receipts_written: dedup.summary.receipts_written,
      receipt_duplicates: dedup.summary.receipt_duplicates,
      events_written: dedup.summary.events_written,
    };
    summary.receipts.written += dedup.summary.receipts_written;
    summary.receipts.skipped_duplicate += dedup.summary.receipt_duplicates;
    // limit 은 모든 dedup pre-pass 이후에 적용한다(E8-D2): 사본/스레드 그룹이 limit 경계에 걸려
    // 일부 사본만 영수증 없이 잔류하면 다음 run 에서 가짜 followup 이벤트나 중복 할일이 생긴다.
    scanned = scanned.map((s) => ({ ...s, pending: s.pending.slice(0, opts.limit) }));
    summary.pending_total = scanned.reduce((a, s) => a + s.pending.length, 0);
  } catch (e) { summary.errors.push(`pending:${String(e?.message ?? e).slice(0, 120)}`); }

  const knowledgeRefsByProject = new Map();
  const knowledgeProjects = [...new Set([...(opts.projects ?? []), ...scanned.map((s) => s.project)])];
  for (const projectCode of knowledgeProjects) {
    const refs = listProjectKnowledgeRefs(projectCode, {
      includeCommon: Boolean(opts.knowledgeCommon),
      knowledgeRoot: opts.knowledgeRoot || DEFAULT_KNOWLEDGE_INDEX_ROOT,
    });
    knowledgeRefsByProject.set(projectCode, refs);
    summary.knowledge_grounding.projects[projectCode] = { refs: refs.length };
    summary.knowledge_grounding.refs += refs.length;
  }

  // 2) LLM 분류(프로젝트별, 줄기 맥락 주입) — provider none 이면 전건 보류
  const perProject = [];
  for (const s of scanned) {
    if (!s.pending.length) continue;
    try {
      const knowledgeRefs = knowledgeRefsByProject.get(s.project) ?? [];
      const projectContext = buildProjectContextLines(opts.workmeta, s.project, { knowledgeRefs });
      const r = await classify(s.pending, { provider: opts.provider, maxItems: opts.limit, projectContext });
      summary.judged += r.judged ?? 0;
      const notTaskRows = [];
      const pendingByKey = new Map(s.pending.map((p) => [p.history_key, p]));
      for (const skip of r.skipped ?? []) {
        if (skip.reason === "not_task") {
          summary.skipped.not_task += 1;
          // 고신뢰 "할일 아님"만 영수증으로 기억 → 다음 사이클 재판단 제외(수렴). medium/low 는 재판단 유지.
          if (opts.receipts && skip.confidence === "high") {
            const item = pendingByKey.get(skip.history_key) ?? {};
            notTaskRows.push({
              receipt_key: `mailreceipt:${skip.history_key}:no_action`,
              history_key: skip.history_key,
              project_id: s.project,
              disposition: "no_action",
              status: "auto",
              handled_at: new Date().toISOString(),
              reason: `llm_not_task_high${skip.note ? `:${skip.note}` : ""}`,
              source_event_ref: "",
              source_mail_ref: `mailcsv:${skip.history_key}`,
              source_mail_source_id: item.source_id || "",
              source_lineage_ref: "",
              generation_rule_ref: "mail_to_task_classify",
              generation_run_ref: opts.runId,
              body_access: "metadata_only",
            });
          }
        } else if (skip.reason === "busy") summary.skipped.busy += 1;
        else summary.skipped.llm_error += 1;
      }
      if (opts.apply && notTaskRows.length) {
        const receipt = appendMailReceipts({ workmetaRoot: opts.workmeta, projectId: s.project, rows: notTaskRows });
        summary.receipts.written += receipt.written;
        summary.receipts.skipped_duplicate += receipt.skipped_duplicate;
      } else if (notTaskRows.length) {
        summary.receipts.planned = (summary.receipts.planned ?? 0) + notTaskRows.length;
      }
      const rules = loadContextHintRules(opts.workmeta, s.project);
      const candidates = {};
      const projectGrounding = summary.knowledge_grounding.projects[s.project] ?? { refs: knowledgeRefs.length };
      const groupRefs = groupRefsByProject.get(s.project) ?? new Map();
      for (const [key, candidate] of Object.entries(r.candidates ?? {})) {
        const pending = pendingByKey.get(key) ?? {};
        const withGroupRef = groupRefs.has(key) && !String(candidate?.source_group_ref ?? "").trim()
          ? { ...candidate, source_group_ref: groupRefs.get(key) }
          : candidate;
        const enriched = enrichCandidateWithRules(withGroupRef, pending.subject ?? "", rules);
        const grounded = applyKnowledgeGroundingToCandidate(enriched.candidate, pending.subject ?? "", knowledgeRefs);
        candidates[key] = grounded.candidate;
        if (enriched.enriched) summary.capability_assign.enriched += 1;
        if (grounded.matched_refs.length) {
          summary.knowledge_grounding.matched += 1;
          projectGrounding.matched = (projectGrounding.matched ?? 0) + 1;
          for (const ref of grounded.used_refs) {
            if (!summary.knowledge_grounding.used_refs.includes(ref)) summary.knowledge_grounding.used_refs.push(ref);
          }
        }
      }
      summary.knowledge_grounding.projects[s.project] = projectGrounding;
      const keys = Object.keys(candidates);
      if (keys.length) perProject.push({ project: s.project, candidates, keys });
      summary.candidate_count += keys.length;
    } catch (e) { summary.errors.push(`classify:${s.project}:${String(e?.message ?? e).slice(0, 120)}`); }
  }

  // 3) 장부 작성(결정적 엔진 위임, 멱등) — apply 일 때만 자식 실행
  for (const p of perProject) {
    if (!opts.apply) { summary.ledger[p.project] = { planned: p.keys.length }; continue; }
    try {
      const tmpDir = join(opts.dataDir, "tmp");
      mkdirSync(tmpDir, { recursive: true });
      const candFile = join(tmpDir, `auto_intake_${p.project}_${opts.runId}.json`);
      writeFileSync(candFile, JSON.stringify(p.candidates, null, 2));
      const args = ["tools/mail_to_task_ledger.mjs", "--project", p.project, "--candidates", candFile,
        "--db", opts.db, "--workmeta", opts.workmeta, "--auto-open", "--run-id", opts.runId, "--apply"];
      await exec("node", args, { timeout: 60000 });
      summary.ledger[p.project] = { applied: p.keys.length, exit: 0 };
    } catch (e) {
      summary.ledger[p.project] = { error: String(e?.message ?? e).slice(0, 160) };
      summary.errors.push(`ledger:${p.project}`);
    }
  }

  // 4) 줄기 갱신(+ 선택: 결정적 폴백 후보). haengbogwan_run 은 메타 전용이며 dry-run 이 기본이라
  //    apply 플래그를 우리 opts.apply 에 종속시킨다. LLM 미가용이어도 줄기는 자란다.
  if (!opts.skipContext) {
    const useDeterministic = opts.fallback === "deterministic" && summary.candidate_count === 0 && summary.judged === 0;
    const args = ["tools/haengbogwan_run.mjs", "--db", opts.db, "--workmeta-root", opts.workmeta, "--json"];
    for (const code of opts.projects) args.push("--project", code);
    if (opts.apply) {
      args.push("--apply-context");
      if (opts.knowledge) args.push("--apply-knowledge-candidates");
      if (useDeterministic) args.push("--apply", "--auto-open");
    }
    try {
      const { stdout } = await exec("node", args, { timeout: 180000 });
      let totals = null;
      try { totals = JSON.parse(String(stdout))?.totals ?? null; } catch { /* 텍스트 모드 무시 */ }
      summary.context = {
        exit: 0, deterministic_fallback: useDeterministic,
        accepted_events: totals?.context_accepted_event_count ?? null,
        knowledge_appended: totals?.knowledge_candidate_appended_count ?? null,
        fallback_candidates: useDeterministic ? (totals?.candidate_count ?? null) : 0,
      };
    } catch (e) {
      summary.context = { error: String(e?.message ?? e).slice(0, 160), deterministic_fallback: useDeterministic };
      summary.errors.push("context");
    }
  }

  // 5) Optional completion-log -> knowledge candidate feed. Default OFF; deterministic and apply-gated.
  if (opts.completionFeed) {
    try {
      const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(opts.db) ? opts.db : resolve(APP, opts.db);
      const feed = runCompletionKnowledgeFeed({
        apply: opts.apply,
        dbPath,
        workmetaRoot: opts.workmeta,
        cursorPath: join(opts.dataDir, "completion_knowledge_cursor.json"),
        limit: opts.limit,
      });
      summary.completion_knowledge_feed = {
        enabled: true,
        scanned: feed.scanned_count,
        planned: feed.planned_count,
        written: feed.written_count,
        skipped: feed.skipped_count,
        duplicates: feed.skipped_duplicate_count,
      };
    } catch (e) {
      summary.completion_knowledge_feed = { enabled: true, error: String(e?.message ?? e).slice(0, 160) };
      summary.errors.push("completion_knowledge_feed");
    }
  }

  // 6) Optional no-reply/due follow-up scan. Default OFF; deterministic and apply-gated.
  if (opts.followup) {
    try {
      const followup = await runFollowupScan({
        apply: opts.apply,
        json: true,
        workmeta: opts.workmeta,
        dataDir: opts.dataDir,
        db: opts.db,
        today: opts.today,
        days: opts.followupDays,
        reminderDays: opts.followupReminderDays,
        limit: opts.followupLimit,
        projects: opts.projects,
        runId: opts.runId,
      }, { exec, appendEvent: deps.appendEvent });
      summary.followup_scan = followup;
      if (!followup.ok) summary.errors.push("followup_scan");
    } catch (e) {
      summary.followup_scan = { enabled: true, error: String(e?.message ?? e).slice(0, 160) };
      summary.errors.push("followup_scan");
    }
  }

  summary.ok = summary.errors.length === 0;
  summary.elapsed_ms = Date.now() - started;

  // 7) 실행 기록(메타만): receipts JSONL + event_log. 실패해도 사이클 결과에는 영향 없음.
  if (opts.apply) {
    try {
      mkdirSync(opts.dataDir, { recursive: true });
      appendFileSync(join(opts.dataDir, "auto_intake_receipts.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...summary })}\n`);
    } catch { /* noop */ }
    if (deps.appendEvent !== null) {
      try {
        const usedRefs = [
          "mail_to_task_classify",
          "haengbogwan_run",
          `run:${opts.runId}`,
          ...(summary.team_mail_dedup.groups ? ["team_mail_dedup"] : []),
          ...summary.knowledge_grounding.used_refs,
        ];
        const event = {
          actor_ref: "erp", actor_kind: "ai", kind: "auto_intake_run",
          used_refs: [...new Set(usedRefs)], data_label: "meta",
          note: `provider=${summary.provider} pending=${summary.pending_total} judged=${summary.judged} candidates=${summary.candidate_count} not_task=${summary.skipped.not_task} errors=${summary.errors.length}`,
        };
        if (typeof deps.appendRunEvent === "function") {
          deps.appendRunEvent(event);
        } else {
          const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(opts.db) ? opts.db : resolve(APP, opts.db);
          if (existsSync(dbPath)) {
            const { openStore } = await import("../src/store.mjs");
            const s = openStore(dbPath);
            s.appendEvent(event);
            s.db.close();
          }
        }
      } catch { /* DB 미가용은 무시(수집 PC 밖 standalone 실행 허용) */ }
    }
  }
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const opts = parseCycleArgs();
  const lock = acquireLock(opts.dataDir);
  if (!lock) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: "already_running" })}\n`);
    process.exitCode = 1;
  } else {
    try {
      const summary = await runCycle(opts);
      if (opts.json) process.stdout.write(`${JSON.stringify(summary)}\n`);
      else process.stdout.write(`# auto intake ${summary.apply ? "apply" : "dry-run"} provider=${summary.provider} pending=${summary.pending_total} judged=${summary.judged} candidates=${summary.candidate_count} not_task=${summary.skipped.not_task} errors=${summary.errors.join(",") || "none"} ${summary.elapsed_ms}ms\n`);
      process.exitCode = summary.ok ? 0 : 1;
    } catch (e) {
      process.stderr.write(`[auto_intake_cycle] ${String(e?.message ?? e)}\n`);
      process.exitCode = 2;
    } finally {
      releaseLock(lock);
    }
  }
}
