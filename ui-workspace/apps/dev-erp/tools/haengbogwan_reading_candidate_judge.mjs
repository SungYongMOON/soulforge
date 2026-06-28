#!/usr/bin/env node
// Haengbogwan reading candidate judge.
// Turns local mail reading packets into work-context groups and task candidates.
// It never writes DB/ledger changes and never emits mail body text.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadingContextPacket,
  redactReadingContextPacket,
} from "./haengbogwan_reading_context_packet.mjs";
import {
  applyCodexJudgmentsToReports,
} from "./haengbogwan_reading_codex_judge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = resolve(APP, "data", "dev-erp.db");
const DEFAULT_LIMIT = 20;
const DEFAULT_GENERATION_RULE_REF = "haengbogwan_reading_candidate_judge.v1";
const WORK_TYPES = ["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TYPE_RULES = {
  schedule: ["일정", "일자", "일시", "회의", "미팅", "협의", "참석", "calendar", "meeting", "schedule", "deadline"],
  answer: ["회신", "답변", "문의", "질의", "질문", "reply", "response", "answer", "inquiry"],
  author: ["작성", "제출", "송부", "자료", "문서", "보고서", "초안", "SDD", "DD 문서", "CSCI", "deliverable", "document", "draft", "submit", "send"],
  revise: ["수정", "보완", "변경", "개정", "업데이트", "재검토", "revise", "revision", "modify", "change", "update"],
  purchase: ["견적", "구매", "발주", "납품", "자재", "제작", "quote", "quotation", "purchase", "order", "delivery"],
  verify: ["시험", "검증", "확인", "점검", "품질", "성적", "측정", "시뮬레이션", "검토의견", "test", "verify", "quality", "inspection", "simulation"],
  decide: ["승인", "결정", "결재", "판단", "확정", "approve", "approval", "decide", "decision"],
};

const ACTION_KEYWORDS = [
  "요청", "부탁", "필요", "해야", "검토", "확인", "작성", "제출", "송부", "공유 부탁", "회신", "답변",
  "보완", "수정", "변경", "협의", "참석", "결정", "승인", "please", "request", "required", "needed",
  "action", "follow-up", "confirm", "review", "submit", "prepare", "send",
];

const REFERENCE_ONLY_KEYWORDS = ["참고", "FYI", "for your information", "reference only", "공유드립니다", "공유 드립니다"];
const READ_RECEIPT_KEYWORDS = ["읽음:", "읽었습니다", "read receipt", "read:"];

const DOMAIN_RULES = [
  {
    area: "mechanical",
    keywords: ["기계", "기구", "틸딩", "틸팅", "예인몸체", "모델링", "시뮬레이션", "mechanical"],
    suggested_assignee_ref: "dev_team_4",
    required_role: "mechanical_engineering_owner",
    required_capability: "mechanical_engineering",
  },
  {
    area: "hardware_firmware",
    keywords: ["하드웨어", "회로", "보드", "펌웨어", "FW", "HW", "센서", "송수신", "콘덴서", "hardware", "firmware"],
    suggested_assignee_ref: "dev_team_1",
    required_role: "hardware_firmware_owner",
    required_capability: "hardware_firmware_engineering",
  },
  {
    area: "windows_sw",
    keywords: ["윈도우", "windows", "SW", "소프트웨어", "운용콘솔", "프로그램", "software"],
    suggested_assignee_ref: "dev_team_2",
    required_role: "windows_software_owner",
    required_capability: "windows_software_engineering",
  },
  {
    area: "quality_test",
    keywords: ["품질", "시험", "검증", "성적서", "검사", "측정", "quality", "test", "verification"],
    suggested_assignee_ref: "",
    required_role: "quality_verification_owner",
    required_capability: "quality_verification",
  },
  {
    area: "systems_engineering",
    keywords: ["SDD", "DD 문서", "CSCI", "요구사항", "체계", "산출물", "문서", "deliverable"],
    suggested_assignee_ref: "",
    required_role: "systems_engineering_owner",
    required_capability: "systems_engineering",
  },
];

const BOT_BY_TYPE = {
  answer: "reply_draft_bot",
  review: "mail_review_bot",
  author: "document_draft_bot",
  revise: "change_summary_bot",
  purchase: "procurement_followup_bot",
  verify: "verification_check_bot",
  decide: "decision_brief_bot",
  schedule: "schedule_watch_bot",
};

const ACTION_COPY = {
  answer: {
    label: "회신 필요사항 정리",
    completion: "회신 필요사항, 회신 담당, 회신 여부가 결정되고 필요한 답장 초안 또는 후속조치가 준비됨.",
    next: "메일 판독 결과를 보고 회신 담당과 답장 필요 여부를 확정한다.",
  },
  review: {
    label: "요청사항 검토",
    completion: "메일의 요청사항을 검토하고 필요한 후속조치, 담당, 보류 사유가 기록됨.",
    next: "요청사항을 담당자에게 배정하거나 owner 검토로 넘긴다.",
  },
  author: {
    label: "자료/문서 작성 및 송부",
    completion: "요청된 자료 또는 문서의 작성 범위, 제출 대상, 완료 기준이 정리되고 후속작업이 배정됨.",
    next: "작성 대상 산출물과 제출/송부 책임자를 확정한다.",
  },
  revise: {
    label: "변경/보완 반영",
    completion: "수정 또는 보완할 대상과 반영 완료 기준이 정리되고 담당자에게 연결됨.",
    next: "변경 대상과 보완 근거를 확인해 담당자에게 넘긴다.",
  },
  purchase: {
    label: "견적/구매/납품 후속처리",
    completion: "견적, 구매, 납품, 제작 관련 후속조치와 담당자가 정리됨.",
    next: "견적/납품 관련 후속조치가 필요한지 확인한다.",
  },
  verify: {
    label: "시험/품질/검증 확인",
    completion: "시험, 품질, 검증, 측정 또는 검토의견 관련 확인사항과 증빙 경로가 정리됨.",
    next: "검증/품질 확인 담당과 필요한 증빙을 연결한다.",
  },
  decide: {
    label: "승인/결정 필요사항 정리",
    completion: "승인 또는 결정이 필요한 항목, 결정권자, 판단 근거가 정리됨.",
    next: "결정권자에게 넘길 판단자료를 준비한다.",
  },
  schedule: {
    label: "일정/회의 확인",
    completion: "회의, 일정, 기한, 참석 또는 일정 변경사항이 일정장부/할일에 반영됨.",
    next: "일정과 참석/준비 담당을 확정하고 일정장부에 반영한다.",
  },
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactText(value) {
  return normalizeText(value).toLowerCase();
}

function hasAny(text, keywords) {
  const haystack = compactText(text);
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function matchingKeywords(text, keywords) {
  const haystack = compactText(text);
  return keywords.filter((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function hashKey(value, prefix = "ctx") {
  const digest = createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
  return `${prefix}:${digest}`;
}

function normalizeSubject(subject) {
  return String(subject ?? "")
    .replace(/^\s*(re|fw|fwd|읽음)\s*:\s*/ig, "")
    .replace(/\([^)]*~[^)]*\)/g, "")
    .replace(/~\s*\d{1,2}[./월]\s*\d{0,2}[^)\s]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPrivateBody(packetOrEvent) {
  const { reading_text, ...rest } = packetOrEvent ?? {};
  return rest;
}

function dateFromParts(year, month, day) {
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(d.getTime())) return "";
  if (d.getUTCFullYear() !== Number(year) || d.getUTCMonth() + 1 !== Number(month) || d.getUTCDate() !== Number(day)) return "";
  return d.toISOString().slice(0, 10);
}

function baseYearFromEvent(event) {
  const fromReceived = Number(String(event?.received_at ?? "").slice(0, 4));
  if (fromReceived >= 2000 && fromReceived <= 2100) return fromReceived;
  return new Date().getUTCFullYear();
}

function currentMessageSegment(text) {
  const source = normalizeText(text);
  if (!source) return "";
  const markers = [
    /\n-{2,}\s*Original Message\s*-{2,}/iu,
    /\n-{2,}\s*원본 메시지\s*-{2,}/u,
    /\n_{8,}/u,
    /\nFrom:\s.+\nTo:\s/iu,
    /\n발신자\s*:/u,
    /\n보낸 날짜\s*:/u,
    /\nSent:\s/iu,
  ];
  let cut = source.length;
  for (const marker of markers) {
    const match = marker.exec(source);
    if (match && match.index > 0) cut = Math.min(cut, match.index);
  }
  return source.slice(0, cut).trim();
}

export function extractDueCandidates(text, { baseYear = new Date().getUTCFullYear() } = {}) {
  const source = String(text ?? "");
  const out = [];
  const add = (due, dueText, sourceLabel, confidence) => {
    if (!DATE_RE.test(due)) return;
    if (out.some((row) => row.due === due && row.due_text === dueText)) return;
    out.push({ due, due_text: dueText, due_source: sourceLabel, confidence });
  };
  for (const m of source.matchAll(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/gu)) {
    add(dateFromParts(m[1], m[2], m[3]), m[0], "body_or_subject", "explicit_full_date");
  }
  for (const m of source.matchAll(/['’](\d{2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})/gu)) {
    add(dateFromParts(2000 + Number(m[1]), m[2], m[3]), m[0], "body_or_subject", "explicit_short_year_date");
  }
  for (const m of source.matchAll(/(?:~|까지|기한|due|by|일자\s*:?)\s*(\d{1,2})\s*[./월]\s*(\d{1,2})?/giu)) {
    const month = Number(m[1]);
    const day = Number(m[2] || "");
    if (day) add(dateFromParts(baseYear, month, day), m[0], "body_or_subject", "explicit_month_day");
  }
  for (const m of source.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/gu)) {
    add(dateFromParts(baseYear, m[1], m[2]), m[0], "body_or_subject", "explicit_korean_month_day");
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.due_text.localeCompare(b.due_text));
}

function classifyTypes(text) {
  const matches = [];
  for (const type of WORK_TYPES) {
    const keywords = TYPE_RULES[type] ?? [];
    if (hasAny(text, keywords)) matches.push(type);
  }
  if (!matches.length && hasAny(text, ACTION_KEYWORDS)) matches.push("review");
  if (!matches.length) matches.push("review");
  const order = ["answer", "schedule", "author", "verify", "revise", "purchase", "decide", "review"];
  return [...new Set(matches)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 4);
}

function classifyDomain(text) {
  const matched = DOMAIN_RULES
    .map((rule) => ({ ...rule, matched_keywords: matchingKeywords(text, rule.keywords) }))
    .filter((rule) => rule.matched_keywords.length);
  if (!matched.length) {
    return {
      area: "mail_triage",
      matched_keywords: [],
      suggested_assignee_ref: "",
      required_role: "mail_triage_owner",
      required_capability: "mail_reading_triage",
    };
  }
  return matched[0];
}

function targetObjectFromText(text, event = {}) {
  const source = `${event.subject ?? ""}\n${text}`;
  const normalizedSubject = normalizeSubject(event.subject);
  const parts = [];
  if (/KVDS/iu.test(source)) parts.push("KVDS");
  if (/예인몸체/u.test(source)) parts.push("예인몸체");
  if (/실무\s*협의|회의/u.test(source)) parts.push("실무협의");
  if (/SDD|DD 문서|CSCI/iu.test(source)) parts.push("SDD/DD/CSCI 문서");
  if (/센서|송수신|음향돔|TVR|FOV|projector|hydrophone/iu.test(source)) parts.push("센서/음향 검증");
  if (/틸딩|틸팅|기계/u.test(source)) parts.push("기계 검토");
  if (/견적|구매|발주|납품|제작/u.test(source)) parts.push("견적/납품");
  if (parts.length) return [...new Set(parts)].slice(0, 4).join(" ");
  return normalizedSubject.slice(0, 80) || "메일 요청사항";
}

function completionGoalForType(type, targetObject) {
  const copy = ACTION_COPY[type] ?? ACTION_COPY.review;
  return `${targetObject} ${copy.label}`;
}

function priorityFor({ due = "", actionSignals = false, text = "", recipientRole = "unknown" } = {}) {
  if (/긴급|급히|asap|urgent|오늘|금일/u.test(text)) return "high";
  if (due) return "high";
  if (recipientRole === "to" && actionSignals) return "medium";
  if (actionSignals) return "medium";
  return "low";
}

function dispositionForEvent(event, { actionSignals, referenceOnly, readReceipt, existingTaskRefs }) {
  if (existingTaskRefs.length) return "update_existing";
  if (readReceipt) return "reference_or_no_action";
  if (referenceOnly && !actionSignals) return "reference_or_no_action";
  if (actionSignals || event.attachment_count > 0) return "candidate";
  if (event.body_access === "subject_only") return "owner_review";
  return "owner_review";
}

function confidenceFor({ disposition, actionSignals, due, bodyAccess, typeCount, existingTaskRefs }) {
  if (existingTaskRefs.length) return 0.9;
  if (disposition === "reference_or_no_action") return 0.85;
  let score = 0.45;
  if (actionSignals) score += 0.2;
  if (due) score += 0.1;
  if (bodyAccess === "event_body_text") score += 0.15;
  if (bodyAccess === "core_mail.body_preview") score += 0.08;
  if (typeCount > 1) score -= 0.05;
  return Math.max(0.1, Math.min(0.95, Number(score.toFixed(2))));
}

function evidenceSummary({ signals, dueCandidates, domain, bodyAccess, disposition }) {
  const parts = [];
  if (signals.length) parts.push(`signals=${signals.join("+")}`);
  if (dueCandidates.length) parts.push(`due_detected=${dueCandidates[0].due}`);
  if (domain.area !== "mail_triage") parts.push(`domain=${domain.area}`);
  parts.push(`body_access=${bodyAccess}`);
  parts.push(`disposition=${disposition}`);
  return `${parts.join("; ")}; body text redacted`;
}

function knowledgeRefsFromContext(knowledgeContext, limit = 8) {
  const refs = [];
  const add = (value) => {
    const ref = String(value ?? "").trim();
    if (!ref || refs.includes(ref)) return;
    refs.push(ref);
  };
  for (const row of Array.isArray(knowledgeContext?.wiki_page_refs) ? knowledgeContext.wiki_page_refs : []) add(row.page_ref || row.ref);
  for (const row of Array.isArray(knowledgeContext?.rag_route_refs) ? knowledgeContext.rag_route_refs : []) add(row.route_ref || row.ref);
  for (const row of Array.isArray(knowledgeContext?.rag_work_card_refs) ? knowledgeContext.rag_work_card_refs : []) add(row.work_card_ref || row.ref);
  for (const row of Array.isArray(knowledgeContext?.knowledge_ledger_refs) ? knowledgeContext.knowledge_ledger_refs : []) add(row.ledger_ref || row.ref);
  for (const row of Array.isArray(knowledgeContext?.core_knowledge_hits) ? knowledgeContext.core_knowledge_hits : []) {
    add(row.source_ref || row.pointer || (row.id ? `core_knowledge:${row.id}` : ""));
  }
  return refs.slice(0, limit);
}

function summarizeKnowledgeContext(knowledgeContext) {
  if (!knowledgeContext) {
    return {
      loaded: false,
      source_text_loaded: false,
      ref_count: 0,
      refs: [],
    };
  }
  const refs = knowledgeRefsFromContext(knowledgeContext);
  return {
    loaded: true,
    schema_version: knowledgeContext.schema_version || "",
    source_text_loaded: !!knowledgeContext.boundary?.source_text_loaded,
    wiki_body_loaded: !!knowledgeContext.boundary?.wiki_body_loaded,
    raw_payload_copied: !!knowledgeContext.boundary?.raw_payload_copied,
    ref_count: refs.length,
    counts: knowledgeContext.counts || {},
    refs,
  };
}

function signalLabels(text, dueCandidates) {
  const labels = [];
  if (hasAny(text, ACTION_KEYWORDS)) labels.push("action_request");
  if (dueCandidates.length) labels.push("due_or_date");
  if (hasAny(text, TYPE_RULES.schedule)) labels.push("schedule");
  if (hasAny(text, TYPE_RULES.author)) labels.push("document_or_submission");
  if (hasAny(text, TYPE_RULES.verify)) labels.push("verification_or_quality");
  if (hasAny(text, TYPE_RULES.revise)) labels.push("change_or_revision");
  if (hasAny(text, TYPE_RULES.purchase)) labels.push("procurement_or_delivery");
  if (hasAny(text, TYPE_RULES.answer)) labels.push("reply_needed");
  if (hasAny(text, TYPE_RULES.decide)) labels.push("decision_needed");
  return [...new Set(labels)];
}

function titleForAction({ type, targetObject, event }) {
  const copy = ACTION_COPY[type] ?? ACTION_COPY.review;
  const target = targetObject || normalizeSubject(event.subject) || "메일 요청사항";
  return `${target} - ${copy.label}`;
}

function sourceLineageFor(event) {
  if (event.pointer_ref && event.source_ref) return `${event.pointer_ref}@${event.source_ref}`;
  return event.pointer_ref || event.source_ref || event.mail_ref || "";
}

function ledgerSafeKey(key) {
  const value = String(key ?? "").trim();
  if (!value || /[,:\n\r]/.test(value)) return "";
  if (/^[A-Za-z]:[\\/]/.test(value) || value.includes("..")) return "";
  return value;
}

function candidateForAction(report, type, index = 0) {
  const copy = ACTION_COPY[type] ?? ACTION_COPY.review;
  return {
    title: report.codex_title || titleForAction({ type, targetObject: report.target_object, event: report }),
    work_type: type,
    completion_criteria: report.codex_completion_criteria || copy.completion,
    due: report.due || "",
    review_status: "needs_review",
    review_reason: [
      `reading_judge:${report.disposition}`,
      `confidence=${report.confidence}`,
      `signals=${report.signals.join("+") || "none"}`,
      report.codex_judgment_status ? `codex=${report.codex_judgment_status}` : "",
      report.codex_owner_review_reason ? `codex_review=${report.codex_owner_review_reason}` : "",
      "body_text_redacted",
    ].filter(Boolean).join(";"),
    status_hint: report.disposition === "candidate" ? "reading_candidate" : report.disposition,
    route_candidate: report.project_id || "",
    route_confidence: "review",
    route_reason: report.evidence_summary,
    required_role: report.required_role,
    required_capability: report.required_capability,
    suggested_assignee_ref: report.suggested_assignee_ref,
    assignee_confidence: report.suggested_assignee_ref ? "low" : "",
    assignee_reason: report.assignee_hint_reason,
    supporting_actor_refs: [report.bot_hint].filter(Boolean),
    source_candidate_ref: `${report.context_key}:${type}:${index}`,
    source_mail_ref: report.source_mail_ref,
    source_mail_source_id: report.source_ref,
    source_thread_ref: report.thread_ref || "",
    source_group_ref: report.context_key,
    source_lineage_ref: report.source_lineage_ref,
    generation_rule_ref: report.generation_rule_ref,
    generation_run_ref: report.generation_run_ref,
    supporting_knowledge_refs: report.supporting_knowledge_refs,
    knowledge_hint_reason: report.knowledge_hint_reason,
    next_action: report.codex_next_action || copy.next,
    body_access: report.body_access,
    context_key: report.context_key,
    target_object: report.target_object,
    completion_goal: completionGoalForType(type, report.target_object),
    bot_hint: report.bot_hint,
  };
}

function buildReportForEvent(event, opts = {}) {
  const fullText = normalizeText(`${event.subject ?? ""}\n${event.reading_text ?? ""}`);
  const currentText = normalizeText(`${event.subject ?? ""}\n${currentMessageSegment(event.reading_text)}`);
  const text = fullText;
  const dueCandidates = extractDueCandidates(currentText, { baseYear: baseYearFromEvent(event) });
  const quotedDueCandidates = dueCandidates.length ? [] : extractDueCandidates(fullText, { baseYear: baseYearFromEvent(event) }).slice(0, 5);
  const due = dueCandidates[0]?.due || "";
  const actionSignals = hasAny(text, ACTION_KEYWORDS);
  const referenceOnly = hasAny(text, REFERENCE_ONLY_KEYWORDS);
  const readReceipt = hasAny(`${event.subject ?? ""}\n${event.reading_text ?? ""}`, READ_RECEIPT_KEYWORDS)
    && !/(요청|작성|제출|검토|확인|협의|회의|일정|SDD|DD|CSCI)/u.test(String(event.reading_text ?? ""));
  const existingTaskRefs = Array.isArray(event.existing_task_refs) ? event.existing_task_refs : [];
  const disposition = dispositionForEvent(event, { actionSignals, referenceOnly, readReceipt, existingTaskRefs });
  const types = disposition === "reference_or_no_action" ? [] : classifyTypes(text);
  const domain = classifyDomain(text);
  const targetObject = targetObjectFromText(text, event);
  const primaryType = types[0] || "review";
  const contextGoal = completionGoalForType(primaryType, targetObject);
  const contextKey = hashKey(`${event.project_id}|${targetObject}|${contextGoal}`);
  const signals = signalLabels(text, dueCandidates);
  const confidence = confidenceFor({
    disposition,
    actionSignals,
    due,
    bodyAccess: event.body_access,
    typeCount: types.length,
    existingTaskRefs,
  });
  const sourceMailRef = event.ledger_key ? `mailcsv:${event.ledger_key}` : (event.pointer_ref || event.mail_ref);
  const botHint = BOT_BY_TYPE[primaryType] || "mail_review_bot";
  const priority = priorityFor({ due, actionSignals, text, recipientRole: event.recipient_role });
  const evidence = evidenceSummary({ signals, dueCandidates, domain, bodyAccess: event.body_access, disposition });
  const knowledgeRefs = knowledgeRefsFromContext(opts.knowledgeContext);

  return {
    mail_ref: event.mail_ref || "",
    ledger_key: event.ledger_key || "",
    project_id: event.project_id || "",
    received_at: event.received_at || "",
    direction: event.direction || "",
    subject: event.subject || "",
    counterpart: event.counterpart || "",
    mailbox_ref: event.mailbox_ref || "",
    recipient_role: event.recipient_role || "unknown",
    source_ref: event.source_ref || "",
    source_mail_ref: sourceMailRef,
    source_lineage_ref: sourceLineageFor(event),
    body_access: event.body_access || "unknown",
    event_body_read: !!event.event_body_read,
    existing_task_refs: existingTaskRefs,
    already_linked: existingTaskRefs.length > 0,
    disposition,
    work_types: types,
    primary_work_type: primaryType,
    target_object: targetObject,
    completion_goal: contextGoal,
    context_key: contextKey,
    due,
    due_candidates: dueCandidates,
    quoted_due_candidates: quotedDueCandidates,
    priority,
    delegable: disposition === "candidate",
    confidence,
    signals,
    evidence_summary: evidence,
    knowledge_context_loaded: Boolean(opts.knowledgeContext),
    supporting_knowledge_refs: knowledgeRefs,
    knowledge_hint_reason: knowledgeRefs.length
      ? `metadata-only project knowledge refs available: ${knowledgeRefs.length}`
      : "no project knowledge refs available",
    required_role: domain.required_role,
    required_capability: domain.required_capability,
    suggested_assignee_ref: domain.suggested_assignee_ref,
    assignee_hint_reason: domain.matched_keywords.length
      ? `domain keywords matched: ${domain.matched_keywords.slice(0, 5).join(", ")}`
      : "no domain-specific assignee hint",
    bot_hint: botHint,
    generation_rule_ref: opts.generationRuleRef || DEFAULT_GENERATION_RULE_REF,
    generation_run_ref: String(opts.generatedAt || new Date().toISOString()).slice(0, 10),
  };
}

function groupReports(reports) {
  const groups = new Map();
  for (const report of reports) {
    if (!groups.has(report.context_key)) {
      groups.set(report.context_key, {
        context_key: report.context_key,
        project_id: report.project_id,
        target_object: report.target_object,
        completion_goal: report.completion_goal,
        is_new_context: report.existing_task_refs.length === 0,
        mail_refs: [],
        dispositions: {},
        work_types: [],
        due: "",
        priority: "low",
        suggested_assignee_refs: [],
        bot_hints: [],
      });
    }
    const group = groups.get(report.context_key);
    group.mail_refs.push(report.mail_ref);
    group.dispositions[report.disposition] = (group.dispositions[report.disposition] || 0) + 1;
    group.work_types.push(...report.work_types);
    if (!group.due || (report.due && report.due < group.due)) group.due = report.due;
    if (report.priority === "high") group.priority = "high";
    else if (report.priority === "medium" && group.priority === "low") group.priority = "medium";
    if (report.suggested_assignee_ref) group.suggested_assignee_refs.push(report.suggested_assignee_ref);
    if (report.bot_hint) group.bot_hints.push(report.bot_hint);
    if (report.existing_task_refs.length) group.is_new_context = false;
  }
  return [...groups.values()].map((group) => ({
    ...group,
    mail_refs: [...new Set(group.mail_refs)],
    work_types: [...new Set(group.work_types)],
    suggested_assignee_refs: [...new Set(group.suggested_assignee_refs)],
    bot_hints: [...new Set(group.bot_hints)],
  })).sort((a, b) => {
    const pa = a.priority === "high" ? 0 : a.priority === "medium" ? 1 : 2;
    const pb = b.priority === "high" ? 0 : b.priority === "medium" ? 1 : 2;
    return pa - pb || String(a.due || "9999-99-99").localeCompare(String(b.due || "9999-99-99"));
  });
}

function buildLedgerCandidates(reports) {
  const out = {};
  for (const report of reports) {
    if (report.disposition !== "candidate") continue;
    const key = ledgerSafeKey(report.ledger_key || report.source_ref || report.mail_ref);
    if (!key) continue;
    const actions = report.work_types.length ? report.work_types : [report.primary_work_type || "review"];
    const candidates = actions.map((type, index) => candidateForAction(report, type, index));
    out[key] = candidates.length === 1 ? candidates[0] : candidates;
  }
  return out;
}

function buildProposalCandidates(reports) {
  return reports
    .filter((report) => report.disposition !== "reference_or_no_action")
    .map((report) => ({
      kind: report.disposition === "update_existing" ? "update_existing_task_from_mail" : "create_or_route_task_from_mail",
      status: "pending_owner_or_router_review",
      mail_ref: report.mail_ref,
      existing_task_refs: report.existing_task_refs,
      context_key: report.context_key,
      target_object: report.target_object,
      work_types: report.work_types,
      due: report.due,
      priority: report.priority,
      suggested_assignee_ref: report.suggested_assignee_ref,
      bot_hint: report.bot_hint,
      supporting_knowledge_refs: report.supporting_knowledge_refs,
      evidence_summary: report.evidence_summary,
      body_access: report.body_access,
      codex_judgment_status: report.codex_judgment_status || "",
    }));
}

function receiptForPacket(packet, reports) {
  return {
    generated_at: new Date().toISOString(),
    source_schema_version: packet?.schema_version || "",
    input_mail_count: reports.length,
    body_access: packet?.body_access || "",
    event_body_read_count: reports.filter((report) => report.event_body_read).length,
    raw_body_persisted: false,
    attachment_payloads_loaded: false,
    secret_loaded: false,
    output_body_text_redacted: true,
    project_knowledge_overlay_loaded: Boolean(packet?.knowledge_context),
    knowledge_ref_count: summarizeKnowledgeContext(packet?.knowledge_context).ref_count,
    source_text_loaded: Boolean(packet?.knowledge_context?.boundary?.source_text_loaded),
  };
}

export function buildReadingRuleReports(contextPacket, opts = {}) {
  const events = Array.isArray(contextPacket?.mail_events) ? contextPacket.mail_events : [];
  const generatedAt = opts.generatedAt || contextPacket?.generated_at || new Date().toISOString();
  return events.map((event) => buildReportForEvent(event, {
    generationRuleRef: opts.generationRuleRef || DEFAULT_GENERATION_RULE_REF,
    generatedAt,
    knowledgeContext: contextPacket?.knowledge_context || null,
  }));
}

export function buildReadingCandidateBundle(contextPacket, reports, opts = {}) {
  const ledgerCandidates = buildLedgerCandidates(reports);
  return {
    schema_version: "haengbogwan.reading_candidate_bundle.v1",
    generated_at: new Date().toISOString(),
    generation_rule_ref: opts.generationRuleRef || DEFAULT_GENERATION_RULE_REF,
    project_id: contextPacket?.project_id || "",
    query: contextPacket?.query || "",
    body_mode: contextPacket?.body_mode || "",
    body_access: contextPacket?.body_access || "",
    knowledge_context: summarizeKnowledgeContext(contextPacket?.knowledge_context),
    boundary: {
      raw_body_persisted: false,
      reading_text_emitted: false,
      attachments_loaded: false,
      attachment_payloads_loaded: false,
      secret_loaded: false,
      owner_approval_required_for_apply: true,
    },
    counts: {
      mail: reports.length,
      candidate_mail: reports.filter((r) => r.disposition === "candidate").length,
      update_existing_mail: reports.filter((r) => r.disposition === "update_existing").length,
      owner_review_mail: reports.filter((r) => r.disposition === "owner_review").length,
      reference_or_no_action_mail: reports.filter((r) => r.disposition === "reference_or_no_action").length,
      ledger_candidate_keys: Object.keys(ledgerCandidates).length,
      context_groups: new Set(reports.map((r) => r.context_key)).size,
    },
    mail_reading_reports: reports,
    work_context_groups: groupReports(reports),
    ledger_candidates: ledgerCandidates,
    proposal_candidates: buildProposalCandidates(reports),
    receipts: [receiptForPacket(contextPacket, reports), ...(Array.isArray(opts.receipts) ? opts.receipts : [])],
  };
}

export function judgeReadingContextPacket(contextPacket, opts = {}) {
  const ruleReports = buildReadingRuleReports(contextPacket, opts);
  const reports = opts.codexJudgments
    ? applyCodexJudgmentsToReports(ruleReports, opts.codexJudgments, contextPacket, opts)
    : ruleReports;
  return buildReadingCandidateBundle(contextPacket, reports, opts);
}

export function redactReadingCandidateBundle(bundle) {
  return {
    ...bundle,
    mail_reading_reports: (Array.isArray(bundle?.mail_reading_reports) ? bundle.mail_reading_reports : []).map(stripPrivateBody),
  };
}

function readContextPacket(contextPath) {
  const path = resolve(process.cwd(), contextPath);
  if (!existsSync(path)) throw new Error(`context_not_found:${contextPath}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function readCodexJudgments(codexJudgmentsPath) {
  const path = resolve(process.cwd(), codexJudgmentsPath);
  if (!existsSync(path)) throw new Error(`codex_judgments_not_found:${codexJudgmentsPath}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateLimit(value, label = "limit") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function parseArgs(argv) {
  const opts = {
    context: "",
    dbPath: DEFAULT_DB,
    repoRoot: REPO,
    projectId: "",
    query: "",
    direction: "",
    mailbox: "",
    limit: DEFAULT_LIMIT,
    bodyMode: "two_stage",
    maxTextChars: 12000,
    includeHidden: false,
    codexJudgmentsPath: "",
    codexMinConfidence: 0.35,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") opts.help = true;
    else if (token === "--json") opts.json = true;
    else if (token === "--include-hidden") opts.includeHidden = true;
    else if (token === "--context") {
      opts.context = argv[++i];
      if (!opts.context || opts.context.startsWith("--")) throw new Error("--context_requires_value");
    } else if (token === "--db") {
      opts.dbPath = argv[++i];
      if (!opts.dbPath || opts.dbPath.startsWith("--")) throw new Error("--db_requires_value");
    } else if (token === "--repo-root") {
      opts.repoRoot = argv[++i];
      if (!opts.repoRoot || opts.repoRoot.startsWith("--")) throw new Error("--repo-root_requires_value");
    } else if (token === "--project") {
      opts.projectId = argv[++i];
      if (!opts.projectId || opts.projectId.startsWith("--")) throw new Error("--project_requires_value");
    } else if (token === "--query" || token === "--q") {
      opts.query = argv[++i];
      if (!opts.query || opts.query.startsWith("--")) throw new Error(`${token}_requires_value`);
    } else if (token === "--direction") {
      opts.direction = argv[++i];
      if (!opts.direction || opts.direction.startsWith("--")) throw new Error("--direction_requires_value");
    } else if (token === "--mailbox") {
      opts.mailbox = argv[++i];
      if (!opts.mailbox || opts.mailbox.startsWith("--")) throw new Error("--mailbox_requires_value");
    } else if (token === "--limit") {
      opts.limit = validateLimit(argv[++i]);
    } else if (token === "--body-mode") {
      opts.bodyMode = argv[++i];
    } else if (token === "--max-text-chars") {
      opts.maxTextChars = validateLimit(argv[++i], "max_text_chars");
    } else if (token === "--codex-judgments") {
      opts.codexJudgmentsPath = argv[++i];
      if (!opts.codexJudgmentsPath || opts.codexJudgmentsPath.startsWith("--")) throw new Error("--codex-judgments_requires_value");
    } else if (token === "--codex-min-confidence") {
      opts.codexMinConfidence = Number(argv[++i]);
      if (!Number.isFinite(opts.codexMinConfidence) || opts.codexMinConfidence < 0 || opts.codexMinConfidence > 1) {
        throw new Error("--codex-min-confidence_requires_0_to_1");
      }
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_reading_candidate_judge.mjs --context <reading-context.json> [--json]",
    "   or: node tools/haengbogwan_reading_candidate_judge.mjs --db <dev-erp.db> [--repo-root <runtime-root>] [--project <code>|--query <text>] [--limit N] [--body-mode preview|two_stage|full] [--codex-judgments <json>] [--json]",
    "",
    "Emits mail_reading_reports, work_context_groups, ledger_candidates, proposal_candidates.",
    "No writes. Output redacts mail body text.",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const packet = opts.context
      ? readContextPacket(opts.context)
      : buildReadingContextPacket({
        dbPath: opts.dbPath,
        repoRoot: opts.repoRoot,
        projectId: opts.projectId,
        query: opts.query,
        direction: opts.direction,
        mailbox: opts.mailbox,
        limit: opts.limit,
        bodyMode: opts.bodyMode,
        maxTextChars: opts.maxTextChars,
        includeText: true,
        includeHidden: opts.includeHidden,
      });
    const ruleReports = buildReadingRuleReports(packet);
    const codexJudgments = opts.codexJudgmentsPath ? readCodexJudgments(opts.codexJudgmentsPath) : null;
    const receipts = [];
    if (codexJudgments) {
      receipts.push({
        generated_at: new Date().toISOString(),
        source: "codex_automation_judgments",
        raw_body_persisted: false,
        output_body_text_redacted: true,
      });
    }
    const reports = codexJudgments
      ? applyCodexJudgmentsToReports(ruleReports, codexJudgments, packet, { minConfidence: opts.codexMinConfidence })
      : ruleReports;
    const bundle = buildReadingCandidateBundle(packet, reports, { receipts });
    // Keep this call as a boundary assertion/reminder for callers that reuse both tools.
    redactReadingContextPacket(packet);
    stdout.write(`${JSON.stringify(redactReadingCandidateBundle(bundle), null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_reading_candidate_judge] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = await main();
}
