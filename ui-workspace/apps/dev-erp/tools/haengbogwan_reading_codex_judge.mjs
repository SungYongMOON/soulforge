// Optional Codex-automation overlay for the haengbogwan reading judge.
// Codex may interpret mail text, but code owns keys, dedup, source refs, and apply authority.
import { createHash } from "node:crypto";

export const CODEX_REQUEST_SCHEMA = "haengbogwan.reading_codex_judge_request.v1";
export const CODEX_OUTPUT_SCHEMA = "haengbogwan.reading_codex_judgment_bundle.v1";
export const CODEX_OVERLAY_RULE_REF = "haengbogwan_reading_codex_overlay.v1";

const ALLOWED_DISPOSITIONS = new Set(["candidate", "update_existing", "owner_review", "reference_or_no_action"]);
const ALLOWED_WORK_TYPES = new Set(["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"]);
const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "body",
  "body_text",
  "body_html",
  "body_preview",
  "reading_text",
  "raw",
  "raw_body",
  "attachment",
  "attachments",
  "attachment_payload",
  "attachment_payloads",
  "local_path",
  "path",
  "secret",
  "token",
  "password",
  "credential",
  "cookie",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactString(value, max = 500) {
  return normalizeText(value).slice(0, max);
}

function hashText(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function hashKey(value, prefix = "ctx") {
  return `${prefix}:${hashText(value).slice(0, 16)}`;
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

function normalizeDateOnly(value) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function uniqueWorkTypes(values) {
  const list = Array.isArray(values) ? values : [values];
  const out = [];
  for (const value of list) {
    const normalized = String(value ?? "").trim();
    if (!ALLOWED_WORK_TYPES.has(normalized) || out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

function assertNoForbiddenOutputPayload(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenOutputPayload(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (FORBIDDEN_OUTPUT_KEYS.has(normalizedKey)) {
      throw new Error(`codex_output_forbidden_field:${path}.${key}`);
    }
    assertNoForbiddenOutputPayload(child, `${path}.${key}`);
  }
}

function assertNoObviousBodyEcho(output, contextPacket) {
  const text = JSON.stringify(output);
  for (const event of Array.isArray(contextPacket?.mail_events) ? contextPacket.mail_events : []) {
    const reading = normalizeText(event?.reading_text);
    if (reading.length < 80) continue;
    const fragments = [reading.slice(0, 80), reading.slice(-80)].filter((fragment) => fragment.trim().length >= 40);
    for (const fragment of fragments) {
      if (text.includes(fragment)) throw new Error(`codex_output_body_echo:${event.mail_ref || "(unknown)"}`);
    }
  }
}

export function buildCodexJudgeRequest(contextPacket, ruleReports = [], opts = {}) {
  const reportByMailRef = new Map(ruleReports.map((report) => [report.mail_ref, report]));
  return {
    schema_version: CODEX_REQUEST_SCHEMA,
    generated_at: opts.generatedAt || new Date().toISOString(),
    instruction: {
      language: "ko",
      output_schema_version: CODEX_OUTPUT_SCHEMA,
      allowed_dispositions: [...ALLOWED_DISPOSITIONS],
      allowed_work_types: [...ALLOWED_WORK_TYPES],
      allowed_priorities: [...ALLOWED_PRIORITIES],
      code_owned_fields: [
        "mail_ref",
        "ledger_key",
        "source_ref",
        "source_mail_ref",
        "source_lineage_ref",
        "existing_task_refs",
        "body_access",
      ],
      rules: [
        "Return JSON only.",
        "Do not copy mail body text, attachment names, raw rows, local paths, secrets, tokens, or credentials.",
        "If existing_task_refs is non-empty, keep disposition as update_existing.",
        "Use owner_review when the action, due date, or completion criteria is genuinely unclear.",
        "Prefer one primary work_type, but include multiple work_types when the mail clearly asks for multiple actions.",
      ],
    },
    boundary: {
      local_body_text_in_request: true,
      raw_body_persisted: false,
      request_should_not_be_saved_as_report: true,
      output_must_redact_body_text: true,
      owner_approval_required_for_apply: true,
    },
    mail_events: (Array.isArray(contextPacket?.mail_events) ? contextPacket.mail_events : []).map((event) => {
      const rule = reportByMailRef.get(event.mail_ref) || {};
      return {
        mail_ref: event.mail_ref || "",
        ledger_key: event.ledger_key || "",
        project_id: event.project_id || "",
        received_at: event.received_at || "",
        direction: event.direction || "",
        subject: event.subject || "",
        counterpart: event.counterpart || "",
        recipient_role: event.recipient_role || "unknown",
        body_access: event.body_access || "unknown",
        attachment_count: event.attachment_count || 0,
        reading_text_hash: event.reading_text_hash || "",
        existing_task_refs: Array.isArray(event.existing_task_refs) ? event.existing_task_refs : [],
        deterministic_hint: {
          disposition: rule.disposition || "",
          work_types: Array.isArray(rule.work_types) ? rule.work_types : [],
          due_candidates: Array.isArray(rule.due_candidates) ? rule.due_candidates : [],
          target_object: rule.target_object || "",
          completion_goal: rule.completion_goal || "",
          due: rule.due || "",
          priority: rule.priority || "",
          confidence: rule.confidence ?? null,
          signals: Array.isArray(rule.signals) ? rule.signals : [],
          evidence_summary: rule.evidence_summary || "",
        },
        reading_text: event.reading_text || "",
      };
    }),
  };
}

export function redactCodexJudgeRequest(packet) {
  return {
    ...packet,
    boundary: {
      ...packet.boundary,
      local_body_text_in_request: false,
    },
    mail_events: (Array.isArray(packet?.mail_events) ? packet.mail_events : []).map((event) => {
      const { reading_text, ...rest } = event;
      return rest;
    }),
  };
}

export function buildCodexJudgePromptText(requestPacket) {
  return [
    "You are Codex acting as the haengbogwan mail-to-work classifier for a systems-engineering team.",
    "Read each mail and return JSON only. Do not include markdown fences.",
    "Classify each mail as candidate, update_existing, owner_review, or reference_or_no_action.",
    "Extract work_types, title, target_object, completion_goal, due, priority, completion_criteria, next_action, role/capability hints, assignee hint, and a short redacted evidence_summary.",
    "Never quote or copy mail body text. Never include attachment names, local paths, raw rows, secrets, tokens, or credentials.",
    "Code owns mail_ref, ledger_key, source refs, existing_task_refs, and all apply decisions. Do not invent or modify them.",
    "If existing_task_refs is non-empty, disposition must be update_existing.",
    "",
    "Return this exact JSON shape:",
    JSON.stringify({
      schema_version: CODEX_OUTPUT_SCHEMA,
      model_ref: "codex-automation",
      prompt_rule_ref: CODEX_REQUEST_SCHEMA,
      judgments: [{
        mail_ref: "MAIL-1",
        ledger_key: "M001",
        input_reading_text_hash: "sha256 hash from input",
        disposition: "candidate",
        work_types: ["author"],
        primary_work_type: "author",
        title: "short task title",
        target_object: "work target",
        completion_goal: "completion goal",
        due: "YYYY-MM-DD or empty",
        priority: "low|medium|high",
        completion_criteria: "done means ...",
        next_action: "next human/bot action",
        required_role: "role ref or empty",
        required_capability: "capability ref or empty",
        suggested_assignee_ref: "team/person/bot hint or empty",
        bot_hint: "bot ref or empty",
        confidence: 0.8,
        reason_codes: ["request_detected"],
        evidence_summary: "short redacted reason; no body text",
        owner_review_reason: "",
      }],
    }, null, 2),
    "",
    "Input packet:",
    JSON.stringify(requestPacket),
  ].join("\n");
}

function parseJsonFromText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("codex_output_empty");
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("codex_output_invalid_json");
  }
}

export function normalizeCodexJudgmentBundle(output, contextPacket) {
  const parsed = typeof output === "string" ? parseJsonFromText(output) : output;
  if (!parsed || typeof parsed !== "object") throw new Error("codex_output_invalid");
  assertNoForbiddenOutputPayload(parsed);
  assertNoObviousBodyEcho(parsed, contextPacket);

  let rawJudgments = [];
  if (Array.isArray(parsed.judgments)) rawJudgments = parsed.judgments;
  else if (Array.isArray(parsed.mail_reading_reports)) rawJudgments = parsed.mail_reading_reports;
  else if (Array.isArray(parsed)) rawJudgments = parsed;
  else if (parsed.judgments && typeof parsed.judgments === "object") {
    rawJudgments = Object.entries(parsed.judgments).map(([mailRef, value]) => ({ ...value, mail_ref: value?.mail_ref || mailRef }));
  }

  const events = Array.isArray(contextPacket?.mail_events) ? contextPacket.mail_events : [];
  const eventByMailRef = new Map(events.map((event) => [event.mail_ref, event]));
  const judgments = [];
  const seen = new Set();
  for (const raw of rawJudgments) {
    const mailRef = String(raw?.mail_ref ?? "").trim();
    const event = eventByMailRef.get(mailRef);
    if (!event || seen.has(mailRef)) continue;
    seen.add(mailRef);
    const inputHash = String(raw?.input_reading_text_hash ?? "").trim();
    if (!inputHash || inputHash !== String(event.reading_text_hash ?? "")) continue;
    const disposition = ALLOWED_DISPOSITIONS.has(String(raw?.disposition ?? "").trim())
      ? String(raw.disposition).trim()
      : "owner_review";
    const workTypes = uniqueWorkTypes(raw?.work_types?.length ? raw.work_types : raw?.work_type);
    const primaryWorkType = ALLOWED_WORK_TYPES.has(String(raw?.primary_work_type ?? "").trim())
      ? String(raw.primary_work_type).trim()
      : (workTypes[0] || "review");
    if (!workTypes.includes(primaryWorkType) && ALLOWED_WORK_TYPES.has(primaryWorkType)) workTypes.unshift(primaryWorkType);
    const priority = ALLOWED_PRIORITIES.has(String(raw?.priority ?? "").trim()) ? String(raw.priority).trim() : "";
    judgments.push({
      mail_ref: mailRef,
      ledger_key: String(raw?.ledger_key ?? "").trim(),
      input_reading_text_hash: inputHash,
      disposition,
      work_types: workTypes.length ? workTypes : [primaryWorkType],
      primary_work_type: primaryWorkType,
      title: compactString(raw?.title, 220),
      target_object: compactString(raw?.target_object, 180),
      completion_goal: compactString(raw?.completion_goal, 260),
      due: normalizeDateOnly(raw?.due),
      priority,
      completion_criteria: compactString(raw?.completion_criteria, 700),
      next_action: compactString(raw?.next_action, 500),
      required_role: compactString(raw?.required_role, 120),
      required_capability: compactString(raw?.required_capability, 120),
      suggested_assignee_ref: compactString(raw?.suggested_assignee_ref, 120),
      bot_hint: compactString(raw?.bot_hint, 120),
      confidence: clampConfidence(raw?.confidence),
      reason_codes: Array.isArray(raw?.reason_codes) ? raw.reason_codes.map((v) => compactString(v, 80)).filter(Boolean).slice(0, 12) : [],
      evidence_summary: compactString(raw?.evidence_summary, 500),
      owner_review_reason: compactString(raw?.owner_review_reason ?? raw?.review_reason, 500),
    });
  }
  return {
    schema_version: CODEX_OUTPUT_SCHEMA,
    model_ref: compactString(parsed.model_ref || parsed.model || "codex-automation", 120),
    prompt_rule_ref: compactString(parsed.prompt_rule_ref || "", 120),
    judgments,
    output_hash: hashText(JSON.stringify(parsed)),
  };
}

function preserveCodeOwnedDisposition(report, judgment) {
  if (Array.isArray(report.existing_task_refs) && report.existing_task_refs.length) return "update_existing";
  return judgment.disposition || report.disposition;
}

export function applyCodexJudgmentsToReports(ruleReports, codexOutput, contextPacket, opts = {}) {
  const normalized = normalizeCodexJudgmentBundle(codexOutput, contextPacket);
  const minConfidence = Number.isFinite(Number(opts.minConfidence)) ? Number(opts.minConfidence) : 0.35;
  const judgmentByMailRef = new Map(normalized.judgments.map((judgment) => [judgment.mail_ref, judgment]));
  return ruleReports.map((report) => {
    const judgment = judgmentByMailRef.get(report.mail_ref);
    if (!judgment) return { ...report, codex_judgment_status: "not_requested_or_missing" };
    const codexConfidence = judgment.confidence;
    if (codexConfidence !== null && codexConfidence < minConfidence) {
      return {
        ...report,
        codex_judgment_status: "ignored_low_confidence",
        codex_confidence: codexConfidence,
        codex_model_ref: normalized.model_ref,
        codex_output_hash: normalized.output_hash,
      };
    }
    const workTypes = judgment.work_types.length ? judgment.work_types : report.work_types;
    const primaryType = workTypes.includes(judgment.primary_work_type) ? judgment.primary_work_type : (workTypes[0] || report.primary_work_type);
    const targetObject = judgment.target_object || report.target_object;
    const completionGoal = judgment.completion_goal || report.completion_goal;
    const disposition = preserveCodeOwnedDisposition(report, judgment);
    const contextKey = hashKey(`${report.project_id}|${targetObject}|${completionGoal}`);
    return {
      ...report,
      disposition,
      work_types: workTypes,
      primary_work_type: primaryType,
      target_object: targetObject,
      completion_goal: completionGoal,
      context_key: contextKey,
      due: judgment.due || report.due,
      priority: judgment.priority || report.priority,
      confidence: codexConfidence ?? report.confidence,
      evidence_summary: judgment.evidence_summary
        ? `${judgment.evidence_summary}; codex_overlay=applied; body text redacted`
        : `${report.evidence_summary}; codex_overlay=applied`,
      required_role: judgment.required_role || report.required_role,
      required_capability: judgment.required_capability || report.required_capability,
      suggested_assignee_ref: judgment.suggested_assignee_ref || report.suggested_assignee_ref,
      assignee_hint_reason: judgment.suggested_assignee_ref ? "Codex suggested assignee hint; code validation pending" : report.assignee_hint_reason,
      bot_hint: judgment.bot_hint || report.bot_hint,
      codex_title: judgment.title,
      codex_completion_criteria: judgment.completion_criteria,
      codex_next_action: judgment.next_action,
      codex_owner_review_reason: judgment.owner_review_reason,
      codex_reason_codes: judgment.reason_codes,
      codex_judgment_status: "applied",
      codex_confidence: codexConfidence,
      codex_model_ref: normalized.model_ref,
      codex_output_hash: normalized.output_hash,
      generation_rule_ref: `${report.generation_rule_ref}+${CODEX_OVERLAY_RULE_REF}`,
    };
  });
}
